// ── CachosNutri portal.js — Portal do Paciente (MVP read-only) ─────────────────
// Entry point próprio (portal.html), sem depender de app.js (que arranca
// initApp()/initSearch() automaticamente e está acoplado ao DOM do nutricionista).
// DAYS, escHtml, scale, formatDate e renderEvolutionCharts vêm de js/shared.js.

let portalUser    = null;
let portalClients = [];
let portalClient  = null;
let portalPlan    = null;
let portalDayIdx  = 0;
let portalMealViewIdx = 0;      // posição na lista de refeições do dia (com alimentos) atualmente visível
let portalWaterToday = 0;
let portalTodayIdx = 0;          // dia real de hoje — não muda ao navegar com changePortalDay
// { [day_index]: { [meal_index]: { status, note } } } — estado mais recente conhecido por
// slot de dia da semana do plano atual, mas só dentro da SEMANA ATUAL (ver
// get_latest_meal_status/log_date no schema.sql) — um dia futuro desta semana sem log
// próprio não herda o estado da mesma posição numa semana anterior (bug já corrigido:
// marcar sexta como feita não podia deixar a sexta seguinte já verde antes de chegar).
let portalMealStatusByDay = {};
let _noteModalMealIndex = null;

// { [meal_index]: comment } — comentários do nutricionista, só para o dia real de hoje
// (mesma restrição de portalFotosByDate/isToday: portalDayIdx não distingue semanas
// diferentes, por isso um comentário "de terça" não tem uma data real única fora de
// hoje neste ecrã). Ver também no story-viewer de fotos, que já navega por datas reais.
let portalMealCommentsByDate = {};

// ── Fotos de refeições ─────────────────────────────────────────────────────
// Cada foto liga-se à refeição real do plano (meal_index, tal como meal_logs) — não há
// categorias fixas, já que o nutricionista pode ter qualquer número de refeições por dia.
// meal_name é guardado em duplicado (denormalizado) para a legenda continuar correta mesmo
// que o plano mude de estrutura mais tarde. Tirar a foto acontece no card da refeição (tab
// "Plano de hoje"); a tab "Fotos" é só um calendário/visualizador (estilo Instagram).
let portalFotosByDate = {};             // { [date]: { [meal_index]: {storage_path, meal_name} } }
let portalFotosTodayDate = null;        // fixo no load, como portalTodayIdx
let portalFotosLoadedMonths = new Set();// 'yyyy-m' já carregados — evita repetir queries ao navegar
let portalCalYear = null;
let portalCalMonth = null;              // 0-indexado
let portalFotosSelectedDate = null;     // dia selecionado no calendário da tab Fotos
let _pendingPhotoMealIndex = null;      // definido antes de abrir o file picker escondido

// O código de convite tem de sobreviver ao hiato entre "criar conta" e
// "confirmar o e-mail" (que normalmente reabre o browser sem estado em memória),
// por isso fica em localStorage em vez de numa variável — assim é consumido
// automaticamente no primeiro login/sessão que se seguir, sem o paciente ter de
// voltar a escrevê-lo.
const PENDING_INVITE_KEY = 'cachos_portal_pending_invite_code';
function setPendingInviteCode(code) {
  try { localStorage.setItem(PENDING_INVITE_KEY, code); } catch (e) {}
}
function takePendingInviteCode() {
  try {
    const code = localStorage.getItem(PENDING_INVITE_KEY);
    if (code) localStorage.removeItem(PENDING_INVITE_KEY);
    return code;
  } catch (e) { return null; }
}

// ── Auth: tabs / erros ───────────────────────────────────────────────────────
function switchPortalAuthTab(which) {
  const isLogin = which === 'login';
  document.getElementById('portal-tab-login').classList.toggle('active', isLogin);
  document.getElementById('portal-tab-signup').classList.toggle('active', !isLogin);
  document.getElementById('portal-form-login').style.display  = isLogin ? '' : 'none';
  document.getElementById('portal-form-signup').style.display = isLogin ? 'none' : '';
  // Limpa sempre o formulário que fica escondido — nunca deixar dados (nome,
  // email, password) preenchidos num ecrã de autenticação que já não está visível.
  const hiddenForm = document.getElementById(isLogin ? 'portal-form-signup' : 'portal-form-login');
  if (hiddenForm) hiddenForm.reset();
}

function showPortalAuthError(which, msg) {
  const el = document.getElementById(`portal-${which}-error`);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', !!msg);
}

// traduzErroAuth() vem de shared.js — partilhada com auth.js e app.js.

// ── Auth: ações ──────────────────────────────────────────────────────────────
// Contas de nutricionista não devem entrar no portal do paciente (têm a app
// principal, app.html) — aqui os dados são filtrados por paciente_id, então uma
// conta de nutricionista ficaria só a ver "sem dados" de forma confusa.
//
// Devolve true (é paciente), false (é nutricionista) ou null (sessão órfã —
// existe um utilizador autenticado mas sem linha em "profiles", ex: apagada
// manualmente numa limpeza de testes). Uma sessão órfã tem de ser tratada à
// parte: nunca deve avançar para aceitar convites com um auth.uid() que a
// tabela profiles desconhece (viola a foreign key de paciente_id).
async function verificarRolePaciente(user) {
  const { data: prof, error } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // 0 linhas — sessão órfã
    return true; // erro transitório (rede, etc.) — não bloqueia
  }
  return prof.role === 'paciente';
}

