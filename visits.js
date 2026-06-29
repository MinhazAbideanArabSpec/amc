// visits.js — visit reports (CHECKLIST, create, edit, save, list, detail)
// ═══════════════════════════════════════════════════════
//  VISIT REPORTS — Checklist definition
// ═══════════════════════════════════════════════════════
var CHECKLIST = [
  { section: 'System Health Check', checks: [
    'Restart PC and observe boot time performance',
    'Check disk space (C Drive must have >20% free)',
    'Monitor RAM usage via Task Manager',
    'Check CPU utilization and identify abnormal usage',
    'Verify Windows activation status'
  ]},
  { section: 'Performance Optimization', checks: [
    'Disable unnecessary startup programs',
    'Clear temp files (%temp%, temp, prefetch)',
    'Run Disk Cleanup utility',
    'Optimize browser (remove extensions, clear cache)',
    'Restart system after optimization'
  ]},
  { section: 'Security Check', checks: [
    'Ensure antivirus is installed and updated',
    'Run quick malware scan',
    'Check Windows Firewall status',
    'Install pending Windows updates'
  ]},
  { section: 'Backup Verification', checks: [
    'Confirm user data is backed up',
    'Verify server/NAS backup status and last run'
  ]},
  { section: 'Network Check', checks: [
    'Run internet speed test',
    'Check LAN/WiFi connectivity stability',
    'Test printer and shared folder access'
  ]},
  { section: 'Hardware Inspection', checks: [
    'Check for overheating and fan noise',
    'Inspect cables and connections',
    'Verify UPS condition'
  ]},
  { section: 'Compliance Check', checks: [
    'Verify TPM 2.0 availability',
    'Check Windows version',
    'Identify any pirated software'
  ]}
];

// In-memory state for the report being built
var reportState = {}; // { assetId: { section: { subcheck: result } } }
var reportSectionNotes = {}; // { assetId: { section: note } }
var reportCustomerAssets = [];

