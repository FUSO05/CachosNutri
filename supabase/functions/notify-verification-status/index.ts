// ── notify-verification-status ─────────────────────────────────────────────────
// Edge Function chamada por um admin (js/admin.js: approveAdminProfile/
// confirmAdminReject) depois de aprovar/rejeitar um pedido de verificação de
// nutricionista OU estudante, via admin_set_verification_status() (schema.sql
// secção 19i, generaliza a versão original da secção 17f). Envia um email de
// cortesia — o acesso em si já mudou na base de dados antes desta function
// ser chamada (fire-and-forget: se isto falhar, o status já está correto, só
// não há notificação proativa por email).
//
// Deploy: supabase functions deploy notify-verification-status
// Secrets necessários (mesmos que send-invite-email — ver README.md):
//   supabase secrets set RESEND_API_KEY=...
//   supabase secrets set INVITE_FROM_EMAIL="CachosNutri <onboarding@resend.dev>"  (opcional)
//
// SUPABASE_URL e SUPABASE_ANON_KEY são injetados automaticamente pelo Supabase
// em runtime — não é preciso configurá-los.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://cachosnutri.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const { profileId } = await req.json();
    if (!profileId) return json({ error: 'Pedido inválido: falta profileId.' }, 400);

    // Client autenticado como o próprio admin chamador — esta leitura só devolve
    // a linha se a RLS "admin vê perfis de nutricionistas e estudantes"
    // (schema.sql secção 19h) deixar, ou seja, só se o chamador for mesmo um
    // admin. É a própria verificação de autorização, não é preciso repeti-la.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: prof, error: profError } = await supabase
      .from('profiles')
      .select('nome, email, role, status, motivo_rejeicao')
      .eq('id', profileId)
      .single();

    if (profError || !prof) return json({ error: 'Não autorizado ou perfil inexistente.' }, 404);
    if (prof.status !== 'approved' && prof.status !== 'rejected') {
      return json({ error: 'Este perfil não está num estado notificável.' }, 400);
    }
    if (!prof.email) return json({ error: 'Perfil sem email.' }, 400);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurado nos secrets da function.' }, 500);

    const fromAddr = Deno.env.get('INVITE_FROM_EMAIL') || 'CachosNutri <onboarding@resend.dev>';
    const nome = prof.nome || (prof.role === 'estudante' ? 'Estudante' : 'Nutricionista');
    const isEstudante = prof.role === 'estudante';

    const approvedBody = isEstudante
      ? `<p>O seu estatuto de estudante foi verificado e aprovado — válido por 1 ano. Já pode entrar na plataforma.</p>`
      : `<p>A sua conta foi verificada e aprovada. Já pode entrar na plataforma e começar a acompanhar os seus pacientes.</p>`;
    const rejectedIntro = isEstudante
      ? `<p>Não foi possível aprovar o seu comprovativo de matrícula pelo seguinte motivo:</p>`
      : `<p>Não foi possível aprovar o seu pedido de verificação profissional pelo seguinte motivo:</p>`;
    const rejectedOutro = isEstudante
      ? `<p>Pode reenviar o comprovativo a partir do ecrã de verificação, ao entrar novamente na plataforma.</p>`
      : `<p>Pode reenviar os seus dados e documentos a partir do ecrã de verificação, ao entrar novamente na plataforma.</p>`;

    const html = prof.status === 'approved'
      ? `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#27865a">CachosNutri</h2>
          <p>Olá <b>${escapeHtml(nome)}</b>,</p>
          ${approvedBody}
          <p style="margin:28px 0">
            <a href="https://cachosnutri.vercel.app/login.html" style="background:#27865a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Entrar no CachosNutri</a>
          </p>
        </div>`
      : `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#27865a">CachosNutri</h2>
          <p>Olá <b>${escapeHtml(nome)}</b>,</p>
          ${rejectedIntro}
          <p style="background:#fee2e2;color:#b91c1c;padding:12px 16px;border-radius:8px">${escapeHtml(prof.motivo_rejeicao || 'Sem motivo indicado.')}</p>
          ${rejectedOutro}
          <p style="margin:28px 0">
            <a href="https://cachosnutri.vercel.app/login.html" style="background:#27865a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Entrar no CachosNutri</a>
          </p>
        </div>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [prof.email],
        subject: prof.status === 'approved' ? 'A sua conta CachosNutri foi aprovada' : 'Pedido de verificação CachosNutri',
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return json({ error: `Falha ao enviar email: ${errText}` }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
