// ── CachosNutri app.js ────────────────────────────────────────────────────────

const DAYS          = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const DEFAULT_MEALS = ['Pequeno-almoço','Lanche da manhã','Almoço','Lanche da tarde','Jantar'];
const MEAL_TIMES    = ['07:30','10:30','13:00','16:00','20:00','','',''];

let appData    = { version: 1, clients: [] };
let appProfile = { name: '', age: '', sex: '', email: '', photo: '' };
let nav        = { view: 'welcome', clientId: null, planId: null };
let state      = { activeDay: 0, days: [] };
let draftClient = null;

let selectedFood   = null;
let activeMealCtx  = null;
let pieChart       = null;
let searchDebounce = null;

// ── Profile ───────────────────────────────────────────────────────────────────
function loadProfile() {
  try {
    const raw = localStorage.getItem('cachos_profile');
    if (raw) appProfile = { ...appProfile, ...JSON.parse(raw) };
  } catch(e) {}
}

function saveProfile() {
  appProfile.name  = document.getElementById('profName').value.trim();
  appProfile.age   = document.getElementById('profAge').value;
  appProfile.sex   = document.getElementById('profSex').value;
  appProfile.email = document.getElementById('profEmail').value.trim();
  try { localStorage.setItem('cachos_profile', JSON.stringify(appProfile)); } catch(e) {}
  updateSidebarUser();
  updateWelcomeUser();
  closeProfileModal();
  if (nav.view === 'clients') renderDashboard();
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
let _confirmCallback = null;

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  _confirmCallback = onConfirm;
  document.getElementById('confirmModal').style.display = '';
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  _confirmCallback = null;
}

function confirmOk() {
  const cb = _confirmCallback;
  closeConfirm();
  if (cb) cb();
}

function openProfileModal() {
  document.getElementById('profName').value  = appProfile.name;
  document.getElementById('profAge').value   = appProfile.age;
  document.getElementById('profSex').value   = appProfile.sex;
  document.getElementById('profEmail').value = appProfile.email;
  updateProfilePhotoUI();
  document.getElementById('profileModal').style.display = '';
}

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

function handlePhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    appProfile.photo = ev.target.result;
    updateProfilePhotoUI();
    updateSidebarUser();
    updateWelcomeUser();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function updateProfilePhotoUI() {
  const img     = document.getElementById('profPhotoImg');
  const initial = document.getElementById('profPhotoInitial');
  if (!img || !initial) return;
  if (appProfile.photo) {
    img.src = appProfile.photo;
    img.style.display = '';
    initial.style.display = 'none';
  } else {
    img.style.display = 'none';
    initial.style.display = '';
    initial.textContent = appProfile.name ? appProfile.name[0].toUpperCase() : 'N';
  }
}

function updateSidebarUser() {
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = appProfile.name || 'Nutricionista';
  if (avatarEl) {
    if (appProfile.photo) {
      avatarEl.innerHTML = `<img src="${escHtml(appProfile.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      avatarEl.textContent = appProfile.name ? appProfile.name[0].toUpperCase() : 'N';
    }
  }
}

function updateWelcomeUser() {
  const nameEl   = document.getElementById('wl-profile-name');
  const avatarEl = document.getElementById('wl-avatar');
  const greetEl  = document.getElementById('welcome-greeting');
  const greetName = appProfile.name || 'Nutricionista';
  if (nameEl) nameEl.textContent = appProfile.name || 'Nutricionista';
  if (avatarEl) {
    if (appProfile.photo) {
      avatarEl.innerHTML = `<img src="${escHtml(appProfile.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      avatarEl.textContent = appProfile.name ? appProfile.name[0].toUpperCase() : 'N';
    }
  }
  if (greetEl) greetEl.textContent = `Olá, ${greetName}`;
}

function updateWelcomeStats() {
  const clientsEl = document.getElementById('ws-clients');
  const plansEl   = document.getElementById('ws-plans');
  if (!clientsEl && !plansEl) return;
  const totalClients = appData.clients.length;
  const totalPlans   = appData.clients.reduce((s, c) => s + c.plans.length, 0);
  if (clientsEl) clientsEl.textContent = totalClients;
  if (plansEl) plansEl.textContent = totalPlans;
}

