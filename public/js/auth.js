// ── CachosNutri auth.js — lógica exclusiva do ecrã de login/criar conta ───────
// Usado só por login.html. Ao autenticar com sucesso, navega para app.html
// (página real, não uma secção escondida) — este ficheiro não sabe nada sobre
// o dashboard/planos/etc., só sobre entrar/criar conta e a decisão de importar
// dados locais pré-existentes.

let currentUser         = null;
let _pendingLocalImport = null;

function switchAuthTab(which) {
  const isLogin = which === 'login';
  document.getElementById('auth-tab-login').classList.toggle('active', isLogin);
  document.getElementById('auth-tab-signup').classList.toggle('active', !isLogin);
  document.getElementById('auth-form-login').style.display  = isLogin ? '' : 'none';
  document.getElementById('auth-form-signup').style.display = isLogin ? 'none' : '';
}

function showAuthError(which, msg) {
  const el = document.getElementById(`auth-${which}-error`);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', !!msg);
}

function traduzErroAuth(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou password incorretos.';
  if (/User already registered/i.test(msg))   return 'Já existe uma conta com este e-mail.';
  if (/Password should be at least/i.test(msg)) return 'A password deve ter pelo menos 6 caracteres.';
  if (/Unable to validate email address/i.test(msg)) return 'E-mail inválido.';
  return msg;
}

// Se já houver sessão válida (ex: utilizador voltou a esta página com o browser),
// salta logo para a app em vez de mostrar o formulário outra vez.
async function checkExistingSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      window.location.href = 'app.html';
    }
  } catch (e) { console.error('Erro ao verificar sessão:', e); }
}

async function handleLogin() {
  const email    = document.getElementById('auth-login-email').value.trim();
  const password = document.getElementById('auth-login-password').value;
  showAuthError('login', '');
  const btn = document.getElementById('auth-login-btn');
  btn.disabled = true; btn.textContent = 'A entrar…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) { showAuthError('login', traduzErroAuth(error.message)); return; }
  currentUser = data.user;
  await completeAuthFlow();
}

async function handleSignup() {
  const nome     = document.getElementById('auth-signup-nome').value.trim();
  const email    = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  showAuthError('signup', '');
  const btn = document.getElementById('auth-signup-btn');
  btn.disabled = true; btn.textContent = 'A criar conta…';
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { role: 'nutricionista', nome } }
  });
  btn.disabled = false; btn.textContent = 'Criar conta';
  if (error) { showAuthError('signup', traduzErroAuth(error.message)); return; }
  if (!data.session) {
    showAuthError('signup', 'Conta criada! Verifique o seu e-mail para confirmar antes de entrar.');
    return;
  }
  currentUser = data.user;
  await completeAuthFlow();
}

// Verificação leve (só conta registos, não carrega dados) — decide se vale a
// pena oferecer importar dados locais antes de seguir para app.html, que é
// quem efetivamente carrega tudo (loadAppData).
async function hasAnyRemoteClients() {
  try {
    const { count, error } = await sb
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('nutricionista_id', currentUser.id);
    if (error) throw error;
    return (count || 0) > 0;
  } catch (e) {
    console.error('Erro ao verificar clientes existentes:', e);
    return true; // em dúvida, não oferece importar por cima de dados que podem existir
  }
}

async function completeAuthFlow() {
  const alreadyImportedKey = 'cachos_imported_' + currentUser.id;
  const localRaw = localStorage.getItem('cachos_data');
  let localHasData = false;
  if (localRaw && !localStorage.getItem(alreadyImportedKey)) {
    try {
      const parsed = JSON.parse(localRaw);
      if (parsed.clients && parsed.clients.length) {
        localHasData = true;
        _pendingLocalImport = parsed;
      }
    } catch (e) {}
  }

  if (localHasData && !(await hasAnyRemoteClients())) {
    showImportNotice();
    return;
  }
  window.location.href = 'app.html';
}

function showImportNotice() {
  document.getElementById('auth-form-login').style.display = 'none';
  document.getElementById('auth-form-signup').style.display = 'none';
  document.querySelector('.auth-tabs').style.display = 'none';
  document.getElementById('auth-import-notice').style.display = '';
}

// Guarda os dados importados em sessionStorage — é app.html, ao iniciar, que
// os sincroniza de facto com o Supabase (reaproveita syncAppDataToSupabase()).
function importLocalData() {
  if (_pendingLocalImport) {
    try { sessionStorage.setItem('cachos_pending_import', JSON.stringify(_pendingLocalImport)); } catch (e) {}
  }
  localStorage.setItem('cachos_imported_' + currentUser.id, '1');
  _pendingLocalImport = null;
  window.location.href = 'app.html';
}

function skipImport() {
  localStorage.setItem('cachos_imported_' + currentUser.id, '1');
  _pendingLocalImport = null;
  window.location.href = 'app.html';
}

document.addEventListener('DOMContentLoaded', () => {
  checkExistingSession();
});
