// tickets.js — support ticketing (admin + customer)

// ── Shared helpers ────────────────────────────────────────────
const TICKET_STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const TICKET_PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

function ticketStatusBadge(status) {
  return `<span class="ticket-badge status-${status}">${TICKET_STATUS_LABEL[status] || status}</span>`;
}
function ticketPriorityBadge(priority) {
  return `<span class="ticket-badge priority-${priority}">${TICKET_PRIORITY_LABEL[priority] || priority}</span>`;
}
function currentActorId() {
  return (typeof viewAsProfile !== 'undefined' && viewAsProfile) ? viewAsProfile.id : myProfile.id;
}

let _openTicketId = null;

async function renderTicketThread(ticketId, { isAdmin }) {
  const bodyEl = document.getElementById('ticket-detail-modal-body');
  bodyEl.innerHTML = '<div class="empty-state">Loading…</div>';
  document.getElementById('ticket-detail-modal-overlay').classList.add('open');
  _openTicketId = ticketId;

  const [{ data: ticket, error: ticketErr }, { data: messages, error: msgErr }] = await Promise.all([
    sb.from('tickets').select('*, profiles!tickets_customer_id_fkey(name)').eq('id', ticketId).single(),
    sb.from('ticket_messages').select('*, profiles(name, role)').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
  ]);

  if (ticketErr || !ticket) {
    bodyEl.innerHTML = `<div class="empty-state">Could not load this ticket.</div>`;
    return;
  }

  document.getElementById('ticket-detail-modal-title').textContent = ticket.subject;

  const statusControl = isAdmin ? `
    <select id="ticket-status-select" onchange="updateTicketStatus('${ticket.id}', this.value)" style="width:auto;margin-bottom:0;padding:4px 8px;font-size:12px;">
      ${Object.keys(TICKET_STATUS_LABEL).map(s => `<option value="${s}" ${s === ticket.status ? 'selected' : ''}>${TICKET_STATUS_LABEL[s]}</option>`).join('')}
    </select>
  ` : ticketStatusBadge(ticket.status);

  const threadHtml = (messages || []).length
    ? (msgErr ? '' : messages.map(m => {
        const fromCustomer = m.profiles?.role !== 'admin';
        const who = m.author_id === currentActorId() ? 'You' : (m.profiles?.name || 'Unknown');
        return `
        <div class="ticket-msg ${fromCustomer ? 'from-customer' : ''}">
          <div class="ticket-msg-meta">${escapeHtml(who)} · ${fmtDateTime(m.created_at)}</div>
          <div class="ticket-msg-body">${escapeHtml(m.body)}</div>
        </div>`;
      }).join(''))
    : '<div class="empty-state">No messages yet.</div>';

  bodyEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${statusControl}
        ${ticketPriorityBadge(ticket.priority)}
      </div>
      ${isAdmin ? `<div style="font-size:12.5px;color:#8A8377;">${escapeHtml(ticket.profiles?.name || '—')}</div>` : ''}
    </div>
    <div id="ticket-thread">${threadHtml}</div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);">
      <label>Reply</label>
      <textarea id="ticket-reply-input" rows="3" style="width:100%;padding:8px 10px;font-family:inherit;font-size:13px;border:1px solid #D8D4C9;border-radius:3px;margin-bottom:10px;"></textarea>
      <button onclick="submitTicketReply('${ticket.id}', ${isAdmin})" id="ticket-reply-btn">Send Reply</button>
      <div id="ticket-reply-error" style="color:var(--rust);font-size:12.5px;margin-top:8px;display:none;"></div>
    </div>
  `;
}

async function submitTicketReply(ticketId, isAdmin) {
  const input = document.getElementById('ticket-reply-input');
  const errEl = document.getElementById('ticket-reply-error');
  const btn = document.getElementById('ticket-reply-btn');
  const body = input.value.trim();
  errEl.style.display = 'none';
  if (!body) {
    errEl.textContent = 'Enter a message first.';
    errEl.style.display = 'block';
    return;
  }
  btn.disabled = true; btn.textContent = 'Sending…';

  const { error } = await sb.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: currentActorId(),
    body,
  });

  btn.disabled = false; btn.textContent = 'Send Reply';
  if (error) {
    errEl.textContent = 'Failed to send: ' + error.message;
    errEl.style.display = 'block';
    return;
  }

  await renderTicketThread(ticketId, { isAdmin });
  if (isAdmin) loadAdminTicketsTab(); else loadCustomerTicketsTab(getCustomerId());
}

function closeTicketDetailModal() {
  document.getElementById('ticket-detail-modal-overlay').classList.remove('open');
  _openTicketId = null;
}

async function updateTicketStatus(ticketId, status) {
  const { error } = await sb.from('tickets').update({ status }).eq('id', ticketId);
  if (error) { alert('Failed to update status: ' + error.message); return; }
  loadAdminTicketsTab();
}

// ── Customer view ────────────────────────────────────────────
var _customerTicketsData = [];

async function loadCustomerTicketsTab(customerId) {
  const el = document.getElementById('customer-tickets-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading…</div>';

  const { data, error } = await sb.from('tickets')
    .select('*').eq('customer_id', customerId).order('updated_at', { ascending: false });
  if (error) { el.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }

  _customerTicketsData = data || [];
  renderCustomerTicketsList();
}

function renderCustomerTicketsList() {
  const el = document.getElementById('customer-tickets-list');
  if (!el) return;
  if (!_customerTicketsData.length) {
    el.innerHTML = '<div class="empty-state">No tickets yet. Click + New Ticket to open one.</div>';
    return;
  }
  el.innerHTML = _customerTicketsData.map(tk => `
    <div class="ticket-row" onclick="renderTicketThread('${tk.id}', { isAdmin: false })">
      <div class="ticket-row-top">
        <span class="ticket-subject">${escapeHtml(tk.subject)}</span>
        ${ticketStatusBadge(tk.status)}
      </div>
      <div class="ticket-meta">${ticketPriorityBadge(tk.priority)} · Updated ${fmtDateTime(tk.updated_at)}</div>
    </div>
  `).join('');
}

function openNewTicketModal() {
  document.getElementById('ticket-form-error').style.display = 'none';
  document.getElementById('tform-subject').value = '';
  document.getElementById('tform-priority').value = 'normal';
  document.getElementById('tform-message').value = '';
  document.getElementById('new-ticket-modal-overlay').classList.add('open');
}
function closeNewTicketModal() {
  document.getElementById('new-ticket-modal-overlay').classList.remove('open');
}

async function submitNewTicket() {
  const errEl = document.getElementById('ticket-form-error');
  const btn = document.getElementById('ticket-submit-btn');
  errEl.style.display = 'none';

  const subject = document.getElementById('tform-subject').value.trim();
  const priority = document.getElementById('tform-priority').value;
  const message = document.getElementById('tform-message').value.trim();
  if (!subject || !message) {
    errEl.textContent = 'Subject and message are required.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true; btn.textContent = 'Submitting…';

  const customerId = getCustomerId();
  const actorId = currentActorId();

  const { data: ticket, error } = await sb.from('tickets')
    .insert({ customer_id: customerId, created_by: actorId, subject, priority })
    .select().single();

  if (error || !ticket) {
    btn.disabled = false; btn.textContent = 'Submit Ticket';
    errEl.textContent = 'Failed: ' + (error?.message || 'unknown error');
    errEl.style.display = 'block';
    return;
  }

  const { error: msgError } = await sb.from('ticket_messages').insert({
    ticket_id: ticket.id, author_id: actorId, body: message,
  });

  btn.disabled = false; btn.textContent = 'Submit Ticket';
  if (msgError) {
    errEl.textContent = 'Ticket created, but the message failed to send: ' + msgError.message;
    errEl.style.display = 'block';
    return;
  }

  closeNewTicketModal();
  loadCustomerTicketsTab(customerId);
}

// ── Admin view ────────────────────────────────────────────────
var _adminTicketsData = [];

async function loadAdminTicketsTab() {
  const tbody = document.getElementById('admin-tickets-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';

  const { data, error } = await sb.from('tickets')
    .select('*, profiles!tickets_customer_id_fkey(name)')
    .order('updated_at', { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${escapeHtml(error.message)}</td></tr>`; return; }

  _adminTicketsData = data || [];
  renderAdminTicketsTable();
}