function updateWelcomeDate() {
  const el = document.getElementById('wl-date-text');
  if (!el) return;
  const today = new Date();
  const day = today.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' });
  const year = today.getFullYear();
  el.textContent = `${day}, ${year}`;
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function makeDefaultDays() {
  return DAYS.map(() => ({
    meals: DEFAULT_MEALS.map((nome, i) => ({
      id: crypto.randomUUID(),
      nome,
      hora: MEAL_TIMES[i] || '',
      foods: []
    }))
  }));
}

function getInitials(nome) {
  const parts = (nome || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Persistence ───────────────────────────────────────────────────────────────
function saveAppData() {
  if (nav.clientId && nav.planId) {
    const client = appData.clients.find(c => c.id === nav.clientId);
    if (client) {
      const plan = client.plans.find(p => p.id === nav.planId);
      if (plan) plan.days = state.days;
    }
  }
  try { localStorage.setItem('cachos_data', JSON.stringify(appData)); } catch(e) {}
  updateWelcomeStats();
}

function saveState() { saveAppData(); }

function loadAppData() {
  try {
    const raw = localStorage.getItem('cachos_data');
    if (raw) {
      appData = JSON.parse(raw);
      // Migrate: ensure all clients have consultations array
      appData.clients.forEach(c => { if (!c.consultations) c.consultations = []; });
      return;
    }
    // Migrate from old single-patient format
    const oldRaw = localStorage.getItem('nutriplan_state');
    if (oldRaw) {
      const oldState = JSON.parse(oldRaw);
      const oldInfo  = JSON.parse(localStorage.getItem('cachos_patient') || '{}');
      appData = {
        version: 1,
        clients: [{
          id: crypto.randomUUID(),
          nome: oldInfo.pNome || 'Paciente importado',
          createdAt: Date.now(),
          info: oldInfo,
          consultations: [],
          plans: [{
            id: crypto.randomUUID(),
            nome: 'Plano 1',
            createdAt: Date.now(),
            days: oldState.days || makeDefaultDays()
          }]
        }]
      };
      saveAppData();
    }
  } catch(e) {}
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showPage(name) {
  document.getElementById('pg-clients').style.display = name === 'clients' ? '' : 'none';
  document.getElementById('pg-client').style.display  = name === 'client'  ? '' : 'none';
  document.getElementById('pg-plan').style.display    = name === 'plan'    ? 'flex' : 'none';
  // Sidebar active state
  const sniDash = document.getElementById('sni-dashboard');
  const sniPac  = document.getElementById('sni-pacientes');
  if (sniDash) sniDash.classList.toggle('active', name === 'clients');
  if (sniPac)  sniPac.classList.toggle('active', name === 'client');
}

function updateBreadcrumb() {
  // Kept for compatibility — sidebar handles active state in showPage
  const client = appData.clients.find(c => c.id === nav.clientId);
  if (client) {
    const el = document.getElementById('client-page-name');
    if (el) el.textContent = client.nome;
  }
}

function enterApp() {
  document.getElementById('pg-welcome').style.display = 'none';
  document.getElementById('app-shell').style.display  = '';
  loadProfile();
  updateSidebarUser();
  updateWelcomeUser();
  goToClients();
}

function goToClients() {
  if (draftClient && nav.clientId === draftClient.id) {
    draftClient = null;
  }
  nav = { view: 'clients', clientId: null, planId: null };
  showPage('clients');
  updateBreadcrumb();
  renderDashboard();
}

function goToClient(clientId, tab) {
  if (draftClient && clientId !== draftClient.id) {
    draftClient = null;
  }
  const client = appData.clients.find(c => c.id === clientId);
  if (!client) return;
  nav = { view: 'client', clientId, planId: null };
  document.getElementById('client-page-name').textContent = client.nome;
  showPage('client');
  updateBreadcrumb();
  renderClientPage(client);
  showClientTab(tab || 'info');
}

function goToPlan(clientId, planId) {
  const client = appData.clients.find(c => c.id === clientId);
  if (!client) return;
  const plan = client.plans.find(p => p.id === planId);
  if (!plan) return;

  nav = { view: 'plan', clientId, planId };
  state.activeDay = 0;
  state.days = plan.days;

  document.getElementById('plan-name-input').value = plan.nome;
  document.getElementById('plan-back-btn').onclick = () => goToClient(clientId, 'plans');

  showPage('plan');
  updateBreadcrumb();
  if (pieChart) { pieChart.destroy(); pieChart = null; }
  render();
}

// ── Clients CRUD ──────────────────────────────────────────────────────────────
function createClient() {
  const client = {
    id: crypto.randomUUID(),
    nome: 'Novo paciente',
    createdAt: Date.now(),
    info: {},
    consultations: [],
    plans: []
  };
  draftClient = client;
  nav = { view: 'client', clientId: client.id, planId: null };
  document.getElementById('client-page-name').textContent = client.nome;
  showPage('client');
  renderClientPage(client);
  showClientTab('info');
  setTimeout(() => {
    const el = document.getElementById('pNome');
    if (el) { el.focus(); el.select(); }
  }, 120);
}

function deleteClient(clientId, e) {
  e.stopPropagation();
  const client = appData.clients.find(c => c.id === clientId);
  if (!client) return;
  showConfirm(
    'Eliminar paciente',
    `Tem a certeza que quer eliminar "${client.nome}"? Esta ação é irreversível.`,
    () => {
      appData.clients = appData.clients.filter(c => c.id !== clientId);
      saveAppData();
      renderDashboard();
    }
  );
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'agora';
  if (m < 60) return `Há ${m} min`;
  if (h < 24) return `Há ${h}h`;
  if (d < 7)  return `Há ${d} dia${d !== 1 ? 's' : ''}`;
  return formatDate(ts);
}

function renderDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  const totalClients = appData.clients.length;
  const totalPlans   = appData.clients.reduce((s, c) => s + c.plans.length, 0);

  const today = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);

  const clientsHTML = totalClients === 0
    ? `<div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <div class="empty-state-title">Nenhum paciente ainda</div>
        <div class="empty-state-sub">Clique em "Novo paciente" para começar.</div>
      </div>`
    : appData.clients.map(c => `
        <div class="client-card" onclick="goToClient('${c.id}')">
          <div class="client-avatar">${getInitials(c.nome)}</div>
          <div class="client-card-info">
            <div class="client-card-name">${escHtml(c.nome)}</div>
            <div class="client-card-meta">Criado em ${formatDate(c.createdAt)}</div>
          </div>
          <div class="client-card-right">
            <span class="plans-badge">${c.plans.length} plano${c.plans.length !== 1 ? 's' : ''}</span>
            <button class="btn-danger-sm" onclick="deleteClient('${c.id}', event)" title="Eliminar">×</button>
          </div>
        </div>`).join('');

  const greetName = appProfile.name ? `, ${escHtml(appProfile.name)}` : '';

  container.innerHTML = `
    <div class="dashboard">

      <div class="dash-header">
        <div>
          <div class="dash-greeting">Olá${greetName}! 👋</div>
          <div class="dash-sub">Bem-vindo ao CachosNutri — aqui está o resumo do seu consultório.</div>
        </div>
        <div class="dash-date">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${todayCap}
        </div>
      </div>

      <div class="dash-stats">
        <div class="stat-card">
          <div class="stat-icon-wrap stat-green">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87"/></svg>
          </div>
          <div><div class="stat-num">${totalClients}</div><div class="stat-label">Pacientes ativos</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap stat-blue">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          </div>
          <div><div class="stat-num">${totalPlans}</div><div class="stat-label">Planos criados</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap stat-orange">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div><div class="stat-num">4</div><div class="stat-label">Fórmulas TMB</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap stat-cyan">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
          </div>
          <div><div class="stat-num">1.376</div><div class="stat-label">Alimentos TCA</div></div>
        </div>
      </div>

      <div class="dash-body">
        <div class="dash-left" style="width:100%">
          <div class="dash-hero">
            <div class="dash-hero-text">
              <h2 class="dash-hero-title">Nutrição que<br><span class="dash-hero-accent">transforma </span>vidas</h2>
              <p class="dash-hero-sub">Crie planos alimentares personalizados, acompanhe a evolução dos seus pacientes e alcance resultados extraordinários.</p>
              <div class="dash-hero-actions">
                <button class="btn-hero-primary" onclick="createClient()">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                  Adicionar paciente
              </div>
              <div class="dash-hero-badge">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div>
                  <div class="dhb-title">Base TCA-INSA</div>
                  <div class="dhb-sub">Dados nutricionais confiáveis e atualizados</div>
                </div>
                <span class="dhb-count">1.376 alimentos</span>
              </div>
            </div>
            <div class="dash-hero-visual">
              <div class="hero-plate-bg"></div>
              <img src="img/plate.png" alt="Prato saudável" class="hero-plate-img">
            </div>
          </div>

          <div id="dash-patients" class="dash-patients">
            <div class="dash-patients-header">
              <div class="dash-section-title">Os seus pacientes</div>
              <input class="patients-search" id="patients-search" type="text" placeholder="Pesquisar paciente…" oninput="filterPatients(this.value)">
            </div>
            <div class="clients-list" id="clients-list">${clientsHTML}</div>
          </div>
        </div>
      </div>

    </div>
  `;
}

function filterPatients(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('#clients-list .client-card').forEach(card => {
    const name = card.querySelector('.client-card-name')?.textContent.toLowerCase() || '';
    card.style.display = name.includes(q) ? '' : 'none';
  });
}

// ── Client page ───────────────────────────────────────────────────────────────
function renderClientPage(client) {
  loadInfoForm(client.info || {});
  renderPlansList(client);
}

function showClientTab(tab) {
  const isInfo = tab === 'info';
  const isPlans = tab === 'plans';
  const isEvol  = tab === 'evolution';
  document.getElementById('ct-info').classList.toggle('active', isInfo);
  document.getElementById('ct-plans').classList.toggle('active', isPlans);
  document.getElementById('ct-evolution').classList.toggle('active', isEvol);
  document.getElementById('ct-info-view').style.display       = isInfo  ? '' : 'none';
  document.getElementById('ct-plans-view').style.display      = isPlans ? '' : 'none';
  document.getElementById('ct-evolution-view').style.display  = isEvol  ? '' : 'none';
  document.getElementById('pg-client').classList.toggle('evolution-active', isEvol);
  if (isEvol) renderEvolutionTab();
}

function loadInfoForm(info) {
  PATIENT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = info[id] !== undefined ? info[id] : '';
  });
  // Restore formula selector buttons
  const formula = info.pFormula || 'harris';
  document.getElementById('pFormula').value = formula;
  document.querySelectorAll('.formula-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.formula === formula);
  });
  updateAge();
  updateMetrics();
  updateSomatorio();
}

