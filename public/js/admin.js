// ── CachosNutri admin.js — lógica exclusiva do dashboard de admin ─────────────
// Usado só por admin.html. Não ligado em nenhum menu — só acessível por URL
// direto. A conta admin é criada manualmente por SQL (ver README), nunca por
// signup, por isso este ficheiro nunca cria contas, só autentica e revê
// pedidos de verificação de nutricionistas e estudantes.

// Nutricionista usa pending_verification, estudante usa
// pending_manual_verification (nunca pending_email_confirmation — esse fluxo
// aprova-se sozinho, nunca passa pelo admin) — por isso "Pendentes" é uma
// lista de status, não um valor único. "Todos" usa null (sem filtro).
const ADMIN_FILTER_STATUSES = {
  pending: ['pending_verification', 'pending_manual_verification'],
  approved: ['approved'],
  rejected: ['rejected'],
  all: null,
};

let currentAdmin  = null;
let adminFilter   = 'pending';
let adminProfiles = [];
let _adminRejectTargetId = null;

function showAdminLoginError(msg) {
  const el = document.getElementById('admin-login-error');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', !!msg);
}

async function handleAdminLogin() {
  const email    = document.getElementById('admin-login-email').value.trim();
  const password = document.getElementById('admin-login-password').value;
  showAdminLoginError('');
  const btn = document.getElementById('admin-login-btn');
  setButtonLoading(btn, true);

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    setButtonLoading(btn, false);
    showAdminLoginError(traduzErroAuth(error.message));
    return;
  }

  const { data: prof, error: profErr } = await sb.from('profiles').select('role').eq('id', data.user.id).single();
  // Não distingue "não é admin" de "erro de rede" na mensagem — evita confirmar
  // a quem tenta entrar aqui se estes dados de acesso pertencem a outro tipo de
  // conta (mesmo princípio de verificarRoleProfissional em auth.js/app.js).
  if (profErr || !prof || prof.role !== 'admin') {
    await sb.auth.signOut();
    setButtonLoading(btn, false);
    showAdminLoginError('Não foi possível entrar com esta conta nesta área.');
    return;
  }

  setButtonLoading(btn, false);
  currentAdmin = data.user;
  showAdminShell();
}

async function handleAdminLogout() {
  await sb.auth.signOut();
  currentAdmin = null;
  document.getElementById('pg-admin-shell').style.display = 'none';
  document.getElementById('pg-admin-auth').style.display = '';
}

function showAdminShell() {
  document.getElementById('pg-admin-auth').style.display = 'none';
  document.getElementById('pg-admin-shell').style.display = '';
  loadAdminProfiles();
}

function setAdminFilter(status) {
  adminFilter = status;
  document.querySelectorAll('.admin-filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  loadAdminProfiles();
}

async function loadAdminProfiles() {
  const list = document.getElementById('admin-list');
  list.innerHTML = '<p class="admin-empty">A carregar…</p>';

  let query = sb.from('profiles')
    .select('id, role, nome, email, cedula, pais_atuacao, corpo_profissional, instituicao_ensino, ano_conclusao_previsto, documentos_verificacao, status, motivo_rejeicao, created_at')
    .in('role', ['nutricionista', 'estudante'])
    .order('created_at', { ascending: false });
  const statuses = ADMIN_FILTER_STATUSES[adminFilter];
  if (statuses) query = query.in('status', statuses);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar pedidos de verificação:', error);
    list.innerHTML = '<p class="admin-empty">Não foi possível carregar os pedidos.</p>';
    return;
  }
  adminProfiles = data || [];
  renderAdminList();
}

function renderAdminList() {
  const list = document.getElementById('admin-list');
  if (!adminProfiles.length) {
    list.innerHTML = '<p class="admin-empty">Sem pedidos nesta categoria.</p>';
    return;
  }
  list.innerHTML = adminProfiles.map(renderAdminCard).join('');
}

const ADMIN_STATUS_LABEL = {
  pending_verification:       { text: 'Pendente', cls: 'invite-badge--pending' },
  pending_manual_verification: { text: 'Pendente', cls: 'invite-badge--pending' },
  pending_email_confirmation: { text: 'Aguarda email', cls: 'invite-badge--pending' },
  approved:                   { text: 'Aprovado', cls: 'invite-badge--active' },
  rejected:                   { text: 'Rejeitado', cls: 'invite-badge--rejected' },
  expired:                    { text: 'Expirado', cls: 'invite-badge--rejected' },
};
const ADMIN_ROLE_LABEL = { nutricionista: 'Nutricionista', estudante: 'Estudante' };
// Estes 2 status são os únicos que realmente esperam ação do admin — os
// outros (pending_email_confirmation nunca chega a precisar, approved/
// rejected/expired já foram decididos) não mostram botões de Aprovar/Rejeitar.
const ADMIN_ACTIONABLE_STATUSES = ['pending_verification', 'pending_manual_verification'];

