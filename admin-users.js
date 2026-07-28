// admin-users.js — user management, staff, view-as

// ── Admin: load & render user list ──────────────────────
// ── Admin: load & render CLIENTS list (customer role only) ──
async function loadClientsList() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;

  const [{ data: clients, error }, { data: allStaff }] = await Promise.all([
    sb.from('profiles').select('*').eq('role', 'customer').is('customer_id', null).order('name'),
    sb.from('profiles').select('customer_id').not('customer_id', 'is', null)
  ]);

  if (error) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error: ${error.message}</td></tr>`; return; }
  if (!clients || !clients.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No clients yet.</td></tr>`; return; }

  const staffCount = {};
  (allStaff || []).forEach(s => { staffCount[s.customer_id] = (staffCount[s.customer_id] || 0) + 1; });

  tbody.innerHTML = clients.map(u => `
    <tr>
      <td style="font-weight:600;">${u.name}</td>
      <td>${u.email}</td>
      <td>${u.contact_person || '—'}</td>
      <td><span class="badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditModal('${u.id}')">Edit</button>
          <button style="background:var(--accent);color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:12.5px;font-weight:600;"
            onclick="viewAsCustomer('${u.id}')">🔑 Login as Client</button>
          <button class="secondary" onclick="openStaffModal('${u.id}', '${u.name.replace(/'/g, "\'")}')">Staff ${staffCount[u.id] ? `(${staffCount[u.id]})` : ''}</button>
          <button class="secondary" onclick="triggerLogoUpload('${u.id}')">${u.logo_path ? 'Change Logo' : 'Upload Logo'}</button>
          <button class="secondary" onclick="toggleActive('${u.id}', ${u.is_active})">${u.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="danger" onclick="deleteUser('${u.id}', '${u.name.replace(/'/g, "\'")}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openCreateClientModal() {
  editingUserId = null;
  document.getElementById('modal-title').textContent = 'Add Client';
  document.getElementById('create-only-fields').style.display = 'block';
  document.getElementById('form-email').value = '';
  document.getElementById('form-name').value = '';
  document.getElementById('form-role').value = 'customer';
  document.getElementById('form-contact-person').value = '';
  document.getElementById('form-phone').value = '';
  document.getElementById('form-next-visit-date').value = '';
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('modal-overlay').classList.add('open');
}

// ── Admin: load & render USERS list (admin role only) ──
async function loadUsersList() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  const { data: users, error } = await sb.from('profiles')
    .select('*').eq('role', 'admin').order('created_at', { ascending: false });

  if (error) { tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Error: ${error.message}</td></tr>`; return; }
  if (!users || !users.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No admin users yet.</td></tr>`; return; }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:600;">${u.name}</td>
      <td>${u.email}</td>
      <td><span class="badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditModal('${u.id}')">Edit</button>
          <button class="secondary" onclick="toggleActive('${u.id}', ${u.is_active})">${u.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="danger" onclick="deleteUser('${u.id}', '${u.name.replace(/'/g, "\'")}')">Delete</button>
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
  document.getElementById('create-only-fields').style.display = 'block';
  document.getElementById('form-email').value = u.email;
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
    // ── UPDATE existing profile ──
    const newEmail = document.getElementById('form-email').value.trim();
    const { error } = await sb.from('profiles')
      .update({ name, role, email: newEmail, contact_person: contactPerson, phone, next_visit_date: nextVisitDate })
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
          email, name, role,
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


// ── Staff management ─────────────────────────────────────
var _staffCustomerId = null;
var _staffCustomerName = '';

async function openStaffModal(customerId, customerName) {
  _staffCustomerId = customerId;
  _staffCustomerName = customerName;
  document.getElementById('staff-modal-title').textContent = 'Staff — ' + customerName;
  document.getElementById('staff-new-email').value = '';
  document.getElementById('staff-add-error').style.display = 'none';
  await loadStaffList();
  document.getElementById('staff-modal-overlay').classList.add('open');
}

function closeStaffModal() {
  document.getElementById('staff-modal-overlay').classList.remove('open');
}

async function loadStaffList() {
  const el = document.getElementById('staff-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  const { data: staff } = await sb.from('profiles')
    .select('id, name, email, is_active')
    .eq('customer_id', _staffCustomerId)
    .order('created_at', { ascending: true });
  if (!staff || !staff.length) {
    el.innerHTML = '<div class="empty-state">No additional staff accounts yet.</div>';
    return;
  }
  el.innerHTML = staff.map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:10px 14px;border-radius:7px;background:var(--bg);border:1px solid var(--line);margin-bottom:8px;">
      <div>
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);">${s.email}</div>
        <div style="font-size:12px;color:#8A8377;margin-top:2px;">${s.name || '—'} · ${s.is_active ? 'Active' : 'Inactive'}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="secondary" style="padding:4px 10px;font-size:12px;"
          onclick="toggleStaffActive('${s.id}', ${s.is_active})">${s.is_active ? 'Deactivate' : 'Activate'}</button>
        <button class="danger" style="padding:4px 10px;font-size:12px;"
          onclick="deleteStaff('${s.id}')">Remove</button>
      </div>
    </div>`).join('');
}

