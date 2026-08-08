// subscriptions.js — subscription tracking (admin + customer)

// ── Helpers ─────────────────────────────────────────────────
function subStatus(endDate) {
  const days = Math.round((new Date(endDate) - new Date()) / 86400000);
  if (days < 0)   return { label: t('sub_expired'),                                cls: 'expired',  days };
  if (days < 90)  return { label: t('sub_expiring').replace('{n}', days),          cls: 'expiring', days };
  return           { label: t('sub_active'),                                        cls: 'active',   days };
}

function subCardHtml(s, showCustomer, showActions) {
  const st = subStatus(s.end_date);
  return `
    <div class="sub-card sub-${st.cls}">
      <div class="sub-software">${s.software_name}</div>
      ${s.vendor ? `<div class="sub-vendor">${s.vendor}</div>` : ''}
      ${showCustomer && s.profiles ? `<div class="sub-vendor" style="color:var(--accent);">${s.profiles.name}</div>` : ''}
      <div class="sub-dates">
        ${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <span class="sub-badge ${st.cls}">${st.label}</span>
        ${showActions ? `
          <div style="display:flex;gap:6px;">
            <button class="secondary" style="padding:3px 10px;font-size:12px;" onclick="openEditSubModal('${s.id}')">Edit</button>
            <button class="danger" style="padding:3px 10px;font-size:12px;" onclick="deleteSub('${s.id}','${s.software_name.replace(/'/g,"\\'")}')">Delete</button>
          </div>` : ''}
      </div>
      ${s.notes ? `<div style="font-size:11.5px;color:#8A8377;margin-top:8px;">${s.notes}</div>` : ''}
    </div>`;
}

// ── Admin ────────────────────────────────────────────────────
var _subsData = [];
var _subsSort = { key: 'end_date', dir: 'asc' };