async function handlePortalLogin() {
  const email    = document.getElementById('portal-login-email').value.trim();
  const password = document.getElementById('portal-login-password').value;
  showPortalAuthError('login', '');
  const btn = document.getElementById('portal-login-btn');
  setButtonLoading(btn, true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { setButtonLoading(btn, false); showPortalAuthError('login', traduzErroAuth(error.message)); return; }
  const isPaciente = await verificarRolePaciente(data.user);
  if (isPaciente === null) {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    showPortalAuthError('login', 'Não foi possível entrar com esta conta nesta área.');
    return;
  }
  if (!isPaciente) {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    // Não diz de que tipo é a conta (evita confirmar a quem tenta entrar aqui
    // que estes dados de acesso pertencem a um nutricionista).
    showPortalAuthError('login', 'Não foi possível entrar com esta conta nesta área.');
    return;
  }
  setButtonLoading(btn, false);
  portalUser = data.user;
  await afterPortalAuth();
}

async function handlePortalSignup() {
  const nome     = document.getElementById('portal-signup-nome').value.trim();
  const email    = document.getElementById('portal-signup-email').value.trim();
  const password = document.getElementById('portal-signup-password').value;
  const code     = document.getElementById('portal-signup-code').value.trim().toUpperCase();
  showPortalAuthError('signup', '');
  if (!code) { showPortalAuthError('signup', 'Introduza o código de convite recebido por email.'); return; }
  const btn = document.getElementById('portal-signup-btn');
  setButtonLoading(btn, true);
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: {
      data: { role: 'paciente', nome },
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
  setButtonLoading(btn, false);
  if (error) { showPortalAuthError('signup', traduzErroAuth(error.message)); return; }

  setPendingInviteCode(code);

  if (!data.session) {
    switchPortalAuthTab('login');
    showPortalAuthError('login', 'Conta criada! Verifique o seu e-mail para confirmar e depois inicie sessão aqui.');
    return;
  }
  portalUser = data.user;
  await afterPortalAuth();
}

function confirmPortalLogout() {
  showConfirm(
    'Terminar sessão',
    'Tem a certeza que quer terminar a sessão?',
    handlePortalLogout,
    'Terminar sessão'
  );
}

async function handlePortalLogout() {
  await sb.auth.signOut();
  portalUser = null;
  portalClients = [];
  portalClient = null;
  portalPlan = null;
  portalProfile = { nome: '', email: '', photo: '', nascimento: '', sexo: '', telefone: '' };
  // Limpa a cache local do perfil — a chave não é por utilizador, por isso
  // sem isto outro paciente que entre a seguir no mesmo dispositivo via um
  // instante o nome/foto do paciente anterior antes de a rede confirmar.
  try { localStorage.removeItem(PORTAL_PROFILE_CACHE_KEY); } catch (e) {}
  closePortalProfileMenu();

  // No PWA instalado (telemóvel), a landing page é para nutricionistas/visitantes
  // — não faz sentido o paciente ser levado para lá ao sair. Em vez de navegar,
  // tenta fechar a janela (funciona nalguns contextos standalone Android) e, já
  // que fechar não é garantido em todos os browsers/SOs, mostra sempre o ecrã de
  // login do próprio portal como destino seguro caso o fecho não aconteça.
  const isStandalonePwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalonePwa) {
    window.close();
    showPortalAuth();
    return;
  }
  window.location.href = 'index.html';
}

async function afterPortalAuth() {
  const code = takePendingInviteCode();
  if (code) {
    const ok = await acceptInviteCode(code);
    if (!ok) showAlertModal('O código de convite não é válido ou já foi utilizado. Pode pedir um novo ao seu nutricionista, ou introduzi-lo manualmente mais tarde.', { title: 'Convite inválido' });
  }
  showPortalApp();
  await loadPortalData(); // já traz o perfil embutido (ver dentro da função)
}

// ── Perfil e Definições do paciente ──────────────────────────────────────────
// profiles.nome/email/photo_url/data_nascimento/sexo/telefone são as mesmas
// colunas já usadas no perfil do nutricionista (ver saveProfile/
// syncProfileToSupabase em app.js), sem cedula (não se aplica ao paciente).
// Estes dados passam a ser só do paciente — a ficha do cliente do lado do
// nutricionista só os mostra, já não os edita (ver app.js). A data de
// nascimento fica permanentemente bloqueada depois de definida uma primeira
// vez (trigger profiles_lock_birthdate em schema.sql) — refletido aqui
// desativando o campo assim que já tiver valor.
let portalProfile = { nome: '', email: '', photo: '', nascimento: '', sexo: '', telefone: '' };
let _portalPendingPhoto = null;

// Cache local do último perfil confirmado pelo Supabase — evita o "flash" de
// dados vazios/avatar por defeito enquanto a rede ainda não respondeu (mesmo
// padrão já usado no perfil do nutricionista, ver appProfile/cachos_profile em
// app.js). Pinta de imediato com o que ficou de uma visita anterior; a rede
// só confirma/corrige a seguir — não acrescenta pedido nenhum ao servidor.
const PORTAL_PROFILE_CACHE_KEY = 'cachos_portal_profile';

function loadCachedPortalProfile() {
  try {
    const raw = localStorage.getItem(PORTAL_PROFILE_CACHE_KEY);
    if (raw) portalProfile = { ...portalProfile, ...JSON.parse(raw) };
  } catch (e) {}
}

function cachePortalProfile() {
  try { localStorage.setItem(PORTAL_PROFILE_CACHE_KEY, JSON.stringify(portalProfile)); } catch (e) {}
}

function applyPortalProfileRow(prof) {
  portalProfile.nome       = prof.nome || (portalClient && portalClient.nome) || '';
  portalProfile.email      = prof.email || '';
  portalProfile.photo      = prof.photo_url || '';
  portalProfile.nascimento = prof.data_nascimento || '';
  portalProfile.sexo       = prof.sexo || '';
  portalProfile.telefone   = prof.telefone || '';
  cachePortalProfile();
  updatePortalProfileUI();
}

// Só usada quando loadPortalData() não conseguiu trazer o perfil já embutido
// (ex: paciente ainda sem nenhum cliente ligado) — no caminho normal, o
// próprio select de loadPortalData() já traz profiles junto (ver abaixo),
// numa só viagem à rede em vez de duas sequenciais. Isto importa sobretudo
// com muitos utilizadores em simultâneo: metade dos pedidos a menos por
// carregamento de página é o que realmente ajuda a escalar, não só a
// perceção de velocidade de um utilizador sozinho.
async function fetchPortalProfile() {
  const { data: prof, error } = await sb.from('profiles').select('nome, email, photo_url, data_nascimento, sexo, telefone').eq('id', portalUser.id).single();
  if (error) { console.error('Erro ao carregar perfil do paciente:', error); return; }
  applyPortalProfileRow(prof);
}

function updatePortalProfileUI() {
  const name = portalProfile.nome || (portalClient && portalClient.nome) || (portalUser && portalUser.email) || 'Paciente';
  const initial = name ? name[0].toUpperCase() : 'P';
  const nameEl = document.getElementById('portal-topbar-name');
  const ddNameEl = document.getElementById('portal-dd-name');
  const clientNameEl = document.getElementById('portal-client-name');
  if (nameEl) nameEl.textContent = name;
  if (ddNameEl) ddNameEl.textContent = name;
  if (clientNameEl) clientNameEl.textContent = name;
  ['portal-topbar-avatar', 'portal-dd-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (portalProfile.photo) {
      el.innerHTML = `<img src="${escHtml(portalProfile.photo)}" alt="">`;
    } else {
      el.textContent = initial;
    }
  });
}

function togglePortalProfileMenu() {
  const dd = document.getElementById('portal-profile-dropdown');
  if (dd.style.display === 'none') openPortalProfileMenu();
  else closePortalProfileMenu();
}

function openPortalProfileMenu() {
  document.getElementById('portal-profile-dropdown').style.display = '';
  document.querySelector('.portal-profile-btn').setAttribute('aria-expanded', 'true');
  // Adiado para o próximo tick — senão o próprio clique que abre o menu (ainda a
  // borbulhar até ao document) fechava-o de imediato.
  setTimeout(() => document.addEventListener('click', _onPortalProfileMenuOutsideClick, true), 0);
}

function closePortalProfileMenu() {
  const dd = document.getElementById('portal-profile-dropdown');
  if (!dd || dd.style.display === 'none') return;
  dd.style.display = 'none';
  document.querySelector('.portal-profile-btn').setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', _onPortalProfileMenuOutsideClick, true);
}

function _onPortalProfileMenuOutsideClick(e) {
  if (!e.target.closest('.portal-profile-wrap')) closePortalProfileMenu();
}

function openPortalSettingsModal() {
  closePortalProfileMenu();
  document.getElementById('portalProfName').value       = portalProfile.nome       || '';
  document.getElementById('portalProfEmail').value      = portalProfile.email      || '';
  document.getElementById('portalProfNascimento').value = portalProfile.nascimento || '';
  document.getElementById('portalProfGenero').value     = portalProfile.sexo       || '';
  document.getElementById('portalProfTelefone').value   = portalProfile.telefone   || '';
  // Uma vez definida, a data de nascimento fica bloqueada para sempre (ver
  // trigger profiles_lock_birthdate) — desativa aqui para o paciente não
  // tentar mudar e só descobrir o erro ao gravar.
  document.getElementById('portalProfNascimento').disabled = !!portalProfile.nascimento;
  _portalPendingPhoto = null;
  updatePortalSettingsPhotoUI();
  document.getElementById('portalNewPassword').value = '';
  document.getElementById('portalConfirmPassword').value = '';
  showFieldError('portal-password-error', '');
  showFieldError('portal-profile-error', '');
  updatePortalConsentStatusText();
  document.getElementById('portalSettingsModal').style.display = '';
}

