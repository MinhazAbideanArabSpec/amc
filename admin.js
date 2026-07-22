// admin.js — admin overview, users, contracts, assets
// ── Admin: load overview stats ───────────────────────────
async function loadAdminOverview() {
  const [{ data: customers }, { data: contracts }] = await Promise.all([
    sb.from('profiles').select('id').eq('role', 'customer'),
    sb.from('contracts').select('*, profiles!contracts_customer_id_fkey(name)')
  ]);

  const totalCustomers = customers?.length || 0;
  const allContracts = contracts || [];
  const totalContracts = allContracts.length;
  const activeContracts = allContracts.filter(c => c.status === 'active');

  const today = new Date();
  const expiring = activeContracts
    .map(c => ({ ...c, daysLeft: Math.round((new Date(c.end_date) - today) / 86400000) }))
    .filter(c => c.daysLeft >= 0 && c.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  document.getElementById('stat-total-customers').textContent = totalCustomers;
  document.getElementById('stat-active-contracts').textContent = activeContracts.length;
  document.getElementById('stat-expiring-soon').textContent = expiring.length;
  document.getElementById('stat-total-contracts').textContent = totalContracts;

  const tbody = document.getElementById('expiring-tbody');
  if (!expiring.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No contracts expiring within 60 days.</td></tr>`;
  } else {
    tbody.innerHTML = expiring.map(c => `
      <tr>
        <td style="font-weight:600;">${c.contract_number}</td>
        <td>${c.profiles?.name || '—'}</td>
        <td>${fmtDate(c.end_date)}</td>
        <td>${c.daysLeft} days</td>
      </tr>
    `).join('');
  }
}

// ── Customer view ────────────────────────────────────────
function renderCustomerProfile(p) {
  document.getElementById('customer-profile-rows').innerHTML = `
    <div class="profile-row"><span class="lbl">Name</span><span class="val">${p.name}</span></div>
    <div class="profile-row"><span class="lbl">Email</span><span class="val">${p.email}</span></div>
    <div class="profile-row"><span class="lbl">Contact Person</span><span class="val">${p.contact_person || '—'}</span></div>
    <div class="profile-row"><span class="lbl">Phone</span><span class="val">${p.phone || '—'}</span></div>
    <div class="profile-row"><span class="lbl">Status</span><span class="val">${p.is_active ? 'Active' : 'Inactive'}</span></div>
  `;
}

// ── Admin: load & render user list ──────────────────────
async function loadUsersList() {
  const { data: users, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  const tbody = document.getElementById('users-tbody');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error loading users: ${error.message}</td></tr>`;
    return;
  }
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No users yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:600;">${u.name}</td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role}">${u.role}</span></td>
      <td><span class="badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditModal('${u.id}')">Edit</button>
          ${u.role === 'customer' ? `<button class="secondary" onclick="triggerLogoUpload('${u.id}')">${u.logo_path ? 'Change Logo' : 'Upload Logo'}</button>` : ''}
          <button class="secondary" onclick="openResetPasswordModal('${u.id}', '${u.name.replace(/'/g, "\\'")}')">Reset Password</button>
          <button class="secondary" onclick="toggleActive('${u.id}', ${u.is_active})">${u.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="danger" onclick="deleteUser('${u.id}', '${u.name.replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Logo upload ──────────────────────────────────────────
var logoUploadUserId = null;

function triggerLogoUpload(userId) {
  logoUploadUserId = userId;
  document.getElementById('logo-file-input').click();
}

async function handleLogoFileSelected(input) {
  const file = input.files[0];
  if (!file || !logoUploadUserId) return;

  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    input.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('Logo must be under 2MB.');
    input.value = '';
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const filePath = `${logoUploadUserId}/logo.${ext}`;

  const { error: uploadError } = await sb.storage.from('logos').upload(filePath, file, { upsert: true });
  if (uploadError) { alert('Upload failed: ' + uploadError.message); input.value = ''; return; }

  const { error: updateError } = await sb.from('profiles').update({ logo_path: filePath }).eq('id', logoUploadUserId);
  if (updateError) { alert('Saved file but failed to link: ' + updateError.message); input.value = ''; return; }

  input.value = '';
  logoUploadUserId = null;
  alert('Logo uploaded successfully.');
  loadUsersList();
}

// ── Modal: open for create ──────────────────────────────
function openCreateModal() {
  editingUserId = null;
  document.getElementById('modal-title').textContent = 'Create User';
  document.getElementById('create-only-fields').style.display = 'block';
  document.getElementById('form-email').value = '';
  document.getElementById('form-password').value = '';
  document.getElementById('form-name').value = '';
  document.getElementById('form-role').value = 'customer';
  document.getElementById('form-contact-person').value = '';
  document.getElementById('form-phone').value = '';
  document.getElementById('form-next-visit-date').value = '';
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('modal-overlay').classList.add('open');
}

// ── Modal: open for edit ────────────────────────────────
async function openEditModal(userId) {
  const { data: u, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error || !u) { alert('Could not load user.'); return; }

  editingUserId = userId;
  document.getElementById('modal-title').textContent = 'Edit User';
  document.getElementById('create-only-fields').style.display = 'none'; // can't change email/password here
  document.getElementById('form-name').value = u.name;
  document.getElementById('form-role').value = u.role;
  document.getElementById('form-contact-person').value = u.contact_person || '';
  document.getElementById('form-phone').value = u.phone || '';
  document.getElementById('form-next-visit-date').value = u.next_visit_date || '';
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── Save (create or update) ─────────────────────────────
async function saveUser() {
  const errEl = document.getElementById('form-error');
  errEl.style.display = 'none';
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;

  const name = document.getElementById('form-name').value.trim();
  const role = document.getElementById('form-role').value;
  const contactPerson = document.getElementById('form-contact-person').value.trim();
  const phone = document.getElementById('form-phone').value.trim();
  const nextVisitDate = document.getElementById('form-next-visit-date').value || null;

  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  if (editingUserId) {
    // ── UPDATE existing profile (no auth changes) ──
    const { error } = await sb.from('profiles')
      .update({ name, role, contact_person: contactPerson, phone, next_visit_date: nextVisitDate })
      .eq('id', editingUserId);

    saveBtn.disabled = false;
    if (error) {
      errEl.textContent = 'Update failed: ' + error.message;
      errEl.style.display = 'block';
      return;
    }
    closeModal();
    loadUsersList();

  } else {
    // ── CREATE new user via secure Edge Function ──
    const email = document.getElementById('form-email').value.trim();
    const password = document.getElementById('form-password').value;

    if (!email) {
      errEl.textContent = 'Email is required.';
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }
    if (!password || password.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters.';
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }

    const { data: { session } } = await sb.auth.getSession();

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email, password, name, role,
          contact_person: contactPerson,
          phone
        }),
      });
      const result = await res.json();

      saveBtn.disabled = false;

      if (!res.ok) {
        errEl.textContent = result.error || 'Failed to create user.';
        errEl.style.display = 'block';
        return;
      }

      closeModal();
      loadUsersList();

    } catch (err) {
      saveBtn.disabled = false;
      errEl.textContent = 'Network error: ' + err.message;
      errEl.style.display = 'block';
    }
  }
}

