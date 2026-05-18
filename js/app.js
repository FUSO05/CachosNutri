// ── NutriPlan app.js ─────────────────────────────────────────────────────────

// ── Estado global ──
const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const DEFAULT_MEALS = ['Pequeno-almoço','Lanche da manhã','Almoço','Lanche da tarde','Jantar'];
const MEAL_TIMES    = ['07:30','10:30','13:00','16:00','20:00','','',''];

let state = {
  activeDay: 0,
  days: DAYS.map(() => ({
    meals: DEFAULT_MEALS.map((nome, i) => ({
      id: crypto.randomUUID(),
      nome,
      hora: MEAL_TIMES[i] || '',
      foods: []
    }))
  }))
};

let selectedFood   = null;   // alimento actualmente em destaque na sidebar
let activeMealCtx  = null;   // id da refeição para adicionar
let pieChart       = null;
let searchDebounce = null;

// ── Persistência ──────────────────────────────────────────────────────────────
function saveState() {
  try { localStorage.setItem('nutriplan_state', JSON.stringify(state)); } catch(e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem('nutriplan_state');
    if (raw) state = JSON.parse(raw);
  } catch(e) {}
}

// ── Helpers nutricionais ──────────────────────────────────────────────────────
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
  let tot = { kcal:0, prot:0, hc:0, lip:0 };
  state.days[dayIdx].meals.forEach(meal => {
    meal.foods.forEach(fi => {
      const s = scale(fi.food, fi.qty);
      tot.kcal += s.kcal; tot.prot += s.prot; tot.hc += s.hc; tot.lip += s.lip;
    });
  });
  return { kcal: +tot.kcal.toFixed(1), prot: +tot.prot.toFixed(1), hc: +tot.hc.toFixed(1), lip: +tot.lip.toFixed(1) };
}

function mealTotals(meal) {
  let tot = { kcal:0, prot:0, hc:0, lip:0 };
  meal.foods.forEach(fi => {
    const s = scale(fi.food, fi.qty);
    tot.kcal += s.kcal; tot.prot += s.prot; tot.hc += s.hc; tot.lip += s.lip;
  });
  return { kcal: +tot.kcal.toFixed(0), prot: +tot.prot.toFixed(1), hc: +tot.hc.toFixed(1), lip: +tot.lip.toFixed(1) };
}

// ── Render principal ──────────────────────────────────────────────────────────
function render() {
  renderDayTabs();
  renderPlan();
  renderChart();
}