function closePortalSettingsModal() {
  document.getElementById('portalSettingsModal').style.display = 'none';
}

function updatePortalSettingsPhotoUI() {
  const img     = document.getElementById('portalProfPhotoImg');
  const initial = document.getElementById('portalProfPhotoInitial');
  const photo   = _portalPendingPhoto || portalProfile.photo;
  if (photo) {
    img.src = photo;
    img.style.display = '';
    initial.style.display = 'none';
  } else {
    img.style.display = 'none';
    initial.style.display = '';
    const name = document.getElementById('portalProfName').value || portalProfile.nome || 'P';
    initial.textContent = name[0].toUpperCase();
  }
}

// Mesmo mecanismo de handlePhotoUpload() em app.js: reduz a imagem a no máximo
// 300px via canvas e guarda como data-URI JPEG — sem bucket de Storage, tal
// como o perfil do nutricionista (ver profiles.photo_url).
function handlePortalPhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 300 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      _portalPendingPhoto = canvas.toDataURL('image/jpeg', 0.85);
      updatePortalSettingsPhotoUI();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function savePortalProfile() {
  showFieldError('portal-profile-error', '');
  const nome       = document.getElementById('portalProfName').value.trim();
  const email      = document.getElementById('portalProfEmail').value.trim();
  const nascimento = document.getElementById('portalProfNascimento').value || null;
  const sexo       = document.getElementById('portalProfGenero').value || null;
  const telefone   = document.getElementById('portalProfTelefone').value.trim();
  const payload = { nome, email, data_nascimento: nascimento, sexo, telefone };
  if (_portalPendingPhoto) payload.photo_url = _portalPendingPhoto;
  const { error } = await sb.from('profiles').update(payload).eq('id', portalUser.id);
  if (error) {
    console.error('Erro ao guardar perfil do paciente:', error);
    // A data de nascimento pode recusar por já estar definida (trigger
    // profiles_lock_birthdate) — não deve acontecer com o campo desativado,
    // mas cobre qualquer outra tentativa (ex: API direta).
    showFieldError('portal-profile-error', 'Não foi possível guardar o perfil. Tente novamente.');
    return;
  }
  portalProfile.nome       = nome;
  portalProfile.email      = email;
  portalProfile.nascimento = nascimento || '';
  portalProfile.sexo       = sexo || '';
  portalProfile.telefone   = telefone;
  if (_portalPendingPhoto) { portalProfile.photo = _portalPendingPhoto; _portalPendingPhoto = null; }
  document.getElementById('portalProfNascimento').disabled = !!portalProfile.nascimento;
  cachePortalProfile();
  updatePortalProfileUI();
  showToast('Perfil guardado');
}

// Só troca profiles.email (o que o nutricionista vê) — não chama auth.updateUser,
// por isso o login continua a ser feito com o email original. Ver contexto no
// plano: mudança de email é só um campo de contacto, sem fluxo de confirmação.
async function savePortalPassword() {
  const pass    = document.getElementById('portalNewPassword').value;
  const confirm = document.getElementById('portalConfirmPassword').value;
  showFieldError('portal-password-error', '');
  if (!pass || pass.length < 8) { showFieldError('portal-password-error', 'A password deve ter pelo menos 8 caracteres.'); return; }
  if (pass !== confirm) { showFieldError('portal-password-error', 'As passwords não coincidem.'); return; }
  const { error } = await sb.auth.updateUser({ password: pass });
  if (error) { showFieldError('portal-password-error', traduzErroAuth(error.message)); return; }
  document.getElementById('portalNewPassword').value = '';
  document.getElementById('portalConfirmPassword').value = '';
  showToast('Password atualizada');
}

async function updatePortalConsentStatusText() {
  const el = document.getElementById('portal-consent-status-text');
  if (!portalClient) { el.textContent = 'Sem consentimento registado.'; return; }
  const { data, error } = await sb.from('patient_consents').select('consented_at').eq('client_id', portalClient.id).maybeSingle();
  if (error || !data) { el.textContent = 'Sem consentimento registado.'; return; }
  el.textContent = `Consentimento aceite em ${formatDate(data.consented_at)}.`;
}

// ── Convite ──────────────────────────────────────────────────────────────────
function getInviteCodeFromUrl() {
  const code = new URLSearchParams(window.location.search).get('invite');
  return code ? code.trim().toUpperCase() : null;
}

async function acceptInviteCode(code) {
  try {
    const { error } = await sb.rpc('accept_invite', { p_code: code });
    if (error) throw error;
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.pathname + url.search);
    return true;
  } catch (e) {
    console.error('Erro ao aceitar convite:', e);
    return false;
  }
}

async function submitManualInviteCode() {
  const el = document.getElementById('portal-manual-code');
  const code = el.value.trim().toUpperCase();
  if (!code) return;
  const ok = await acceptInviteCode(code);
  if (!ok) { showAlertModal('Código inválido ou já utilizado.', { title: 'Convite inválido' }); return; }
  el.value = '';
  await loadPortalData();
}

// ── View switching ───────────────────────────────────────────────────────────
function showPortalAuth() {
  document.getElementById('portal-auth').style.display = '';
  document.getElementById('portal-app').style.display  = 'none';
}

function showPortalApp() {
  document.getElementById('portal-auth').style.display = 'none';
  document.getElementById('portal-app').style.display  = '';
}

// ── Data loading ─────────────────────────────────────────────────────────────
function rowToPortalClient(row) {
  return {
    id: row.id,
    nome: row.nome,
    info: row.info || {},
    consultations: (row.consultations || [])
      .slice().sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(rowToPortalConsultation),
    plans: (row.plans || [])
      .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(rowToPortalPlan)
  };
}

function rowToPortalPlan(row) {
  return {
    id: row.id,
    nome: row.nome,
    macroTargets: row.macro_targets,
    waterMl: row.water_ml,
    days: row.days && row.days.length ? row.days : null
  };
}

function rowToPortalConsultation(row) {
  return {
    id: row.id,
    date: new Date(row.date).getTime(),
    peso: row.peso, imc: row.imc, massaGorda: row.massa_gorda, mig: row.mig,
    somatorioPregas: row.somatorio_pregas,
    perCinturaISAK: row.per_cintura_isak, perAnca: row.per_anca, perBraco: row.per_braco,
    notes: row.notes
  };
}

