// admin.js — contracts, assets, reports, status

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
        <a class="overview-link" href="javascript:void(0)" onclick="switchCustomerTab('contract')">View full contract →</a>
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
  if (!donutEl) return;

  const TILE_STYLES = {
    'Critical':         { hex: '#C0392B', bg: '#FDEDEC' },
    'Warning':          { hex: '#D4A017', bg: '#FEF9E7' },
    'Pass':             { hex: '#27AE60', bg: '#EAFAF1' },
    'No Active Status': { hex: '#94A3B8', bg: '#F1F5F9' },
  };

  // Always show all 4 tiles, merging with actual counts
  const FIXED_ORDER = ['Critical', 'Warning', 'Pass', 'No Active Status'];
  const allCounts = {};
  FIXED_ORDER.forEach(label => {
    allCounts[label] = counts[label]?.count || 0;
  });

  // Store asset lists per status for modal

  const tiles = FIXED_ORDER.map(label => {
    const count = allCounts[label];
    const style = TILE_STYLES[label];
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    const active = count > 0 && label !== 'No Active Status';
    const hasAssets = count > 0;
    return `
      <div onclick="${hasAssets ? `openAssetHealthModal('${label}')` : ''}"
        style="
        flex: 0 0 calc(50% - 6px);
        aspect-ratio: 1;
        border-radius: 8px;
        padding: 20px;
        background: ${active ? style.bg : '#F8FAFC'};
        border: 1.5px solid ${active ? style.hex : '#E2E8F0'};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        box-sizing: border-box;
        ${hasAssets ? 'cursor:pointer;transition:opacity 0.15s;' : ''}
      " ${hasAssets ? 'onmouseover="this.style.opacity=\'0.8\'" onmouseout="this.style.opacity=\'1\'"' : ''}>
        <div style="font-size:40px;font-weight:800;color:${active ? style.hex : '#94A3B8'};line-height:1;">${count}</div>
        <div style="font-size:12px;font-weight:700;color:${active ? style.hex : '#94A3B8'};margin-top:8px;">${label}</div>
        <div style="font-size:11px;color:${active ? style.hex + 'AA' : '#B0BAC6'};margin-top:3px;">${pct}%</div>
        ${hasAssets ? `<div style="font-size:10px;color:${style.hex}99;margin-top:6px;">Tap to view →</div>` : ''}
      </div>`;
  }).join('');

  donutEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;">${tiles}</div>
    <div style="font-size:11.5px;color:#8A8377;text-align:right;">${total} assets total</div>`;
}

async function loadCustomerAssets(customerId) {
  const summaryEl = document.getElementById('asset-health-summary');
  const listEl    = document.getElementById('customer-assets-list');
  const donutEl   = document.getElementById('asset-donut-wrap');

  const [{ data: assets, error }, { data: assignments }] = await Promise.all([
    sb.from('assets').select('*').eq('customer_id', customerId).order('category').order('name'),
    sb.from('asset_status_assignments')
      .select('asset_id, asset_statuses(name, color, icon)')
      .eq('customer_id', customerId)
      .eq('is_resolved', false)
  ]);


  if (error) {
    if (listEl) listEl.innerHTML = `<div class="empty-state">Error loading assets.</div>`;
    return;
  }
  if (!assets || !assets.length) {
    if (listEl) listEl.innerHTML = `<div class="empty-state">No assets registered yet.</div>`;
    if (donutEl) donutEl.innerHTML   = `<div class="empty-state">No assets to chart yet.</div>`;
    if (summaryEl) summaryEl.innerHTML = `<div class="empty-state">No assets registered yet.</div>`;
    return;
  }

  customerAssetsCache = assets;
  const istatEl = document.getElementById('istat-assets');
  if (istatEl) istatEl.textContent = assets.length;

  const assetStatusMap = {};
  (assignments || []).forEach(a => {
    if (!assetStatusMap[a.asset_id]) assetStatusMap[a.asset_id] = [];
    if (a.asset_statuses) assetStatusMap[a.asset_id].push(a.asset_statuses);
  });

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

  window._dashHealthCounts = counts;
  // Store assets per status for the clickable health modal
  window._assetHealthGroups = {};
  Object.entries(counts).forEach(([label, data]) => {
    window._assetHealthGroups[label] = {
      ...data,
      assets: assets.filter(a => {
        const statuses = assetStatusMap[a.id] || [];
        if (label === 'No Active Status') return !statuses.length;
        return statuses.some(s => s.name === label);
      })
    };
  });
  if (donutEl) renderAssetDonut(counts, assets.length);
  if (summaryEl) summaryEl.innerHTML = Object.entries(counts).map(([label, { count, color }]) => `
    <div class="health-tile c-${color}">
      <div class="h-count">${count}</div>
      <div class="h-label">${label}</div>
    </div>
  `).join('');

  // Fetch latest visit scores for each asset
  const { data: vras } = await sb.from('visit_report_assets')
    .select('id, asset_id, overall_status, visit_report_checks(section, result), visit_reports(visit_date)')
    .in('asset_id', assets.map(a => a.id))
    .order('created_at', { ascending: false });

  // Keep only most recent vra per asset
  const latestVraMap = {};
  (vras || []).forEach(v => { if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v; });

  // Fetch issue tags for those vras
  const vraIds = Object.values(latestVraMap).map(v => v.id);
  const tagMap = vraIds.length ? await fetchTagsForVras(vraIds) : {};

  window._dashAssetResults = assets.map(a => ({
    asset: a, vra: latestVraMap[a.id], checks: latestVraMap[a.id]?.visit_report_checks || []
  }));

  const buildCards = (assetList) => {
    if (!assetList.length) return '<div class="empty-state">No assets in this group.</div>';
    return `<div class="asset-card-grid">` + assetList.map(a => {
      const statuses = assetStatusMap[a.id] || [];
      const pills = statuses.length
        ? statuses.map(s => `<span class="status-pill c-${s.color}">${t('status_' + s.name.toLowerCase()) || s.name}</span>`).join('')
        : `<span class="status-pill c-slate">${t('no_active_status')}</span>`;

      const vra = latestVraMap[a.id];
      const checks = vra?.visit_report_checks || [];
      const pass = checks.filter(c => c.result === 'pass').length;
      const ok   = checks.filter(c => c.result === 'ok').length;
      const fail = checks.filter(c => c.result === 'fail').length;
      const visitDate = vra?.visit_reports?.visit_date ? fmtDate(vra.visit_reports.visit_date) : null;

      const scoreHtml = visitDate ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;color:#8A8377;">${visitDate}</span>
          <div style="display:flex;gap:6px;">
            ${pass > 0 ? `<span style="font-size:11px;font-weight:700;color:#27AE60;">${pass} ${t('result_pass')}</span>` : ''}
            ${ok   > 0 ? `<span style="font-size:11px;font-weight:700;color:#D4A017;">${ok} ${t('result_ok')}</span>` : ''}
            ${fail > 0 ? `<span style="font-size:11px;font-weight:700;color:#C0392B;">${fail} ${t('result_fail')}</span>` : ''}
            ${pass === 0 && ok === 0 && fail === 0 ? `<span style="font-size:11px;color:#9CA3AF;">No checks</span>` : ''}
          </div>
        </div>` : `<div style="margin-top:6px;font-size:11px;color:#9CA3AF;">${t('no_visit_yet')}</div>`;

      // Issue tags grouped by section with per-section coloring
      const tags = vra ? (tagMap[vra.id] || []) : [];
      let tagsHtml = '';
      if (tags.length) {
        // Fetch checks to determine per-section result
        const sectionResultMap = {};
        if (vra?.visit_report_checks) {
          vra.visit_report_checks.forEach(c => { sectionResultMap[c.section] = c.result; });
        }
        const bySection = {};
        tags.forEach(t => { if (!bySection[t.section]) bySection[t.section] = []; bySection[t.section].push(t); });
        tagsHtml = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">` +
          Object.entries(bySection).map(([sec, stags]) => {
            // Use per-section result for color: fail=red, ok=amber, pass=green
            const secResult = sectionResultMap[sec] || 'ok';
            const isFail = secResult === 'fail';
            return `
              <div style="margin-bottom:5px;">
                <div style="font-size:10px;font-weight:700;color:#8A8377;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">${sec}</div>
                <div style="display:flex;flex-wrap:wrap;gap:3px;">
                  ${stags.map(t => `<span class="issue-tag-pill ${isFail ? 'critical' : ''}">${t.label}</span>`).join('')}
                </div>
              </div>`;
          }).join('') + `</div>`;
      }

      return `
        <div class="asset-card" onclick="openAssetDetail('${a.id}')">
          <div class="a-name">${a.employee_name || a.name}</div>
          <div class="a-meta">${a.name} · ${a.category}${a.location ? ' · ' + a.location : ''}</div>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${pills}</div>
          ${scoreHtml}
          ${tagsHtml}
        </div>`;
    }).join('') + `</div>`;
  };

  const euAssets = assets.filter(a => a.asset_group !== 'data_center');
  const dcAssets = assets.filter(a => a.asset_group === 'data_center');

  const dashEU = document.getElementById('customer-assets-list-dash-eu');
  const dashDC = document.getElementById('customer-assets-list-dash-dc');
  if (dashEU) dashEU.innerHTML = buildCards(euAssets);
  if (dashDC) dashDC.innerHTML = buildCards(dcAssets);

  // Also keep combined cache for tab list
  const assetCardsHtml = buildCards(assets);
  if (listEl) listEl.innerHTML = assetCardsHtml;
}