function renderDayTabs() {
  const wrap = document.getElementById('dayTabs');
  wrap.innerHTML = DAYS.map((d, i) => `
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
        ${escHtml(fi.food.nome)}
        <span>(${fi.food.cat})</span>
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

// ── Gráfico ───────────────────────────────────────────────────────────────────
function renderChart() {
  const tot = dayTotals(state.activeDay);

  document.getElementById('kcalNum').textContent  = tot.kcal.toFixed(0);

  // Calorias de cada macro
  const cProt = tot.prot * 4;
  const cHc   = tot.hc   * 4;
  const cLip  = tot.lip  * 9;
  const total = cProt + cHc + cLip || 1;

  document.getElementById('legProt').textContent  = `${tot.prot.toFixed(1)}g`;
  document.getElementById('legHc').textContent    = `${tot.hc.toFixed(1)}g`;
  document.getElementById('legLip').textContent   = `${tot.lip.toFixed(1)}g`;
  document.getElementById('legProtPct').textContent = `${(cProt/total*100).toFixed(0)}%`;
  document.getElementById('legHcPct').textContent   = `${(cHc/total*100).toFixed(0)}%`;
  document.getElementById('legLipPct').textContent  = `${(cLip/total*100).toFixed(0)}%`;

  document.getElementById('rProt').textContent = `${tot.prot.toFixed(1)}g`;
  document.getElementById('rHc').textContent   = `${tot.hc.toFixed(1)}g`;
  document.getElementById('rLip').textContent  = `${tot.lip.toFixed(1)}g`;

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
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 4,
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


// ── Search de alimentos ───────────────────────────────────────────────────────
let activeCat = 'Todos';

function initSearch() {
  document.getElementById('foodSearch').addEventListener('input', function() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => doSearch(this.value.trim()), 120);
  });
}

function filterCat(cat) {
  activeCat = cat;
  document.querySelectorAll('.cat-pill').forEach(p =>
    p.classList.toggle('active', p.textContent === cat));
  doSearch(document.getElementById('foodSearch').value.trim());
}

function doSearch(q) {
  const results = document.getElementById('searchResults');
  const qLow = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  let list = TCA;
  if (activeCat !== 'Todos') list = list.filter(f => f.cat === activeCat);
  if (qLow) {
    list = list.filter(f => {
      const n = f.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
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
  // Remove previous expanded item
  const prevEl = document.querySelector('.result-item.selected');
  if (prevEl) {
    prevEl.classList.remove('selected');
    prevEl.querySelector('.result-actions')?.remove();
  }
  // Toggle off if same item
  if (prevEl === el) {
    selectedFood = null;
    return;
  }

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
    </div>
  `;
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
  const v = Math.max(1, (parseFloat(inp.value)||100) + delta);
  inp.value = v;
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
  saveState();
  render();
  closeSearchModal();

  setTimeout(() => {
    const el = document.getElementById(`meal-${mealId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

// ── Acções sobre o plano ──────────────────────────────────────────────────────
function switchDay(i) {
  state.activeDay = i;
  render();
}

function addMeal() {
  const meal = {
    id: crypto.randomUUID(),
    nome: 'Nova refeição',
    hora: '',
    foods: []
  };
  state.days[state.activeDay].meals.push(meal);
  saveState();
  render();
  setTimeout(() => {
    const el = document.querySelector(`#meal-${meal.id} .meal-name-input`);
    if (el) { el.select(); el.scrollIntoView({ behavior:'smooth', block:'center' }); }
  }, 50);
}

function deleteMeal(mealId) {
  const day = state.days[state.activeDay];
  if (day.meals.length <= 1) return;
  day.meals = day.meals.filter(m => m.id !== mealId);
  saveState();
  render();
}

function renameMeal(mealId, nome) {
  const meal = findMeal(mealId);
  if (meal) { meal.nome = nome; saveState(); }
}

function setMealTime(mealId, hora) {
  const meal = findMeal(mealId);
  if (meal) { meal.hora = hora; saveState(); }
}

function updateQty(mealId, fiId, rawVal) {
  const qty = parseFloat(rawVal);
  if (!qty || qty <= 0) return;
  const meal = findMeal(mealId);
  if (!meal) return;
  const fi = meal.foods.find(f => f.id === fiId);
  if (fi) { fi.qty = qty; saveState(); updateMealTotalsUI(meal); renderChart(); }
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
  saveState();
  const row = document.getElementById(`fi-${fiId}`);
  if (row) row.remove();
  updateMealTotalsUI(meal);
  renderChart();
}

function focusSearch(mealId, btn) {
  activeMealCtx = mealId;

  // Garantir que o botão está visível antes de calcular a posição
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

// ── Utilitários ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  const isPlan = tab === 'plan';
  document.getElementById('tab-plan').classList.toggle('active', isPlan);
  document.getElementById('tab-info').classList.toggle('active', !isPlan);
  document.querySelector('.day-tabs').style.display  = isPlan ? '' : 'none';
  document.querySelector('.main-layout').style.display = isPlan ? '' : 'none';
  document.getElementById('infoPage').classList.toggle('active', !isPlan);
}

// ── Informações do Paciente ───────────────────────────────────────────────────
const PATIENT_FIELDS = ['pNome','pNascimento','pGenero','pEmail','pTelefone',
  'pAltura','pPeso','pPesoObj','pCintura','pAtividade','pObjetivo',
  'pAlergias','pPatologias','pMedicacao','pNotas'];

function savePatientInfo() {
  const data = {};
  PATIENT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  try { localStorage.setItem('cachos_patient', JSON.stringify(data)); } catch(e) {}
  const btn = document.querySelector('.btn-save-info');
  const orig = btn.innerHTML;
  btn.innerHTML = '✓ Guardado';
  btn.style.background = '#16a34a';
  setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 1800);
}

function loadPatientInfo() {
  try {
    const raw = localStorage.getItem('cachos_patient');
    if (!raw) return;
    const data = JSON.parse(raw);
    PATIENT_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] !== undefined) el.value = data[id];
    });
    updateAge();
    updateMetrics();
    updateTMB();
  } catch(e) {}
}

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
  const h = parseFloat(document.getElementById('pAltura').value);
  const w = parseFloat(document.getElementById('pPeso').value);
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
  updateTMB();
}

function updateTMB() {
  const h   = parseFloat(document.getElementById('pAltura').value);
  const w   = parseFloat(document.getElementById('pPeso').value);
  const ageStr = document.getElementById('pIdade').value;
  const age = parseInt(ageStr);
  const gen = document.getElementById('pGenero').value;
  const fac = parseFloat(document.getElementById('pAtividade').value);

  if (h > 0 && w > 0 && age > 0 && gen) {
    // Mifflin-St Jeor
    const tmb = gen === 'M'
      ? 10 * w + 6.25 * h - 5 * age + 5
      : 10 * w + 6.25 * h - 5 * age - 161;
    document.getElementById('pTMB').value = Math.round(tmb) + ' kcal';
    if (fac) {
      document.getElementById('pGET').value = Math.round(tmb * fac) + ' kcal';
    } else {
      document.getElementById('pGET').value = '';
    }
  } else {
    document.getElementById('pTMB').value = '';
    document.getElementById('pGET').value = '';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  loadPatientInfo();
  initSearch();
  render();

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