async function loadPortalData() {
  // Pinta já com o último perfil confirmado (cache local), antes de qualquer
  // pedido à rede — evita mostrar nome/avatar por defeito enquanto se espera
  // pela resposta (ver loadCachedPortalProfile/cachePortalProfile acima).
  loadCachedPortalProfile();
  updatePortalProfileUI();

  // profiles!paciente_id vem embutido na mesma viagem — clients.paciente_id é
  // sempre o próprio paciente autenticado aqui, por isso este embed traz o seu
  // próprio perfil (nome/email/foto/nascimento/género/telefone) sem precisar
  // de um segundo pedido a seguir (fetchPortalProfile fica só de reserva para
  // quando ainda não há nenhum cliente ligado, ver abaixo). Um pedido a menos
  // por carregamento de página importa sobretudo com muitos utilizadores em
  // simultâneo — é isso, não só a perceção de velocidade, que ajuda a escalar.
  const { data: rows, error } = await sb
    .from('clients')
    .select('id, nome, info, plans(id, nome, macro_targets, water_ml, days, created_at), consultations(*), profiles!paciente_id(nome, email, photo_url, data_nascimento, sexo, telefone)')
    .eq('paciente_id', portalUser.id);

  portalClients = error ? [] : (rows || []).map(rowToPortalClient);
  if (error) {
    console.error('Erro ao carregar dados do portal:', error);
    showAlertModal('Não foi possível carregar os seus dados. Tente novamente mais tarde.');
  }

  const profRow = rows && rows[0] && (Array.isArray(rows[0].profiles) ? rows[0].profiles[0] : rows[0].profiles);
  if (profRow) applyPortalProfileRow(profRow);
  else if (!error) fetchPortalProfile(); // sem cliente ligado ainda — só aqui vale a pena o segundo pedido

  if (!portalClients.length) {
    document.getElementById('portal-empty').style.display = '';
    document.getElementById('portal-main').style.display  = 'none';
    updatePortalProfileUI();
    return;
  }
  document.getElementById('portal-empty').style.display = 'none';
  document.getElementById('portal-main').style.display  = '';

  portalClient = portalClients[0];
  portalPlan   = portalClient.plans[0] || null;
  document.getElementById('portal-client-name').textContent = portalClient.nome;
  updatePortalProfileUI();
  document.getElementById('portal-plan-sub').textContent = portalPlan
    ? `· ${portalPlan.nome || 'Sem nome'}`
    : '';

  if (!(await hasPatientConsent(portalClient.id))) {
    showPortalConsentGate();
    return;
  }
  await continuePortalDataLoad();
}

async function continuePortalDataLoad() {
  const jsDay = new Date().getDay();
  portalDayIdx = (jsDay + 6) % 7; // JS: 0=Domingo..6=Sábado → DAYS: 0=Segunda..6=Domingo
  portalTodayIdx = portalDayIdx;

  portalFotosTodayDate = localDateStr();
  portalFotosSelectedDate = portalFotosTodayDate;
  const today = new Date();
  portalCalYear = today.getFullYear();
  portalCalMonth = today.getMonth();
  portalFotosByDate = {};
  portalFotosLoadedMonths = new Set();

  // Os 4 pedidos são independentes entre si (cada um só escreve o seu próprio
  // estado — portalWaterToday/portalMealStatusByDay/portalMealCommentsByDate/
  // portalFotosByDate — nenhum lê o resultado dos outros), por isso correm em
  // paralelo em vez de um a seguir ao outro. Antes disto, o ecrã ficava com o
  // nome/separadores já visíveis mas o conteúdo do "Plano de hoje" em branco
  // durante a soma de 4 pedidos sequenciais.
  await Promise.all([
    loadWaterToday(),
    loadMealStatusByDay(),
    loadMealCommentsForToday(),
    ensurePortalFotosMonthLoaded(portalCalYear, portalCalMonth)
  ]);

  showPortalTab('plano');
  maybeShowPortalInstallBanner();
}

// ── Consentimento RGPD (dado pelo próprio paciente, não pelo nutricionista) ───
async function hasPatientConsent(clientId) {
  const { data, error } = await sb.from('patient_consents').select('id').eq('client_id', clientId).maybeSingle();
  if (error) { console.error('Erro ao verificar consentimento:', error); return true; } // erro transitório não bloqueia quem já tinha acesso
  return !!data;
}

function showPortalConsentGate() {
  document.getElementById('portal-consent-checkbox').checked = false;
  togglePortalConsentBtn();
  document.getElementById('portal-main').style.display = 'none';
  document.getElementById('portal-consent-modal').style.display = 'flex';
}

function togglePortalConsentBtn() {
  document.getElementById('portal-consent-btn').disabled = !document.getElementById('portal-consent-checkbox').checked;
}

async function acceptPortalConsent() {
  if (!document.getElementById('portal-consent-checkbox').checked) return;
  const btn = document.getElementById('portal-consent-btn');
  btn.disabled = true;
  const { error } = await sb.from('patient_consents').upsert({ client_id: portalClient.id }, { onConflict: 'client_id' });
  if (error) {
    console.error('Erro ao registar consentimento:', error);
    showAlertModal('Não foi possível registar o consentimento. Tente novamente.');
    btn.disabled = false;
    return;
  }
  document.getElementById('portal-consent-modal').style.display = 'none';
  document.getElementById('portal-main').style.display = '';
  await continuePortalDataLoad();
}

// ── Água diária ──────────────────────────────────────────────────────────────
async function loadWaterToday() {
  const [start, end] = localDayRangeISO();
  const { data, error } = await sb
    .from('daily_water_logs')
    .select('amount_ml')
    .eq('client_id', portalClient.id)
    .gte('logged_at', start)
    .lt('logged_at', end);
  if (error) { console.error('Erro ao carregar água de hoje:', error); portalWaterToday = 0; return; }
  portalWaterToday = (data || []).reduce((sum, r) => sum + r.amount_ml, 0);
}

async function logWater(amountMl) {
  if (!portalClient || !amountMl || amountMl <= 0) return;
  const { error } = await sb.from('daily_water_logs').insert({ client_id: portalClient.id, amount_ml: amountMl });
  if (error) {
    console.error('Erro ao registar água:', error);
    showToast('Não foi possível registar a água. Tente novamente.', 'error');
    return;
  }
  portalWaterToday += amountMl;
  showToast(`💧 ${amountMl} ml registados`);
  if (document.getElementById('pt-plano').classList.contains('active')) renderPortalPlano();
}

function logWaterCustom() {
  const el = document.getElementById('portal-water-custom-input');
  const val = parseInt(el.value, 10);
  if (!val || val <= 0) return;
  el.value = '';
  logWater(val);
}

// ── Refeições feitas/saltadas (só para o dia de hoje) ─────────────────────────
async function loadMealStatusByDay() {
  portalMealStatusByDay = {};
  if (!portalPlan) return;
  // meal_logs é append-only (uma linha nova por cada mudança de estado) — em vez de
  // trazer o histórico inteiro do plano e filtrar em JS, a função get_latest_meal_status
  // já devolve só a linha mais recente por (day_index, meal_index) via "distinct on"
  // do lado da base de dados (ver PAGINATION.md). A janela [início desta semana, início
  // da próxima) é essencial, não só uma otimização: sem ela, um dia futuro desta semana
  // (ex: sexta, se hoje é quinta) herdava o estado da mesma posição numa semana anterior.
  const weekStart = localDateStr(-portalTodayIdx);
  const weekEnd = localDateStr(7 - portalTodayIdx);
  const { data, error } = await sb.rpc('get_latest_meal_status', {
    p_client_id: portalClient.id,
    p_plan_id: portalPlan.id,
    p_week_start: weekStart,
    p_week_end: weekEnd
  });
  if (error) { console.error('Erro ao carregar estado das refeições:', error); return; }
  (data || []).forEach(r => {
    portalMealStatusByDay[r.day_index] = portalMealStatusByDay[r.day_index] || {};
    portalMealStatusByDay[r.day_index][r.meal_index] = { status: r.status, note: r.note, horaReal: r.hora_real };
  });
}

async function loadMealCommentsForToday() {
  portalMealCommentsByDate = {};
  if (!portalClient || !portalFotosTodayDate) return;
  const { data, error } = await sb
    .from('meal_comments')
    .select('meal_index, comment')
    .eq('client_id', portalClient.id)
    .eq('log_date', portalFotosTodayDate);
  if (error) { console.error('Erro ao carregar comentários do nutricionista:', error); return; }
  (data || []).forEach(r => { portalMealCommentsByDate[r.meal_index] = r.comment; });
}

function showMealComment(mealIndex) {
  const comment = portalMealCommentsByDate[mealIndex];
  if (!comment) return;
  showAlertModal(comment, { type: 'info', title: 'Comentário do nutricionista' });
}

