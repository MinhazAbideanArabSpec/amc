// subscriptions.js — subscription tracking (admin + customer)

// ── Helpers ─────────────────────────────────────────────────
function subStatus(endDate) {
  const days = Math.round((new Date(endDate) - new Date()) / 86400000);
  if (days < 0)   return { label: t('sub_expired'),                                cls: 'expired',  days };
  if (days < 90) return { label: t('sub_expiring').replace('{n}', days),          cls: 'expiring', days };
  return           { label: t('sub_active'),                                        cls: 'active',   days };
}

function subCardHtml(s, showCustomer, showActions, fullWidth = false) {
  const st = subStatus(s.end_date);
  const daysLabel = st.days < 0 ? Math.abs(st.days) + 'd ago' : st.days + 'd left';
  const daysColor = st.cls === 'expired' ? '#C0392B' : st.cls === 'expiring' ? '#D4A017' : '#27AE60';
  if (fullWidth) {
    return `
      <div class="sub-card sub-card-full sub-${st.cls}">
        <div style="flex:1 1 200px;min-width:0;">
          <div class="sub-software">${s.software_name}</div>
          ${s.vendor ? `<div class="sub-vendor">${s.vendor}</div>` : ''}
          ${showCustomer && s.profiles ? `<div class="sub-vendor" style="color:var(--accent);">${s.profiles.name}</div>` : ''}
        </div>
        <div class="sub-dates" style="flex:0 0 auto;">${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}</div>
        <span class="sub-badge ${st.cls}" style="flex:0 0 auto;">${st.label}</span>
        <span style="flex:0 0 auto;font-size:13px;font-weight:700;color:${daysColor};min-width:70px;text-align:right;">${daysLabel}</span>
        ${showActions ? `
          <div style="display:flex;gap:6px;flex:0 0 auto;">
            <button class="secondary" style="padding:3px 10px;font-size:12px;" onclick="openEditSubModal('${s.id}')">Edit</button>
            <button class="danger" style="padding:3px 10px;font-size:12px;" onclick="deleteSub('${s.id}','${s.software_name.replace(/'/g,"\'")}')">Delete</button>
          </div>` : ''}
      ${(s.reference_number || s.notes) ? `<div style="flex:1 1 100%;font-size:11.5px;color:#8A8377;margin-top:2px;display:flex;gap:12px;">${s.reference_number ? '<span>Ref: ' + s.reference_number + '</span>' : ''}${s.notes ? '<span>' + s.notes + '</span>' : ''}</div>` : ''}
      </div>`;
  }
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
        <span style="font-size:12px;font-weight:700;color:${daysColor};">${daysLabel}</span>
        ${showActions ? `
          <div style="display:flex;gap:6px;">
            <button class="secondary" style="padding:3px 10px;font-size:12px;" onclick="openEditSubModal('${s.id}')">Edit</button>
            <button class="danger" style="padding:3px 10px;font-size:12px;" onclick="deleteSub('${s.id}','${s.software_name.replace(/'/g,"\'")}')">Delete</button>
          </div>` : ''}
      </div>
      ${showActions && s.reference_number ? `<div style="font-size:11.5px;color:#8A8377;margin-top:4px;">Ref: ${s.reference_number}</div>` : ''}
      ${s.notes ? `<div style="font-size:11.5px;color:#8A8377;margin-top:8px;">${s.notes}</div>` : ''}
    </div>`;
}

// ── Admin ────────────────────────────────────────────────────
function scrollToSubsGroup(group) {
  const el = document.getElementById(`subs-group-${group}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
  if (!subs || !subs.length) { el.innerHTML = `<div class="empty-state">No subscriptions yet. Click + Add Subscription to get started.</div>`; return; }

  // Group: expiring, active, expired
  const expiring = subs.filter(s => subStatus(s.end_date).cls === 'expiring');
  const active   = subs.filter(s => subStatus(s.end_date).cls === 'active');
  const expired  = subs.filter(s => subStatus(s.end_date).cls === 'expired');

  // ── Summary cards ────────────────────────────────────────
  const summaryEl = document.getElementById('subs-summary');
  if (summaryEl) {
    function summaryCard(count, label, color, bg, border, clickFn) {
      const clickable = clickFn ? `onclick="${clickFn}" style="cursor:pointer;"` : '';
      const hint = clickFn ? `<div style="font-size:10px;color:${color};opacity:0.6;margin-top:6px;">Click to view →</div>` : '';
      return `
        <div ${clickable} style="border:1.5px solid ${border};border-radius:10px;padding:16px;background:${bg};
          transition:opacity 0.15s;display:flex;flex-direction:column;justify-content:center;min-height:90px;"
          ${clickFn ? `onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"` : ''}>
          <div style="font-size:30px;font-weight:800;color:${color};line-height:1;">${count}</div>
          <div style="font-size:11px;font-weight:700;color:${color};margin-top:5px;text-transform:uppercase;letter-spacing:0.06em;">${label}</div>
          ${hint}
        </div>`;
    }

    summaryEl.innerHTML =
      summaryCard(subs.length,     'Total Renewals', '#475569', '#F8FAFC', '#E2E8F0', null) +
      summaryCard(active.length,   'Active',         '#166634', '#F0FDF4', '#BBF7D0', null) +
      summaryCard(expiring.length, 'Expiring Soon',  '#92660F', '#FAF1E0', '#F0C06A', 'scrollToSubsGroup(\'expiring\')') +
      summaryCard(expired.length,  'Expired',        '#C0392B', '#FDEDEC', '#F5C6CB', 'scrollToSubsGroup(\'expired\')');
  }

  // Sort: expiring by days ascending, expired by days descending (most recent first)
  const expiringSorted = [...expiring].sort((a, b) => subStatus(a.end_date).days - subStatus(b.end_date).days);
  const expiredSorted  = [...expired].sort((a, b) => subStatus(b.end_date).days - subStatus(a.end_date).days);

  let html = '';
  if (expiredSorted.length) {
    html += `<div id="subs-group-expired" style="font-size:11px;font-weight:700;color:var(--rust);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Expired (${expiredSorted.length})</div>`;
    html += `<div class="sub-grid-full" style="margin-bottom:20px;">` + expiredSorted.map(s => subCardHtml(s, true, true, true)).join('') + `</div>`;
  }
  if (expiringSorted.length) {
    html += `<div id="subs-group-expiring" style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">⚠ Expiring Soon (${expiringSorted.length})</div>`;
    html += `<div class="sub-grid-full" style="margin-bottom:20px;">` + expiringSorted.map(s => subCardHtml(s, true, true, true)).join('') + `</div>`;
  }
  if (active.length) {
    html += `<div id="subs-group-active" style="font-size:11px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Active (${active.length})</div>`;
    html += `<div class="sub-grid-full">` + active.map(s => subCardHtml(s, true, true, true)).join('') + `</div>`;
  }
  el.innerHTML = html;
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
  document.getElementById('sform-reference').value = '';
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
  document.getElementById('sform-reference').value = s.reference_number || '';
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
  const reference_number = document.getElementById('sform-reference').value.trim();
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

  const payload = { customer_id, software_name, vendor: vendor||null, start_date, end_date, notes: notes||null, reference_number: reference_number||null };
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
  invalidateAdminTab('subs');
  loadSubscriptions();
}

