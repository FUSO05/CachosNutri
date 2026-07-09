// ── CachosNutri shared.js ───────────────────────────────────────────────────────
// Funções e constantes usadas tanto pelo lado do nutricionista (app.js) como pelo
// portal do paciente (portal.js). Tem de ser incluído antes de ambos.

const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Devolve [inicioISO, fimISO] do dia local do browser (hoje, por omissão — usa offsetDays
// para dias anteriores). Usado para agregar registos de água/refeições por dia sem depender
// de uma coluna de data explícita nas tabelas de log.
function localDayRangeISO(offsetDays = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

// Devolve [inicioISO, fimISO] de uma janela de N dias terminando hoje (inclusive) —
// construído em cima de localDayRangeISO para agregações de "últimos 7/30 dias".
function localWindowRangeISO(days) {
  return [localDayRangeISO(-(days - 1))[0], localDayRangeISO(0)[1]];
}

// ── Modal de aviso/erro — substitui alert() nativo e erros que antes só iam
// para a consola. Cada página que o usa tem de incluir o markup #alertModal
// (ver app.html/portal.html). opts.type: 'error' (omissão) ou 'info'.
function showAlertModal(message, opts) {
  opts = opts || {};
  const overlay = document.getElementById('alertModal');
  if (!overlay) { console.error(message); return; }
  const isInfo = opts.type === 'info';
  document.getElementById('alert-title').textContent = opts.title || (isInfo ? 'Aviso' : 'Ocorreu um erro');
  document.getElementById('alert-message').textContent = message;
  document.getElementById('alert-icon-wrap').className = 'alert-icon-wrap' + (isInfo ? ' alert-icon-wrap--info' : '');
  overlay.style.display = '';
}

function closeAlertModal() {
  const overlay = document.getElementById('alertModal');
  if (overlay) overlay.style.display = 'none';
}

// ── Modal de confirmação — usado para ações destrutivas/irreversíveis (apagar,
// terminar sessão, etc.). Cada página que o usa tem de incluir o markup
// #confirmModal (ver app.html/portal.html).
let _confirmCallback = null;

function showConfirm(title, message, onConfirm, okLabel) {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok-btn').textContent  = okLabel || 'Eliminar';
  _confirmCallback = onConfirm;
  document.getElementById('confirmModal').style.display = '';
}

// ── Toast — confirmação/erro rápido e não-bloqueante para ações frequentes
// (registar água, marcar refeição, etc.), onde um modal a exigir clique em "Ok"
// a cada clique seria péssima UX. Cada página que o usa tem de incluir o markup
// #toast (ver app.html/portal.html). type: 'success' (omissão) ou 'error'.
let _toastTimer = null;
function showToast(message, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.textContent = message;
  el.className = 'toast toast--visible' + (type === 'error' ? ' toast--error' : '');
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
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

// ── Botão com spinner ────────────────────────────────────────────────────────
// Usado em ações assíncronas (login, registo, etc.): mostra um spinner dentro
// do próprio botão (em vez de trocar o texto por "A entrar…") e bloqueia o
// resto do ecrã enquanto a ação está em curso, para evitar duplo-submit ou
// outras ações ao mesmo tempo.
function setButtonLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
  const existingSpinner = btn.querySelector('.btn-spinner');
  if (loading && !existingSpinner) {
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    btn.appendChild(spinner);
  } else if (!loading && existingSpinner) {
    existingSpinner.remove();
  }

  let overlay = document.getElementById('actionBlockOverlay');
  if (loading && !overlay) {
    overlay = document.createElement('div');
    overlay.id = 'actionBlockOverlay';
    overlay.className = 'action-block-overlay';
    document.body.appendChild(overlay);
  } else if (!loading && overlay) {
    overlay.remove();
  }
}

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

// ── Gráficos de evolução (Chart.js) — reaproveitado pelo dashboard do nutricionista
// (ct-evolution-view) e pelo portal do paciente (tab "Evolução"). Espera canvases
// com id="chartPeso", id="chartGordura" e id="chartIMC" já presentes no DOM.
let evolutionCharts = [];

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
        maintainAspectRatio: false,
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
