// ── CachosNutri auth.js — lógica exclusiva do ecrã de login/criar conta ───────
// Usado só por login.html. Ao autenticar com sucesso, navega para app.html
// (página real, não uma secção escondida) — este ficheiro não sabe nada sobre
// o dashboard/planos/etc., só sobre entrar/criar conta e a decisão de importar
// dados locais pré-existentes.

let currentUser         = null;
let _pendingLocalImport = null;
let _signupRole         = 'nutricionista';

function switchAuthTab(which) {
  const isLogin = which === 'login';
  document.getElementById('auth-tab-login').classList.toggle('active', isLogin);
  document.getElementById('auth-tab-signup').classList.toggle('active', !isLogin);
  document.getElementById('auth-form-login').style.display  = isLogin ? '' : 'none';
  document.getElementById('auth-form-signup').style.display = isLogin ? 'none' : '';
  // Limpa sempre o formulário que fica escondido — nunca deixar dados (nome,
  // email, password) preenchidos num ecrã de autenticação que já não está visível.
  const hiddenForm = document.getElementById(isLogin ? 'auth-form-signup' : 'auth-form-login');
  if (hiddenForm) hiddenForm.reset();
  if (!isLogin) switchSignupRole('nutricionista'); // estado inicial sempre previsível ao reabrir o separador
}

// Alterna entre os 2 conjuntos de campos do formulário de registo. Crucial:
// um campo escondido com "required" continua a bloquear o submit do form, por
// isso os atributos required têm de ser alternados aqui também, não só o
// display — senão o bloco escondido impede sempre o envio.
function switchSignupRole(role) {
  const isNutri = role === 'nutricionista';
  _signupRole = role;
  document.getElementById('signup-role-nutri').classList.toggle('active', isNutri);
  document.getElementById('signup-role-estudante').classList.toggle('active', !isNutri);
  document.getElementById('signup-fields-nutricionista').style.display = isNutri ? '' : 'none';
  document.getElementById('signup-fields-estudante').style.display = isNutri ? 'none' : '';
  document.getElementById('auth-signup-pais').required = isNutri;
  document.getElementById('auth-signup-cedula').required = isNutri;
  document.getElementById('auth-signup-instituicao').required = !isNutri;
}

function showAuthError(which, msg) {
  const el = document.getElementById(`auth-${which}-error`);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', !!msg);
}

// traduzErroAuth() vem de shared.js — partilhada com portal.js e app.js.

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

// Contas de paciente não devem entrar na app do nutricionista (têm o próprio
// portal, portal.html) — esta app só carrega dados via nutricionista_id, então
// uma conta de paciente ficaria só a ver um dashboard vazio e confuso.
//
// Devolve true (é nutricionista OU estudante — desde a Fase 2 um estudante
// aprovado usa exatamente a mesma app.html), false (é paciente/admin) ou null
// (sessão órfã — utilizador autenticado sem linha em "profiles").
async function verificarRoleProfissional(user) {
  const { data: prof, error } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // 0 linhas — sessão órfã
    return true; // erro transitório (rede, etc.) — não bloqueia
  }
  // Explicitamente esta lista (não "!== 'paciente'") — desde que existe o role
  // 'admin', uma conta admin também não deve cair no dashboard de app.html.
  return prof.role === 'nutricionista' || prof.role === 'estudante';
}

