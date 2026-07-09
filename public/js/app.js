// ── CachosNutri app.js ────────────────────────────────────────────────────────
// DAYS, escHtml, scale, formatDate e renderEvolutionCharts vêm de js/shared.js
// (partilhado com o portal do paciente, js/portal.js).

const DEFAULT_MEALS = ['Pequeno-almoço','Lanche da manhã','Almoço','Lanche da tarde','Jantar'];
const MEAL_TIMES    = ['07:30','10:30','13:00','16:00','20:00','','',''];

const PLAN_TEMPLATES = {
  defice: {
    label: 'Défice Calórico', desc: 'Redução calórica para perda de peso (~1800 kcal)', icon: '⚖️',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '444', qty: 60 }, { id: '25', qty: 200 }, { id: '636', qty: 100 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '2122000015', qty: 150 }, { id: '662', qty: 150 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 150 }, { id: '403', qty: 120 }, { id: '551', qty: 150 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '86', qty: 60 }, { id: '433', qty: 40 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '878', qty: 150 }, { id: '594', qty: 150 }, { id: '608', qty: 100 }] },
    ]
  },
  hipertrofia: {
    label: 'Hipertrofia', desc: 'Alto teor proteico para ganho muscular (~3000 kcal)', icon: '💪',
    meals: [
      { nome: 'Pequeno-almoço', hora: '07:30', foods: [{ id: '444', qty: 100 }, { id: '25', qty: 300 }, { id: '636', qty: 120 }, { id: '86', qty: 120 }] },
      { nome: 'Lanche da manhã', hora: '10:00', foods: [{ id: '2122000008', qty: 200 }, { id: '697', qty: 30 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 200 }, { id: '403', qty: 200 }, { id: '530', qty: 100 }, { id: '395', qty: 15 }] },
      { nome: 'Lanche da tarde', hora: '16:00', foods: [{ id: '814', qty: 120 }, { id: '433', qty: 80 }] },
      { nome: 'Jantar', hora: '20:00', foods: [{ id: '878', qty: 200 }, { id: '586', qty: 250 }, { id: '551', qty: 150 }, { id: '395', qty: 15 }] },
    ]
  },
  vegetariano: {
    label: 'Vegetariano', desc: 'Sem carnes, rico em proteína vegetal (~2000 kcal)', icon: '🌿',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '444', qty: 80 }, { id: '25', qty: 250 }, { id: '636', qty: 100 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '2122000008', qty: 150 }, { id: '662', qty: 150 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '538', qty: 200 }, { id: '403', qty: 120 }, { id: '608', qty: 120 }, { id: '395', qty: 10 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '86', qty: 120 }, { id: '433', qty: 50 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '545', qty: 180 }, { id: '403', qty: 120 }, { id: '551', qty: 150 }, { id: '395', qty: 10 }] },
    ]
  },
  semgluten: {
    label: 'Sem Glúten', desc: 'Isento de glúten (~2000 kcal)', icon: '🌾',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '445', qty: 60 }, { id: '25', qty: 250 }, { id: '636', qty: 100 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '2122000015', qty: 150 }, { id: '662', qty: 150 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 150 }, { id: '586', qty: 200 }, { id: '601', qty: 100 }, { id: '395', qty: 15 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '86', qty: 60 }, { id: '697', qty: 30 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '805', qty: 150 }, { id: '403', qty: 150 }, { id: '551', qty: 150 }, { id: '395', qty: 15 }] },
    ]
  },
  semlactose: {
    label: 'Sem Lactose', desc: 'Isento de lactose (~2000 kcal)', icon: '🥛',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '444', qty: 80 }, { id: '636', qty: 120 }, { id: '86', qty: 60 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '662', qty: 180 }, { id: '697', qty: 30 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 150 }, { id: '403', qty: 150 }, { id: '608', qty: 120 }, { id: '395', qty: 15 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '814', qty: 100 }, { id: '403', qty: 80 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '878', qty: 150 }, { id: '594', qty: 150 }, { id: '551', qty: 150 }, { id: '395', qty: 15 }] },
    ]
  },
  baixocarb: {
    label: 'Baixo Teor de Carboidratos', desc: 'Restrição de HC para controlo glicémico (~1800 kcal)', icon: '🥩',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '86', qty: 120 }, { id: '2122000011', qty: 100 }, { id: '615', qty: 100 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '2122000008', qty: 150 }, { id: '697', qty: 30 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 200 }, { id: '551', qty: 200 }, { id: '395', qty: 15 }, { id: '584', qty: 80 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '814', qty: 120 }, { id: '611', qty: 100 }, { id: '600', qty: 80 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '878', qty: 200 }, { id: '608', qty: 150 }, { id: '557', qty: 150 }, { id: '395', qty: 15 }] },
    ]
  },
  baixofibra: {
    label: 'Baixo Teor de Fibra', desc: 'Redução de fibra para conforto digestivo (~2000 kcal)', icon: '🍚',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '429', qty: 60 }, { id: '25', qty: 250 }, { id: '663', qty: 120 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '76', qty: 200 }, { id: '636', qty: 100 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 150 }, { id: '403', qty: 150 }, { id: '601', qty: 100 }, { id: '395', qty: 10 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '86', qty: 60 }, { id: '429', qty: 50 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '805', qty: 150 }, { id: '586', qty: 200 }, { id: '601', qty: 100 }, { id: '395', qty: 10 }] },
    ]
  },
  hiperproteico: {
    label: 'Hiperproteico', desc: 'Maximização de proteína para composição corporal (~2500 kcal)', icon: '🏋️',
    meals: [
      { nome: 'Pequeno-almoço', hora: '07:00', foods: [{ id: '444', qty: 60 }, { id: '2122000008', qty: 200 }, { id: '86', qty: 120 }] },
      { nome: 'Lanche da manhã', hora: '10:00', foods: [{ id: '2122000011', qty: 150 }, { id: '662', qty: 150 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 220 }, { id: '403', qty: 120 }, { id: '551', qty: 150 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '814', qty: 150 }, { id: '86', qty: 60 }] },
      { nome: 'Jantar', hora: '20:00', foods: [{ id: '288', qty: 220 }, { id: '586', qty: 150 }, { id: '608', qty: 100 }, { id: '395', qty: 10 }] },
    ]
  },
  baixofodmap: {
    label: 'Baixo Teor de FODMAPs', desc: 'Adequado para síndrome do intestino irritável (~2000 kcal)', icon: '🫁',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '444', qty: 60 }, { id: '1900000063', qty: 250 }, { id: '676', qty: 150 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '1920000010', qty: 150 }, { id: '636', qty: 100 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '270', qty: 150 }, { id: '403', qty: 150 }, { id: '601', qty: 100 }, { id: '395', qty: 10 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '86', qty: 60 }, { id: '615', qty: 80 }, { id: '611', qty: 80 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '878', qty: 150 }, { id: '586', qty: 200 }, { id: '578', qty: 100 }, { id: '395', qty: 10 }] },
    ]
  },
  ovolacto: {
    label: 'Ovolactovegetariano', desc: 'Vegetariano com ovos e laticínios (~2000 kcal)', icon: '🥚',
    meals: [
      { nome: 'Pequeno-almoço', hora: '08:00', foods: [{ id: '444', qty: 80 }, { id: '25', qty: 250 }, { id: '636', qty: 100 }] },
      { nome: 'Lanche da manhã', hora: '10:30', foods: [{ id: '2122000008', qty: 150 }, { id: '662', qty: 130 }] },
      { nome: 'Almoço', hora: '13:00', foods: [{ id: '538', qty: 180 }, { id: '403', qty: 120 }, { id: '601', qty: 100 }, { id: '395', qty: 10 }] },
      { nome: 'Lanche da tarde', hora: '16:30', foods: [{ id: '86', qty: 120 }, { id: '2122000011', qty: 100 }] },
      { nome: 'Jantar', hora: '19:30', foods: [{ id: '536', qty: 180 }, { id: '419', qty: 120 }, { id: '608', qty: 100 }, { id: '395', qty: 10 }] },
    ]
  },
};

let appData    = { version: 1, clients: [] };
let appProfile = { name: '', age: '', sex: '', email: '', photo: '', cedula: '' };
let nav        = { view: 'welcome', clientId: null, planId: null };
let state      = { activeDay: 0, days: [] };
let draftClient = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
let currentUser = null;

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
  if (!appProfile.customTemplates) appProfile.customTemplates = [];
}

