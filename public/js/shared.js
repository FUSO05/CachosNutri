// ── CachosNutri shared.js ───────────────────────────────────────────────────────
// Funções e constantes usadas tanto pelo lado do nutricionista (app.js) como pelo
// portal do paciente (portal.js). Tem de ser incluído antes de ambos.

const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const FOTOS_MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Formata um objeto Date como 'yyyy-mm-dd' local — usado pelos calendários de fotos de
// refeições (portal do paciente e área do nutricionista) para calcular limites de mês.
function dateToYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

// Devolve 'yyyy-mm-dd' do dia local do browser (hoje, por omissão). Ao contrário de
// localDayRangeISO (usada para filtrar por logged_at/taken_at), esta serve para colunas de
// data explícitas (photo_date) e para construir caminhos determinísticos no Storage.
function localDateStr(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

// ── Fotos de refeições — compressão + URLs assinados ────────────────────────
// Compressão obrigatória antes de qualquer upload: uma foto de câmara (~3MB) fica-se por
// ~40-100KB a 800px/70%, essencial para o plano gratuito do Supabase Storage (1GB) aguentar
// uma base de pacientes razoável (ver supabase/schema.sql, secção 7). Sempre reencodada para
// JPEG — mantém o caminho determinístico no Storage simples (sem variar a extensão consoante
// o suporte do browser para outros formatos).
async function compressImageFile(file, maxDim = 800, quality = 0.70) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    bitmap = await createImageBitmap(file);
  }
  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Cache de URLs assinados em módulo — o bucket 'meal-photos' é privado, por isso qualquer
// <img> precisa de um URL assinado (não há URL pública direta). TTL de 50min vs. os 60min de
// validade pedidos ao Supabase deixa margem de segurança. Partilhado entre portal.js e app.js.
const _signedPhotoUrlCache = {};
async function getSignedPhotoUrls(paths) {
  const now = Date.now();
  const missing = paths.filter(p => !_signedPhotoUrlCache[p] || now - _signedPhotoUrlCache[p].fetchedAt > 50 * 60 * 1000);
  if (missing.length) {
    const { data, error } = await sb.storage.from('meal-photos').createSignedUrls(missing, 3600);
    if (!error) {
      (data || []).forEach(d => { if (d.signedUrl) _signedPhotoUrlCache[d.path] = { url: d.signedUrl, fetchedAt: now }; });
    }
  }
  return Object.fromEntries(paths.map(p => [p, _signedPhotoUrlCache[p]?.url]));
}

// Chamado depois de substituir/apagar uma foto — o caminho no Storage é o mesmo de antes
// (determinístico), por isso sem isto o URL assinado antigo continuaria em cache e o browser
// serviria a imagem antiga a partir da mesma query string.
function invalidateSignedPhotoUrl(path) {
  delete _signedPhotoUrlCache[path];
}

// ── Story viewer — timeline "story" das fotos de refeições (estilo Instagram Stories),
// partilhado entre o portal do paciente (com gestão: substituir/apagar) e a área do
// nutricionista (só leitura). Injetado dinamicamente em document.body — não precisa de
// markup estático em app.html/portal.html, que já carregam este ficheiro.
let _storyState = null;