async function logMealStatus(mealIndex, status, note, isNoteSave, horaReal) {
  if (!portalClient || !portalPlan) return;
  const { error } = await sb.from('meal_logs').insert({
    client_id: portalClient.id,
    plan_id: portalPlan.id,
    day_index: portalTodayIdx,
    log_date: localDateStr(0), // logMealStatus só regista sempre para "hoje" — nunca outro dia
    meal_index: mealIndex,
    status,
    note: note || null,
    hora_real: horaReal || null
  });
  if (error) {
    console.error('Erro ao registar refeição:', error);
    showToast('Não foi possível registar a refeição. Tente novamente.', 'error');
    return;
  }
  portalMealStatusByDay[portalTodayIdx] = portalMealStatusByDay[portalTodayIdx] || {};
  portalMealStatusByDay[portalTodayIdx][mealIndex] = { status, note: note || null, horaReal: horaReal || null };
  // isNoteSave força a mensagem a falar da nota (não do status done/skipped, que
  // vem só preservado do que já estava antes — saveNoteModal() reenvia esse
  // status para não o perder, não para o anunciar de novo). Dentro disso, a
  // mensagem ainda depende de ter sido escrito texto ou deixado em branco.
  showToast(isNoteSave ? (note ? 'Anotação guardada' : 'Anotação removida') : status === 'done' ? '✓ Refeição marcada como feita' : 'Refeição marcada como saltada');
  if (document.getElementById('pt-plano').classList.contains('active')) renderPortalPlano();
}

function openNoteModal(mealIndex) {
  _noteModalMealIndex = mealIndex;
  const existing = portalMealStatusByDay[portalTodayIdx]?.[mealIndex];
  const meal = portalPlan?.days?.[portalTodayIdx]?.meals?.[mealIndex];
  document.getElementById('note-modal-textarea').value = existing?.note || '';
  document.getElementById('note-modal-hora').value = existing?.horaReal || meal?.hora || '';
  document.getElementById('noteModal').style.display = '';
}

function closeNoteModal() {
  document.getElementById('noteModal').style.display = 'none';
  _noteModalMealIndex = null;
}