function saveProfile() {
  appProfile.name   = document.getElementById('profName').value.trim();
  appProfile.age    = document.getElementById('profAge').value;
  appProfile.sex    = document.getElementById('profSex').value;
  appProfile.email  = document.getElementById('profEmail').value.trim();
  appProfile.cedula = document.getElementById('profCedula').value.trim();
  try { localStorage.setItem('cachos_profile', JSON.stringify(appProfile)); } catch(e) {}
  updateSidebarUser();
  closeProfileModal();
  if (nav.view === 'clients') renderDashboard();
}

// ── Auth (Supabase) ───────────────────────────────────────────────────────────
// app.html assume que já está autenticado (login.html trata do login/registo em
// si). Aqui só é preciso: confirmar a sessão ao iniciar (initApp), saber quem é
// o utilizador atual, e terminar sessão.

async function fetchProfileName() {
  try {
    const { data: prof } = await sb.from('profiles').select('nome, email').eq('id', currentUser.id).single();
    if (prof) {
      if (prof.nome && !appProfile.name) appProfile.name = prof.nome;
      if (prof.email) appProfile.email = prof.email;
    }
  } catch (e) {}
}

// Contas de paciente não devem entrar na app do nutricionista (usam portal.html).
// Devolve true (é nutricionista), false (é paciente) ou null (sessão órfã —
// utilizador autenticado sem linha em "profiles", ex: apagada manualmente).
async function verificarRoleNutricionista() {
  const { data: prof, error } = await sb.from('profiles').select('role').eq('id', currentUser.id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // 0 linhas — sessão órfã
    return true; // erro transitório (rede, etc.) — não bloqueia
  }
  return prof.role !== 'paciente';
}

function confirmLogout() {
  showConfirm(
    'Terminar sessão',
    'Tem a certeza que quer terminar a sessão?',
    handleLogout,
    'Terminar sessão'
  );
}

async function handleLogout() {
  clearTimeout(_remoteSyncTimer);
  await sb.auth.signOut();
  currentUser = null;
  appData = { version: 1, clients: [] };
  nav = { view: 'welcome', clientId: null, planId: null };
  window.location.href = 'index.html';
}

