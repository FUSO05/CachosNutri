// ── Supabase client (Fase 0/1) ─────────────────────────────────────────────────
// Chave "anon/publishable" — é segura para expor no browser, o RLS no Supabase
// é que garante que cada nutricionista só acede aos seus próprios dados.
const SUPABASE_URL = 'https://heninsfwxfnbyngnqbnw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H8ppOByYKnmhgCyeCv2-OQ_lXhLY4OM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