async function deleteSub(subId, name) {
  if (!confirm(`Delete subscription "${name}"?`)) return;
  const { error } = await sb.from('subscriptions').delete().eq('id', subId);
  if (error) { alert('Failed: ' + error.message); return; }
  invalidateAdminTab('subs');
  loadSubscriptions();
}

// ── Customer view ────────────────────────────────────────────
async function loadCustomerSubscriptions(customerId) {
  const tabEl  = document.getElementById('customer-subs-list');
  const dashEl = document.getElementById('customer-subs-dash');

  let { data: subs, error } = await sb.from('subscriptions')
    .select('*')
    .eq('customer_id', customerId)
    .order('end_date', { ascending: true });

  if (!subs && !error) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: subs, error } = await sb.from('subscriptions')
      .select('*')
      .eq('customer_id', customerId)
      .order('end_date', { ascending: true }));
  }

  if (error || !subs || !subs.length) {
    const msg = '<div class="empty-state">No renewals found.</div>';
    if (tabEl)  tabEl.innerHTML  = msg;
    if (dashEl) dashEl.innerHTML = msg;
    return;
  }

  // Tab: show all
  const tabHtml = `<div class="sub-grid">` + subs.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
  if (tabEl) tabEl.innerHTML = tabHtml;

  // Dashboard tile: only show renewals expiring within 90 days or already expired
  const urgent = subs.filter(s => {
    const days = Math.round((new Date(s.end_date) - new Date()) / 86400000);
    return days <= 90;
  });
  if (dashEl) {
    if (!urgent.length) {
      dashEl.innerHTML = `<div class="empty-state" style="color:var(--sage);font-weight:600;">✓ All renewals are up to date</div>`;
    } else {
      dashEl.innerHTML = `<div class="sub-grid">` + urgent.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
    }
  }
}