async function saveNoteModal() {
  const mealIndex = _noteModalMealIndex;
  if (mealIndex == null) return;
  const note = document.getElementById('note-modal-textarea').value.trim();
  const horaReal = document.getElementById('note-modal-hora').value.trim();
  const currentStatus = portalMealStatusByDay[portalTodayIdx]?.[mealIndex]?.status || 'modified';
  closeNoteModal();
  await logMealStatus(mealIndex, currentStatus, note, true, horaReal);
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function showPortalTab(tab) {
  document.getElementById('pt-plano').classList.toggle('active', tab === 'plano');
  document.getElementById('pt-evolucao').classList.toggle('active', tab === 'evolucao');
  document.getElementById('pt-fotos').classList.toggle('active', tab === 'fotos');
  document.getElementById('portal-view-plano').style.display    = tab === 'plano'    ? '' : 'none';
  document.getElementById('portal-view-evolucao').style.display = tab === 'evolucao' ? '' : 'none';
  document.getElementById('portal-view-fotos').style.display    = tab === 'fotos'    ? '' : 'none';
  if (tab === 'plano') renderPortalPlano();
  else if (tab === 'evolucao') renderPortalEvolucao();
  else renderPortalFotos();
}

// ── Plano de hoje (read-only) ────────────────────────────────────────────────
function changePortalDay(delta) {
  portalDayIdx = (portalDayIdx + delta + 7) % 7;
  portalMealViewIdx = 0;
  renderPortalPlano();
}

function changePortalMeal(delta) {
  portalMealViewIdx += delta;
  renderPortalPlano();
}

function renderPortalPlano() {
  const el = document.getElementById('portal-view-plano');
  if (!portalPlan || !portalPlan.days) {
    el.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <div class="empty-state-title">Sem plano ativo</div>
        <div class="empty-state-sub">O seu nutricionista ainda não criou um plano alimentar.</div>
      </div>`;
    return;
  }

  const day = portalPlan.days[portalDayIdx];
  const allMeals = day?.meals || [];
  // Preserva o índice real em allMeals (usado como meal_index) — filtrar antes de mapear
  // desalinharia o índice, já que nem todas as refeições têm alimentos.
  const indexedMeals = allMeals
    .map((meal, idx) => ({ meal, idx }))
    .filter(x => x.meal.foods && x.meal.foods.length);
  const isToday = portalDayIdx === portalTodayIdx;

  portalMealViewIdx = indexedMeals.length
    ? ((portalMealViewIdx % indexedMeals.length) + indexedMeals.length) % indexedMeals.length
    : 0;

  const dayTot = { kcal: 0, prot: 0, hc: 0, lip: 0 };
  allMeals.forEach(m => (m.foods || []).forEach(fi => {
    const s = scale(fi.food, fi.qty);
    dayTot.kcal += s.kcal; dayTot.prot += s.prot; dayTot.hc += s.hc; dayTot.lip += s.lip;
  }));

  let mealNavHTML = '';
  let mealsHTML;
  if (indexedMeals.length) {
    const { meal, idx } = indexedMeals[portalMealViewIdx];
    const rows = meal.foods.map(fi => {
      const s = scale(fi.food, fi.qty);
      return `
        <div class="portal-food-row">
          <span class="portal-food-name">${escHtml(fi.food.nome)}</span>
          <span class="portal-food-qty">${fi.qty}g</span>
          <span class="portal-food-kcal">${s.kcal.toFixed(0)} kcal</span>
        </div>`;
    }).join('');
    const entry = portalMealStatusByDay[portalDayIdx]?.[idx];
    const status = entry?.status;
    const photoEntry = isToday ? portalFotosByDate[portalFotosTodayDate]?.[idx] : null;
    const comment = isToday ? portalMealCommentsByDate[idx] : null;
    const commentBtnHTML = comment
      ? `<button class="portal-meal-btn-icon portal-meal-btn-icon--comment active" onclick="showMealComment(${idx})" type="button" title="O nutricionista comentou">💬</button>`
      : '';
    const statusHTML = isToday ? `
      <div class="portal-meal-status">
        <button class="portal-meal-btn portal-meal-btn--done${status === 'done' ? ' active' : ''}" onclick="logMealStatus(${idx}, 'done')" type="button">Feita</button>
        <button class="portal-meal-btn portal-meal-btn--skip${status === 'skipped' ? ' active' : ''}" onclick="logMealStatus(${idx}, 'skipped')" type="button">Saltada</button>
        <button class="portal-meal-btn portal-meal-btn--note${entry?.note ? ' active' : ''}" onclick="openNoteModal(${idx})" type="button">Nota</button>
        <button class="portal-meal-btn-icon portal-meal-btn-icon--photo${photoEntry ? ' active' : ''}" onclick="handleMealPhotoTap(${idx})" type="button" title="${photoEntry ? 'Ver/substituir foto' : 'Adicionar foto'}">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
        ${commentBtnHTML}
      </div>` : '';
    const cardClass = status === 'done' ? ' portal-meal-card--done' : status === 'skipped' ? ' portal-meal-card--skipped' : '';
    mealsHTML = `
      <div class="portal-meal-card${cardClass}">
        <div class="portal-meal-header">
          <span class="portal-meal-name">${escHtml(meal.nome)}</span>
          ${meal.hora ? `<span class="portal-meal-time">${meal.hora}</span>` : ''}
        </div>
        <div class="portal-food-rows">${rows}</div>
        ${statusHTML}
      </div>`;
    const hasMultiple = indexedMeals.length > 1;
    mealNavHTML = `
      <div class="portal-meal-nav">
        <button class="portal-day-nav-btn" onclick="changePortalMeal(-1)" type="button" aria-label="Refeição anterior"${hasMultiple ? '' : ' style="visibility:hidden"'}>‹</button>
        <span class="portal-meal-nav-label">Refeições<span class="portal-meal-nav-count">${portalMealViewIdx + 1}/${indexedMeals.length}</span></span>
        <button class="portal-day-nav-btn" onclick="changePortalMeal(1)" type="button" aria-label="Próxima refeição"${hasMultiple ? '' : ' style="visibility:hidden"'}>›</button>
      </div>`;
  } else {
    mealsHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <div class="empty-state-title">Sem refeições planeadas</div>
        <div class="empty-state-sub">Não há alimentos registados para ${DAYS[portalDayIdx]}.</div>
      </div>`;
  }

  const target = portalPlan.waterMl;
  const pct = target ? Math.min(100, Math.round((portalWaterToday / target) * 100)) : 0;
  const waterHTML = `
    <div class="portal-section">
      <div class="portal-section-title">
        <svg width="14" height="14" fill="none" stroke="var(--water-fg)" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 8 2 13a10 10 0 0020 0C22 8 17.5 2 12 2z"/></svg>
        Água diária
      </div>
      <div class="portal-water-widget">
        <div class="portal-water-header">
          <span>💧 <b>${portalWaterToday} ml</b>${target ? ` / ${target} ml` : ' hoje'}</span>
          ${target ? `<span class="portal-water-pct">${pct}%</span>` : ''}
        </div>
        ${target ? `<div class="portal-water-bar"><div class="portal-water-fill" style="width:${pct}%"></div></div>` : ''}
        <div class="portal-water-actions">
          <button class="btn-back" onclick="logWater(250)" type="button">+250 ml</button>
          <button class="btn-back" onclick="logWater(500)" type="button">+500 ml</button>
          <input class="field-input portal-water-custom-input" type="number" id="portal-water-custom-input" placeholder="ml" min="1">
          <button class="btn-primary" onclick="logWaterCustom()" type="button">Registar</button>
        </div>
      </div>
    </div>`;

  el.innerHTML = `
    <div class="portal-page-header">
      <div class="portal-page-title">Plano de hoje</div>
      <div class="portal-day-nav">
        <button class="portal-day-nav-btn" onclick="changePortalDay(-1)" type="button" aria-label="Dia anterior">‹</button>
        <span class="portal-day-label">${DAYS[portalDayIdx]}</span>
        <button class="portal-day-nav-btn" onclick="changePortalDay(1)" type="button" aria-label="Dia seguinte">›</button>
      </div>
    </div>

    <div class="portal-section">
      <div class="portal-section-title">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Resumo nutricional
      </div>
      <div class="portal-day-totals">
        <div class="portal-stat">
          <div class="stat-icon-wrap stat-orange"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2C10 6 6 8 6 13a6 6 0 0012 0c0-2-1-3-2-4 .3 2-1 3-2 2 1-3-1-5-2-9z"/></svg></div>
          <div class="portal-stat-value">${dayTot.kcal.toFixed(0)}</div><div class="portal-stat-label">kcal</div>
        </div>
        <div class="portal-stat">
          <div class="stat-icon-wrap stat-blue"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>
          <div class="portal-stat-value">${dayTot.prot.toFixed(1)}g</div><div class="portal-stat-label">Proteína</div>
        </div>
        <div class="portal-stat">
          <div class="stat-icon-wrap stat-cyan"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12h16M4 6h16M4 18h10"/></svg></div>
          <div class="portal-stat-value">${dayTot.hc.toFixed(1)}g</div><div class="portal-stat-label">Hidratos</div>
        </div>
        <div class="portal-stat">
          <div class="stat-icon-wrap stat-green"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 8 2 13a10 10 0 0020 0C22 8 17.5 2 12 2z"/></svg></div>
          <div class="portal-stat-value">${dayTot.lip.toFixed(1)}g</div><div class="portal-stat-label">Gordura</div>
        </div>
      </div>
    </div>

    ${waterHTML}

    ${mealNavHTML}
    <div class="portal-meals">${mealsHTML}</div>
  `;
}

// ── Evolução (read-only, reaproveita renderEvolutionCharts de shared.js) ──────
function renderPortalEvolucao() {
  const el = document.getElementById('portal-view-evolucao');
  const consultations = portalClient?.consultations || [];
  const hasData   = consultations.length > 0;
  const hasCharts = consultations.length >= 2;

  const cardsHTML = hasData
    ? consultations.slice().reverse().map(c => {
        const d = new Date(c.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
        const chips = [
          c.peso            != null ? `<div class="consult-chip"><span class="chip-label">Peso</span><span class="chip-val">${c.peso} kg</span></div>` : '',
          c.imc             != null ? `<div class="consult-chip"><span class="chip-label">IMC</span><span class="chip-val">${c.imc}</span></div>` : '',
          c.massaGorda      != null ? `<div class="consult-chip"><span class="chip-label">Gordura</span><span class="chip-val">${c.massaGorda}%</span></div>` : '',
          c.mig             != null ? `<div class="consult-chip"><span class="chip-label">MIG</span><span class="chip-val">${c.mig} kg</span></div>` : '',
          c.somatorioPregas != null ? `<div class="consult-chip"><span class="chip-label">Σ Pregas</span><span class="chip-val">${c.somatorioPregas} mm</span></div>` : '',
          c.perCinturaISAK  != null ? `<div class="consult-chip"><span class="chip-label">Cintura</span><span class="chip-val">${c.perCinturaISAK} cm</span></div>` : '',
          c.perAnca         != null ? `<div class="consult-chip"><span class="chip-label">Anca</span><span class="chip-val">${c.perAnca} cm</span></div>` : '',
        ].filter(Boolean).join('');
        const note = c.notes ? `<div class="consult-note">${escHtml(c.notes)}</div>` : '';
        return `
          <div class="consultation-card">
            <div class="consult-card-header">
              <div class="consult-date">${d}</div>
            </div>
            <div class="consult-metrics">${chips}</div>
            ${note}
          </div>`;
      }).join('')
    : `<div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg>
        <div class="empty-state-title">Sem registos de consulta</div>
        <div class="empty-state-sub">O seu nutricionista ainda não registou nenhuma avaliação.</div>
      </div>`;

  el.innerHTML = `
    <div class="evolution-header">
      <div class="evolution-title">Histórico de Evolução</div>
    </div>
    ${hasCharts ? `<div class="evolution-charts">
      <div class="evol-chart-card"><div class="evol-chart-title">Peso (kg)</div><div class="evol-chart-canvas-wrap"><canvas id="chartPeso"></canvas></div></div>
      <div class="evol-chart-card"><div class="evol-chart-title">% Massa Gorda</div><div class="evol-chart-canvas-wrap"><canvas id="chartGordura"></canvas></div></div>
      <div class="evol-chart-card"><div class="evol-chart-title">IMC</div><div class="evol-chart-canvas-wrap"><canvas id="chartIMC"></canvas></div></div>
    </div>` : ''}
    <div class="consultations-list">${cardsHTML}</div>
  `;

  if (hasCharts) renderEvolutionCharts(consultations);
}

// ── Fotos de refeições — tirar a foto (card da refeição, tab "Plano de hoje") ─
// Só é possível tirar/substituir/apagar para a refeição de hoje que está a ser mostrada em
// renderPortalPlano() (mesma restrição "só hoje" das outras ações do card).
function handleMealPhotoTap(mealIndex) {
  const entry = portalFotosByDate[portalFotosTodayDate]?.[mealIndex];
  if (entry) {
    openStoryForDay(portalFotosTodayDate, mealIndex);
  } else {
    openMealPhotoPicker(mealIndex);
  }
}

function openMealPhotoPicker(mealIndex) {
  _pendingPhotoMealIndex = mealIndex;
  document.getElementById('portal-foto-file-input').click();
}

async function handleMealPhotoFileChange(input) {
  const file = input.files[0];
  input.value = '';
  if (!file || _pendingPhotoMealIndex == null) return;
  const mealIndex = _pendingPhotoMealIndex;
  _pendingPhotoMealIndex = null;
  try {
    const blob = await compressImageFile(file);
    await uploadMealPhoto(mealIndex, blob);
  } catch (e) {
    console.error('Erro ao processar foto:', e);
    showAlertModal('Não foi possível processar esta foto. Tente outra.', { title: 'Erro' });
  }
}

async function uploadMealPhoto(mealIndex, blob) {
  const date = portalFotosTodayDate;
  const mealName = portalPlan?.days?.[portalTodayIdx]?.meals?.[mealIndex]?.nome || 'Refeição';
  const path = `${portalClient.id}/${date}/meal-${mealIndex}.jpg`;
  const { error: uploadError } = await sb.storage.from('meal-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) {
    console.error('Erro ao enviar foto:', uploadError);
    showToast('Não foi possível enviar a foto. Tente novamente.', 'error');
    return;
  }
  const { error: dbError } = await sb.from('progress_photos').upsert({
    client_id: portalClient.id,
    storage_path: path,
    meal_index: mealIndex,
    meal_name: mealName,
    photo_date: date,
    taken_at: new Date().toISOString(),
  }, { onConflict: 'client_id,photo_date,meal_index' });
  if (dbError) {
    console.error('Erro ao guardar foto:', dbError);
    showToast('Não foi possível guardar a foto. Tente novamente.', 'error');
    return;
  }
  invalidateSignedPhotoUrl(path);
  portalFotosByDate[date] = portalFotosByDate[date] || {};
  portalFotosByDate[date][mealIndex] = { storage_path: path, meal_name: mealName };
  showToast('📷 Foto guardada');
  renderPortalPlano();
  if (document.getElementById('pt-fotos').classList.contains('active')) renderPortalFotos();
}

function deleteMealPhoto(mealIndex) {
  const date = portalFotosTodayDate;
  const entry = portalFotosByDate[date]?.[mealIndex];
  if (!entry) return;
  showConfirm(
    'Apagar foto',
    'Tem a certeza que quer apagar esta foto?',
    async () => {
      const path = entry.storage_path;
      const { error: storageError } = await sb.storage.from('meal-photos').remove([path]);
      if (storageError) {
        // Não apaga a linha se o Storage falhar — evita ficar com um ficheiro órfão
        // que nem o cron de limpeza (cleanup-meal-photos) consegue encontrar depois
        // (esse cron só sabe o que apagar através desta linha em progress_photos).
        console.error('Erro ao apagar foto do storage:', storageError);
        showToast('Não foi possível apagar a foto. Tente novamente.', 'error');
        return;
      }
      const { error: dbError } = await sb.from('progress_photos').delete()
        .match({ client_id: portalClient.id, photo_date: date, meal_index: mealIndex });
      if (dbError) {
        console.error('Erro ao apagar foto:', dbError);
        showToast('Não foi possível apagar a foto.', 'error');
        return;
      }
      invalidateSignedPhotoUrl(path);
      delete portalFotosByDate[date][mealIndex];
      showToast('Foto apagada');
      renderPortalPlano();
      if (document.getElementById('pt-fotos').classList.contains('active')) renderPortalFotos();
    },
    'Apagar'
  );
}

// ── Fotos de refeições — calendário mensal (tab "Fotos") ──────────────────────
// Só um visualizador (estilo Instagram: calendário do mês, toca num dia para ver as fotos
// desse dia com o nome de cada refeição) — tirar/substituir a foto acontece no card da
// refeição, não aqui. Carrega os dados mês a mês (só quando ainda não foram pedidos) em vez
// de uma janela fixa de dias, já que o calendário pode navegar para meses anteriores.
async function loadPortalFotosForMonth(year, month) {
  if (!portalClient) return;
  const first = new Date(year, month, 1);
  const next = new Date(year, month + 1, 1);
  const fromStr = dateToYmd(first);
  const toStr = dateToYmd(next);
  const { data, error } = await sb
    .from('progress_photos')
    .select('storage_path, meal_index, meal_name, photo_date')
    .eq('client_id', portalClient.id)
    .gte('photo_date', fromStr)
    .lt('photo_date', toStr);
  if (error) { console.error('Erro ao carregar fotos de refeições:', error); return; }
  (data || []).forEach(r => {
    portalFotosByDate[r.photo_date] = portalFotosByDate[r.photo_date] || {};
    portalFotosByDate[r.photo_date][r.meal_index] = { storage_path: r.storage_path, meal_name: r.meal_name };
  });
}

async function ensurePortalFotosMonthLoaded(year, month) {
  const key = `${year}-${month}`;
  if (portalFotosLoadedMonths.has(key)) return;
  await loadPortalFotosForMonth(year, month);
  portalFotosLoadedMonths.add(key);
}

async function changePortalFotosMonth(delta) {
  portalCalMonth += delta;
  if (portalCalMonth < 0) { portalCalMonth = 11; portalCalYear--; }
  if (portalCalMonth > 11) { portalCalMonth = 0; portalCalYear++; }
  await ensurePortalFotosMonthLoaded(portalCalYear, portalCalMonth);
  renderPortalFotos();
}

// Toca num dia do calendário → abre a story diretamente (estilo Instagram: tocar no anel de
// story de um dia mostra logo as fotos, sem passo intermédio). Dias sem fotos só ficam
// selecionados/realçados — openStoryForDay já não faz nada se não houver fotos.
async function selectPortalFotosCalendarDay(date) {
  portalFotosSelectedDate = date;
  renderPortalFotos();
  await openStoryForDay(date);
}

function renderPortalFotos() {
  const el = document.getElementById('portal-view-fotos');
  const firstOfMonth = new Date(portalCalYear, portalCalMonth, 1);
  const daysInMonth = new Date(portalCalYear, portalCalMonth + 1, 0).getDate();
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Segunda

  let cellsHTML = '';
  for (let i = 0; i < startWeekday; i++) cellsHTML += `<div class="fotos-cal-cell fotos-cal-cell--empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${portalCalYear}-${String(portalCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasPhotos = !!(portalFotosByDate[dateStr] && Object.keys(portalFotosByDate[dateStr]).length);
    const isToday = dateStr === portalFotosTodayDate;
    const isSelected = dateStr === portalFotosSelectedDate;
    cellsHTML += `
      <button class="fotos-cal-cell${isToday ? ' fotos-cal-cell--today' : ''}${isSelected ? ' fotos-cal-cell--selected' : ''}" onclick="selectPortalFotosCalendarDay('${dateStr}')" type="button">
        <span class="fotos-cal-cell-num">${day}</span>
        ${hasPhotos ? '<span class="fotos-cal-cell-dot"></span>' : ''}
      </button>`;
  }

  const now = new Date();
  const isCurrentMonth = portalCalYear === now.getFullYear() && portalCalMonth === now.getMonth();

  el.innerHTML = `
    <div class="fotos-cal-header">
      <button class="portal-day-nav-btn" onclick="changePortalFotosMonth(-1)" type="button" aria-label="Mês anterior">‹</button>
      <span class="fotos-cal-title">${FOTOS_MONTH_NAMES[portalCalMonth]} ${portalCalYear}</span>
      <button class="portal-day-nav-btn" onclick="changePortalFotosMonth(1)" type="button" aria-label="Mês seguinte"${isCurrentMonth ? ' style="visibility:hidden"' : ''}>›</button>
    </div>
    <div class="fotos-cal-weekdays"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
    <div class="fotos-cal-grid">${cellsHTML}</div>
    <div class="fotos-cal-hint">Toca num dia com <span class="fotos-cal-hint-dot"></span> para ver as fotos desse dia</div>
  `;
}

async function openStoryForDay(date, startMealIndex) {
  const dayEntry = portalFotosByDate[date] || {};
  const indices = Object.keys(dayEntry).map(Number).sort((a, b) => a - b);
  if (!indices.length) return;
  const paths = indices.map(i => dayEntry[i].storage_path);
  const urls = await getSignedPhotoUrls(paths);
  // Comentários do nutricionista para este dia real — ao contrário do indicador do cartão
  // do plano (só "hoje"), aqui a data é sempre real (vem do calendário de fotos), por isso
  // conseguimos mostrar comentários de qualquer dia passado sem ambiguidade de semana.
  const { data: commentRows } = await sb
    .from('meal_comments')
    .select('meal_index, comment')
    .eq('client_id', portalClient.id)
    .eq('log_date', date);
  const commentByIdx = {};
  (commentRows || []).forEach(r => { commentByIdx[r.meal_index] = r.comment; });
  const slots = indices.map(i => ({ category: String(i), label: dayEntry[i].meal_name, url: urls[dayEntry[i].storage_path], comment: commentByIdx[i] }));
  const startIndex = Math.max(0, indices.indexOf(startMealIndex));
  const isToday = date === portalFotosTodayDate;
  showStoryViewer(slots, {
    startIndex,
    canManage: isToday,
    onReplace: isToday ? (categoryStr) => openMealPhotoPicker(Number(categoryStr)) : undefined,
    onDelete: isToday ? (categoryStr) => deleteMealPhoto(Number(categoryStr)) : undefined,
  });
}

// ── PWA: torna o portal instalável no ecrã principal ──────────────────────────
// scope explícito — sem isto, um sw.js na raiz controlaria o site inteiro
// (app.html incluído), quando só queremos afetar o portal do paciente.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/portal.html' })
      .then((reg) => {
        // força uma verificação a cada abertura — sem isto o browser pode continuar
        // a usar o sw.js em cache dele até 24h antes de reparar que há um novo
        reg.update().catch(() => {});
      })
      .catch((err) => console.error('Erro ao registar service worker:', err));
  });

  // quando o novo service worker assume controlo (skipWaiting+clients.claim em sw.js),
  // os separadores já abertos continuam a correr o JS antigo em memória até recarregar —
  // avisa e recarrega sozinho, para o paciente não ficar preso numa versão desatualizada
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swRefreshing) return;
    _swRefreshing = true;
    showToast('A atualizar…');
    setTimeout(() => window.location.reload(), 1200);
  });
}

// ── PWA: banner de instalação próprio (em vez de depender do menu do browser) ─
// O Chrome/Android disparam "beforeinstallprompt" — guardamos o evento e só o
// disparamos quando o próprio paciente clica no nosso botão. No iOS (Safari) esse
// evento não existe (a Apple não permite disparar o ecrã nativo por script), por
// isso mostramos só instruções manuais em vez de um botão.
let _deferredInstallPrompt = null;
const PORTAL_PWA_DISMISSED_KEY = 'cachos_portal_pwa_dismissed';

function isPortalStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  hidePortalInstallBanner();
  try { localStorage.setItem(PORTAL_PWA_DISMISSED_KEY, '1'); } catch (e) {}
});

// Chamado depois do portal (autenticado, sem o gate de consentimento por cima)
// estar mesmo visível — nunca no ecrã de login.
function maybeShowPortalInstallBanner() {
  const banner = document.getElementById('portal-install-banner');
  if (!banner || isPortalStandalone()) return;
  try { if (localStorage.getItem(PORTAL_PWA_DISMISSED_KEY)) return; } catch (e) {}

  const isIos = isIosDevice();
  if (!_deferredInstallPrompt && !isIos) return; // browser sem suporte (ex.: Firefox) — não incomoda

  const text = document.getElementById('portal-install-banner-text');
  const btn  = document.getElementById('portal-install-btn');
  if (isIos && !_deferredInstallPrompt) {
    text.textContent = 'Instala o CachosNutri: toca em Partilhar e depois em "Adicionar ao Ecrã Principal".';
    btn.style.display = 'none';
  } else {
    text.textContent = 'Instala o CachosNutri no teu telemóvel para acesso mais rápido.';
    btn.style.display = '';
  }
  banner.style.display = '';
}

async function triggerPortalInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  hidePortalInstallBanner();
}

function dismissPortalInstallBanner() {
  hidePortalInstallBanner();
  try { localStorage.setItem(PORTAL_PWA_DISMISSED_KEY, '1'); } catch (e) {}
}

function hidePortalInstallBanner() {
  const banner = document.getElementById('portal-install-banner');
  if (banner) banner.style.display = 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  switchPortalAuthTab('login');

  const codeFromUrl = getInviteCodeFromUrl();
  if (codeFromUrl) {
    document.getElementById('portal-signup-code').value = codeFromUrl;
    const urlParams = new URLSearchParams(window.location.search);
    const emailFromUrl = urlParams.get('email');
    const nomeFromUrl  = urlParams.get('nome');
    if (emailFromUrl) document.getElementById('portal-signup-email').value = emailFromUrl;
    if (nomeFromUrl)  document.getElementById('portal-signup-nome').value  = nomeFromUrl;
    switchPortalAuthTab('signup');
  }

  let session;
  try {
    ({ data: { session } } = await sb.auth.getSession());
  } catch (e) { console.error('Erro ao verificar sessão:', e); }

  if (session && session.user) {
    const isPaciente = await verificarRolePaciente(session.user);
    if (isPaciente === null) {
      // Sessão órfã (utilizador autenticado sem linha em profiles, ex: apagada
      // manualmente) — termina-a em silêncio e deixa o formulário de convite
      // (já pré-preenchido acima) pronto para uma conta nova.
      await sb.auth.signOut();
      showPortalAuth();
      return;
    }
    if (!isPaciente) {
      await sb.auth.signOut();
      showPortalAuth();
      showPortalAuthError('login', 'Não foi possível entrar com esta conta nesta área.');
      return;
    }
    portalUser = session.user;
    if (codeFromUrl) {
      const ok = await acceptInviteCode(codeFromUrl);
      if (!ok) showAlertModal('O código de convite não é válido ou já foi utilizado.', { title: 'Convite inválido' });
    }
    const pending = takePendingInviteCode();
    if (pending) await acceptInviteCode(pending);
    showPortalApp();
    await loadPortalData(); // já traz o perfil embutido (ver dentro da função)
  } else {
    showPortalAuth();
  }
});

// A app não faz polling nem subscreve alterações em tempo real — se o
// nutricionista mudar um plano enquanto o paciente já tem o portal aberto
// noutra aba, o paciente só vê a atualização ao voltar a esta aba (evita
// pedidos desnecessários enquanto a aba está em segundo plano).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && portalUser) {
    loadPortalData();
  }
});