function savePatientInfo() {
  if (!nav.clientId) return;
  let client = appData.clients.find(c => c.id === nav.clientId);
  const isDraft = !client && draftClient && draftClient.id === nav.clientId;
  if (!client && isDraft) client = draftClient;
  if (!client) return;
  if (!client.info) client.info = {};
  PATIENT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) client.info[id] = el.value;
  });
  const newNome = client.info.pNome?.trim();
  if (newNome) {
    client.nome = newNome;
    document.getElementById('client-page-name').textContent = newNome;
    updateBreadcrumb();
  }
  if (isDraft) {
    appData.clients.push(client);
    draftClient = null;
  }
  saveAppData();
  const btn = document.querySelector('.btn-save-info');
  const orig = btn.innerHTML;
  btn.innerHTML = '✓ Guardado';
  btn.style.background = '#16a34a';
  setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 1800);
}

// ── Plans CRUD ────────────────────────────────────────────────────────────────
function createPlan() {
  if (!nav.clientId) return;
  const client = appData.clients.find(c => c.id === nav.clientId);
  if (!client) return;
  const plan = {
    id: crypto.randomUUID(),
    nome: `Plano ${client.plans.length + 1}`,
    createdAt: Date.now(),
    days: makeDefaultDays()
  };
  client.plans.push(plan);
  saveAppData();
  goToPlan(nav.clientId, plan.id);
}

function deletePlan(planId, e) {
  e.stopPropagation();
  if (!nav.clientId) return;
  const client = appData.clients.find(c => c.id === nav.clientId);
  if (!client) return;
  const plan = client.plans.find(p => p.id === planId);
  if (!plan) return;
  showConfirm(
    'Eliminar plano',
    `Tem a certeza que quer eliminar "${plan.nome}"?`,
    () => {
      client.plans = client.plans.filter(p => p.id !== planId);
      saveAppData();
      renderPlansList(client);
    }
  );
}

function updatePlanName(nome) {
  if (!nav.clientId || !nav.planId) return;
  const client = appData.clients.find(c => c.id === nav.clientId);
  if (!client) return;
  const plan = client.plans.find(p => p.id === nav.planId);
  if (plan) { plan.nome = nome; saveAppData(); updateBreadcrumb(); }
}