async function loadSubscriptions() {
  const el = document.getElementById('subs-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';

  // Populate customer filter
  const { data: customers } = await sb.from('profiles').select('id,name').eq('role','customer').is('customer_id', null).order('name');
  const filterSel = document.getElementById('sub-customer-filter');
  const currentFilter = filterSel.value;
  filterSel.innerHTML = '<option value="">All Customers</option>' +
    (customers||[]).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  filterSel.value = currentFilter;

  let query = sb.from('subscriptions')
    .select('*, profiles!subscriptions_customer_id_fkey(name)')
    .order('end_date', { ascending: true });
  if (currentFilter) query = query.eq('customer_id', currentFilter);

  const { data: subs, error } = await query;
  if (error) { el.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }

  _subsData = subs || [];
  renderSubsTable();
}

function subSortValue(s, key) {
  if (key === 'customer')      return (s.profiles?.name || '').toLowerCase();
  if (key === 'vendor')        return (s.vendor || '').toLowerCase();
  if (key === 'software_name') return (s.software_name || '').toLowerCase();
  if (key === 'status') {
    const cls = subStatus(s.end_date).cls;
    return cls === 'expired' ? 0 : cls === 'expiring' ? 1 : 2;
  }
  return s[key] || '';
}

function sortSubsBy(key) {
  if (_subsSort.key === key) {
    _subsSort.dir = _subsSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _subsSort.key = key;
    _subsSort.dir = 'asc';
  }
  renderSubsTable();
}

function renderSubsTable() {
  const el = document.getElementById('subs-list');
  if (!_subsData.length) { el.innerHTML = `<div class="empty-state">No subscriptions yet. Click + Add Subscription to get started.</div>`; return; }

  const sorted = [..._subsData].sort((a, b) => {
    const av = subSortValue(a, _subsSort.key), bv = subSortValue(b, _subsSort.key);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return _subsSort.dir === 'asc' ? cmp : -cmp;
  });

  const arrow = key => _subsSort.key === key ? (_subsSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label) => `<th style="cursor:pointer;user-select:none;" onclick="sortSubsBy('${key}')">${label}${arrow(key)}</th>`;

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          ${th('software_name', 'Software')}
          ${th('vendor', 'Vendor')}
          ${th('customer', 'Customer')}
          ${th('end_date', 'Expiration')}
          ${th('status', 'Status')}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(s => {
          const st = subStatus(s.end_date);
          return `
            <tr>
              <td style="font-weight:600;">${s.software_name}</td>
              <td>${s.vendor || '—'}</td>
              <td>${s.profiles?.name || '—'}</td>
              <td>${fmtDate(s.end_date)}</td>
              <td><span class="sub-badge ${st.cls}">${st.label}</span></td>
              <td>
                <div class="row-actions">
                  <button class="secondary" onclick="openEditSubModal('${s.id}')">Edit</button>
                  <button class="danger" onclick="deleteSub('${s.id}','${s.software_name.replace(/'/g,"\\'")}')">Delete</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Create/Edit Modal ────────────────────────────────────────
var editingSubId = null;

async function openCreateSubModal() {
  editingSubId = null;
  document.getElementById('sub-modal-title').textContent = 'Add Subscription';
  document.getElementById('sub-form-error').style.display = 'none';
  document.getElementById('sform-software').value = '';
  document.getElementById('sform-vendor').value = '';
  document.getElementById('sform-start').value = '';
  document.getElementById('sform-end').value = '';
  document.getElementById('sform-notes').value = '';

  const { data: customers } = await sb.from('profiles').select('id,name').eq('role','customer').is('customer_id', null).order('name');
  document.getElementById('sform-customer-id').innerHTML =
    '<option value="">— Select Customer —</option>' +
    (customers||[]).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('sub-modal-overlay').classList.add('open');
}

async function openEditSubModal(subId) {
  const { data: s } = await sb.from('subscriptions').select('*').eq('id', subId).single();
  if (!s) { alert('Could not load subscription.'); return; }

  editingSubId = subId;
  document.getElementById('sub-modal-title').textContent = 'Edit Subscription';
  document.getElementById('sub-form-error').style.display = 'none';
  document.getElementById('sform-software').value = s.software_name;
  document.getElementById('sform-vendor').value   = s.vendor || '';
  document.getElementById('sform-start').value    = s.start_date;
  document.getElementById('sform-end').value      = s.end_date;
  document.getElementById('sform-notes').value    = s.notes || '';

  const { data: customers } = await sb.from('profiles').select('id,name').eq('role','customer').is('customer_id', null).order('name');
  document.getElementById('sform-customer-id').innerHTML =
    '<option value="">— Select Customer —</option>' +
    (customers||[]).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('sform-customer-id').value = s.customer_id;
  document.getElementById('sub-modal-overlay').classList.add('open');
}

function closeSubModal() {
  document.getElementById('sub-modal-overlay').classList.remove('open');
  editingSubId = null;
}

async function saveSubscription() {
  const errEl  = document.getElementById('sub-form-error');
  const saveBtn = document.getElementById('sub-save-btn');
  errEl.style.display = 'none';
  saveBtn.disabled = true;

  const customer_id   = document.getElementById('sform-customer-id').value;
  const software_name = document.getElementById('sform-software').value.trim();
  const vendor        = document.getElementById('sform-vendor').value.trim();
  const start_date    = document.getElementById('sform-start').value;
  const end_date      = document.getElementById('sform-end').value;
  const notes         = document.getElementById('sform-notes').value.trim();

  if (!customer_id || !software_name || !start_date || !end_date) {
    errEl.textContent = 'Customer, software name, and dates are required.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }
  if (end_date < start_date) {
    errEl.textContent = 'End date must be after start date.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  const payload = { customer_id, software_name, vendor: vendor||null, start_date, end_date, notes: notes||null };
  const { error } = editingSubId
    ? await sb.from('subscriptions').update(payload).eq('id', editingSubId)
    : await sb.from('subscriptions').insert(payload);

  if (error) {
    errEl.textContent = 'Failed: ' + error.message;
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  saveBtn.disabled = false;
  closeSubModal();
  loadSubscriptions();
}

async function deleteSub(subId, name) {
  if (!confirm(`Delete subscription "${name}"?`)) return;
  const { error } = await sb.from('subscriptions').delete().eq('id', subId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadSubscriptions();
}

// ── Customer view ────────────────────────────────────────────
async function loadCustomerSubscriptions(customerId) {
  const tabEl  = document.getElementById('customer-subs-list');
  const dashEl = document.getElementById('customer-subs-dash');

  const { data: subs, error } = await sb.from('subscriptions')
    .select('*')
    .eq('customer_id', customerId)
    .order('end_date', { ascending: true });

  const expiredEl = document.getElementById('istat-renewals-expired');
  const soonEl     = document.getElementById('istat-renewals-soon');

  if (error || !subs || !subs.length) {
    const msg = '<div class="empty-state">No subscriptions found.</div>';
    if (tabEl)  tabEl.innerHTML  = msg;
    if (dashEl) dashEl.innerHTML = msg;
    if (expiredEl) expiredEl.textContent = '0';
    if (soonEl)    soonEl.textContent = '0';
    return;
  }

  // Tab: show all
  const tabHtml = `<div class="sub-grid">` + subs.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
  if (tabEl) tabEl.innerHTML = tabHtml;

  // Dashboard: only show expiring < 90 days or expired
  const urgent = subs.filter(s => {
    const days = Math.round((new Date(s.end_date) - new Date()) / 86400000);
    return days < 90;
  });
  if (dashEl) {
    if (!urgent.length) {
      dashEl.innerHTML = `<div class="empty-state" style="color:var(--sage);font-weight:600;">✓ All renewals are up to date</div>`;
    } else {
      dashEl.innerHTML = `<div class="sub-grid">` + urgent.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
    }
  }

  // Hero tile: expired count and expiring-within-60-days count, shown separately
  if (expiredEl || soonEl) {
    let expiredCount = 0, soonCount = 0;
    subs.forEach(s => {
      const days = Math.round((new Date(s.end_date) - new Date()) / 86400000);
      if (days < 0) expiredCount++;
      else if (days < 60) soonCount++;
    });
    if (expiredEl) expiredEl.textContent = expiredCount;
    if (soonEl)    soonEl.textContent = soonCount;
  }
}
