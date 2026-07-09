// ── CachosNutri portal.js — Portal do Paciente (MVP read-only) ─────────────────
// Entry point próprio (portal.html), sem depender de app.js (que arranca
// initApp()/initSearch() automaticamente e está acoplado ao DOM do nutricionista).
// DAYS, escHtml, scale, formatDate e renderEvolutionCharts vêm de js/shared.js.

let portalUser    = null;
let portalClients = [];
let portalClient  = null;
let portalPlan    = null;
let portalDayIdx  = 0;
let portalWaterToday = 0;
let portalTodayIdx = 0;          // dia real de hoje — não muda ao navegar com changePortalDay
// { [day_index]: { [meal_index]: { status, note } } } — estado mais recente conhecido por
// slot de dia da semana do plano atual (aproximação: não distingue semanas diferentes,
// já que day_index sozinho não tem data associada — só a edição fica restrita a "hoje").
let portalMealStatusByDay = {};
let _noteModalMealIndex = null;

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

function traduzErroAuthPortal(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou password incorretos.';
  if (/User already registered/i.test(msg))   return 'Já existe uma conta com este e-mail.';
  if (/Password should be at least/i.test(msg)) return 'A password deve ter pelo menos 6 caracteres.';
  if (/Unable to validate email address/i.test(msg)) return 'E-mail inválido.';
  return msg;
}

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
  if (error) { setButtonLoading(btn, false); showPortalAuthError('login', traduzErroAuthPortal(error.message)); return; }
  const isPaciente = await verificarRolePaciente(data.user);
  if (isPaciente === null) {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    showPortalAuthError('login', 'Esta conta não tem um perfil válido. Contacte o seu nutricionista.');
    return;
  }
  if (!isPaciente) {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    showPortalAuthError('login', 'Esta conta é de nutricionista. Aceda à plataforma principal em vez do portal do paciente.');
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
  if (error) { showPortalAuthError('signup', traduzErroAuthPortal(error.message)); return; }

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
  window.location.href = 'index.html';
}

async function afterPortalAuth() {
  const code = takePendingInviteCode();
  if (code) {
    const ok = await acceptInviteCode(code);
    if (!ok) showAlertModal('O código de convite não é válido ou já foi utilizado. Pode pedir um novo ao seu nutricionista, ou introduzi-lo manualmente mais tarde.', { title: 'Convite inválido' });
  }
  showPortalApp();
  await loadPortalData();
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
  const { data: rows, error } = await sb
    .from('clients')
    .select('id, nome, info, plans(id, nome, macro_targets, water_ml, days, created_at), consultations(*)')
    .eq('paciente_id', portalUser.id);

  portalClients = error ? [] : (rows || []).map(rowToPortalClient);
  if (error) {
    console.error('Erro ao carregar dados do portal:', error);
    showAlertModal('Não foi possível carregar os seus dados. Tente novamente mais tarde.');
  }

  document.getElementById('portal-user-name').textContent =
    portalUser.user_metadata?.nome || portalUser.email || '';

  if (!portalClients.length) {
    document.getElementById('portal-empty').style.display = '';
    document.getElementById('portal-main').style.display  = 'none';
    return;
  }
  document.getElementById('portal-empty').style.display = 'none';
  document.getElementById('portal-main').style.display  = '';

  portalClient = portalClients[0];
  portalPlan   = portalClient.plans[0] || null;
  document.getElementById('portal-client-name').textContent = portalClient.nome;

  const jsDay = new Date().getDay();
  portalDayIdx = (jsDay + 6) % 7; // JS: 0=Domingo..6=Sábado → DAYS: 0=Segunda..6=Domingo
  portalTodayIdx = portalDayIdx;

  await loadWaterToday();
  await loadMealStatusByDay();

  showPortalTab('plano');
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
  const { data, error } = await sb
    .from('meal_logs')
    .select('day_index, meal_index, status, note, logged_at')
    .eq('client_id', portalClient.id)
    .eq('plan_id', portalPlan.id)
    .order('logged_at', { ascending: false });
  if (error) { console.error('Erro ao carregar estado das refeições:', error); return; }
  // Mantém só a linha mais recente por (day_index, meal_index) — a query já vem ordenada
  // por logged_at desc, por isso a primeira ocorrência de cada par é a mais recente.
  (data || []).forEach(r => {
    portalMealStatusByDay[r.day_index] = portalMealStatusByDay[r.day_index] || {};
    if (!(r.meal_index in portalMealStatusByDay[r.day_index])) {
      portalMealStatusByDay[r.day_index][r.meal_index] = { status: r.status, note: r.note };
    }
  });
}