function renderPlansList(client) {
  const list = document.getElementById('plans-list');
  if (!client.plans.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <div class="empty-state-title">Nenhum plano ainda</div>
        <div class="empty-state-sub">Clique em "Novo plano" para criar o primeiro plano.</div>
      </div>`;
    return;
  }
  list.innerHTML = client.plans.map(p => `
    <div class="plan-card" onclick="goToPlan('${client.id}', '${p.id}')">
      <div class="plan-card-icon">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
      </div>
      <div class="plan-card-info">
        <div class="plan-card-name">${escHtml(p.nome)}</div>
        <div class="plan-card-meta">Criado em ${formatDate(p.createdAt)}</div>
      </div>
      <div class="plan-card-right">
        <button class="btn-danger-sm" onclick="deletePlan('${p.id}', event)" title="Eliminar">×</button>
      </div>
    </div>
  `).join('');
}

// ── Nutritional helpers ───────────────────────────────────────────────────────
function scale(food, qty) {
  const f = qty / 100;
  return {
    kcal: +(food.kcal * f).toFixed(1),
    prot: +(food.prot * f).toFixed(1),
    hc:   +(food.hc   * f).toFixed(1),
    lip:  +(food.lip  * f).toFixed(1),
    fib:  +(food.fib  * f).toFixed(1),
  };
}

function dayTotals(dayIdx) {
  let tot = { kcal: 0, prot: 0, hc: 0, lip: 0 };
  state.days[dayIdx].meals.forEach(meal => {
    meal.foods.forEach(fi => {
      const s = scale(fi.food, fi.qty);
      tot.kcal += s.kcal; tot.prot += s.prot; tot.hc += s.hc; tot.lip += s.lip;
    });
  });
  return { kcal: +tot.kcal.toFixed(1), prot: +tot.prot.toFixed(1), hc: +tot.hc.toFixed(1), lip: +tot.lip.toFixed(1) };
}

function mealTotals(meal) {
  let tot = { kcal: 0, prot: 0, hc: 0, lip: 0 };
  meal.foods.forEach(fi => {
    const s = scale(fi.food, fi.qty);
    tot.kcal += s.kcal; tot.prot += s.prot; tot.hc += s.hc; tot.lip += s.lip;
  });
  return { kcal: +tot.kcal.toFixed(0), prot: +tot.prot.toFixed(1), hc: +tot.hc.toFixed(1), lip: +tot.lip.toFixed(1) };
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  renderDayTabs();
  renderPlan();
  renderChart();
}

function renderDayTabs() {
  document.getElementById('dayTabs').innerHTML = DAYS.map((d, i) => `
    <button class="day-tab${i === state.activeDay ? ' active' : ''}" onclick="switchDay(${i})">${d}</button>
  `).join('');
}

function renderPlan() {
  const area = document.getElementById('planArea');
  const day  = state.days[state.activeDay];
  area.innerHTML = day.meals.map(meal => renderMealCard(meal)).join('') + `
    <div class="add-meal-row">
      <button class="add-meal-btn" onclick="addMeal()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Adicionar refeição
      </button>
    </div>`;
}

function renderMealCard(meal) {
  const tot = mealTotals(meal);
  const foodRows = meal.foods.map(fi => renderFoodRow(fi, meal.id)).join('');
  return `
    <div class="meal-card" id="meal-${meal.id}">
      <div class="meal-header">
        <input class="meal-name-input" value="${escHtml(meal.nome)}"
               onchange="renameMeal('${meal.id}', this.value)"
               onblur="renameMeal('${meal.id}', this.value)">
        <input type="time" class="meal-time" value="${meal.hora}"
               onchange="setMealTime('${meal.id}', this.value)">
        <div class="meal-totals">
          <span><b>${tot.kcal}</b> kcal</span>
          <span>P <b>${tot.prot}g</b></span>
          <span>HC <b>${tot.hc}g</b></span>
          <span>L <b>${tot.lip}g</b></span>
        </div>
        <button class="meal-del-btn" onclick="deleteMeal('${meal.id}')" title="Eliminar refeição">×</button>
      </div>
      <div class="food-rows" id="foods-${meal.id}">${foodRows}</div>
      <div class="add-food-row">
        <button class="add-food-btn" onclick="focusSearch('${meal.id}', this)">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Adicionar alimento
        </button>
      </div>
    </div>`;
}

function renderFoodRow(fi, mealId) {
  const s = scale(fi.food, fi.qty);
  return `
    <div class="food-row" id="fi-${fi.id}">
      <div class="food-row-name">
        ${escHtml(fi.food.nome)}<span>(${fi.food.cat})</span>
      </div>
      <div class="food-macros-inline">
        <span class="m"><b>${s.kcal}</b> kcal</span>
        <span class="m">P <b>${s.prot}g</b></span>
        <span class="m">HC <b>${s.hc}g</b></span>
        <span class="m">L <b>${s.lip}g</b></span>
      </div>
      <input class="qty-input" type="number" min="1" max="9999" step="1"
             value="${fi.qty}"
             onchange="updateQty('${mealId}','${fi.id}',this.value)"
             oninput="updateQty('${mealId}','${fi.id}',this.value)">
      <span class="qty-unit">g</span>
      <button class="del-food-btn" onclick="deleteFood('${mealId}','${fi.id}')" title="Remover">×</button>
    </div>`;
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function renderChart() {
  const tot   = dayTotals(state.activeDay);
  const cProt = tot.prot * 4;
  const cHc   = tot.hc   * 4;
  const cLip  = tot.lip  * 9;
  const total = cProt + cHc + cLip || 1;

  document.getElementById('kcalNum').textContent    = tot.kcal.toFixed(0);
  document.getElementById('legProt').textContent    = `${tot.prot.toFixed(1)}g`;
  document.getElementById('legHc').textContent      = `${tot.hc.toFixed(1)}g`;
  document.getElementById('legLip').textContent     = `${tot.lip.toFixed(1)}g`;
  document.getElementById('legProtPct').textContent = `${(cProt/total*100).toFixed(0)}%`;
  document.getElementById('legHcPct').textContent   = `${(cHc/total*100).toFixed(0)}%`;
  document.getElementById('legLipPct').textContent  = `${(cLip/total*100).toFixed(0)}%`;
  document.getElementById('rProt').textContent      = `${tot.prot.toFixed(1)}g`;
  document.getElementById('rHc').textContent        = `${tot.hc.toFixed(1)}g`;
  document.getElementById('rLip').textContent       = `${tot.lip.toFixed(1)}g`;

  const data = total <= 0 ? [1,1,1] : [cProt, cHc, cLip];

  if (pieChart) {
    pieChart.data.datasets[0].data = data;
    pieChart.update('none');
  } else {
    pieChart = new Chart(document.getElementById('pieChart'), {
      type: 'doughnut',
      data: {
        labels: ['Proteína','Hidratos C.','Lípidos'],
        datasets: [{
          data,
          backgroundColor: ['#e74c3c','#f39c12','#9b59b6'],
          borderWidth: 2, borderColor: '#fff', hoverOffset: 4,
        }]
      },
      options: {
        cutout: '68%',
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = (ctx.parsed / (cProt+cHc+cLip) * 100).toFixed(0);
                return ` ${ctx.label}: ${pct}%`;
              }
            }
          }
        }
      }
    });
  }
}

// ── Search ────────────────────────────────────────────────────────────────────
let activeCat = 'Todos';

function initSearch() {
  document.getElementById('foodSearch').addEventListener('input', function() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => doSearch(this.value.trim()), 120);
  });
}

function doSearch(q) {
  const results = document.getElementById('searchResults');
  const qLow = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let list = TCA;
  if (activeCat !== 'Todos') list = list.filter(f => f.cat === activeCat);
  if (qLow) {
    list = list.filter(f => {
      const n = f.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return n.includes(qLow);
    });
  } else {
    list = list.slice(0, 80);
  }
  list = list.slice(0, 120);

  if (!list.length) {
    results.innerHTML = `<div class="search-hint">Nenhum alimento encontrado.</div>`;
    return;
  }

  results.innerHTML = list.map(f => `
    <div class="result-item" onclick="selectFood('${f.id}', this)">
      <div class="result-row">
        <div>
          <div class="result-name">${escHtml(f.nome)}</div>
          <div class="result-cat">${f.cat}</div>
        </div>
        <div>
          <div class="result-kcal">${f.kcal} kcal</div>
          <div class="result-macros">P ${f.prot}g · HC ${f.hc}g · L ${f.lip}g</div>
        </div>
      </div>
    </div>
  `).join('');
}

function selectFood(id, el) {
  const prevEl = document.querySelector('.result-item.selected');
  if (prevEl) {
    prevEl.classList.remove('selected');
    prevEl.querySelector('.result-actions')?.remove();
  }
  if (prevEl === el) { selectedFood = null; return; }

  selectedFood = TCA.find(f => f.id === id);
  if (!selectedFood) return;

  el.classList.add('selected');

  const div = document.createElement('div');
  div.className = 'result-actions';
  div.onclick = e => e.stopPropagation();
  div.innerHTML = `
    <div class="ra-label">Por 100g (ajuste a quantidade):</div>
    <div class="ra-macros">
      <span><b id="dKcal">${selectedFood.kcal}</b> kcal</span>
      <span>P <b id="dProt">${selectedFood.prot}g</b></span>
      <span>HC <b id="dHc">${selectedFood.hc}g</b></span>
      <span>L <b id="dLip">${selectedFood.lip}g</b></span>
    </div>
    <div class="ra-controls">
      <div class="qty-sel-wrap">
        <button class="qty-btn" onclick="changeQty(-10)">−</button>
        <input id="addQty" type="number" value="100" min="1" max="9999" oninput="updateDetailCalc()">
        <button class="qty-btn" onclick="changeQty(10)">+</button>
      </div>
      <span class="qty-unit-lbl">g</span>
      <button class="btn-add-food" onclick="addFoodToMeal()">+ Adicionar</button>
    </div>`;
  el.appendChild(div);
}

function updateDetailCalc() {
  if (!selectedFood) return;
  const qty = parseFloat(document.getElementById('addQty').value) || 100;
  const s = scale(selectedFood, qty);
  document.getElementById('dKcal').textContent = s.kcal;
  document.getElementById('dProt').textContent = s.prot + 'g';
  document.getElementById('dHc').textContent   = s.hc   + 'g';
  document.getElementById('dLip').textContent  = s.lip  + 'g';
}

function changeQty(delta) {
  const inp = document.getElementById('addQty');
  inp.value = Math.max(1, (parseFloat(inp.value) || 100) + delta);
  updateDetailCalc();
}

function addFoodToMeal() {
  if (!selectedFood || !activeMealCtx) return;
  const mealId = activeMealCtx;
  const qty    = parseFloat(document.getElementById('addQty').value) || 100;
  const meal   = findMeal(mealId);
  if (!meal) return;
  meal.foods.push({ id: crypto.randomUUID(), food: selectedFood, qty });
  selectedFood = null;
  saveAppData();
  render();
  closeSearchModal();
  setTimeout(() => {
    const el = document.getElementById(`meal-${mealId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

// ── Plan actions ──────────────────────────────────────────────────────────────
function switchDay(i) {
  state.activeDay = i;
  render();
}

function openCopyDayModal() {
  const from = state.activeDay;
  document.getElementById('copy-day-title').textContent = `Copiar ${DAYS[from]}`;
  document.getElementById('copy-day-grid').innerHTML = DAYS
    .map((d, i) => {
      if (i === from) return '';
      const tot   = dayTotals(i);
      const meals = state.days[i].meals.filter(m => m.foods.length > 0).length;
      return `
        <button class="copy-day-btn" onclick="copyDay(${i})">
          <span class="copy-day-name">${d}</span>
          <span class="copy-day-meta">${meals} refeição${meals !== 1 ? 'ões' : ''} · ${tot.kcal} kcal</span>
        </button>`;
    }).join('');
  document.getElementById('copyDayModal').style.display = '';
}

function closeCopyDayModal() {
  document.getElementById('copyDayModal').style.display = 'none';
}

function copyDay(toIdx) {
  const from = state.days[state.activeDay];
  state.days[toIdx].meals = from.meals.map(meal => ({
    ...meal,
    id: crypto.randomUUID(),
    foods: meal.foods.map(fi => ({ ...fi, id: crypto.randomUUID() }))
  }));
  saveAppData();
  closeCopyDayModal();
  switchDay(toIdx);
}

function addMeal() {
  const meal = { id: crypto.randomUUID(), nome: 'Nova refeição', hora: '', foods: [] };
  state.days[state.activeDay].meals.push(meal);
  saveAppData();
  render();
  setTimeout(() => {
    const el = document.querySelector(`#meal-${meal.id} .meal-name-input`);
    if (el) { el.select(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, 50);
}

function deleteMeal(mealId) {
  const day = state.days[state.activeDay];
  if (day.meals.length <= 1) return;
  day.meals = day.meals.filter(m => m.id !== mealId);
  saveAppData();
  render();
}

function renameMeal(mealId, nome) {
  const meal = findMeal(mealId);
  if (meal) { meal.nome = nome; saveAppData(); }
}

function setMealTime(mealId, hora) {
  const meal = findMeal(mealId);
  if (meal) { meal.hora = hora; saveAppData(); }
}

function updateQty(mealId, fiId, rawVal) {
  const qty = parseFloat(rawVal);
  if (!qty || qty <= 0) return;
  const meal = findMeal(mealId);
  if (!meal) return;
  const fi = meal.foods.find(f => f.id === fiId);
  if (fi) { fi.qty = qty; saveAppData(); updateMealTotalsUI(meal); renderChart(); }
}

function updateMealTotalsUI(meal) {
  const tot = mealTotals(meal);
  const hdr = document.querySelector(`#meal-${meal.id} .meal-totals`);
  if (hdr) hdr.innerHTML = `
    <span><b>${tot.kcal}</b> kcal</span>
    <span>P <b>${tot.prot}g</b></span>
    <span>HC <b>${tot.hc}g</b></span>
    <span>L <b>${tot.lip}g</b></span>`;
}

function deleteFood(mealId, fiId) {
  const meal = findMeal(mealId);
  if (!meal) return;
  meal.foods = meal.foods.filter(f => f.id !== fiId);
  saveAppData();
  const row = document.getElementById(`fi-${fiId}`);
  if (row) row.remove();
  updateMealTotalsUI(meal);
  renderChart();
}

function focusSearch(mealId, btn) {
  activeMealCtx = mealId;
  btn.scrollIntoView({ block: 'nearest', behavior: 'instant' });

  const dd   = document.getElementById('foodDropdown');
  const rect = btn.getBoundingClientRect();
  const ddW  = 360;

  let left = rect.left;
  if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8;
  if (left < 8) left = 8;
  dd.style.left = left + 'px';

  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;

  if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
    dd.style.top       = (rect.bottom + 4) + 'px';
    dd.style.bottom    = 'auto';
    dd.style.maxHeight = Math.max(180, Math.min(460, spaceBelow)) + 'px';
  } else {
    dd.style.bottom    = (window.innerHeight - rect.top + 4) + 'px';
    dd.style.top       = 'auto';
    dd.style.maxHeight = Math.max(180, Math.min(460, spaceAbove)) + 'px';
  }

  selectedFood = null;
  document.getElementById('foodSearch').value = '';
  doSearch('');
  dd.classList.add('open');
  setTimeout(() => document.getElementById('foodSearch').focus(), 50);
}

function closeSearchModal() {
  document.getElementById('foodDropdown').classList.remove('open');
}

function findMeal(mealId) {
  for (const day of state.days) {
    const m = day.meals.find(m => m.id === mealId);
    if (m) return m;
  }
  return null;
}

// ── Patient info calculations ─────────────────────────────────────────────────
const PATIENT_FIELDS = [
  'pNome','pNascimento','pGenero','pEmail','pTelefone',
  'pAltura','pPeso','pPesoRef','pPesoObj','pMassaGorda','pCintura',
  'pFormula','pAtividade','pObjetivo',
  'pPregaTricipital','pPregaBicipital','pPregaSubescapular','pPregaAbdominal',
  'pPregaSupraespinal','pPregaIleocristal','pPregaCrural','pPregaGeminal',
  'pPerCefalico','pPerBraco','pPerCinturaISAK','pPerAnca','pPerCrural','pPerGeminal',
  'pAlergias','pPatologias','pMedicacao','pNotas'
];

function updateAge() {
  const val = document.getElementById('pNascimento').value;
  if (!val) { document.getElementById('pIdade').value = ''; return; }
  const birth = new Date(val);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  document.getElementById('pIdade').value = age > 0 ? age + ' anos' : '';
  updateTMB();
}

function updateMetrics() {
  const h  = parseFloat(document.getElementById('pAltura').value);
  const w  = parseFloat(document.getElementById('pPeso').value);
  const bf = parseFloat(document.getElementById('pMassaGorda').value);

  if (h > 0 && w > 0) {
    const imc = w / ((h / 100) ** 2);
    document.getElementById('pIMC').value = imc.toFixed(1);
    let cls = '';
    if      (imc < 18.5) cls = 'Abaixo do peso';
    else if (imc < 25)   cls = 'Peso normal';
    else if (imc < 30)   cls = 'Pré-obesidade';
    else if (imc < 35)   cls = 'Obesidade Grau I';
    else if (imc < 40)   cls = 'Obesidade Grau II';
    else                  cls = 'Obesidade Grau III';
    document.getElementById('pIMCClass').value = cls;
  } else {
    document.getElementById('pIMC').value = '';
    document.getElementById('pIMCClass').value = '';
  }

  if (w > 0 && bf > 0 && bf < 100) {
    const lbm = w * (1 - bf / 100);
    document.getElementById('pMIG').value = lbm.toFixed(1) + ' kg';
  } else {
    document.getElementById('pMIG').value = '';
  }

  updateTMB();
}

function setFormula(formula, btn) {
  document.getElementById('pFormula').value = formula;
  document.querySelectorAll('.formula-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateTMB();
}

function updateSomatorio() {
  const ids = ['pPregaTricipital','pPregaBicipital','pPregaSubescapular','pPregaAbdominal',
               'pPregaSupraespinal','pPregaIleocristal','pPregaCrural','pPregaGeminal'];
  let soma = 0, count = 0;
  ids.forEach(id => {
    const v = parseFloat(document.getElementById(id).value);
    if (!isNaN(v) && v > 0) { soma += v; count++; }
  });
  document.getElementById('pSomatorioPregas').value = count > 0 ? soma.toFixed(1) + ' mm' : '';
}

function updateTMB() {
  const h       = parseFloat(document.getElementById('pAltura').value);
  const w       = parseFloat(document.getElementById('pPeso').value);
  const ageStr  = document.getElementById('pIdade').value;
  const age     = parseInt(ageStr);
  const gen     = document.getElementById('pGenero').value;
  const fac     = parseFloat(document.getElementById('pAtividade').value);
  const bf      = parseFloat(document.getElementById('pMassaGorda').value);
  const formula = document.getElementById('pFormula')?.value || 'harris';

  let tmb = null;

  if (formula === 'cunningham') {
    if (w > 0 && bf > 0 && bf < 100) {
      const lbm = w * (1 - bf / 100);
      tmb = 500 + 22 * lbm;
    }
  } else if (formula === 'harris') {
    if (h > 0 && w > 0 && age > 0 && gen) {
      tmb = gen === 'M'
        ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * age
        : 447.593 + 9.247 * w + 3.098 * h - 4.330 * age;
    }
  } else if (formula === 'tenhaaf') {
    if (h > 0 && w > 0 && age > 0 && gen) {
      tmb = 19.38 * w + 6.52 * h - 6.56 * age + (gen === 'M' ? 17.36 : 0) + 123;
    }
  } else if (formula === 'delorenzo') {
    // De Lorenzo et al. (1999) — calibrado para atletas; H em cm, resultado em kJ → ÷ 4.184
    if (h > 0 && w > 0 && age > 0 && gen) {
      const kj = gen === 'M'
        ? 9 * w + 11.7 * h - 1.14 * age + 9082
        : 9 * w + 11.7 * h - 1.14 * age - 857 + 9082;
      tmb = kj / 4.184;
    }
  }

  if (tmb !== null && tmb > 0) {
    document.getElementById('pTMB').value = Math.round(tmb) + ' kcal';
    document.getElementById('pGET').value = fac ? Math.round(tmb * fac) + ' kcal' : '';
  } else {
    document.getElementById('pTMB').value = '';
    document.getElementById('pGET').value = '';
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Evolução do Paciente ──────────────────────────────────────────────────────
let evolutionCharts = [];

function currentClient() {
  return appData.clients.find(c => c.id === nav.clientId) || null;
}

function registerConsultation() {
  const client = currentClient();
  if (!client) return;
  const f = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const record = {
    id: crypto.randomUUID(),
    date: Date.now(),
    peso:            parseFloat(f('pPeso'))            || null,
    altura:          parseFloat(f('pAltura'))          || null,
    imc:             parseFloat(f('pIMC'))             || null,
    massaGorda:      parseFloat(f('pMassaGorda'))      || null,
    mig:             parseFloat(f('pMIG'))             || null,
    somatorioPregas: parseFloat(f('pSomatorioPregas')) || null,
    perCinturaISAK:  parseFloat(f('pPerCinturaISAK'))  || null,
    perAnca:         parseFloat(f('pPerAnca'))         || null,
    perBraco:        parseFloat(f('pPerBraco'))        || null,
    notes:           f('pNotas')
  };
  if (!client.consultations) client.consultations = [];
  client.consultations.push(record);
  saveAppData();
  renderEvolutionTab();
}

function deleteConsultation(consultationId) {
  const client = currentClient();
  if (!client) return;
  showConfirm(
    'Eliminar registo',
    'Tem a certeza que quer eliminar este registo de consulta?',
    () => {
      client.consultations = client.consultations.filter(c => c.id !== consultationId);
      saveAppData();
      renderEvolutionTab();
    }
  );
}

function renderEvolutionTab() {
  const client = currentClient();
  if (!client) return;
  const container = document.getElementById('evolution-content');
  if (!container) return;

  const consultations = (client.consultations || []).slice().sort((a, b) => a.date - b.date);
  const hasData = consultations.length > 0;
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
              <div class="consult-date">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${d}
              </div>
              <button class="btn-danger-sm" onclick="deleteConsultation('${c.id}')" title="Eliminar registo">×</button>
            </div>
            <div class="consult-metrics">${chips}</div>
            ${note}
          </div>`;
      }).join('')
    : `<div class="evolution-empty">
        <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="color:var(--gray-300)"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-top:12px">Sem registos de consulta</div>
        <div style="font-size:12px;color:var(--gray-400);margin-top:4px">Preenche as informações do paciente e clica em "Registar consulta"</div>
      </div>`;

  container.innerHTML = `
    <div class="evolution-header">
      <div class="evolution-title">Histórico de Evolução</div>
      <button class="btn-primary" onclick="registerConsultation()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Registar consulta
      </button>
    </div>
    ${hasCharts ? `<div class="evolution-charts">
      <div class="evol-chart-card"><div class="evol-chart-title">Peso (kg)</div><canvas id="chartPeso"></canvas></div>
      <div class="evol-chart-card"><div class="evol-chart-title">% Massa Gorda</div><canvas id="chartGordura"></canvas></div>
      <div class="evol-chart-card"><div class="evol-chart-title">IMC</div><canvas id="chartIMC"></canvas></div>
    </div>` : ''}
    <div class="consultations-list">${cardsHTML}</div>
  `;

  if (hasCharts) renderEvolutionCharts(consultations);
}

function renderEvolutionCharts(consultations) {
  evolutionCharts.forEach(c => c.destroy());
  evolutionCharts = [];

  const labels = consultations.map(c =>
    new Date(c.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
  );

  const chartDefs = [
    { id: 'chartPeso',    label: 'Peso (kg)',       key: 'peso',       color: '#27865a' },
    { id: 'chartGordura', label: '% Massa Gorda',   key: 'massaGorda', color: '#f59e0b' },
    { id: 'chartIMC',     label: 'IMC',             key: 'imc',        color: '#4285f4' },
  ];

  chartDefs.forEach(({ id, label, key, color }) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const data = consultations.map(c => c[key]);
    if (data.every(v => v == null)) return;

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: color + '18',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: color,
          tension: 0.35,
          fill: true,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { size: 11 } } }
        }
      }
    });
    evolutionCharts.push(chart);
  });
}

// ── Exportação PDF ────────────────────────────────────────────────────────────
function openExportModal() {
  const grid = document.getElementById('export-days-grid');
  grid.innerHTML = DAYS.map((day, i) => {
    const tot = dayTotals(i);
    const meals = state.days[i].meals.filter(m => m.foods.length > 0).length;
    return `
      <label class="export-day-label">
        <input type="checkbox" class="export-day-cb" data-day="${i}" checked>
        <div class="export-day-info">
          <span class="export-day-name">${day}</span>
          <span class="export-day-meta">${meals} refeição${meals !== 1 ? 'ões' : ''} · ${tot.kcal} kcal</span>
        </div>
      </label>`;
  }).join('');
  document.getElementById('export-all').checked = true;
  document.getElementById('exportModal').style.display = '';
}

function closeExportModal() {
  document.getElementById('exportModal').style.display = 'none';
}

function toggleAllDays(checked) {
  document.querySelectorAll('.export-day-cb').forEach(cb => { cb.checked = checked; });
}

function generatePdf() {
  const selected = [...document.querySelectorAll('.export-day-cb:checked')].map(cb => +cb.dataset.day);
  if (!selected.length) return;

  const client      = appData.clients.find(c => c.id === nav.clientId);
  const plan        = client?.plans.find(p => p.id === nav.planId);
  const patientName = escHtml(client?.nome || '—');
  const planName    = escHtml(plan?.nome   || 'Plano Nutricional');
  const isMulti     = selected.length > 1;

  const pageStyle = isMulti
    ? `<style>@page{size:A4 landscape;margin:0}</style>`
    : `<style>@page{size:A4 portrait;margin:0}</style>`;

  const bodyHTML = isMulti ? buildWeeklyTableHTML(selected) : buildSingleDayHTML(selected[0]);

  document.getElementById('pdf-output').innerHTML = `
    ${pageStyle}
    <div class="pdf-page">
      <div class="pdf-topbar">
        <div class="pdf-topbar-left">
          <img src="img/fav.png" class="pdf-logo" alt="">
          <div>
            <div class="pdf-plan-title">Plano Nutricional</div>
          </div>
        </div>
        <div class="pdf-topbar-right">
          <div class="pdf-patient-label">Paciente:</div>
          <div class="pdf-patient-name">${patientName}</div>
        </div>
      </div>
      <div class="pdf-divider"></div>
      ${bodyHTML}
    </div>`;

  closeExportModal();
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.getElementById('pdf-output').innerHTML = ''; }, 1000);
  }, 80);
}

function buildSingleDayHTML(dayIdx) {
  const day = state.days[dayIdx];
  const mealsHTML = day.meals.map(meal => {
    if (!meal.foods.length) return '';
    const rows = meal.foods.map(fi => `
      <tr>
        <td>${escHtml(fi.food.nome)}</td>
        <td class="num">${fi.qty}g</td>
      </tr>`).join('');
    return `
      <div class="pdf-s-meal">
        <div class="pdf-s-meal-name">${escHtml(meal.nome)}${meal.hora ? `<span class="pdf-s-meal-time">${meal.hora}</span>` : ''}</div>
        <table class="pdf-s-table"><tbody>${rows}</tbody></table>
      </div>`;
  }).join('');
  return `
    <div class="pdf-s-day-title">${DAYS[dayIdx]}</div>
    ${mealsHTML || '<p class="pdf-empty-msg">Sem refeições registadas</p>'}`;
}

function buildWeeklyTableHTML(selected) {
  const mealSlots = state.days[selected[0]].meals;

  let maxFoods = 0;
  selected.forEach(i => state.days[i].meals.forEach(m => { if (m.foods.length > maxFoods) maxFoods = m.foods.length; }));
  const fs = maxFoods <= 3 ? '9.5pt' : maxFoods <= 6 ? '8pt' : '7pt';

  const headerCells = selected.map(i =>
    `<th class="pwt-day-header">${DAYS[i].toUpperCase()}</th>`
  ).join('');

  const mealRows = mealSlots.map((templateMeal, mealIdx) => {
    const cells = selected.map(dayIdx => {
      const meal = state.days[dayIdx].meals[mealIdx];
      if (!meal || !meal.foods.length) return `<td class="pwt-cell pwt-empty">—</td>`;
      const foods = meal.foods.map(fi =>
        `<div class="pwt-food">${escHtml(fi.food.nome)}<span class="pwt-qty"> — ${fi.qty}g</span></div>`
      ).join('');
      return `<td class="pwt-cell">${foods}</td>`;
    }).join('');
    return `<tr>
      <td class="pwt-meal-col">
        <div class="pwt-meal-name">${escHtml(templateMeal.nome)}</div>
        ${templateMeal.hora ? `<div class="pwt-meal-time">${templateMeal.hora}</div>` : ''}
      </td>
      ${cells}
    </tr>`;
  }).join('');

  return `<table class="pwt" style="font-size:${fs}">
    <thead><tr>
      <th class="pwt-meal-col-header">REFEIÇÃO</th>
      ${headerCells}
    </tr></thead>
    <tbody>${mealRows}</tbody>
  </table>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAppData();
  loadProfile();
  updateWelcomeStats();
  updateWelcomeUser();
  updateWelcomeDate();
  initSearch();

  document.addEventListener('click', e => {
    const dd = document.getElementById('foodDropdown');
    if (dd.classList.contains('open') && !dd.contains(e.target) && !e.target.closest('.add-food-btn')) {
      closeSearchModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearchModal();
  });
});