async function handleLogin() {
  const email    = document.getElementById('auth-login-email').value.trim();
  const password = document.getElementById('auth-login-password').value;
  showAuthError('login', '');
  const btn = document.getElementById('auth-login-btn');
  setButtonLoading(btn, true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { setButtonLoading(btn, false); showAuthError('login', traduzErroAuth(error.message)); return; }
  const isNutri = await verificarRoleProfissional(data.user);
  if (isNutri === null) {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    showAuthError('login', 'Não foi possível entrar com esta conta nesta área.');
    return;
  }
  if (!isNutri) {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    // Não diz de que tipo é a conta (evita confirmar a quem tenta entrar aqui
    // que estes dados de acesso pertencem a um paciente) — ver traduzErroAuth
    // para o mesmo princípio nas mensagens de autenticação.
    showAuthError('login', 'Não foi possível entrar com esta conta nesta área.');
    return;
  }
  setButtonLoading(btn, false);
  currentUser = data.user;
  await completeAuthFlow();
}

// PT -> Ordem dos Nutricionistas, BR -> Conselho Regional de Nutricionistas —
// 1:1 fixo, por isso o campo de corpo profissional nunca é editável à parte.
function syncCorpoProfissional() {
  const pais  = document.getElementById('auth-signup-pais').value;
  const corpo = pais === 'PT' ? 'ON' : pais === 'BR' ? 'CRN' : '';
  document.getElementById('auth-signup-corpo').value = corpo;
}

async function handleSignup() {
  const nome     = document.getElementById('auth-signup-nome').value.trim();
  const email    = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  showAuthError('signup', '');

  let signupData;
  if (_signupRole === 'estudante') {
    const instituicao = document.getElementById('auth-signup-instituicao').value.trim();
    const anoConclusao = document.getElementById('auth-signup-ano-conclusao').value;
    if (!instituicao) { showAuthError('signup', 'Indique a sua instituição de ensino.'); return; }
    signupData = {
      role: 'estudante', nome,
      instituicao_ensino: instituicao,
      ano_conclusao_previsto: anoConclusao || null,
    };
  } else {
    const pais   = document.getElementById('auth-signup-pais').value;
    const cedula = document.getElementById('auth-signup-cedula').value.trim();
    const corpo  = pais === 'PT' ? 'ON' : pais === 'BR' ? 'CRN' : '';
    if (!pais) { showAuthError('signup', 'Selecione o país de atuação.'); return; }
    if (!cedula) { showAuthError('signup', 'Indique o nº de cédula profissional.'); return; }
    signupData = { role: 'nutricionista', nome, cedula, pais_atuacao: pais, corpo_profissional: corpo };
  }

  const btn = document.getElementById('auth-signup-btn');
  setButtonLoading(btn, true);
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: signupData } });
  setButtonLoading(btn, false);
  if (error) { showAuthError('signup', traduzErroAuth(error.message)); return; }
  if (!data.session) {
    const msg = _signupRole === 'estudante'
      ? 'Enviámos um email de confirmação. Se usar o email da sua instituição de ensino, a validação é automática depois de confirmar; caso contrário, vai ser-lhe pedido o comprovativo de matrícula ao entrar.'
      : 'Enviámos um email de confirmação. Depois de confirmar, entre com os seus dados — vai ser-lhe pedido para submeter os documentos de verificação profissional antes de ter acesso à app.';
    showAlertModal(msg, { type: 'info', title: 'Confirme o seu email' });
    return;
  }

  currentUser = data.user;
  // Sem confirmação de email a bloquear (sessão já vem criada) — mostra o
  // próximo passo num modal antes de avançar, em vez de texto sempre visível
  // no formulário. Só continua para app.html depois de o utilizador fechar.
  const nextStepMsg = _signupRole === 'estudante'
    ? 'Conta criada! Se o seu email não for reconhecido como académico, vai ser-lhe pedido o comprovativo de matrícula antes de ter acesso à app.'
    : 'Conta criada! Vai precisar de submeter o comprovativo da sua cédula profissional e um documento de identificação — o acesso à app só é liberado após aprovação.';
  showAlertModal(nextStepMsg, { type: 'info', title: 'Registo concluído', onClose: completeAuthFlow });
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
  const erro = new URLSearchParams(window.location.search).get('erro');
  if (erro === 'sem_acesso') {
    showAuthError('login', 'Não foi possível entrar com esta conta nesta área.');
  } else if (erro === 'sessao_invalida') {
    showAuthError('login', 'A tua sessão já não é válida. Inicia sessão novamente.');
  }
  checkExistingSession();
});
