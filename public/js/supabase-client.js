// ── Supabase client (Fase 0/1) ─────────────────────────────────────────────────
// Chave "anon/publishable" — é segura para expor no browser, o RLS no Supabase
// é que garante que cada nutricionista só acede aos seus próprios dados.
const SUPABASE_URL = 'https://heninsfwxfnbyngnqbnw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H8ppOByYKnmhgCyeCv2-OQ_lXhLY4OM';

// login.html/app.html (nutricionista), portal.html (paciente) e admin.html
// (admin) carregam este mesmo ficheiro — mas precisam de sessões de
// autenticação isoladas. Por omissão o supabase-js guarda a sessão numa única
// chave de localStorage partilhada por todas as páginas da mesma origem (e
// sincroniza-a entre separadores), por isso iniciar sessão numa área
// substituía/terminava a sessão da outra se ambas estivessem abertas ao mesmo
// tempo no mesmo browser (ex: o mesmo operador com admin.html e app.html
// abertos em separadores diferentes).
const _path = location.pathname.toLowerCase();
const _authStorageKey = _path.includes('portal') ? 'cachosnutri-paciente-auth'
  : _path.includes('admin') ? 'cachosnutri-admin-auth'
  : 'cachosnutri-nutricionista-auth';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: _authStorageKey }
});