// ── Toggle active/inactive ───────────────────────────────
var resetPasswordUserId = null;

function openResetPasswordModal(userId, userName) {
  resetPasswordUserId = userId;
  document.getElementById('reset-pw-user-name').textContent = 'User: ' + userName;
  document.getElementById('reset-pw-input').value = '';
  document.getElementById('reset-pw-confirm').value = '';
  document.getElementById('reset-pw-error').style.display = 'none';
  document.getElementById('reset-pw-overlay').classList.add('open');
}

function closeResetPasswordModal() {
  document.getElementById('reset-pw-overlay').classList.remove('open');
  resetPasswordUserId = null;
}

async function saveResetPassword() {
  const errEl = document.getElementById('reset-pw-error');
  const btn = document.getElementById('reset-pw-btn');
  errEl.style.display = 'none';

  const newPw = document.getElementById('reset-pw-input').value;
  const confirmPw = document.getElementById('reset-pw-confirm').value;

  if (!newPw || newPw.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.style.display = 'block';
    return;
  }
  if (newPw !== confirmPw) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Resetting…';

  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'reset-password', user_id: resetPasswordUserId, new_password: newPw })
  });

  const result = await res.json();
  btn.disabled = false;
  btn.textContent = 'Reset Password';

  if (!res.ok || result.error) {
    errEl.textContent = result.error || 'Failed to reset password.';
    errEl.style.display = 'block';
    return;
  }

  closeResetPasswordModal();
  alert('Password reset successfully.');
}

