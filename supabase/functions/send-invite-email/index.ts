// ── send-invite-email ────────────────────────────────────────────────────────
// Edge Function chamada pelo nutricionista (js/app.js: sendInvite/resendInvite)
// depois de criar/atualizar uma linha em nutricionista_paciente_links. Envia o
// email de convite ao paciente via Resend.
//
// Deploy: supabase functions deploy send-invite-email
// Secrets necessários (ver README.md):
//   supabase secrets set RESEND_API_KEY=...
//   supabase secrets set PORTAL_URL=https://o-teu-dominio.vercel.app   (opcional)
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

    const { code, email, clientNome, nutricionistaNome } = await req.json();
    if (!code || !email) return json({ error: 'Pedido inválido: falta code ou email.' }, 400);

    // Client autenticado como o próprio nutricionista chamador — a query seguinte
    // respeita a RLS de nutricionista_paciente_links, confirmando que este código
    // pertence mesmo a um convite dele antes de gastar uma chamada à Resend.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: link, error: linkError } = await supabase
      .from('nutricionista_paciente_links')
      .select('id, status')
      .eq('code', code)
      .single();

    if (linkError || !link) return json({ error: 'Convite inválido.' }, 404);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurado nos secrets da function.' }, 500);

    const portalUrl = (Deno.env.get('PORTAL_URL') || '').replace(/\/$/, '');
    const linkParams = new URLSearchParams({ invite: code });
    if (email) linkParams.set('email', email);
    if (clientNome) linkParams.set('nome', clientNome);
    const inviteUrl = portalUrl
      ? `${portalUrl}/portal.html?${linkParams.toString()}`
      : `portal.html?${linkParams.toString()}`;
    const fromAddr  = Deno.env.get('INVITE_FROM_EMAIL') || 'CachosNutri <onboarding@resend.dev>';
    const nutriName = nutricionistaNome || 'O seu nutricionista';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#27865a">CachosNutri</h2>
        <p><b>${escapeHtml(nutriName)}</b> convidou-o(a) para aceder ao seu portal de acompanhamento nutricional${clientNome ? ` como <b>${escapeHtml(clientNome)}</b>` : ''}.</p>
        <p>Através do portal pode consultar o seu plano alimentar do dia e acompanhar a sua evolução.</p>
        <p style="margin:28px 0">
          <a href="${inviteUrl}" style="background:#27865a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Aceder ao portal</a>
        </p>
        <p style="font-size:12px;color:#666">Se o botão não funcionar, copie este link: ${inviteUrl}</p>
      </div>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [email],
        subject: `${nutriName} convidou-o para o CachosNutri`,
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