async function addStaff() {
  const email = document.getElementById('staff-new-email').value.trim();
  const errEl = document.getElementById('staff-add-error');
  const btn   = document.getElementById('staff-add-btn');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Please enter an email address.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Adding…';
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ email, name: _staffCustomerName, role: 'customer', customer_id: _staffCustomerId, contact_person: '', phone: '' })
  });
  const result = await res.json();
  btn.disabled = false; btn.textContent = '+ Add';
  if (!res.ok) { errEl.textContent = result.error || 'Failed to add staff.'; errEl.style.display = 'block'; return; }
  document.getElementById('staff-new-email').value = '';
  await loadStaffList();
  loadUsersList();
}

async function toggleStaffActive(staffId, currentlyActive) {
  await sb.from('profiles').update({ is_active: !currentlyActive }).eq('id', staffId);
  await loadStaffList();
}

async function deleteStaff(staffId) {
  if (!confirm('Remove this staff account?')) return;
  await sb.from('profiles').delete().eq('id', staffId);
  await loadStaffList();
  loadUsersList();
}


// ── View As Customer ─────────────────────────────────────────
async function viewAsCustomer(customerId) {
  const { data: profile } = await sb.from('profiles').select('*').eq('id', customerId).single();
  if (!profile) { alert('Could not load customer profile.'); return; }

  viewAsProfile = profile;

  // Clear hero logo and name from previous customer
  const heroRight = document.getElementById('dash-hero-right');
  if (heroRight) heroRight.innerHTML = '';
  const heroName = document.getElementById('dash-hero-name');
  if (heroName) heroName.textContent = '—';
  customerAssetsCache = [];
  window._dashContracts = null;
  window._statusGroups = null;
  window._assetHealthGroups = null;
  window._dashAssetResults = null;
  window._dashSectionTotals = null;
  window._dashGrandTotals = null;
  window._criticalAssets = [];
  window._dashTagGroups = null;

  // Clear all dashboard UI panels to loading state
  const clearPanels = [
    'customer-assets-list-dash-eu','customer-assets-list-dash-dc',
    'asset-donut-wrap','customer-status-tiles','customer-issue-tags-list',
    'dash-issue-tags-panel-eu','dash-issue-tags-panel-dc',
    'visit-dates-last','visit-dates-next',
    'customer-contracts-overview','customer-subs-dash','customer-renewals-list',
  ];
  clearPanels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="empty-state">Loading…</div>';
  });

  // Clear stat card values
  ['istat-contract-days','istat-assets','istat-visits','istat-notif-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const istatContractNum = document.getElementById('istat-contract-num');
  if (istatContractNum) istatContractNum.textContent = 'Contract';
  const istatNotifSub = document.getElementById('istat-notif-sub');
  if (istatNotifSub) istatNotifSub.textContent = 'Tap to view';
  const istatNotifCard = document.getElementById('istat-notif-card');
  if (istatNotifCard) { istatNotifCard.style.background = ''; istatNotifCard.style.borderColor = ''; }
  const istatNotifIcon = document.getElementById('istat-notif-icon');
  if (istatNotifIcon) istatNotifIcon.style.background = '';

  // Clear next visit days label
  const nextVisitLabel = document.querySelector('[data-days-label]');
  if (nextVisitLabel) nextVisitLabel.remove();

  // Switch to customer view
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('customer-view').style.display = 'block';

  // Show banner
  document.getElementById('view-as-banner').style.display = 'flex';
  document.getElementById('view-as-name').textContent = profile.name;

  // Load this customer's data fresh — staggered to avoid race conditions
  const cid = getCustomerId();
  switchCustomerTab('overview');
  await renderCustomerProfile(profile);
  initLanguage(profile.language || 'en');
  loadCustomerContracts(cid);
  loadCustomerAssets(cid);
  loadCustomerReportsCount(cid);
  loadVisitDates(cid, profile.next_visit_date);
  setTimeout(() => loadCustomerSubscriptions(cid), 300);
  setTimeout(() => loadNotifications(cid), 600);
  setTimeout(() => loadDashIssueTags(cid), 900);
  setTimeout(() => loadCustomerIssueTags(cid), 1200);
}

function exitViewAs() {
  viewAsProfile = null;
  document.getElementById('view-as-banner').style.display = 'none';
  document.getElementById('customer-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'block';
  switchAdminTab('clients');
}