async function logMealStatus(mealIndex, status, note) {
  if (!portalClient || !portalPlan) return;
  const { error } = await sb.from('meal_logs').insert({
    client_id: portalClient.id,
    plan_id: portalPlan.id,
    day_index: portalTodayIdx,
    meal_index: mealIndex,
    status,
    note: note || null
  });
  if (error) {
    console.error('Erro ao registar refeição:', error);
    showToast('Não foi possível registar a refeição. Tente novamente.', 'error');
    return;
  }
  portalMealStatusByDay[portalTodayIdx] = portalMealStatusByDay[portalTodayIdx] || {};
  portalMealStatusByDay[portalTodayIdx][mealIndex] = { status, note: note || null };
  showToast(status === 'done' ? '✓ Refeição marcada como feita' : status === 'skipped' ? 'Refeição marcada como saltada' : 'Anotação guardada');
  if (document.getElementById('pt-plano').classList.contains('active')) renderPortalPlano();
}

function openNoteModal(mealIndex) {
  _noteModalMealIndex = mealIndex;
  const existing = portalMealStatusByDay[portalTodayIdx]?.[mealIndex];
  document.getElementById('note-modal-textarea').value = existing?.note || '';
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
  const currentStatus = portalMealStatusByDay[portalTodayIdx]?.[mealIndex]?.status || 'modified';
  closeNoteModal();
  await logMealStatus(mealIndex, currentStatus, note);
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function showPortalTab(tab) {
  const isPlano = tab === 'plano';
  document.getElementById('pt-plano').classList.toggle('active', isPlano);
  document.getElementById('pt-evolucao').classList.toggle('active', !isPlano);
  document.getElementById('portal-view-plano').style.display    = isPlano ? '' : 'none';
  document.getElementById('portal-view-evolucao').style.display = isPlano ? 'none' : '';
  if (isPlano) renderPortalPlano(); else renderPortalEvolucao();
}

// ── Plano de hoje (read-only) ────────────────────────────────────────────────
function changePortalDay(delta) {
  portalDayIdx = (portalDayIdx + delta + 7) % 7;
  renderPortalPlano();
}

function renderPortalPlano() {
  const el = document.getElementById('portal-view-plano');
  if (!portalPlan || !portalPlan.days) {
    el.innerHTML = `
      <div class="empty-state">
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

  const dayTot = { kcal: 0, prot: 0, hc: 0, lip: 0 };
  allMeals.forEach(m => (m.foods || []).forEach(fi => {
    const s = scale(fi.food, fi.qty);
    dayTot.kcal += s.kcal; dayTot.prot += s.prot; dayTot.hc += s.hc; dayTot.lip += s.lip;
  }));

  const mealsHTML = indexedMeals.length ? indexedMeals.map(({ meal, idx }) => {
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
    const statusHTML = isToday ? `
      <div class="portal-meal-status">
        <button class="portal-meal-btn portal-meal-btn--done${status === 'done' ? ' active' : ''}" onclick="logMealStatus(${idx}, 'done')" type="button">Feita</button>
        <button class="portal-meal-btn portal-meal-btn--skip${status === 'skipped' ? ' active' : ''}" onclick="logMealStatus(${idx}, 'skipped')" type="button">Saltada</button>
        <button class="portal-meal-btn portal-meal-btn--note${entry?.note ? ' active' : ''}" onclick="openNoteModal(${idx})" type="button">Nota</button>
      </div>` : '';
    const cardClass = status === 'done' ? ' portal-meal-card--done' : status === 'skipped' ? ' portal-meal-card--skipped' : '';
    return `
      <div class="portal-meal-card${cardClass}">
        <div class="portal-meal-header">
          <span class="portal-meal-name">${escHtml(meal.nome)}</span>
          ${meal.hora ? `<span class="portal-meal-time">${meal.hora}</span>` : ''}
        </div>
        <div class="portal-food-rows">${rows}</div>
        ${statusHTML}
      </div>`;
  }).join('') : `
      <div class="empty-state">
        <div class="empty-state-title">Sem refeições planeadas</div>
        <div class="empty-state-sub">Não há alimentos registados para ${DAYS[portalDayIdx]}.</div>
      </div>`;

  const target = portalPlan.waterMl;
  const pct = target ? Math.min(100, Math.round((portalWaterToday / target) * 100)) : 0;
  const waterHTML = `
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
    </div>`;

  el.innerHTML = `
    <div class="portal-day-nav">
      <button class="btn-back" onclick="changePortalDay(-1)" type="button">‹</button>
      <span class="portal-day-label">${DAYS[portalDayIdx]}</span>
      <button class="btn-back" onclick="changePortalDay(1)" type="button">›</button>
    </div>
    <div class="portal-day-totals">
      <span><b>${dayTot.kcal.toFixed(0)}</b> kcal</span>
      <span>P <b>${dayTot.prot.toFixed(1)}g</b></span>
      <span>HC <b>${dayTot.hc.toFixed(1)}g</b></span>
      <span>L <b>${dayTot.lip.toFixed(1)}g</b></span>
    </div>
    ${waterHTML}
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
    : `<div class="evolution-empty">
        <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-top:12px">Sem registos de consulta</div>
        <div style="font-size:12px;color:var(--gray-400);margin-top:4px">O seu nutricionista ainda não registou nenhuma avaliação.</div>
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
      showPortalAuthError('login', 'Esta conta é de nutricionista. Aceda à plataforma principal em vez do portal do paciente.');
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
    await loadPortalData();
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