function renderAdminCard(p) {
  const badge = ADMIN_STATUS_LABEL[p.status] || { text: p.status, cls: '' };
  const docs = p.documentos_verificacao || {};
  const isEstudante = p.role === 'estudante';

  const docLinks = isEstudante
    ? [docs.matricula
        ? `<a href="#" class="admin-doc-link" onclick="event.preventDefault(); viewAdminDocument('${escHtml(docs.matricula)}')">Ver comprovativo de matrícula</a>`
        : '<span class="admin-doc-link admin-doc-link--missing">Comprovativo não enviado</span>']
    : [
        docs.professional_proof ? `<a href="#" class="admin-doc-link" onclick="event.preventDefault(); viewAdminDocument('${escHtml(docs.professional_proof)}')">Ver comprovativo profissional</a>` : '<span class="admin-doc-link admin-doc-link--missing">Comprovativo não enviado</span>',
        docs.id_document ? `<a href="#" class="admin-doc-link" onclick="event.preventDefault(); viewAdminDocument('${escHtml(docs.id_document)}')">Ver documento de identificação</a>` : '<span class="admin-doc-link admin-doc-link--missing">Identificação não enviada</span>',
      ];

  const metaFields = isEstudante
    ? [
        `Instituição: ${escHtml(p.instituicao_ensino || '—')}`,
        `Ano de conclusão: ${escHtml(String(p.ano_conclusao_previsto || '—'))}`,
      ]
    : [
        `Cédula: ${escHtml(p.cedula || '—')}`,
        `País: ${escHtml(p.pais_atuacao || '—')}`,
        `Corpo: ${escHtml(p.corpo_profissional || '—')}`,
      ];
  metaFields.push(`Criado: ${p.created_at ? new Date(p.created_at).toLocaleDateString('pt-PT') : '—'}`);

  const actions = ADMIN_ACTIONABLE_STATUSES.includes(p.status) ? `
    <div class="admin-card-actions">
      <button class="btn-back" onclick="openAdminRejectModal('${p.id}')">Rejeitar</button>
      <button class="btn-primary" onclick="approveAdminProfile('${p.id}')">Aprovar</button>
    </div>` : '';

  const rejectionNote = p.status === 'rejected' && p.motivo_rejeicao
    ? `<p class="admin-card-reason">Motivo: ${escHtml(p.motivo_rejeicao)}</p>` : '';

  return `
    <div class="admin-card" id="admin-card-${p.id}">
      <div class="admin-card-header">
        <div>
          <div class="admin-card-name">${escHtml(p.nome || '(sem nome)')} <span class="admin-role-badge">${ADMIN_ROLE_LABEL[p.role] || p.role}</span></div>
          <div class="admin-card-email">${escHtml(p.email || '')}</div>
        </div>
        <span class="invite-badge ${badge.cls}">${badge.text}</span>
      </div>
      <div class="admin-card-meta">
        ${metaFields.map(f => `<span>${f}</span>`).join('')}
      </div>
      <div class="admin-card-docs">${docLinks.join('')}</div>
      ${rejectionNote}
      ${actions}
    </div>`;
}

async function viewAdminDocument(path) {
  const { data, error } = await sb.storage.from('verification-documents').createSignedUrl(path, 3600);
  if (error || !data) {
    console.error('Erro ao gerar link do documento:', error);
    showAlertModal('Não foi possível abrir o documento.');
    return;
  }
  window.open(data.signedUrl, '_blank');
}

async function approveAdminProfile(profileId) {
  const { error } = await sb.rpc('admin_set_verification_status', { p_profile_id: profileId, p_status: 'approved' });
  if (error) {
    console.error('Erro ao aprovar pedido:', error);
    showAlertModal('Não foi possível aprovar este pedido. ' + (error.message || ''));
    return;
  }
  notifyVerificationStatus(profileId);
  showToast('Pedido aprovado.');
  loadAdminProfiles();
}

function openAdminRejectModal(profileId) {
  _adminRejectTargetId = profileId;
  document.getElementById('admin-reject-reason').value = '';
  document.getElementById('adminRejectModal').style.display = '';
}

function closeAdminRejectModal() {
  document.getElementById('adminRejectModal').style.display = 'none';
  _adminRejectTargetId = null;
}

async function confirmAdminReject() {
  const reason = document.getElementById('admin-reject-reason').value.trim();
  if (!reason) { showAlertModal('Indique o motivo da rejeição.'); return; }
  const profileId = _adminRejectTargetId;
  const btn = document.getElementById('admin-reject-confirm-btn');
  setButtonLoading(btn, true);
  const { error } = await sb.rpc('admin_set_verification_status', { p_profile_id: profileId, p_status: 'rejected', p_reason: reason });
  setButtonLoading(btn, false);
  if (error) {
    console.error('Erro ao rejeitar pedido:', error);
    showAlertModal('Não foi possível rejeitar este pedido. ' + (error.message || ''));
    return;
  }
  closeAdminRejectModal();
  notifyVerificationStatus(profileId);
  showToast('Pedido rejeitado.');
  loadAdminProfiles();
}

// Fire-and-forget: o status já mudou na BD (é isso que dá/tira o acesso), este
// email é só uma notificação de cortesia — se a Resend falhar ou não estiver
// configurada, o nutricionista continua aprovado/rejeitado normalmente.
async function notifyVerificationStatus(profileId) {
  try {
    const { error } = await sb.functions.invoke('notify-verification-status', { body: { profileId } });
    if (error) throw error;
  } catch (e) { console.error('Erro ao notificar nutricionista:', e); }
}

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    const { data: prof } = await sb.from('profiles').select('role').eq('id', session.user.id).single();
    if (prof && prof.role === 'admin') {
      currentAdmin = session.user;
      showAdminShell();
    } else {
      await sb.auth.signOut();
    }
  }
});