// slots: array ordenado de {category, label, url, comment?} só das categorias preenchidas
// do dia — "comment" (se vier preenchido) é o comentário do nutricionista para essa
// refeição, mostrado independentemente de canManage.
// opts: { startIndex=0, canManage=false, onReplace(category), onDelete(category),
//         onComment(slot) } — onComment é opcional e independente de canManage (o
// nutricionista pode comentar sem poder substituir/apagar a foto do paciente).
function showStoryViewer(slots, opts) {
  opts = opts || {};
  if (!slots || !slots.length) return;
  closeStoryViewer();

  const overlay = document.createElement('div');
  overlay.className = 'story-overlay';
  overlay.innerHTML = `
    <div class="story-progress-row">${slots.map(() => '<div class="story-progress-seg"><div class="story-progress-seg-fill"></div></div>').join('')}</div>
    <button class="story-close-btn" type="button" aria-label="Fechar">&times;</button>
    <div class="story-media-wrap"><img class="story-media-img" alt=""></div>
    <div class="story-meta"><span class="story-meta-label"></span></div>
    <div class="story-comment-row" style="display:none">
      <span class="story-comment-text"></span>
      <button class="story-comment-btn" type="button" style="display:none">Comentar</button>
    </div>
    <div class="story-manage-actions" style="display:none">
      <button class="story-manage-btn story-manage-btn--replace" type="button" title="Substituir foto">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      </button>
      <button class="story-manage-btn story-manage-btn--delete" type="button" title="Apagar foto">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>
    </div>
    <div class="story-tap-zone story-tap-zone-left"></div>
    <div class="story-tap-zone story-tap-zone-center"></div>
    <div class="story-tap-zone story-tap-zone-right"></div>
  `;
  document.body.appendChild(overlay);

  _storyState = {
    overlay, slots,
    index: Math.min(Math.max(opts.startIndex || 0, 0), slots.length - 1),
    paused: false,
    elapsed: 0,
    duration: 4000,
    timer: null,
    canManage: !!opts.canManage,
    onReplace: opts.onReplace,
    onDelete: opts.onDelete,
    onComment: opts.onComment,
  };

  overlay.querySelector('.story-close-btn').onclick = closeStoryViewer;
  overlay.querySelector('.story-tap-zone-left').onclick = () => _storyStep(-1);
  overlay.querySelector('.story-tap-zone-right').onclick = () => _storyStep(1);
  overlay.querySelector('.story-tap-zone-center').onclick = () => _storyTogglePause();

  if (_storyState.canManage) {
    const actions = overlay.querySelector('.story-manage-actions');
    actions.style.display = '';
    actions.querySelector('.story-manage-btn--replace').onclick = () => {
      const cat = _storyState.slots[_storyState.index].category;
      const cb = _storyState.onReplace;
      closeStoryViewer();
      if (cb) cb(cat);
    };
    actions.querySelector('.story-manage-btn--delete').onclick = () => {
      const cat = _storyState.slots[_storyState.index].category;
      const cb = _storyState.onDelete;
      closeStoryViewer();
      if (cb) cb(cat);
    };
  }

  if (_storyState.onComment) {
    overlay.querySelector('.story-comment-btn').onclick = () => {
      const slot = _storyState.slots[_storyState.index];
      const cb = _storyState.onComment;
      closeStoryViewer();
      if (cb) cb(slot);
    };
  }

  document.addEventListener('keydown', _storyKeydown);
  _storyRenderSlot();
  _storyStartTimer();
}

function _storyKeydown(e) {
  if (e.key === 'Escape') closeStoryViewer();
  else if (e.key === 'ArrowLeft') _storyStep(-1);
  else if (e.key === 'ArrowRight') _storyStep(1);
}

function _storyRenderSlot() {
  const st = _storyState;
  if (!st) return;
  const slot = st.slots[st.index];
  st.overlay.querySelector('.story-media-img').src = slot.url;
  st.overlay.querySelector('.story-meta-label').textContent = slot.label;
  st.elapsed = 0;
  st.overlay.querySelectorAll('.story-progress-seg-fill').forEach((el, i) => {
    el.style.width = i < st.index ? '100%' : '0%';
  });

  const commentRow = st.overlay.querySelector('.story-comment-row');
  const commentText = commentRow.querySelector('.story-comment-text');
  const commentBtn = commentRow.querySelector('.story-comment-btn');
  commentText.textContent = slot.comment || '';
  commentText.style.display = slot.comment ? '' : 'none';
  commentBtn.style.display = st.onComment ? '' : 'none';
  if (commentBtn.style.display !== 'none') commentBtn.textContent = slot.comment ? 'Editar comentário' : 'Comentar';
  commentRow.style.display = (slot.comment || st.onComment) ? '' : 'none';
}

function _storyStartTimer() {
  const st = _storyState;
  if (!st) return;
  clearInterval(st.timer);
  st.timer = setInterval(() => {
    if (!_storyState || _storyState.paused) return;
    _storyState.elapsed += 50;
    const pct = Math.min(100, (_storyState.elapsed / _storyState.duration) * 100);
    const fills = _storyState.overlay.querySelectorAll('.story-progress-seg-fill');
    const fill = fills[_storyState.index];
    if (fill) fill.style.width = pct + '%';
    if (_storyState.elapsed >= _storyState.duration) _storyStep(1);
  }, 50);
}

function _storyStep(delta) {
  const st = _storyState;
  if (!st) return;
  const next = st.index + delta;
  if (next < 0) { _storyRenderSlot(); return; }
  if (next >= st.slots.length) { closeStoryViewer(); return; }
  st.index = next;
  _storyRenderSlot();
}

function _storyTogglePause() {
  const st = _storyState;
  if (!st) return;
  st.paused = !st.paused;
  st.overlay.classList.toggle('story-overlay--paused', st.paused);
}

function closeStoryViewer() {
  if (!_storyState) return;
  clearInterval(_storyState.timer);
  _storyState.overlay.remove();
  document.removeEventListener('keydown', _storyKeydown);
  _storyState = null;
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