// Ponto de entrada de app.html: confirma sessão (redireciona para a landing se
// não houver), trata de uma importação pendente vinda de login.html, carrega
// os dados e mostra o dashboard.
async function initApp() {
  let session;
  try {
    ({ data: { session } } = await sb.auth.getSession());
  } catch (e) { console.error('Erro ao verificar sessão:', e); }
  if (!session || !session.user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = session.user;
  const isNutri = await verificarRoleNutricionista();
  if (isNutri === null) {
    await sb.auth.signOut();
    window.location.href = 'login.html?erro=sessao_invalida';
    return;
  }
  if (!isNutri) {
    await sb.auth.signOut();
    window.location.href = 'login.html?erro=role_paciente';
    return;
  }
  await fetchProfileName();

  const pendingImport = sessionStorage.getItem('cachos_pending_import');
  if (pendingImport) {
    sessionStorage.removeItem('cachos_pending_import');
    try {
      appData = { version: 1, clients: JSON.parse(pendingImport).clients || [] };
      await syncAppDataToSupabase();
    } catch (e) { console.error('Erro ao importar dados locais:', e); }
  }

  await loadAppData();
  loadProfile();
  updateSidebarUser();
  goToClients();
}

function openProfileModal() {
  document.getElementById('profName').value   = appProfile.name;
  document.getElementById('profAge').value    = appProfile.age;
  document.getElementById('profSex').value    = appProfile.sex;
  document.getElementById('profEmail').value  = appProfile.email;
  document.getElementById('profCedula').value = appProfile.cedula || '';
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

// ── Persistence (Supabase, com localStorage como cache local) ──────────────────
let _remoteSyncTimer = null;

function saveAppData() {
  if (nav.clientId && nav.planId) {
    const client = appData.clients.find(c => c.id === nav.clientId);
    if (client) {
      const plan = client.plans.find(p => p.id === nav.planId);
      if (plan) plan.days = state.days;
    }
  }
  try { localStorage.setItem('cachos_data', JSON.stringify(appData)); } catch(e) {}
  scheduleRemoteSync();
}

function saveState() { saveAppData(); }

function scheduleRemoteSync() {
  if (!currentUser) return;
  setSyncStatus('pending');
  clearTimeout(_remoteSyncTimer);
  _remoteSyncTimer = setTimeout(syncAppDataToSupabase, 600);
}

function setSyncStatus(state) {
  const el = document.getElementById('sn-sync-status');
  if (!el) return;
  el.classList.remove('sync-error');
  if (state === 'pending')      el.textContent = 'A guardar…';
  else if (state === 'syncing') el.textContent = 'A sincronizar…';
  else if (state === 'error')   { el.textContent = 'Falha ao sincronizar — nova tentativa em breve'; el.classList.add('sync-error'); }
  else                          el.textContent = 'CachosNutri · sincronizado';
}

function numOrNull(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function rowToClient(row) {
  return {
    id: row.id,
    nome: row.nome,
    createdAt: new Date(row.created_at).getTime(),
    info: row.info || {},
    consultations: (row.consultations || [])
      .slice().sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(rowToConsultation),
    plans: (row.plans || [])
      .slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(rowToPlan)
  };
}

function rowToPlan(row) {
  return {
    id: row.id,
    nome: row.nome,
    createdAt: new Date(row.created_at).getTime(),
    macroTargets: row.macro_targets,
    waterMl: row.water_ml,
    days: row.days && row.days.length ? row.days : makeDefaultDays()
  };
}

function rowToConsultation(row) {
  return {
    id: row.id,
    date: new Date(row.date).getTime(),
    peso: row.peso, altura: row.altura, imc: row.imc,
    massaGorda: row.massa_gorda, mig: row.mig,
    somatorioPregas: row.somatorio_pregas,
    perCinturaISAK: row.per_cintura_isak, perAnca: row.per_anca, perBraco: row.per_braco,
    notes: row.notes
  };
}

// Carrega appData a partir do Supabase para o nutricionista autenticado.
async function loadAppData() {
  if (!currentUser) { appData = { version: 1, clients: [] }; return; }
  try {
    const { data: rows, error } = await sb
      .from('clients')
      .select('id, nome, info, created_at, plans(id, nome, macro_targets, water_ml, days, created_at), consultations(*)')
      .eq('nutricionista_id', currentUser.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    appData = { version: 1, clients: (rows || []).map(rowToClient) };
  } catch (e) {
    console.error('Erro ao carregar dados do Supabase:', e);
    appData = { version: 1, clients: [] };
    showAlertModal('Não foi possível carregar os seus dados. Tente novamente mais tarde.');
  }
}

// Envia o estado completo em memória para o Supabase (upsert + limpeza de removidos).
async function syncAppDataToSupabase(retryCount) {
  if (!currentUser) return;
  retryCount = retryCount || 0;
  setSyncStatus('syncing');
  const nutricionistaId = currentUser.id;
  try {
    const clientIds = [];
    const planIds = [];
    const consultationIds = [];

    for (const client of appData.clients) {
      clientIds.push(client.id);
      const { error: cErr } = await sb.from('clients').upsert({
        id: client.id,
        nutricionista_id: nutricionistaId,
        nome: client.nome,
        info: client.info || {}
      });
      if (cErr) throw cErr;

      for (const plan of client.plans) {
        planIds.push(plan.id);
        const { error: pErr } = await sb.from('plans').upsert({
          id: plan.id,
          client_id: client.id,
          nome: plan.nome,
          macro_targets: plan.macroTargets,
          water_ml: plan.waterMl,
          days: plan.days
        });
        if (pErr) throw pErr;
      }

      for (const cons of (client.consultations || [])) {
        consultationIds.push(cons.id);
        const { error: xErr } = await sb.from('consultations').upsert({
          id: cons.id,
          client_id: client.id,
          date: new Date(cons.date).toISOString(),
          peso: numOrNull(cons.peso), altura: numOrNull(cons.altura), imc: numOrNull(cons.imc),
          massa_gorda: numOrNull(cons.massaGorda), mig: numOrNull(cons.mig),
          somatorio_pregas: numOrNull(cons.somatorioPregas),
          per_cintura_isak: numOrNull(cons.perCinturaISAK), per_anca: numOrNull(cons.perAnca), per_braco: numOrNull(cons.perBraco),
          notes: cons.notes || null
        });
        if (xErr) throw xErr;
      }
    }

    await pruneDeleted('clients', 'nutricionista_id', nutricionistaId, clientIds);
    if (clientIds.length) {
      await pruneDeletedByParent('plans', 'client_id', clientIds, planIds);
      await pruneDeletedByParent('consultations', 'client_id', clientIds, consultationIds);
    }
    setSyncStatus('idle');
  } catch (e) {
    console.error('Erro ao sincronizar com Supabase:', e);
    setSyncStatus('error');
    if (retryCount < 3) {
      setTimeout(() => syncAppDataToSupabase(retryCount + 1), 2000 * Math.pow(2, retryCount));
    }
  }
}

async function pruneDeleted(table, ownerCol, ownerId, keepIds) {
  const { data, error } = await sb.from(table).select('id').eq(ownerCol, ownerId);
  if (error || !data) return;
  const keepSet = new Set(keepIds);
  const toDelete = data.map(r => r.id).filter(id => !keepSet.has(id));
  if (toDelete.length) await sb.from(table).delete().in('id', toDelete);
}

async function pruneDeletedByParent(table, parentCol, parentIds, keepIds) {
  const { data, error } = await sb.from(table).select('id').in(parentCol, parentIds);
  if (error || !data) return;
  const keepSet = new Set(keepIds);
  const toDelete = data.map(r => r.id).filter(id => !keepSet.has(id));
  if (toDelete.length) await sb.from(table).delete().in('id', toDelete);
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
  closeMobileSidebar();
}

// ── Mobile sidebar (off-canvas drawer) ──────────────────────────────────────────
function toggleMobileSidebar() {
  document.querySelector('.sidebar-nav').classList.toggle('mobile-open');
  document.getElementById('sidebar-backdrop').classList.toggle('active');
}

function closeMobileSidebar() {
  document.querySelector('.sidebar-nav')?.classList.remove('mobile-open');
  document.getElementById('sidebar-backdrop')?.classList.remove('active');
}

function updateBreadcrumb() {
  // Kept for compatibility — sidebar handles active state in showPage
  const client = appData.clients.find(c => c.id === nav.clientId);
  if (client) {
    const el = document.getElementById('client-page-name');
    if (el) el.textContent = client.nome;
  }
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
  if (clientId !== nav.clientId) previewPlanId = null;
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

  if (plan.waterMl === null) {
    const peso = parseFloat(client.info?.pPeso) || 0;
    plan.waterMl = peso ? Math.round(peso * 35) : 2000;
    saveAppData();
  }

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
  renderInviteSection(client);
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
  document.getElementById('pConsentimento').checked = !!info.pConsentimento;
  renderConsentimentoLabel(info.pConsentimentoData);
  updateAge();
  updateMetrics();
  updateSomatorio();
}

function renderConsentimentoLabel(isoDate) {
  const el = document.getElementById('pConsentimentoData-label');
  if (!el) return;
  el.textContent = isoDate
    ? `Consentimento registado em ${new Date(isoDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}`
    : '';
}

function onConsentimentoChange() {
  renderConsentimentoLabel(document.getElementById('pConsentimento').checked ? Date.now() : null);
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
  const consentChecked = document.getElementById('pConsentimento').checked;
  client.info.pConsentimento = consentChecked;
  client.info.pConsentimentoData = consentChecked ? (client.info.pConsentimentoData || new Date().toISOString()) : null;
  renderConsentimentoLabel(client.info.pConsentimentoData);
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

// Exporta todos os dados de um paciente em JSON (RGPD — direito de acesso/portabilidade,
// tipicamente usado antes de um pedido de eliminação/direito ao esquecimento).
function exportClientDataJson() {
  if (!nav.clientId) return;
  let client = appData.clients.find(c => c.id === nav.clientId);
  if (!client && draftClient && draftClient.id === nav.clientId) client = draftClient;
  if (!client) return;

  const exportPayload = {
    exportadoEm: new Date().toISOString(),
    paciente: client
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safeName = (client.nome || 'paciente').trim().replace(/[^\w\- ]/g, '').replace(/\s+/g, '_');
  a.href = url;
  a.download = `cachosnutri_${safeName || 'paciente'}_dados.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Portal do Paciente — convite ────────────────────────────────────────────
// Sem letras/números ambíguos (0/O, 1/I) para reduzir erros de transcrição manual.
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genInviteCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => INVITE_CODE_CHARS[b % INVITE_CODE_CHARS.length]).join('');
}

function buildInviteUrl(code, email, nome) {
  const base = `${window.location.origin}${window.location.pathname.replace(/app\.html$/, '')}portal.html`;
  const params = new URLSearchParams({ invite: code });
  if (email) params.set('email', email);
  if (nome) params.set('nome', nome);
  return `${base}?${params.toString()}`;
}

async function loadInviteLink(clientId) {
  if (!currentUser) return null;
  const { data, error } = await sb
    .from('nutricionista_paciente_links')
    .select('id, code, email, status, invited_at, accepted_at')
    .eq('client_id', clientId)
    .eq('nutricionista_id', currentUser.id)
    .order('invited_at', { ascending: false })
    .limit(1);
  if (error) { console.error('Erro ao carregar estado do convite:', error); return null; }
  const link = (data && data[0]) || null;
  if (!link || link.status !== 'active') return link;

  // Um convite pode continuar marcado como "active" mesmo depois de a conta do
  // paciente ter sido apagada no Supabase (ex: apagada manualmente em
  // Authentication → Users). Confirma que o cliente continua mesmo associado
  // antes de mostrar "Associado" — senão trata como se nunca tivesse sido.
  const { data: clientRow } = await sb.from('clients').select('paciente_id').eq('id', clientId).single();
  if (!clientRow || !clientRow.paciente_id) {
    await sb.from('nutricionista_paciente_links').update({ status: 'revoked' }).eq('id', link.id);
    return null;
  }
  return link;
}

async function renderInviteSection(client) {
  const el = document.getElementById('invite-section');
  if (!el) return;

  if (!appData.clients.find(c => c.id === client.id)) {
    el.innerHTML = `<p class="modal-hint">Guarde a informação do paciente para poder enviar um convite de acesso ao portal.</p>`;
    return;
  }

  el.innerHTML = `<p class="modal-hint">A verificar estado do convite…</p>`;
  const link = await loadInviteLink(client.id);
  if (nav.clientId !== client.id) return; // utilizador já navegou para outro paciente

  if (!link || link.status === 'revoked') {
    el.innerHTML = `
      <div class="invite-row">
        <input class="field-input" type="email" id="invite-email" placeholder="email@paciente.com" value="${escHtml(client.info?.pEmail || '')}">
        <button class="btn-primary" onclick="sendInvite('${client.id}')">Enviar convite</button>
      </div>`;
    return;
  }

  if (link.status === 'pending') {
    const inviteUrl = buildInviteUrl(link.code, link.email, client.nome);
    el.innerHTML = `
      <div class="invite-status">
        <span class="invite-badge invite-badge--pending">Pendente</span>
        Convite enviado para ${escHtml(link.email || '—')} em ${formatDate(link.invited_at)}
      </div>
      <div class="invite-row">
        <input class="field-input" readonly value="${escHtml(inviteUrl)}" onclick="this.select()">
        <button class="btn-back" onclick="copyInviteLink('${inviteUrl}')">Copiar link</button>
      </div>
      <div class="invite-actions">
        <button class="btn-back" onclick="resendInvite('${client.id}')">Reenviar email</button>
        <button class="btn-danger-sm-text" onclick="revokeInvite('${client.id}','${link.id}')">Cancelar convite</button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="invite-status">
      <span class="invite-badge invite-badge--active">✓ Associado</span>
      Paciente com acesso ao portal${link.accepted_at ? ` desde ${formatDate(link.accepted_at)}` : ''}
    </div>
    <div class="invite-actions">
      <button class="btn-danger-sm-text" onclick="revokeInvite('${client.id}','${link.id}')">Remover acesso</button>
    </div>`;
}

async function deliverInviteEmail(code, email, clientNome) {
  try {
    const { error } = await sb.functions.invoke('send-invite-email', {
      body: { code, email, clientNome, nutricionistaNome: appProfile.name || 'O seu nutricionista' }
    });
    if (error) throw error;
  } catch (e) {
    console.error('Erro ao enviar email de convite:', e);
    showAlertModal('O convite foi criado, mas o email pode não ter sido enviado (confirme se a Edge Function "send-invite-email" já está publicada no Supabase). Pode copiar o link e enviar manualmente.', { type: 'info', title: 'Convite criado' });
  }
}

async function sendInvite(clientId) {
  const emailEl = document.getElementById('invite-email');
  const email = emailEl?.value.trim();
  if (!email) return;
  const client = appData.clients.find(c => c.id === clientId);
  if (!client || !currentUser) return;

  const code = genInviteCode();
  const { error } = await sb.from('nutricionista_paciente_links').insert({
    nutricionista_id: currentUser.id,
    client_id: clientId,
    code,
    email,
    status: 'pending'
  });
  if (error) {
    console.error('Erro ao criar convite:', error);
    showAlertModal('Não foi possível criar o convite. Tente novamente.');
    return;
  }
  await deliverInviteEmail(code, email, client.nome);
  renderInviteSection(client);
}

async function resendInvite(clientId) {
  const client = appData.clients.find(c => c.id === clientId);
  if (!client) return;
  const link = await loadInviteLink(clientId);
  if (!link || link.status !== 'pending' || !link.email) return;
  await deliverInviteEmail(link.code, link.email, client.nome);
  renderInviteSection(client);
}

function revokeInvite(clientId, linkId) {
  showConfirm(
    'Remover acesso ao portal',
    'Tem a certeza que quer remover o acesso deste paciente ao portal? Pode voltar a convidar mais tarde.',
    async () => {
      const { error: linkErr } = await sb.from('nutricionista_paciente_links').update({ status: 'revoked' }).eq('id', linkId);
      const { error: clientErr } = await sb.from('clients').update({ paciente_id: null }).eq('id', clientId);
      if (linkErr || clientErr) {
        console.error('Erro ao remover acesso ao portal:', linkErr || clientErr);
        showAlertModal('Não foi possível remover o acesso. Tente novamente.');
        return;
      }
      const client = appData.clients.find(c => c.id === clientId);
      if (client) renderInviteSection(client);
    },
    'Remover'
  );
}

function copyInviteLink(url) {
  navigator.clipboard?.writeText(url).catch(() => {});
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
    macroTargets: null,
    waterMl: null,
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

let previewPlanId = null;

function renderPlansList(client) {
  const list        = document.getElementById('plans-list');
  const resumoPanel = document.getElementById('pd-resumo-panel');
  const bottomRow   = document.getElementById('pd-bottom-row');

  if (!client.plans.length) {
    previewPlanId = null;
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <div class="empty-state-title">Nenhum plano ainda</div>
        <div class="empty-state-sub">Clique em "Novo plano" para criar o primeiro plano.</div>
      </div>`;
    if (resumoPanel) { resumoPanel.innerHTML = ''; resumoPanel.style.display = 'none'; }
    if (bottomRow)   { bottomRow.innerHTML   = ''; bottomRow.style.display   = 'none'; }
    return;
  }
  if (resumoPanel) resumoPanel.style.display = '';
  if (bottomRow)   bottomRow.style.display   = '';
  const DAY_ABBR = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  list.innerHTML = client.plans.map(p => {
    const activeDays = p.days.filter(d => d.meals.some(m => m.foods.length)).length;
    const totalMeals = p.days.reduce((s, d) => s + d.meals.filter(m => m.foods.length).length, 0);
    const dayDots = p.days.map((d, i) => {
      const active = d.meals.some(m => m.foods.length);
      return `<span class="pc-day-dot ${active ? 'pc-day-dot--on' : ''}">${DAY_ABBR[i]}</span>`;
    }).join('');
    const isSelected = p.id === previewPlanId;
    return `
    <div class="plan-card ${isSelected ? 'plan-card--selected' : ''}" onclick="goToPlan('${client.id}','${p.id}')">
      <div class="plan-card-accent"></div>
      <div class="plan-card-body">
        <div class="plan-card-top">
          <div class="plan-card-icon">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          </div>
          <div class="plan-card-info">
            <div class="plan-card-name">${escHtml(p.nome)}</div>
            <div class="plan-card-meta">Criado em ${formatDate(p.createdAt)}</div>
          </div>
          <button class="btn-danger-sm" onclick="deletePlan('${p.id}', event)" title="Eliminar">×</button>
        </div>
        <div class="plan-card-days">${dayDots}</div>
        <div class="plan-card-footer">
          <div class="plan-card-stats">
            <div class="pc-stat"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>${activeDays} dia${activeDays !== 1 ? 's' : ''}</span></div>
            <div class="pc-stat"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z"/></svg><span>${totalMeals} ${totalMeals === 1 ? 'refeição' : 'refeições'}</span></div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // auto-select first plan
  if (!previewPlanId || !client.plans.find(p => p.id === previewPlanId)) {
    previewPlanId = client.plans[0].id;
  }
  renderPlanDetail(client.plans.find(p => p.id === previewPlanId), client);
}

function selectPlanPreview(planId) {
  const client = appData.clients.find(c => c.id === nav.clientId);
  if (!client) return;
  previewPlanId = planId;
  renderPlansList(client);
}

function renderPlanDetail(plan, client) {
  const resumoPanel = document.getElementById('pd-resumo-panel');
  const bottomRow   = document.getElementById('pd-bottom-row');
  if (!resumoPanel || !bottomRow || !plan) return;

  const activeDays = plan.days.filter(d => d.meals.some(m => m.foods.length)).length;
  const totalMeals = plan.days.reduce((s, d) => s + d.meals.filter(m => m.foods.length).length, 0);
  const adhesion   = Math.round(activeDays / 7 * 100);

  const daysWithFood = plan.days.filter(d => d.meals.some(m => m.foods.length));
  let avgKcal = 0, avgProt = 0, avgHc = 0, avgLip = 0;
  daysWithFood.forEach(d => {
    let k = 0, p = 0, h = 0, l = 0;
    d.meals.forEach(m => m.foods.forEach(fi => {
      const s = scale(fi.food, fi.qty);
      k += s.kcal; p += s.prot; h += s.hc; l += s.lip;
    }));
    avgKcal += k; avgProt += p; avgHc += h; avgLip += l;
  });
  if (daysWithFood.length) {
    avgKcal /= daysWithFood.length; avgProt /= daysWithFood.length;
    avgHc   /= daysWithFood.length; avgLip  /= daysWithFood.length;
  }
  const cP = avgProt * 4, cH = avgHc * 4, cL = avgLip * 9;
  const cTotal  = cP + cH + cL || 1;
  const pctProt = Math.round(cP / cTotal * 100);
  const pctHc   = Math.round(cH / cTotal * 100);
  const pctLip  = Math.round(cL / cTotal * 100);
  const macroLabel = (pctProt >= 20 && pctProt <= 35 && pctLip >= 20 && pctLip <= 35) ? 'Equilibrado' : 'A ajustar';

  const objMap = { perda: 'Perda de peso', manutencao: 'Manutenção de peso', ganho: 'Ganho de massa muscular', saude: 'Melhoria da saúde geral', outro: 'Outro' };
  const palMap = { '1.4': 'Sedentário (PAL 1.4)', '1.6': 'Moderado (PAL 1.6)', '1.8': 'Ativo (PAL 1.8)', '2.0': 'Muito Ativo (PAL 2.0)' };
  const objetivo  = objMap[client.info?.pObjetivo] || '—';
  const atividade = palMap[client.info?.pAtividade] || '—';
  const autorNome = appProfile.name || 'Nutricionista';
  const getVal    = parseFloat(client.info?.pGET) || null;
  const totalFoods = new Set(plan.days.flatMap(d => d.meals.flatMap(m => m.foods.map(fi => fi.food.id)))).size;
  const daysEmpty  = 7 - activeDays;

  // ── Resumo panel (top right)
  resumoPanel.innerHTML = `
    <div class="pd-resumo-title">Resumo do plano</div>
    <div class="pd-stats-row">
      <div class="pd-stat-card">
        <svg width="20" height="20" fill="none" stroke="var(--green)" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div class="pd-stat-val">7</div><div class="pd-stat-lbl">dias<br>de plano</div>
      </div>
      <div class="pd-stat-card">
        <svg width="20" height="20" fill="none" stroke="var(--green)" stroke-width="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        <div class="pd-stat-val">${totalMeals}</div><div class="pd-stat-lbl">refeições<br>planeadas</div>
      </div>
      <div class="pd-stat-card">
        <svg width="20" height="20" fill="none" stroke="var(--green)" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <div class="pd-stat-val">${adhesion}%</div><div class="pd-stat-lbl">adesão<br>semanal</div>
      </div>
      <div class="pd-stat-card">
        <svg width="20" height="20" fill="none" stroke="var(--green)" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <div class="pd-stat-val pd-stat-label-val">${macroLabel}</div><div class="pd-stat-lbl">distribuição<br>de macros</div>
      </div>
    </div>`;

  // ── Bottom row (3 cards)
  bottomRow.innerHTML = `
    <div class="pd-section">
      <div class="pd-section-title">Distribuição de macronutrientes (média diária)</div>
      ${daysWithFood.length ? `
        <div class="pd-macro-bar-wrap">
          <div class="pd-macro-bar">
            <div class="pd-macro-seg" style="width:${pctHc}%;background:#27865a"></div>
            <div class="pd-macro-seg" style="width:${pctProt}%;background:#4caf82"></div>
            <div class="pd-macro-seg" style="width:${pctLip}%;background:#f39c12"></div>
          </div>
        </div>
        <div class="pd-macro-cards">
          <div class="pd-macro-mini" style="border-color:#27865a22">
            <span class="pd-macro-dot" style="background:#27865a"></span>
            <div class="pd-macro-mini-val">${avgHc.toFixed(1)}g</div>
            <div class="pd-macro-mini-lbl">Hidratos <b>${pctHc}%</b></div>
          </div>
          <div class="pd-macro-mini" style="border-color:#4caf8222">
            <span class="pd-macro-dot" style="background:#4caf82"></span>
            <div class="pd-macro-mini-val">${avgProt.toFixed(1)}g</div>
            <div class="pd-macro-mini-lbl">Proteínas <b>${pctProt}%</b></div>
          </div>
          <div class="pd-macro-mini" style="border-color:#f39c1222">
            <span class="pd-macro-dot" style="background:#f39c12"></span>
            <div class="pd-macro-mini-val">${avgLip.toFixed(1)}g</div>
            <div class="pd-macro-mini-lbl">Gorduras <b>${pctLip}%</b></div>
          </div>
        </div>
        <div class="pd-kcal-avg">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          ${avgKcal.toFixed(0)} kcal/dia em média
        </div>`
      : '<p class="pd-empty-note">Sem dados — adiciona alimentos ao plano.</p>'}
    </div>
    <div class="pd-section">
      <div class="pd-section-title">Informações adicionais</div>
      <div class="pd-info-list">
        <div class="pd-info-row">
          <span>Objetivo do plano</span>
          <span>${objetivo}</span>
        </div>
        <div class="pd-info-row">
          <span>Nível de atividade</span>
          <span>${atividade}</span>
        </div>
        ${getVal ? `<div class="pd-info-row"><span>GET estimado</span><span>${getVal.toFixed(0)} kcal</span></div>` : ''}
        <div class="pd-info-row">
          <span>Alimentos distintos</span>
          <span>${totalFoods}</span>
        </div>
        <div class="pd-info-row">
          <span>Dias sem refeições</span>
          <span>${daysEmpty === 0 ? '✓ Nenhum' : daysEmpty}</span>
        </div>
        <div class="pd-info-row">
          <span>Criado por</span>
          <span>${escHtml(autorNome)}</span>
        </div>
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">Ações rápidas</div>
      <div class="pd-actions-list">
        <button class="pd-action" onclick="goToPlan('${client.id}','${plan.id}')">
          <div class="pd-action-icon" style="background:#edf7f2">
            <svg width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <div class="pd-action-text"><div class="pd-action-label">Editar plano</div><div class="pd-action-desc">Abrir o editor de refeições</div></div>
        </button>
        <button class="pd-action" onclick="openExportForPlan('${client.id}','${plan.id}')">
          <div class="pd-action-icon" style="background:#edf7f2">
            <svg width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </div>
          <div class="pd-action-text"><div class="pd-action-label">Exportar PDF</div><div class="pd-action-desc">Gerar plano para entregar ao paciente</div></div>
        </button>
        <button class="pd-action pd-action--danger" onclick="deletePlan('${plan.id}', event)">
          <div class="pd-action-icon" style="background:#fdf0f0">
            <svg width="14" height="14" fill="none" stroke="#e74c3c" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </div>
          <div class="pd-action-text"><div class="pd-action-label">Eliminar plano</div><div class="pd-action-desc">Remover permanentemente</div></div>
        </button>
      </div>
    </div>`;
}

// ── Nutritional helpers ───────────────────────────────────────────────────────
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
  renderWater();
}

function renderDayTabs() {
  document.getElementById('dayTabs').innerHTML = DAYS.map((d, i) => `
    <button class="day-tab${i === state.activeDay ? ' active' : ''}" onclick="switchDay(${i})">${d}</button>
  `).join('');

  const mobileSelect = document.getElementById('day-select-mobile');
  if (mobileSelect) {
    mobileSelect.innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
    mobileSelect.value = state.activeDay;
  }
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
      <button class="btn-equiv" onclick="openEquivModal('${fi.id}','${mealId}')" title="Ver equivalências">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M7 16H3l4 4m0-4-4-4M17 8h4l-4-4m0 4 4 4"/></svg>
        Trocar
      </button>
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
  renderMacroTargets(tot);
}

// ── Macro Targets ─────────────────────────────────────────────────────────────
function renderMacroTargets(tot) {
  const client = appData.clients.find(c => c.id === nav.clientId);
  const plan   = client?.plans.find(p => p.id === nav.planId);
  if (!plan) return;

  const cta  = document.getElementById('macro-targets-cta');
  const sec  = document.getElementById('macro-targets-section');
  if (!cta || !sec) return;

  if (!plan.macroTargets) {
    cta.style.display = '';
    sec.style.display = 'none';
    return;
  }
  cta.style.display = 'none';
  sec.style.display = '';

  const rows = [
    { id: 'mt-kcal', label: 'Calorias',  actual: tot.kcal,  target: plan.macroTargets.kcal,  unit: ' kcal' },
    { id: 'mt-prot', label: 'Proteína',  actual: tot.prot,  target: plan.macroTargets.prot,  unit: 'g' },
    { id: 'mt-hc',   label: 'Hidratos',  actual: tot.hc,    target: plan.macroTargets.hc,    unit: 'g' },
    { id: 'mt-lip',  label: 'Lípidos',   actual: tot.lip,   target: plan.macroTargets.lip,   unit: 'g' },
  ];

  rows.forEach(({ id, label, actual, target, unit }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const diff  = actual - target;
    const pct   = target > 0 ? Math.min(actual / target * 100, 100) : 0;
    const ratio = target > 0 ? Math.abs(diff) / target : 0;
    const color = ratio < 0.05 ? '#27865a' : diff < 0 ? '#f39c12' : '#e74c3c';
    const cls   = ratio < 0.05 ? 'mt-ok'   : diff < 0 ? 'mt-deficit' : 'mt-excess';
    const txt   = ratio < 0.05
      ? '✓ No objetivo'
      : diff < 0
        ? `Faltam ${Math.abs(diff).toFixed(0)}${unit}`
        : `Excesso ${diff.toFixed(0)}${unit}`;
    el.innerHTML = `
      <div class="mt-label">${label}</div>
      <div class="mt-bar-wrap"><div class="mt-bar" style="width:${pct}%;background:${color}"></div></div>
      <div class="mt-values">
        <span class="mt-actual">${actual.toFixed(0)}${unit} <span style="color:#aaa;font-weight:400">/ ${target}${unit}</span></span>
        <span class="${cls}">${txt}</span>
      </div>`;
  });
}

function openMacroTargetsModal() {
  const client = appData.clients.find(c => c.id === nav.clientId);
  const plan   = client?.plans.find(p => p.id === nav.planId);
  if (!plan) return;

  const mt = plan.macroTargets;
  const get  = parseFloat(client?.info?.pGET)  || null;
  const peso = parseFloat(client?.info?.pPeso) || null;

  document.getElementById('tg-kcal').value = mt?.kcal ?? (get  ? Math.round(get)       : '');
  document.getElementById('tg-prot').value = mt?.prot ?? (peso ? Math.round(peso * 1.8) : '');
  document.getElementById('tg-hc').value   = mt?.hc   ?? '';
  document.getElementById('tg-lip').value  = mt?.lip  ?? '';

  document.getElementById('macroTargetsModal').style.display = 'flex';
}

function closeMacroTargetsModal() {
  document.getElementById('macroTargetsModal').style.display = 'none';
}

function saveMacroTargets() {
  const client = appData.clients.find(c => c.id === nav.clientId);
  const plan   = client?.plans.find(p => p.id === nav.planId);
  if (!plan) return;

  const kcal = parseFloat(document.getElementById('tg-kcal').value);
  const prot = parseFloat(document.getElementById('tg-prot').value);
  const hc   = parseFloat(document.getElementById('tg-hc').value);
  const lip  = parseFloat(document.getElementById('tg-lip').value);

  if ([kcal, prot, hc, lip].some(v => isNaN(v) || v < 0)) return;

  plan.macroTargets = { kcal, prot, hc, lip };
  saveAppData();
  closeMacroTargetsModal();
  renderChart();
}

// ── Equivalences ──────────────────────────────────────────────────────────────
let equivContext = null;

function findEquivalences(food, qty) {
  const target = scale(food, qty);
  if (target.kcal < 1) return [];

  const cP = target.prot * 4, cH = target.hc * 4, cL = target.lip * 9;
  const dom = cP >= cH && cP >= cL ? 'prot' : cH >= cL ? 'hc' : 'lip';

  return TCA
    .filter(f => f.id !== food.id && f.kcal > 0)
    .map(f => {
      const eqQty = Math.round(target.kcal / f.kcal * 100);
      if (eqQty < 5 || eqQty > 800) return null;
      const s = scale(f, eqQty);
      const pD = Math.abs(s.prot - target.prot);
      const hD = Math.abs(s.hc   - target.hc);
      const lD = Math.abs(s.lip  - target.lip);
      const score = dom === 'prot' ? pD*3 + hD + lD
                  : dom === 'hc'   ? hD*3 + pD + lD
                                   : lD*3 + pD + hD;
      return { food: f, qty: eqQty, scaled: s, score, sameCat: f.cat === food.cat };
    })
    .filter(Boolean)
    .sort((a, b) => a.sameCat !== b.sameCat ? (a.sameCat ? -1 : 1) : a.score - b.score)
    .slice(0, 6);
}

function openEquivModal(fiId, mealId) {
  equivContext = { fiId, mealId };
  const meal = findMeal(mealId);
  const fi   = meal?.foods.find(f => f.id === fiId);
  if (!fi) return;

  document.getElementById('equiv-food-name').textContent = fi.food.nome;
  const results = findEquivalences(fi.food, fi.qty);

  const container = document.getElementById('equiv-results');
  if (!results.length) {
    container.innerHTML = '<p class="modal-hint" style="grid-column:1/-1">Sem equivalências disponíveis para este alimento.</p>';
  } else {
    container.innerHTML = results.map(r => `
      <div class="equiv-card" onclick="swapFood('${r.food.id}',${r.qty})">
        <div class="equiv-card-name">${escHtml(r.food.nome)}</div>
        <div class="equiv-card-qty">${r.qty}g</div>
        <div class="equiv-card-macros">
          <span>${r.scaled.kcal.toFixed(0)} kcal</span>
          <span>P ${r.scaled.prot.toFixed(1)}g</span>
          <span>HC ${r.scaled.hc.toFixed(1)}g</span>
          <span>L ${r.scaled.lip.toFixed(1)}g</span>
        </div>
        ${r.sameCat ? '<div class="equiv-same-cat">Mesma categoria</div>' : ''}
      </div>`).join('');
  }
  document.getElementById('equivModal').style.display = 'flex';
}

function closeEquivModal() {
  document.getElementById('equivModal').style.display = 'none';
}

function swapFood(newFoodId, newQty) {
  const meal = findMeal(equivContext.mealId);
  const fi   = meal?.foods.find(f => f.id === equivContext.fiId);
  if (!fi) return;
  fi.food = TCA.find(f => f.id === newFoodId);
  fi.qty  = newQty;
  saveAppData();
  render();
  closeEquivModal();
}

// ── Water ─────────────────────────────────────────────────────────────────────
function updateWater(val) {
  const v = parseInt(val);
  if (isNaN(v) || v < 0) return;
  const client = appData.clients.find(c => c.id === nav.clientId);
  const plan   = client?.plans.find(p => p.id === nav.planId);
  if (plan) { plan.waterMl = v; saveAppData(); }
}

function renderWater() {
  const client = appData.clients.find(c => c.id === nav.clientId);
  const plan   = client?.plans.find(p => p.id === nav.planId);
  const el = document.getElementById('water-input');
  if (el && plan) el.value = plan.waterMl ?? '';
}

// ── Templates ─────────────────────────────────────────────────────────────────
function openTemplateModal() {
  document.getElementById('templateModal').style.display = 'flex';
  renderTemplateModal();
}

function closeTemplateModal() {
  document.getElementById('templateModal').style.display = 'none';
}

function renderTemplateModal() {
  const builtIn = Object.entries(PLAN_TEMPLATES).map(([key, t]) =>
    `<div class="template-card" onclick="applyTemplate('builtin','${key}')">
       <div class="template-icon">${t.icon}</div>
       <div class="template-name">${t.label}</div>
       <div class="template-desc">${t.desc}</div>
     </div>`
  ).join('');
  const custom = (appProfile.customTemplates || []).map(t =>
    `<div class="template-card template-card--custom" onclick="applyTemplate('custom','${t.key}')">
       <div class="template-card-top">
         <div class="template-icon">${t.icon}</div>
         <button class="template-delete" onclick="event.stopPropagation();deleteCustomTemplate('${t.key}')" title="Apagar">×</button>
       </div>
       <div class="template-name">${t.label}</div>
       <div class="template-desc">${t.desc || 'Template personalizado'}</div>
     </div>`
  ).join('');
  document.getElementById('template-grid').innerHTML = builtIn + custom;
}

function applyTemplate(source, key) {
  const dayName = DAYS[state.activeDay];
  closeTemplateModal();
  showConfirm('Aplicar template',
    `As refeições de ${dayName} serão substituídas pelas do template. Continuar?`,
    () => {
      const client = appData.clients.find(c => c.id === nav.clientId);
      const plan   = client?.plans.find(p => p.id === nav.planId);
      if (!plan) return;
      const tplMeals = source === 'builtin'
        ? PLAN_TEMPLATES[key].meals
        : (appProfile.customTemplates || []).find(t => t.key === key)?.meals;
      if (!tplMeals) return;
      plan.days[state.activeDay] = {
        meals: tplMeals.map(m => ({
          id: crypto.randomUUID(), nome: m.nome, hora: m.hora,
          foods: m.foods
            .map(f => ({ food: TCA.find(t => t.id === f.id), qty: f.qty }))
            .filter(fi => fi.food != null)
            .map(fi => ({ ...fi, id: crypto.randomUUID() }))
        }))
      };
      state.days = plan.days;
      saveAppData();
      render();
    },
    'Continuar'
  );
}

function openSaveTemplateModal() {
  document.getElementById('saveTemplateModal').style.display = 'flex';
  document.getElementById('st-label').value = '';
  document.getElementById('st-desc').value = '';
}

function closeSaveTemplateModal() {
  document.getElementById('saveTemplateModal').style.display = 'none';
}

function saveCurrentAsTemplate() {
  const label = document.getElementById('st-label').value.trim();
  if (!label) { showAlertModal('Dá um nome ao template.', { title: 'Nome em falta' }); return; }
  const desc  = document.getElementById('st-desc').value.trim();
  const day   = state.days[state.activeDay];
  if (!day) return;
  const meals = day.meals.map(m => ({
    nome: m.nome, hora: m.hora,
    foods: m.foods
      .filter(fi => fi.food)
      .map(fi => ({ id: fi.food.id, qty: fi.qty }))
  }));
  appProfile.customTemplates.push({ key: crypto.randomUUID(), label, desc, icon: '⭐', meals });
  try { localStorage.setItem('cachos_profile', JSON.stringify(appProfile)); } catch(e) {}
  closeSaveTemplateModal();
  renderTemplateModal();
}

function deleteCustomTemplate(key) {
  appProfile.customTemplates = appProfile.customTemplates.filter(t => t.key !== key);
  try { localStorage.setItem('cachos_profile', JSON.stringify(appProfile)); } catch(e) {}
  renderTemplateModal();
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

// ── Evolução do Paciente ──────────────────────────────────────────────────────
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

// Agrega os registos de água e refeições dos últimos 7 dias do cliente em cards de
// adesão, mostrados no topo da tab Evolução. A meta de água e a estrutura de refeições
// vêm do plano mais recente do cliente (nenhuma das tabelas de log fica presa a um plano
// específico de forma obrigatória — plan_id em meal_logs é só informativo).
async function buildAdherenceCardsHTML(client) {
  const [start7, end7] = [localDayRangeISO(-6)[0], localDayRangeISO(0)[1]];

  const [{ data: waterRows, error: waterErr }, { data: mealRows, error: mealErr }] = await Promise.all([
    sb.from('daily_water_logs').select('amount_ml, logged_at').eq('client_id', client.id).gte('logged_at', start7).lt('logged_at', end7),
    sb.from('meal_logs').select('meal_index, status, note, logged_at').eq('client_id', client.id).gte('logged_at', start7).lt('logged_at', end7)
  ]);
  if (waterErr) console.error('Erro ao carregar adesão de água:', waterErr);
  if (mealErr) console.error('Erro ao carregar adesão de refeições:', mealErr);

  const activePlan = client.plans && client.plans.length
    ? client.plans.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
    : null;

  const waterByDay = {};
  (waterRows || []).forEach(r => {
    const day = new Date(r.logged_at).toDateString();
    waterByDay[day] = (waterByDay[day] || 0) + r.amount_ml;
  });
  const waterDays = Object.values(waterByDay);
  const waterAvg = waterDays.length ? Math.round(waterDays.reduce((a, b) => a + b, 0) / waterDays.length) : 0;
  const target = activePlan?.waterMl;

  const waterCard = `
    <div class="adherence-card">
      <div class="adherence-card-title">💧 Água — média últimos 7 dias</div>
      ${waterDays.length
        ? `<div class="adherence-card-value">${waterAvg} ml${target ? ` <span class="adherence-card-target">/ ${target} ml meta</span>` : ''}</div>`
        : `<div class="adherence-card-empty">Sem registos de água nos últimos 7 dias</div>`}
    </div>`;

  // Total de "slots" possíveis (refeições com alimentos) na janela de 7 dias: qualquer
  // janela de 7 dias consecutivos contém cada dia da semana exatamente uma vez, por isso
  // basta somar os slots-com-alimentos de cada dia do plano atual (sem multiplicar por 7).
  const totalSlots = activePlan?.days
    ? activePlan.days.reduce((sum, d) => sum + (d.meals || []).filter(m => m.foods && m.foods.length).length, 0)
    : 0;

  const mealCounts = { done: 0, skipped: 0, modified: 0 };
  (mealRows || []).forEach(r => { if (mealCounts[r.status] != null) mealCounts[r.status]++; });
  const donePct = totalSlots ? Math.round((mealCounts.done / totalSlots) * 100) : 0;

  const mealCard = `
    <div class="adherence-card">
      <div class="adherence-card-title">🍽️ Refeições — últimos 7 dias</div>
      ${totalSlots
        ? `<div class="adherence-card-value">${donePct}% feitas <span class="adherence-card-target">(${mealCounts.done}/${totalSlots})</span></div>
           <div class="adherence-card-empty">${mealCounts.skipped} saltada(s) · ${mealCounts.modified} modificada(s)</div>`
        : `<div class="adherence-card-empty">Sem plano com refeições definidas</div>`}
    </div>`;

  const dailyHTML = buildDailyAdherenceHTML(activePlan, waterRows || [], mealRows || []);

  return `<div class="adherence-cards">${waterCard}${mealCard}</div>${dailyHTML}`;
}

// Notas de refeições mostradas via "Ver detalhes" (showMealNoteByIndex) — guardadas num
// array em vez de embutidas no onclick, para nunca ter de escapar texto livre do paciente
// dentro de um atributo HTML.
let _dailyMealNotes = [];

function showMealNoteByIndex(i) {
  const entry = _dailyMealNotes[i];
  if (!entry) return;
  showAlertModal(entry.note, { type: 'info', title: `Nota — ${entry.mealName}` });
}

// Quebra a adesão dos últimos 7 dias dia a dia (água + refeições + notas), ao contrário
// dos cards acima que só mostram agregados da semana. Usa sempre a estrutura de
// refeições do plano atual para cada dia da semana (mesma imprecisão aceite para o
// card semanal, caso o plano tenha mudado a meio da janela).
function buildDailyAdherenceHTML(activePlan, waterRows, mealRows) {
  _dailyMealNotes = [];
  if (!activePlan || !activePlan.days) {
    return `<div class="daily-adherence"><div class="daily-adherence-title">Adesão diária</div><div class="adherence-card-empty">Sem plano definido</div></div>`;
  }

  const rowsHTML = [];
  for (let offset = 0; offset < 7; offset++) {
    const [start, end] = localDayRangeISO(-offset);
    const dateObj = new Date(start);
    const dayIndex = (dateObj.getDay() + 6) % 7;

    const waterTotal = waterRows
      .filter(r => r.logged_at >= start && r.logged_at < end)
      .reduce((s, r) => s + r.amount_ml, 0);

    const dayMealsInPlan = (activePlan.days[dayIndex]?.meals || [])
      .map((m, idx) => ({ meal: m, idx }))
      .filter(x => x.meal.foods && x.meal.foods.length);

    const logsForDay = mealRows.filter(r => r.logged_at >= start && r.logged_at < end);
    const logByIdx = {};
    logsForDay.forEach(r => { logByIdx[r.meal_index] = r; });

    const mealChips = dayMealsInPlan.map(({ meal, idx }) => {
      const log = logByIdx[idx];
      const statusClass = !log ? 'daily-meal-chip--none'
        : log.status === 'done' ? 'daily-meal-chip--done'
        : log.status === 'skipped' ? 'daily-meal-chip--skipped'
        : 'daily-meal-chip--modified';
      let noteBtn = '';
      if (log?.note) {
        const noteIdx = _dailyMealNotes.push({ mealName: meal.nome, note: log.note }) - 1;
        noteBtn = `<button class="daily-note-btn" onclick="showMealNoteByIndex(${noteIdx})" type="button">Ver detalhes</button>`;
      }
      return `<span class="daily-meal-chip ${statusClass}">${escHtml(meal.nome)}${noteBtn}</span>`;
    }).join('');

    const dateLabel = dateObj.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    rowsHTML.push(`
      <div class="daily-adherence-row">
        <div class="daily-adherence-date">${dateLabel}</div>
        <div class="daily-adherence-water">💧 ${waterTotal} ml</div>
        <div class="daily-adherence-meals">${mealChips || '<span class="adherence-card-empty">Sem refeições no plano</span>'}</div>
      </div>`);
  }

  return `
    <div class="daily-adherence">
      <div class="daily-adherence-title">Adesão diária (últimos 7 dias)</div>
      ${rowsHTML.join('')}
    </div>`;
}

// Reel só-leitura das fotos de refeições do cliente (feature 3 da Fase 4) — só os últimos 2
// dias, para caber na tab Evolução sem a alongar muito; o ícone de calendário ao lado abre o
// calendário do mês completo (openNutriPhotosCalendarModal), com o mesmo padrão do portal do
// paciente, para navegar qualquer dia/mês. O nutricionista nunca tira/substitui/apaga fotos,
// só as vê na mesma story viewer partilhada (showStoryViewer, em shared.js), com canManage:false.
let _nutriMealPhotosByDate = {};
let _nutriMealPhotoUrls = {};

async function buildMealPhotosTimelineHTML(client) {
  const fromDate = localDateStr(-1);
  const { data, error } = await sb
    .from('progress_photos')
    .select('storage_path, meal_index, meal_name, photo_date')
    .eq('client_id', client.id)
    .gte('photo_date', fromDate);
  if (error) console.error('Erro ao carregar fotos de refeições:', error);

  const byDate = {};
  (data || []).forEach(r => {
    byDate[r.photo_date] = byDate[r.photo_date] || {};
    byDate[r.photo_date][r.meal_index] = { storage_path: r.storage_path, meal_name: r.meal_name };
  });
  _nutriMealPhotosByDate = byDate;
  _nutriMealPhotoUrls = data && data.length ? await getSignedPhotoUrls(data.map(r => r.storage_path)) : {};

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const daysHTML = dates.length ? dates.map(date => {
    const dayEntry = byDate[date];
    const indices = Object.keys(dayEntry).map(Number).sort((a, b) => a - b);
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    const thumbsHTML = indices.map(i => `
      <div class="fotos-reel-thumb" onclick="openNutriStoryForDay('${date}')" title="${escHtml(dayEntry[i].meal_name)}">
        <img src="${_nutriMealPhotoUrls[dayEntry[i].storage_path] || ''}" alt="${escHtml(dayEntry[i].meal_name)}">
      </div>`).join('');
    return `
      <div class="fotos-reel-day">
        <div class="fotos-reel-day-label">${dateLabel}</div>
        <div class="fotos-reel-thumbs">${thumbsHTML}</div>
      </div>`;
  }).join('') : `<div class="adherence-card-empty">Sem fotos nos últimos 2 dias</div>`;

  return `
    <div class="daily-adherence fotos-reel">
      <div class="daily-adherence-title-row">
        <div class="daily-adherence-title">📷 Fotos das refeições (últimos 2 dias)</div>
        <button class="btn-icon" onclick="openNutriPhotosCalendarModal()" type="button" title="Ver calendário de fotos">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
      </div>
      <div class="fotos-reel-days">${daysHTML}</div>
    </div>`;
}

function openNutriStoryForDay(date) {
  const dayEntry = _nutriMealPhotosByDate[date] || {};
  const indices = Object.keys(dayEntry).map(Number).sort((a, b) => a - b);
  if (!indices.length) return;
  const slots = indices.map(i => ({ category: String(i), label: dayEntry[i].meal_name, url: _nutriMealPhotoUrls[dayEntry[i].storage_path] }));
  showStoryViewer(slots, { canManage: false });
}

// ── Calendário de fotos (modal, abre a partir do ícone junto ao reel acima) ───
// Mesmo padrão do calendário do portal do paciente (mês a mês, carrega só quando ainda não
// foi pedido), mas sempre só-leitura — nunca há upload/substituição/apagar deste lado.
let _nutriCalClientId = null;
let _nutriCalYear = null;
let _nutriCalMonth = null;
let _nutriCalPhotosByDate = {};
let _nutriCalLoadedMonths = new Set();

async function openNutriPhotosCalendarModal() {
  const client = currentClient();
  if (!client) return;
  _nutriCalClientId = client.id;
  const now = new Date();
  _nutriCalYear = now.getFullYear();
  _nutriCalMonth = now.getMonth();
  // Semeia com o que o reel já carregou (últimos 2 dias) — evita um pedido a mais se o mês
  // atual só tiver essas fotos.
  _nutriCalPhotosByDate = { ..._nutriMealPhotosByDate };
  _nutriCalLoadedMonths = new Set();
  document.getElementById('nutriPhotosCalendarModal').style.display = '';
  await ensureNutriCalMonthLoaded(_nutriCalYear, _nutriCalMonth);
  renderNutriPhotosCalendarModal();
}

function closeNutriPhotosCalendarModal() {
  document.getElementById('nutriPhotosCalendarModal').style.display = 'none';
}

async function ensureNutriCalMonthLoaded(year, month) {
  const key = `${year}-${month}`;
  if (_nutriCalLoadedMonths.has(key)) return;
  const first = new Date(year, month, 1);
  const next = new Date(year, month + 1, 1);
  const { data, error } = await sb
    .from('progress_photos')
    .select('storage_path, meal_index, meal_name, photo_date')
    .eq('client_id', _nutriCalClientId)
    .gte('photo_date', dateToYmd(first))
    .lt('photo_date', dateToYmd(next));
  if (error) { console.error('Erro ao carregar calendário de fotos:', error); return; }
  (data || []).forEach(r => {
    _nutriCalPhotosByDate[r.photo_date] = _nutriCalPhotosByDate[r.photo_date] || {};
    _nutriCalPhotosByDate[r.photo_date][r.meal_index] = { storage_path: r.storage_path, meal_name: r.meal_name };
  });
  _nutriCalLoadedMonths.add(key);
}

async function changeNutriCalMonth(delta) {
  _nutriCalMonth += delta;
  if (_nutriCalMonth < 0) { _nutriCalMonth = 11; _nutriCalYear--; }
  if (_nutriCalMonth > 11) { _nutriCalMonth = 0; _nutriCalYear++; }
  await ensureNutriCalMonthLoaded(_nutriCalYear, _nutriCalMonth);
  renderNutriPhotosCalendarModal();
}

function renderNutriPhotosCalendarModal() {
  const el = document.getElementById('nutri-cal-modal-body');
  const firstOfMonth = new Date(_nutriCalYear, _nutriCalMonth, 1);
  const daysInMonth = new Date(_nutriCalYear, _nutriCalMonth + 1, 0).getDate();
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const todayStr = localDateStr();

  let cellsHTML = '';
  for (let i = 0; i < startWeekday; i++) cellsHTML += `<div class="fotos-cal-cell fotos-cal-cell--empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${_nutriCalYear}-${String(_nutriCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasPhotos = !!(_nutriCalPhotosByDate[dateStr] && Object.keys(_nutriCalPhotosByDate[dateStr]).length);
    const isToday = dateStr === todayStr;
    cellsHTML += `
      <button class="fotos-cal-cell${isToday ? ' fotos-cal-cell--today' : ''}" onclick="openNutriCalendarDayStory('${dateStr}')" type="button">
        <span class="fotos-cal-cell-num">${day}</span>
        ${hasPhotos ? '<span class="fotos-cal-cell-dot"></span>' : ''}
      </button>`;
  }

  const now = new Date();
  const isCurrentMonth = _nutriCalYear === now.getFullYear() && _nutriCalMonth === now.getMonth();

  el.innerHTML = `
    <div class="fotos-cal-header">
      <button class="portal-day-nav-btn" onclick="changeNutriCalMonth(-1)" type="button" aria-label="Mês anterior">‹</button>
      <span class="fotos-cal-title">${FOTOS_MONTH_NAMES[_nutriCalMonth]} ${_nutriCalYear}</span>
      <button class="portal-day-nav-btn" onclick="changeNutriCalMonth(1)" type="button" aria-label="Mês seguinte"${isCurrentMonth ? ' style="visibility:hidden"' : ''}>›</button>
    </div>
    <div class="fotos-cal-weekdays"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
    <div class="fotos-cal-grid">${cellsHTML}</div>
  `;
}

async function openNutriCalendarDayStory(date) {
  const dayEntry = _nutriCalPhotosByDate[date] || {};
  const indices = Object.keys(dayEntry).map(Number).sort((a, b) => a - b);
  if (!indices.length) return;
  const paths = indices.map(i => dayEntry[i].storage_path);
  const urls = await getSignedPhotoUrls(paths);
  const slots = indices.map(i => ({ category: String(i), label: dayEntry[i].meal_name, url: urls[dayEntry[i].storage_path] }));
  showStoryViewer(slots, { canManage: false });
}

async function renderEvolutionTab() {
  const client = currentClient();
  if (!client) return;
  const container = document.getElementById('evolution-content');
  if (!container) return;

  const [adherenceHTML, mealPhotosHTML] = await Promise.all([
    buildAdherenceCardsHTML(client),
    buildMealPhotosTimelineHTML(client)
  ]);
  if (nav.clientId !== client.id) return; // navegou para outro cliente durante o await

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
    ${adherenceHTML}
    ${mealPhotosHTML}
    <div class="evolution-header">
      <div class="evolution-title">Histórico de Evolução</div>
      <button class="btn-primary" onclick="registerConsultation()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Registar consulta
      </button>
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

// ── Exportação PDF ────────────────────────────────────────────────────────────
function openExportForPlan(clientId, planId) {
  goToPlan(clientId, planId);
  setTimeout(openExportModal, 120);
}

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

  const nutriName   = escHtml(appProfile.name || 'Nutricionista');
  const nutriSubLine = appProfile.cedula
    ? `${nutriName} · Cédula nº ${escHtml(appProfile.cedula)}`
    : nutriName;

  document.getElementById('pdf-output').innerHTML = `
    ${pageStyle}
    <div class="pdf-page">
      <div class="pdf-topbar">
        <div class="pdf-topbar-left">
          <img src="img/fav.png" class="pdf-logo" alt="">
          <div>
            <div class="pdf-plan-title">Plano Nutricional</div>
            <div class="pdf-plan-sub">${nutriSubLine}</div>
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
  const client = appData.clients.find(c => c.id === nav.clientId);
  const plan   = client?.plans.find(p => p.id === nav.planId);
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
  const waterLine = plan?.waterMl
    ? `<div class="pdf-water-row">
         <svg width="14" height="14" fill="none" stroke="#3b9bd4" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 8 2 13a10 10 0 0020 0C22 8 17.5 2 12 2z"/></svg>
         <span>Água diária recomendada: <b>${plan.waterMl} ml</b></span>
       </div>`
    : '';
  return `
    <div class="pdf-s-day-title">${DAYS[dayIdx]}</div>
    ${mealsHTML || '<p class="pdf-empty-msg">Sem refeições registadas</p>'}
    ${waterLine}`;
}

function buildWeeklyTableHTML(selected) {
  const client  = appData.clients.find(c => c.id === nav.clientId);
  const plan    = client?.plans.find(p => p.id === nav.planId);
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

  const waterRow = `<tr class="pwt-water-row">
    <td class="pwt-meal-col">💧 Água</td>
    ${selected.map(() => `<td class="pwt-cell">${plan?.waterMl ? plan.waterMl + ' ml' : '—'}</td>`).join('')}
  </tr>`;
  return `<table class="pwt" style="font-size:${fs}">
    <thead><tr>
      <th class="pwt-meal-col-header">REFEIÇÃO</th>
      ${headerCells}
    </tr></thead>
    <tbody>${mealRows}${waterRow}</tbody>
  </table>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  initApp();

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
