// ── cleanup-meal-photos ──────────────────────────────────────────────────────
// Edge Function agendada (não é chamada pelo frontend) que apaga fotos de refeições
// com mais de 45 dias — tanto o objeto no Storage como a linha em progress_photos.
// Pedido explícito do utilizador: fotos de comida têm "prazo de validade curto",
// por isso o armazenamento deve reciclar-se sozinho em vez de crescer para sempre
// (ver supabase/schema.sql, secção 7, e o plano de Fase 4).
//
// Ao contrário de send-invite-email (que reencaminha o Authorization de quem chama
// e por isso respeita a RLS de um utilizador específico), esta function corre sem
// utilizador associado — é invocada pelo cron do Supabase, não por um paciente ou
// nutricionista — por isso usa a SUPABASE_SERVICE_ROLE_KEY (bypassa RLS por desenho)
// para conseguir limpar fotos de TODOS os clientes. A query está sempre explicitamente
// filtrada por idade (photo_date < hoje - 45 dias); nunca apaga "tudo".
//
// Deploy: supabase functions deploy cleanup-meal-photos
// Secret necessário (ver README.md):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (Project Settings → API)
//
// Agendamento: feito no dashboard do Supabase (Database → Cron Jobs → nova função
// "Supabase Edge Function", 1×/dia) — não em SQL committed, para nunca escrever a
// service-role key em controlo de versão.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RETENTION_DAYS = 45;
const BUCKET = 'meal-photos';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10); // 'yyyy-mm-dd'

    const { data: rows, error: selectError } = await supabase
      .from('progress_photos')
      .select('id, storage_path')
      .lt('photo_date', cutoffStr);

    if (selectError) return json({ error: selectError.message }, 500);
    if (!rows || !rows.length) return json({ ok: true, deleted: 0 });

    let deleted = 0;
    const failures: string[] = [];

    for (const row of rows) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
      if (storageError) {
        // Não apaga a linha se o Storage falhar — evita perder a referência ao objeto
        // (fica para a próxima execução do cron tentar de novo).
        failures.push(`${row.id}: ${storageError.message}`);
        continue;
      }
      const { error: deleteError } = await supabase.from('progress_photos').delete().eq('id', row.id);
      if (deleteError) { failures.push(`${row.id}: ${deleteError.message}`); continue; }
      deleted++;
    }

    return json({ ok: true, deleted, total: rows.length, failures: failures.length ? failures : undefined });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