// ═══════════════════════════════════════════════════════
//  VISIT REPORTS — Admin list
// ═══════════════════════════════════════════════════════
async function loadReportsList() {
  const tbody = document.getElementById('reports-tbody');

  // Populate customer filter dropdown
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const filterSel = document.getElementById('report-customer-filter');
  const currentFilter = filterSel.value;
  filterSel.innerHTML = '<option value="">All Customers</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  filterSel.value = currentFilter;

  let query = sb.from('visit_reports')
    .select('*, profiles!visit_reports_customer_id_fkey(name)')
    .order('visit_date', { ascending: false });
  if (currentFilter) query = query.eq('customer_id', currentFilter);

  const { data: reports, error } = await query;

  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${error.message}</td></tr>`; return; }
  if (!reports.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No visit reports yet.</td></tr>`; return; }

  tbody.innerHTML = reports.map(r => `
    <tr>
      <td style="font-weight:600;">${r.visit_number}</td>
      <td>${r.profiles?.name || '—'}</td>
      <td>${fmtDate(r.visit_date)}</td>
      <td>${r.engineer_name}</td>
      <td><span class="badge ${r.status === 'completed' ? 'active-badge' : 'pending-badge'}">${r.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditReportModal('${r.id}')">Edit</button>
          <button class="secondary" onclick="openReportDetail('${r.id}')">View</button>
          <button class="danger" onclick="deleteReport('${r.id}', '${r.visit_number.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ═══════════════════════════════════════════════════════
//  VISIT REPORTS — Create modal
// ═══════════════════════════════════════════════════════
async function openCreateReportModal() {
  reportState = {};
  reportSectionNotes = {};
  reportCustomerAssets = [];

  document.getElementById('report-modal-title').textContent = 'New Visit Report';
  document.getElementById('rform-report-id').value = '';
  document.getElementById('report-form-error').style.display = 'none';
  document.getElementById('rform-visit-number').value = '';
  document.getElementById('rform-visit-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rform-engineer').value = myProfile?.name || '';
  document.getElementById('rform-overall-notes').value = '';
  document.getElementById('rform-assets-container').innerHTML = '<div class="empty-state">Select a customer to load their assets.</div>';

  // Populate customer dropdown
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('rform-customer-id');
  sel.innerHTML = '<option value="">— Select Customer —</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  document.getElementById('report-modal-overlay').classList.add('open');
}

async function openEditReportModal(reportId) {
  reportState = {};
  reportSectionNotes = {};
  reportCustomerAssets = [];

  // Fetch the report header
  const { data: report } = await sb.from('visit_reports').select('*').eq('id', reportId).single();
  if (!report) { alert('Could not load report.'); return; }

  document.getElementById('report-modal-title').textContent = 'Edit Visit Report';
  document.getElementById('rform-report-id').value = reportId;
  document.getElementById('report-form-error').style.display = 'none';
  document.getElementById('rform-visit-number').value = report.visit_number;
  document.getElementById('rform-visit-date').value = report.visit_date;
  document.getElementById('rform-engineer').value = report.engineer_name;
  document.getElementById('rform-overall-notes').value = report.overall_notes || '';
  document.getElementById('rform-assets-container').innerHTML = '<div class="empty-state">Loading assets…</div>';

  // Populate customer dropdown and lock to this customer
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('rform-customer-id');
  sel.innerHTML = '<option value="">— Select Customer —</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = report.customer_id;

  // Fetch all assets for this customer
  const { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', report.customer_id)
    .order('employee_name');

  reportCustomerAssets = assets || [];

  // Fetch existing visit_report_assets + checks for this report
  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, visit_report_checks(*)')
    .eq('visit_report_id', reportId);

  // Build a map of assetId → { sectionNotes, checks }
  const existingMap = {};
  (vras || []).forEach(vra => {
    existingMap[vra.asset_id] = {
      sectionNotes: vra.section_notes || {},
      checks: vra.visit_report_checks || []
    };
  });

  // Initialize reportState and reportSectionNotes from existing data
  assets.forEach(a => {
    const existing = existingMap[a.id];
    reportState[a.id] = {};
    reportSectionNotes[a.id] = existing?.sectionNotes || {};
    CHECKLIST.forEach(s => {
      reportState[a.id][s.section] = {};
      s.checks.forEach(c => {
        const match = existing?.checks.find(ch => ch.section === s.section && ch.sub_check === c);
        reportState[a.id][s.section][c] = match?.result || null;
      });
    });
  });

  document.getElementById('report-modal-overlay').classList.add('open');

  // Render asset selection with previously included assets pre-ticked
  const previouslyIncludedIds = new Set(Object.keys(existingMap));
  renderEditAssetSelection(assets, previouslyIncludedIds, existingMap);
}

function renderEditAssetSelection(assets, previouslyIncludedIds, existingMap) {
  const container = document.getElementById('rform-assets-container');
  container.innerHTML = `
    <div style="margin-bottom:12px;">
      <div class="report-section-title" style="margin-bottom:10px;">Select assets visited this time</div>
      ${assets.map(a => `
        <div class="report-check-row" style="padding:8px 0;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
            <input type="checkbox" id="asset-chk-${a.id}"
              ${previouslyIncludedIds.has(a.id) ? 'checked' : ''}
              onchange="onAssetSelectionChange()"
              style="width:16px;height:16px;cursor:pointer;margin-bottom:0;flex-shrink:0;"/>
            <span style="font-size:13.5px;font-weight:600;color:var(--ink);">${a.employee_name || a.name}</span>
            <span style="font-size:12px;color:#8A8377;">${a.name} · ${a.category}</span>
          </label>
        </div>
      `).join('')}
    </div>
    <div id="rform-checklists"></div>
  `;

  // Render checklists for previously included assets and restore PASS/OK/FAIL
  const selectedAssets = assets.filter(a => previouslyIncludedIds.has(a.id));
  if (selectedAssets.length) {
    renderChecklistForm(selectedAssets);
    // Restore button states after DOM is updated
    setTimeout(() => {
      selectedAssets.forEach(a => {
        CHECKLIST.forEach(s => {
          s.checks.forEach(c => {
            const result = reportState[a.id]?.[s.section]?.[c];
            if (result) {
              const key = slugify(a.id + s.section + c);
              ['pass','ok','fail'].forEach(r => {
                const btn = document.getElementById(`btn-${key}-${r}`);
                if (btn) btn.className = 'result-btn' + (r === result ? ` selected-${r}` : '');
              });
            }
          });
          // Restore section notes
          const noteEl = document.getElementById(`note-${slugify(a.id + s.section)}`);
          if (noteEl && reportSectionNotes[a.id]?.[s.section]) {
            noteEl.value = reportSectionNotes[a.id][s.section];
          }
        });
      });
    }, 50);
  }
}

async function onReportCustomerChange() {
  const customerId = document.getElementById('rform-customer-id').value;
  const container = document.getElementById('rform-assets-container');
  if (!customerId) {
    container.innerHTML = '<div class="empty-state">Select a customer to load their assets.</div>';
    return;
  }

  container.innerHTML = '<div class="empty-state">Loading assets…</div>';
  const { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', customerId)
    .order('employee_name');

  reportCustomerAssets = assets || [];
  reportState = {};
  reportSectionNotes = {};

  if (!assets || !assets.length) {
    container.innerHTML = '<div class="empty-state">This customer has no assets registered.</div>';
    return;
  }

  // Step 1: Show asset selection checkboxes
  container.innerHTML = `
    <div style="margin-bottom:12px;">
      <div class="report-section-title" style="margin-bottom:10px;">Select assets visited this time</div>
      ${assets.map(a => `
        <div class="report-check-row" style="padding:8px 0;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
            <input type="checkbox" id="asset-chk-${a.id}"
              onchange="onAssetSelectionChange()"
              style="width:16px;height:16px;cursor:pointer;margin-bottom:0;flex-shrink:0;"/>
            <span style="font-size:13.5px;font-weight:600;color:var(--ink);">${a.employee_name || a.name}</span>
            <span style="font-size:12px;color:#8A8377;">${a.name} · ${a.category}</span>
          </label>
        </div>
      `).join('')}
    </div>
    <div id="rform-checklists"></div>
  `;
}

function onAssetSelectionChange() {
  const checklistsContainer = document.getElementById('rform-checklists');
  if (!checklistsContainer) return;

  const selectedAssets = reportCustomerAssets.filter(a =>
    document.getElementById(`asset-chk-${a.id}`)?.checked
  );

  // Initialize state for newly selected assets
  selectedAssets.forEach(a => {
    if (!reportState[a.id]) {
      reportState[a.id] = {};
      reportSectionNotes[a.id] = {};
      CHECKLIST.forEach(s => {
        reportState[a.id][s.section] = {};
        s.checks.forEach(c => { reportState[a.id][s.section][c] = null; });
      });
    }
  });

  if (!selectedAssets.length) {
    checklistsContainer.innerHTML = '';
    return;
  }

  renderChecklistForm(selectedAssets);
}

function renderChecklistForm(assets) {
  const container = document.getElementById('rform-checklists');
  if (!container) return;
  container.innerHTML = assets.map(a => `
    <div class="report-asset-block" style="margin-top:6px;">
      <div class="report-asset-header">
        <h3>${a.employee_name || a.name}</h3>
        <span class="a-sub">${a.name} · ${a.category}</span>
      </div>
      ${CHECKLIST.map(s => `
        <div class="report-section-block">
          <div class="report-section-title">${s.section}</div>
          ${s.checks.map(c => `
            <div class="report-check-row">
              <span class="report-check-label">${c}</span>
              <div class="result-btns">
                <button class="result-btn" id="btn-${slugify(a.id+s.section+c)}-pass"
                  onclick="setResult('${a.id}','${s.section}','${c.replace(/'/g,"\\'")}','pass')">PASS</button>
                <button class="result-btn" id="btn-${slugify(a.id+s.section+c)}-ok"
                  onclick="setResult('${a.id}','${s.section}','${c.replace(/'/g,"\\'")}','ok')">OK</button>
                <button class="result-btn" id="btn-${slugify(a.id+s.section+c)}-fail"
                  onclick="setResult('${a.id}','${s.section}','${c.replace(/'/g,"\\'")}','fail')">FAIL</button>
              </div>
            </div>
          `).join('')}
          <div class="section-note-row">
            <input type="text" placeholder="Section note (optional)"
              id="note-${slugify(a.id+s.section)}"
              onchange="setSectionNote('${a.id}','${s.section}',this.value)"/>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function slugify(str) {
  // Simple deterministic hash to avoid collisions from truncation
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'k' + Math.abs(hash).toString(36);
}

function setResult(assetId, section, check, result) {
  if (!reportState[assetId]) reportState[assetId] = {};
  if (!reportState[assetId][section]) reportState[assetId][section] = {};
  reportState[assetId][section][check] = result;

  // Update button styles
  const key = slugify(assetId + section + check);
  ['pass','ok','fail'].forEach(r => {
    const btn = document.getElementById(`btn-${key}-${r}`);
    if (btn) {
      btn.className = 'result-btn' + (r === result ? ` selected-${r}` : '');
    }
  });
}

function setSectionNote(assetId, section, value) {
  if (!reportSectionNotes[assetId]) reportSectionNotes[assetId] = {};
  reportSectionNotes[assetId][section] = value;
}

function closeReportModal() {
  document.getElementById('report-modal-overlay').classList.remove('open');
}

async function saveVisitReport() {
  const errEl = document.getElementById('report-form-error');
  errEl.style.display = 'none';
  const saveBtn = document.getElementById('report-save-btn');
  saveBtn.disabled = true;

  const existingReportId = document.getElementById('rform-report-id').value;
  const customer_id    = document.getElementById('rform-customer-id').value;
  const visit_number   = document.getElementById('rform-visit-number').value.trim();
  const visit_date     = document.getElementById('rform-visit-date').value;
  const engineer_name  = document.getElementById('rform-engineer').value.trim();
  const overall_notes  = document.getElementById('rform-overall-notes').value.trim();

  if (!customer_id || !visit_number || !visit_date || !engineer_name) {
    errEl.textContent = 'Customer, visit number, date and engineer name are required.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }
  if (!reportCustomerAssets.length) {
    errEl.textContent = 'No assets loaded for this customer.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  const selectedAssets = reportCustomerAssets.filter(a =>
    document.getElementById(`asset-chk-${a.id}`)?.checked
  );

  if (!selectedAssets.length) {
    errEl.textContent = 'Please select at least one asset to include in this report.';
    errEl.style.display = 'block';
    saveBtn.disabled = false;
    return;
  }

  let reportId = existingReportId;

  if (existingReportId) {
    // ── EDIT MODE: update header, delete old asset/check records ──
    const { error: updateError } = await sb.from('visit_reports')
      .update({ customer_id, visit_number, visit_date, engineer_name, overall_notes, status: 'completed' })
      .eq('id', existingReportId);

    if (updateError) {
      errEl.textContent = 'Update failed: ' + updateError.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }

    // Delete existing asset rows (cascades to checks automatically)
    await sb.from('visit_report_assets').delete().eq('visit_report_id', existingReportId);

  } else {
    // ── CREATE MODE: insert new report ──
    const { data: report, error: rError } = await sb.from('visit_reports')
      .insert({ customer_id, visit_number, visit_date, engineer_name, overall_notes, status: 'completed' })
      .select().single();

    if (rError) {
      errEl.textContent = 'Failed to save report: ' + rError.message;
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      return;
    }
    reportId = report.id;
  }

  // Insert asset rows + checks (same for both create and edit)
  for (const asset of selectedAssets) {
    const section_notes = reportSectionNotes[asset.id] || {};
    const allResults = Object.values(reportState[asset.id] || {})
      .flatMap(s => Object.values(s)).filter(Boolean);
    const overall_status = allResults.includes('fail') ? 'fail'
      : allResults.includes('ok') ? 'ok'
      : allResults.length ? 'pass' : null;

    const { data: vra, error: vraError } = await sb.from('visit_report_assets')
      .insert({ visit_report_id: reportId, asset_id: asset.id, overall_status, section_notes })
      .select().single();

    if (vraError || !vra) continue;

    const checks = [];
    CHECKLIST.forEach(s => {
      s.checks.forEach(c => {
        const result = reportState[asset.id]?.[s.section]?.[c] || null;
        checks.push({ visit_report_asset_id: vra.id, section: s.section, sub_check: c, result });
      });
    });
    await sb.from('visit_report_checks').insert(checks);
  }

  saveBtn.disabled = false;
  closeReportModal();
  loadReportsList();
}

async function deleteReport(reportId, name) {
  if (!confirm(`Delete report "${name}"? This cannot be undone.`)) return;
  const { error } = await sb.from('visit_reports').delete().eq('id', reportId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadReportsList();
}

// ═══════════════════════════════════════════════════════
//  VISIT REPORTS — Detail view (admin + customer)
// ═══════════════════════════════════════════════════════
async function openReportDetail(reportId) {
  document.getElementById('report-detail-body').innerHTML = '<div class="empty-state">Loading…</div>';
  document.getElementById('report-detail-overlay').classList.add('open');

  // Fetch report header
  const { data: report } = await sb.from('visit_reports')
    .select('*, profiles!visit_reports_customer_id_fkey(name)')
    .eq('id', reportId).single();

  // Fetch all assets in this report with their checks
  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, assets(name, employee_name, category)')
    .eq('visit_report_id', reportId);

  const { data: allChecks } = await sb.from('visit_report_checks')
    .select('*')
    .in('visit_report_asset_id', (vras || []).map(v => v.id));

  document.getElementById('report-detail-title').textContent = `${report.visit_number} — ${fmtDate(report.visit_date)}`;

  // Header summary
  let html = `
    <div class="contract-grid" style="margin-bottom:18px;">
      <div class="contract-field"><div class="lbl">Customer</div><div class="val">${report.profiles?.name || '—'}</div></div>
      <div class="contract-field"><div class="lbl">Visit Number</div><div class="val">${report.visit_number}</div></div>
      <div class="contract-field"><div class="lbl">Visit Date</div><div class="val">${fmtDate(report.visit_date)}</div></div>
      <div class="contract-field"><div class="lbl">Engineer</div><div class="val">${report.engineer_name}</div></div>
    </div>
    ${report.overall_notes ? `<div style="margin-bottom:16px;"><div class="contract-field"><div class="lbl">Overall Notes</div><div class="val" style="font-weight:400;">${report.overall_notes}</div></div></div>` : ''}
  `;

  // Per-asset sections
  (vras || []).forEach(vra => {
    const asset = vra.assets;
    const assetChecks = (allChecks || []).filter(c => c.visit_report_asset_id === vra.id);
    const sectionNotes = vra.section_notes || {};

    const overallBadge = vra.overall_status
      ? `<span class="result-badge ${vra.overall_status}">${vra.overall_status.toUpperCase()}</span>`
      : `<span class="result-badge none">—</span>`;

    html += `
      <div class="report-asset-block" style="margin-bottom:14px;">
        <div class="report-asset-header" style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3>${asset?.employee_name || asset?.name || '—'}</h3>
            <span class="a-sub">${asset?.name || ''} · ${asset?.category || ''}</span>
          </div>
          ${overallBadge}
        </div>
        ${CHECKLIST.map(s => {
          const sectionChecks = assetChecks.filter(c => c.section === s.section);
          const note = sectionNotes[s.section];
          return `
            <div class="report-section-block">
              <div class="report-section-title">${s.section}</div>
              ${s.checks.map(c => {
                const match = sectionChecks.find(sc => sc.sub_check === c);
                const result = match?.result || null;
                return `
                  <div class="report-check-row">
                    <span class="report-check-label">${c}</span>
                    ${result
                      ? `<span class="result-badge ${result}">${result.toUpperCase()}</span>`
                      : `<span class="result-badge none">—</span>`
                    }
                  </div>
                `;
              }).join('')}
              ${note ? `<div style="padding:6px 0 2px; font-size:12px; color:var(--ink-soft); font-style:italic;">Note: ${note}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  });

  document.getElementById('report-detail-body').innerHTML = html;
}

function closeReportDetail() {
  document.getElementById('report-detail-overlay').classList.remove('open');
}