async function openAssetDetail(assetId) {
  const asset = customerAssetsCache.find(a => a.id === assetId);
  if (!asset) return;

  document.getElementById('asset-detail-title').textContent = asset.employee_name || asset.name;
  document.getElementById('asset-detail-body').innerHTML = '<div class="empty-state">Loading…</div>';
  document.getElementById('asset-detail-overlay').classList.add('open');

  // Fetch current status assignment
  const { data: assignments } = await sb.from('asset_status_assignments')
    .select('*, asset_statuses(name, color)')
    .eq('asset_id', assetId)
    .eq('is_resolved', false);

  // Fetch latest visit report asset
  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, visit_reports(visit_number, visit_date, engineer_name)')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(1);

  const vra = vras?.[0];

  // Fetch checks and issue tags for latest vra
  let checks = [], tags = [];
  if (vra) {
    const [{ data: chk }, tagMap] = await Promise.all([
      sb.from('visit_report_checks').select('*').eq('visit_report_asset_id', vra.id),
      fetchTagsForVras([vra.id])
    ]);
    checks = chk || [];
    tags   = tagMap[vra.id] || [];
  }

  // ── Current Status block ──
  const statusHtml = assignments?.length
    ? assignments.map(a => {
        const fixed = FIXED_STATUSES.find(f => f.id === a.asset_statuses?.id) || {};
        return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;
          background:${fixed.bg || '#F3F4F6'};border:1px solid ${fixed.hex || '#ccc'};
          font-size:13px;font-weight:700;color:${fixed.hex || '#475569'};">
          ${a.asset_statuses?.name || '—'}
        </span>`;
      }).join('')
    : `<span style="padding:5px 14px;border-radius:20px;background:#F3F4F6;font-size:13px;color:#8A8377;">No Active Status</span>`;

  // ── Visit checklist results ──
  let checklistHtml = '';
  if (vra) {
    const visit = vra.visit_reports;
    checklistHtml = `
      <div style="margin-top:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:12px;">Visit Checklist</div>
        ${CHECKLIST.map(s => {
          const match = checks.find(c => c.section === s);
          const result = match?.result || null;
          const sectionTags = tags.filter(t => t.section === s);
          const resultColor = result === 'pass' ? '#27AE60' : result === 'ok' ? '#D4A017' : result === 'fail' ? '#C0392B' : '#9CA3AF';
          const resultBg    = result === 'pass' ? '#EAFAF1' : result === 'ok' ? '#FEF9E7' : result === 'fail' ? '#FDEDEC' : '#F9FAFB';
          return `
            <div style="display:flex;flex-direction:column;gap:4px;padding:10px 0;border-bottom:1px solid var(--line);">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:13px;font-weight:600;color:var(--ink);">${s}</span>
                <span style="padding:3px 12px;border-radius:20px;font-size:11.5px;font-weight:700;
                  background:${resultBg};color:${resultColor};">
                  ${result ? result.toUpperCase() : '—'}
                </span>
              </div>
              ${sectionTags.length ? `
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">
                  ${sectionTags.map(t => `<span class="issue-tag-pill ${result === 'fail' ? 'critical' : ''}">${t.label}</span>`).join('')}
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  } else {
    checklistHtml = `<div class="empty-state" style="margin-top:16px;">No visit report recorded for this asset yet.</div>`;
  }

  document.getElementById('asset-detail-body').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:12px;color:#8A8377;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
          ${asset.name} · ${asset.category}${asset.location ? ' · ' + asset.location : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${statusHtml}
        </div>
      </div>
    </div>
    ${checklistHtml}
  `;
}

function closeAssetDetail() {
  document.getElementById('asset-detail-overlay').classList.remove('open');
}