function renderAdminTicketsTable() {
  const tbody = document.getElementById('admin-tickets-tbody');
  if (!tbody) return;

  const q = document.getElementById('tickets-search')?.value.trim().toLowerCase() || '';
  const statusFilter = document.getElementById('tickets-status-filter')?.value || '';

  let rows = _adminTicketsData;
  if (statusFilter) rows = rows.filter(tk => tk.status === statusFilter);
  if (q) rows = rows.filter(tk =>
    tk.subject.toLowerCase().includes(q) || (tk.profiles?.name || '').toLowerCase().includes(q));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${_adminTicketsData.length ? 'No tickets match your search.' : 'No tickets yet.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(tk => `
    <tr style="cursor:pointer;" onclick="renderTicketThread('${tk.id}', { isAdmin: true })">
      <td style="font-weight:600;">${escapeHtml(tk.subject)}</td>
      <td>${escapeHtml(tk.profiles?.name || '—')}</td>
      <td>${ticketStatusBadge(tk.status)}</td>
      <td>${ticketPriorityBadge(tk.priority)}</td>
      <td style="font-size:12.5px;color:#64748B;">${fmtDateTime(tk.created_at)}</td>
      <td style="font-size:12.5px;color:#64748B;">${fmtDateTime(tk.updated_at)}</td>
    </tr>
  `).join('');
}