async function toggleActive(userId, currentlyActive) {
  const { error } = await sb.from('profiles')
    .update({ is_active: !currentlyActive })
    .eq('id', userId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadUsersList();
}

// ── Delete profile ───────────────────────────────────────
async function deleteUser(userId, name) {
  if (!confirm(`Delete "${name}"? This removes their profile (their login will remain unless removed separately in Supabase Auth).`)) return;
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadUsersList();
}

// ═══════════════════════════════════════════════════════
//  CONTRACTS — Admin
// ═══════════════════════════════════════════════════════
var editingContractId = null;

async function loadContractsList() {
  const tbody = document.getElementById('contracts-tbody');
  const { data: contracts, error } = await sb
    .from('contracts')
    .select('*, profiles!contracts_customer_id_fkey(name)')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${error.message}</td></tr>`;
    return;
  }
  if (!contracts.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No contracts yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = contracts.map(c => `
    <tr>
      <td style="font-weight:600;">${c.contract_number}</td>
      <td>${c.profiles?.name || '—'}</td>
      <td>${c.contract_type}</td>
      <td>${fmtDate(c.start_date)}</td>
      <td>${fmtDate(c.end_date)}</td>
      <td><span class="badge status-${c.status}">${c.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditContractModal('${c.id}')">Edit</button>
          <button class="danger" onclick="deleteContract('${c.id}', '${c.contract_number}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openCreateContractModal() {
  editingContractId = null;
  document.getElementById('contract-modal-title').textContent = 'Create Contract';
  document.getElementById('contract-form-error').style.display = 'none';
  document.getElementById('cform-number').value = '';
  document.getElementById('cform-type').value = '';
  document.getElementById('cform-start').value = '';
  document.getElementById('cform-end').value = '';
  document.getElementById('cform-address').value = '';
  document.getElementById('cform-prepared-by').value = '';
  document.getElementById('cform-reviewed-by').value = '';
  document.getElementById('cform-accepted-by').value = '';
  document.getElementById('cform-status').value = 'active';
  document.getElementById('cform-pdf-file').value = '';
  document.getElementById('cform-existing-pdf-note').textContent = '';

  await populateCustomerDropdown();
  document.getElementById('contract-modal-overlay').classList.add('open');
}

async function populateCustomerDropdown(selectedId) {
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('cform-customer-id');
  sel.innerHTML = (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (selectedId) sel.value = selectedId;
}

async function openEditContractModal(contractId) {
  const { data: c, error } = await sb.from('contracts').select('*').eq('id', contractId).single();
  if (error || !c) { alert('Could not load contract.'); return; }

  editingContractId = contractId;
  document.getElementById('contract-modal-title').textContent = 'Edit Contract';
  document.getElementById('contract-form-error').style.display = 'none';
  document.getElementById('cform-number').value = c.contract_number;
  document.getElementById('cform-type').value = c.contract_type;
  document.getElementById('cform-start').value = c.start_date;
  document.getElementById('cform-end').value = c.end_date;
  document.getElementById('cform-address').value = c.customer_address || '';
  document.getElementById('cform-prepared-by').value = c.prepared_by || '';
  document.getElementById('cform-reviewed-by').value = c.reviewed_by || '';
  document.getElementById('cform-accepted-by').value = c.accepted_by || '';
  document.getElementById('cform-status').value = c.status;
  document.getElementById('cform-pdf-file').value = '';
  document.getElementById('cform-existing-pdf-note').textContent = c.pdf_path ? '(PDF already uploaded — choose a file only to replace it)' : '(no PDF uploaded yet)';

  await populateCustomerDropdown(c.customer_id);
  document.getElementById('contract-modal-overlay').classList.add('open');
}

function closeContractModal() {
  document.getElementById('contract-modal-overlay').classList.remove('open');
}

async function saveContract() {
  const errEl = document.getElementById('contract-form-error');
  errEl.style.display = 'none';
  const saveBtn = document.getElementById('contract-save-btn');
  saveBtn.disabled = true;

  const customer_id = document.getElementById('cform-customer-id').value;
  const contract_number = document.getElementById('cform-number').value.trim();
  const contract_type = document.getElementById('cform-type').value.trim();
  const start_date = document.getElementById('cform-start').value;
  const end_date = document.getElementById('cform-end').value;
  const customer_address = document.getElementById('cform-address').value.trim();
  const prepared_by = document.getElementById('cform-prepared-by').value.trim();
  const reviewed_by = document.getElementById('cform-reviewed-by').value.trim();
  const accepted_by = document.getElementById('cform-accepted-by').value.trim();
  const status = document.getElementById('cform-status').value;
  const pdfFile = document.getElementById('cform-pdf-file').files[0];

  if (!customer_id || !contract_number || !contract_type || !start_date || !end_date) {
    errEl.textContent = 'Customer, contract number, type, start and end dates are required.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  const payload = {
    customer_id, contract_number, contract_type, start_date, end_date,
    customer_address, prepared_by, reviewed_by, accepted_by, status
  };

  let contractId = editingContractId;

  if (contractId) {
    const { error } = await sb.from('contracts').update(payload).eq('id', contractId);
    if (error) {
      errEl.textContent = 'Update failed: ' + error.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }
  } else {
    const { data: inserted, error } = await sb.from('contracts').insert(payload).select().single();
    if (error) {
      errEl.textContent = 'Create failed: ' + error.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }
    contractId = inserted.id;
  }

  // Upload PDF if a new one was chosen
  if (pdfFile) {
    const filePath = `${customer_id}/${contract_number}-${Date.now()}.pdf`;
    const { error: uploadError } = await sb.storage.from('contracts').upload(filePath, pdfFile, { upsert: true });

    if (uploadError) {
      errEl.textContent = 'Contract saved, but PDF upload failed: ' + uploadError.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      loadContractsList();
      return;
    }

    await sb.from('contracts').update({ pdf_path: filePath }).eq('id', contractId);
  }

  saveBtn.disabled = false;
  closeContractModal();
  loadContractsList();
}

async function deleteContract(contractId, number) {
  if (!confirm(`Delete contract "${number}"? This cannot be undone.`)) return;
  const { error } = await sb.from('contracts').delete().eq('id', contractId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadContractsList();
}

// ═══════════════════════════════════════════════════════
//  CONTRACTS — Customer (read-only)
// ═══════════════════════════════════════════════════════
// ── Contract validity timeline (visual progress bars) ──────
function renderContractTimeline(contracts, today) {
  const el = document.getElementById('contract-timeline-wrap');

  el.innerHTML = `<div class="timeline-card-inner">` + contracts.map(c => {
    const start = new Date(c.start_date);
    const end = new Date(c.end_date);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const elapsedDays = Math.round((today - start) / 86400000);
    const daysLeft = Math.round((end - today) / 86400000);
    const pctElapsed = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

    let color = 'sage';
    if (daysLeft <= 0) color = 'rust';
    else if (daysLeft <= 60) color = 'amber';

    const daysLabel = daysLeft <= 0 ? 'Expired' : `${daysLeft} days left`;
    const urgentClass = (daysLeft > 0 && daysLeft <= 60) ? 'urgent' : (daysLeft <= 0 ? 'urgent' : '');

    return `
      <div class="timeline-contract-row">
        <div class="timeline-top">
          <span class="t-num">${c.contract_number}</span>
          <span class="t-days ${urgentClass}">${daysLabel}</span>
        </div>
        <div class="timeline-track">
          <div class="timeline-fill c-${color}" style="width:${pctElapsed}%;"></div>
        </div>
        <div class="timeline-dates">
          <span>${fmtDate(c.start_date)}</span>
          <span>${fmtDate(c.end_date)}</span>
        </div>
      </div>
    `;
  }).join('') + `</div>`;
}

async function loadCustomerContracts(customerId) {
  const container = document.getElementById('customer-contracts-list');
  const overviewContainer = document.getElementById('customer-overview-rows');
  const timelineEl = document.getElementById('contract-timeline-wrap');
  const { data: contracts, error } = await sb
    .from('contracts')
    .select('*')
    .eq('customer_id', customerId)
    .order('start_date', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty-state">Error loading contracts: ${error.message}</div>`;
    overviewContainer.innerHTML = `<div class="empty-state">Error loading overview.</div>`;
    timelineEl.innerHTML = `<div class="empty-state">Error loading chart.</div>`;
    return;
  }
  if (!contracts.length) {
    container.innerHTML = `<div class="empty-state">No contracts assigned yet.</div>`;
    overviewContainer.innerHTML = `<div class="empty-state">No contracts assigned yet.</div>`;
    timelineEl.innerHTML = `<div class="empty-state">No contracts to chart yet.</div>`;
    return;
  }

  const today = new Date();

  window._dashContracts = contracts;
  renderContractTimeline(contracts, today);

  // Populate contract days stat card
  const activeContract = contracts.find(c => c.status === 'active') || contracts[0];
  if (activeContract) {
    const daysLeft = Math.max(0, Math.round((new Date(activeContract.end_date) - today) / 86400000));
    const el = document.getElementById('istat-contract-days');
    if (el) el.textContent = daysLeft;
    const sub = document.getElementById('istat-contract-num');
    if (sub) sub.textContent = activeContract.contract_number;
  }

  // Overview rows: quick glance at status + days remaining
  overviewContainer.innerHTML = contracts.map(c => {
    const daysLeft = Math.round((new Date(c.end_date) - today) / 86400000);
    const daysLabel = daysLeft < 0 ? 'Expired' : `${daysLeft} days remaining`;
    const urgentClass = (daysLeft >= 0 && daysLeft <= 60) ? 'urgent' : '';
    return `
      <div class="overview-row">
        <div class="overview-row-main">
          <span class="contract-num">${c.contract_number}</span>
          <span class="badge status-${c.status}">${c.status}</span>
          <span class="days-left ${urgentClass}">${daysLabel}</span>
        </div>
        <a class="overview-link" href="javascript:void(0)" onclick="switchCustomerTab('contracts')">View full contract →</a>
      </div>
    `;
  }).join('');

  // Full contract blocks
  container.innerHTML = contracts.map(c => `
    <div class="contract-block" id="contract-${c.id}">
      <div class="contract-block-header">
        <h3>${c.contract_number}</h3>
        <span class="badge status-${c.status}">${c.status}</span>
      </div>
      <div class="contract-grid">
        <div class="contract-field"><div class="lbl">Contract Type</div><div class="val">${c.contract_type}</div></div>
        <div class="contract-field"><div class="lbl">Customer Address</div><div class="val">${c.customer_address || '—'}</div></div>
        <div class="contract-field"><div class="lbl">Start Date</div><div class="val">${fmtDate(c.start_date)}</div></div>
        <div class="contract-field"><div class="lbl">End Date</div><div class="val">${fmtDate(c.end_date)}</div></div>
        <div class="contract-field"><div class="lbl">Prepared By</div><div class="val">${c.prepared_by || '—'}</div></div>
        <div class="contract-field"><div class="lbl">Reviewed By</div><div class="val">${c.reviewed_by || '—'}</div></div>
        <div class="contract-field"><div class="lbl">Accepted By</div><div class="val">${c.accepted_by || '—'}</div></div>
      </div>
      ${c.pdf_path
        ? `<button class="pdf-link-btn" onclick="downloadContractPdf('${c.pdf_path}')">⬇ Download Contract PDF</button>`
        : `<button class="pdf-link-btn disabled" disabled>No PDF uploaded yet</button>`
      }
    </div>
  `).join('');
}

async function downloadContractPdf(pdfPath) {
  const { data, error } = await sb.storage.from('contracts').createSignedUrl(pdfPath, 60);
  if (error || !data?.signedUrl) {
    alert('Could not generate download link: ' + (error?.message || 'unknown error'));
    return;
  }
  window.open(data.signedUrl, '_blank');
}

// ── Shared helper ─────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════
//  ASSETS — Admin
// ═══════════════════════════════════════════════════════
var editingAssetId = null;
var allHealthStatuses = []; // cached: [{id, category, label, color, sort_order}]

async function loadHealthStatuses() {
  if (allHealthStatuses.length) return allHealthStatuses;
  const { data } = await sb.from('health_statuses').select('*').order('category').order('sort_order');
  allHealthStatuses = data || [];
  return allHealthStatuses;
}

async function populateAssetCustomerFilter() {
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('asset-customer-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Customers</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = current;
}

async function loadAssetsList() {
  await populateAssetCustomerFilter();
  await loadHealthStatuses();

  const filterId = document.getElementById('asset-customer-filter').value;
  const tbody = document.getElementById('assets-tbody');

  if (!filterId) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Select a customer to view their assets.</td></tr>`;
    return;
  }

  let query = sb.from('assets')
    .select('*, profiles!assets_customer_id_fkey(name), health_statuses(label, color)')
    .eq('customer_id', filterId)
    .order('created_at', { ascending: false });

  const { data: assets, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${error.message}</td></tr>`;
    return;
  }
  if (!assets.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No assets yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = assets.map(a => `
    <tr>
      <td style="font-weight:600;">${a.employee_name || '<span style="color:#9CA3AF;">—</span>'}</td>
      <td style="color:var(--ink-soft);">${a.name}</td>
      <td>${a.profiles?.name || '—'}</td>
      <td>${a.category}</td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;background:${a.asset_group === 'data_center' ? '#EEF2FF' : '#F0FDF4'};color:${a.asset_group === 'data_center' ? '#3730A3' : '#166534'};">${a.asset_group === 'data_center' ? 'Data Center' : 'End User'}</span></td>
      <td>${a.health_statuses ? `<span class="status-pill c-${a.health_statuses.color}">${a.health_statuses.label}</span>` : '<span style="color:#9CA3AF;">Not set</span>'}</td>
      <td>${a.location || '—'}</td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditAssetModal('${a.id}')">Edit</button>
          <button class="danger" onclick="deleteAsset('${a.id}', '${(a.employee_name || a.name).replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function populateAssetCustomerDropdown(selectedId) {
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('aform-customer-id');
  sel.innerHTML = (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (selectedId) sel.value = selectedId;
}

async function populateStatusDropdown(category, selectedId) {
  await loadHealthStatuses();
  const options = allHealthStatuses.filter(s => s.category === category);
  const sel = document.getElementById('aform-status-id');
  sel.innerHTML = '<option value="">— No status set —</option>' +
    options.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  if (selectedId) sel.value = selectedId;
}

async function openCreateAssetModal() {
  editingAssetId = null;
  document.getElementById('asset-modal-title').textContent = 'Add Asset';
  document.getElementById('asset-form-error').style.display = 'none';
  document.getElementById('aform-employee-name').value = '';
  document.getElementById('aform-name').value = '';
  document.getElementById('aform-category').value = 'Desktop';
  document.getElementById('aform-group').value = 'end_user';
  document.getElementById('aform-serial').value = '';
  document.getElementById('aform-location').value = '';
  document.getElementById('aform-notes').value = '';

  await populateAssetCustomerDropdown();
  document.getElementById('asset-modal-overlay').classList.add('open');
}

async function openEditAssetModal(assetId) {
  const { data: a, error } = await sb.from('assets').select('*').eq('id', assetId).single();
  if (error || !a) { alert('Could not load asset.'); return; }

  editingAssetId = assetId;
  document.getElementById('asset-modal-title').textContent = 'Edit Asset';
  document.getElementById('asset-form-error').style.display = 'none';
  document.getElementById('aform-employee-name').value = a.employee_name || '';
  document.getElementById('aform-name').value = a.name;
  document.getElementById('aform-category').value = a.category;
  document.getElementById('aform-group').value = a.asset_group || 'end_user';
  document.getElementById('aform-serial').value = a.serial_model || '';
  document.getElementById('aform-location').value = a.location || '';
  document.getElementById('aform-notes').value = a.notes || '';

  await populateAssetCustomerDropdown(a.customer_id);
  document.getElementById('asset-modal-overlay').classList.add('open');
}

function closeAssetModal() {
  document.getElementById('asset-modal-overlay').classList.remove('open');
}

async function saveAsset() {
  const errEl = document.getElementById('asset-form-error');
  errEl.style.display = 'none';
  const saveBtn = document.getElementById('asset-save-btn');
  saveBtn.disabled = true;

  const customer_id   = document.getElementById('aform-customer-id').value;
  const employee_name = document.getElementById('aform-employee-name').value.trim();
  const name          = document.getElementById('aform-name').value.trim();
  const category      = document.getElementById('aform-category').value;
  const asset_group   = document.getElementById('aform-group').value;
  const serial_model  = document.getElementById('aform-serial').value.trim();
  const location      = document.getElementById('aform-location').value.trim();
  const notes         = document.getElementById('aform-notes').value.trim();

  if (!customer_id || !name || !category) {
    errEl.textContent = 'Customer, asset name, and category are required.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  const payload = { customer_id, employee_name, name, category, asset_group, serial_model, location, notes };
  let assetId = editingAssetId;

  if (assetId) {
    const { error } = await sb.from('assets').update(payload).eq('id', assetId);
    if (error) {
      errEl.textContent = 'Update failed: ' + error.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }
  } else {
    const { data: inserted, error } = await sb.from('assets').insert(payload).select().single();
    if (error) {
      errEl.textContent = 'Create failed: ' + error.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }
    assetId = inserted.id;
  }

  saveBtn.disabled = false;
  closeAssetModal();
  loadAssetsList();
}

async function deleteAsset(assetId, name) {
  if (!confirm(`Delete asset "${name}"? This cannot be undone.`)) return;
  const { error } = await sb.from('assets').delete().eq('id', assetId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadAssetsList();
}

// ═══════════════════════════════════════════════════════
//  ASSETS — Customer (dashboard + detail)
// ═══════════════════════════════════════════════════════
var customerAssetsCache = [];

// ── Donut chart for asset health (pure SVG, no library) ────
var COLOR_HEX = {
  sage: '#5B7D6B', amber: '#92660F', rust: '#C0392B', slate: '#94A3B8',
  red: '#C0392B', blue: '#1E5F8E', purple: '#5B21B6', teal: '#0EA5A0',
  green: '#1A6B3A', orange: '#C2510E', pink: '#9D2C6E', brown: '#6B3A2A',
  navy: '#1C2F5E', lime: '#4A7A1E'
};

function renderAssetDonut(counts, total) {
  const donutEl = document.getElementById('asset-donut-wrap');
  if (!Object.keys(counts).length) {
    donutEl.innerHTML = '<div class="empty-state">No status data yet.</div>';
    return;
  }

  // Find the max count to size bars proportionally
  const maxCount = Math.max(...Object.values(counts).map(c => c.count));

  const bars = Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([label, { count, color, icon }]) => {
      const pct = (count / maxCount * 100).toFixed(1);
      const hex = COLOR_HEX[color] || '#94A3B8';
      const iconHtml = icon ? `<span class="bar-icon" style="color:${hex};">${iconSvg(icon, 13)}</span>` : '';
      return `
        <div class="asset-bar-row">
          <div class="asset-bar-label">${iconHtml}${label}</div>
          <div class="asset-bar-track">
            <div class="asset-bar-fill" style="width:${pct}%; background:${hex};"></div>
          </div>
          <div class="asset-bar-count">${count}</div>
        </div>`;
    }).join('');

  donutEl.innerHTML = `
    <div class="asset-bar-summary">
      <span class="asset-bar-total">${total} <span style="font-size:11px;font-weight:500;color:#8A8377;">assets</span></span>
    </div>
    <div class="asset-bar-chart">${bars}</div>
  `;
}

async function loadCustomerAssets(customerId) {
  const summaryEl = document.getElementById('asset-health-summary');
  const listEl    = document.getElementById('customer-assets-list');
  const donutEl   = document.getElementById('asset-donut-wrap');

  // Fetch assets and their active status assignments in parallel
  const [{ data: assets, error }, { data: assignments }] = await Promise.all([
    sb.from('assets').select('*').eq('customer_id', customerId).order('category').order('name'),
    sb.from('asset_status_assignments')
      .select('asset_id, asset_statuses(name, color, icon)')
      .eq('customer_id', customerId)
      .eq('is_resolved', false)
  ]);

  if (error) {
    summaryEl.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`;
    listEl.innerHTML    = `<div class="empty-state">Error loading assets.</div>`;
    donutEl.innerHTML   = `<div class="empty-state">Error loading chart.</div>`;
    return;
  }
  if (!assets || !assets.length) {
    summaryEl.innerHTML = `<div class="empty-state">No assets registered yet.</div>`;
    listEl.innerHTML    = `<div class="empty-state">No assets registered yet.</div>`;
    donutEl.innerHTML   = `<div class="empty-state">No assets to chart yet.</div>`;
    return;
  }

  customerAssetsCache = assets;
  const el = document.getElementById('istat-assets');
  if (el) el.textContent = assets.length;

  // Build a map of assetId → [status names]
  const assetStatusMap = {}; // assetId → [{name, color}]
  (assignments || []).forEach(a => {
    if (!assetStatusMap[a.asset_id]) assetStatusMap[a.asset_id] = [];
    if (a.asset_statuses) assetStatusMap[a.asset_id].push(a.asset_statuses);
  });

  // Build donut counts — each ASSET counted once per STATUS it's under
  // If asset has no active status → count under "No Active Status"
  const counts = {};
  assets.forEach(a => {
    const statuses = assetStatusMap[a.id] || [];
    if (!statuses.length) {
      if (!counts['No Active Status']) counts['No Active Status'] = { count: 0, color: 'slate', icon: 'checkcircle' };
      counts['No Active Status'].count++;
    } else {
      statuses.forEach(s => {
        if (!counts[s.name]) counts[s.name] = { count: 0, color: s.color, icon: s.icon };
        counts[s.name].count++;
      });
    }
  });

  // Total unique asset count for donut center
  const totalAssets = assets.length;
  window._dashHealthCounts = counts;
  renderAssetDonut(counts, totalAssets);

  // Health tile breakdown
  summaryEl.innerHTML = Object.entries(counts).map(([label, { count, color }]) => `
    <div class="health-tile c-${color}">
      <div class="h-count">${count}</div>
      <div class="h-label">${label}</div>
    </div>
  `).join('');

  // Asset cards — show status pills from assignments
  const assetCardsHtml = `<div class="asset-card-grid">` + assets.map(a => {
    const statuses = assetStatusMap[a.id] || [];
    const pills = statuses.length
      ? statuses.map(s => `<span class="status-pill c-${s.color}">${s.name}</span>`).join('')
      : `<span class="status-pill c-slate">No Active Status</span>`;
    return `
      <div class="asset-card" onclick="openAssetDetail('${a.id}')">
        <div class="a-name">${a.employee_name || a.name}</div>
        <div class="a-meta">${a.name} · ${a.category}${a.location ? ' · ' + a.location : ''}</div>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${pills}</div>
      </div>`;
  }).join('') + `</div>`;

  listEl.innerHTML = assetCardsHtml;
  // Also populate the dashboard overview copy
  const dashList = document.getElementById('customer-assets-list-dash');
  if (dashList) dashList.innerHTML = assetCardsHtml;
}

async function openAssetDetail(assetId) {
  const asset = customerAssetsCache.find(a => a.id === assetId);
  if (!asset) return;

  document.getElementById('asset-detail-title').textContent = asset.employee_name || asset.name;

  const { data: history } = await sb
    .from('asset_status_history')
    .select('*, health_statuses(label, color)')
    .eq('asset_id', assetId)
    .order('changed_at', { ascending: false });

  const historyHtml = (history && history.length)
    ? history.map(h => `
        <div class="history-item">
          <div class="history-dot c-${h.health_statuses?.color || 'slate'}"></div>
          <div class="history-body">
            <div class="h-status">${h.health_statuses?.label || 'Unknown'}</div>
            <div class="h-date">${new Date(h.changed_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}${h.changed_by ? ' · ' + h.changed_by : ''}</div>
            ${h.note ? `<div class="h-note">${h.note}</div>` : ''}
          </div>
        </div>
      `).join('')
    : '<div class="empty-state">No status history yet.</div>';

  document.getElementById('asset-detail-body').innerHTML = `
    <div class="contract-grid" style="margin-bottom:18px;">
      <div class="contract-field"><div class="lbl">Employee</div><div class="val">${asset.employee_name || '—'}</div></div>
      <div class="contract-field"><div class="lbl">Asset / Description</div><div class="val">${asset.name}</div></div>
      <div class="contract-field"><div class="lbl">Category</div><div class="val">${asset.category}</div></div>
      <div class="contract-field"><div class="lbl">Current Status</div><div class="val">${asset.health_statuses ? `<span class="status-pill c-${asset.health_statuses.color}">${asset.health_statuses.label}</span>` : 'Not set'}</div></div>
      <div class="contract-field"><div class="lbl">Serial / Model</div><div class="val">${asset.serial_model || '—'}</div></div>
      <div class="contract-field"><div class="lbl">Location</div><div class="val">${asset.location || '—'}</div></div>
    </div>
    ${asset.notes ? `<div style="margin-bottom:18px;"><div class="contract-field"><div class="lbl">Notes</div><div class="val" style="font-weight:400;">${asset.notes}</div></div></div>` : ''}
    <div class="card-header" style="margin-top:4px;"><h2 style="font-size:14px;">Status History</h2></div>
    ${historyHtml}
  `;

  document.getElementById('asset-detail-overlay').classList.add('open');
}

function closeAssetDetail() {
  document.getElementById('asset-detail-overlay').classList.remove('open');
}

