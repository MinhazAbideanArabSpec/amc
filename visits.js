// visits.js — visit reports (section-level checklist, no sub-checks)

// ── 7 sections only, no sub-checks ──────────────────────────
var CHECKLIST = [
  'System Health Check',
  'Performance Optimization',
  'Security Check',
  'Backup Verification',
  'Network Check',
  'Hardware Inspection',
  'Compliance Check'
];

// In-memory state: { assetId: { sectionName: result } }
var reportState = {};
// Notes: { assetId: { sectionName: note } }
var reportSectionNotes = {};
var reportCustomerAssets = [];
// Status assignments in this visit: { assetId: { statusId: { checked: bool, note: string } } }
// All available status definitions (loaded once per modal open)
var allVisitStatuses = [];

// ═══════════════════════════════════════════════════════
//  Admin list
// ═══════════════════════════════════════════════════════
async function loadReportsList() {
  const tbody = document.getElementById('reports-tbody');

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
//  Create modal
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

  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('rform-customer-id');
  sel.innerHTML = '<option value="">— Select Customer —</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  document.getElementById('report-modal-overlay').classList.add('open');
}

// ═══════════════════════════════════════════════════════
//  Edit modal
// ═══════════════════════════════════════════════════════
async function openEditReportModal(reportId) {
  reportState = {};
  reportSectionNotes = {};
  reportCustomerAssets = [];

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

  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const sel = document.getElementById('rform-customer-id');
  sel.innerHTML = '<option value="">— Select Customer —</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = report.customer_id;

  const { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', report.customer_id)
    .order('employee_name');
  reportCustomerAssets = assets || [];

  // Fetch existing vras + checks
  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, visit_report_checks(*)')
    .eq('visit_report_id', reportId);

  const existingMap = {};
  (vras || []).forEach(vra => {
    existingMap[vra.asset_id] = {
      sectionNotes: vra.section_notes || {},
      checks: vra.visit_report_checks || []
    };
  });

  // Initialize state — one result per section
  assets.forEach(a => {
    const existing = existingMap[a.id];
    reportState[a.id] = {};
    reportSectionNotes[a.id] = existing?.sectionNotes || {};
    CHECKLIST.forEach(s => {
      const match = existing?.checks.find(ch => ch.section === s && ch.sub_check === s);
      reportState[a.id][s] = match?.result || null;
    });
  });

  document.getElementById('report-modal-overlay').classList.add('open');
  renderEditAssetSelection(assets, new Set(Object.keys(existingMap)));
}

function renderEditAssetSelection(assets, previouslyIncludedIds) {
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

  const selectedAssets = assets.filter(a => previouslyIncludedIds.has(a.id));
  if (selectedAssets.length) {
    renderChecklistForm(selectedAssets);
    // Restore PASS/OK/FAIL and section notes
    setTimeout(() => {
      selectedAssets.forEach(a => {
        CHECKLIST.forEach(s => {
          const result = reportState[a.id]?.[s];
          if (result) {
            const key = slugify(a.id + s);
            ['pass','ok','fail'].forEach(r => {
              const btn = document.getElementById(`btn-${key}-${r}`);
              if (btn) btn.className = 'result-btn' + (r === result ? ` selected-${r}` : '');
            });
          }
          const noteEl = document.getElementById(`note-${slugify(a.id + s)}`);
          if (noteEl && reportSectionNotes[a.id]?.[s]) noteEl.value = reportSectionNotes[a.id][s];
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
    .eq('customer_id', customerId).order('employee_name');

  reportCustomerAssets = assets || [];
  reportState = {};
  reportSectionNotes = {};

  if (!assets || !assets.length) {
    container.innerHTML = '<div class="empty-state">This customer has no assets registered.</div>';
    return;
  }

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
  const container = document.getElementById('rform-checklists');
  if (!container) return;

  const selectedAssets = reportCustomerAssets.filter(a =>
    document.getElementById(`asset-chk-${a.id}`)?.checked
  );

  selectedAssets.forEach(a => {
    if (!reportState[a.id]) {
      reportState[a.id] = {};
      reportSectionNotes[a.id] = {};
      CHECKLIST.forEach(s => { reportState[a.id][s] = null; });
    }
  });

  if (!selectedAssets.length) { container.innerHTML = ''; return; }
  renderChecklistForm(selectedAssets);
}

// ── Simplified: one PASS/OK/FAIL row per section ────────────
function renderChecklistForm(assets) {
  const container = document.getElementById('rform-checklists');
  if (!container) return;

  const STATUS_HEX = {
    red:'#C0392B', amber:'#92660F', blue:'#1E5F8E', purple:'#5B21B6',
    teal:'#0EA5A0', slate:'#475569', green:'#1A6B3A', orange:'#C2510E',
    pink:'#9D2C6E', brown:'#6B3A2A', navy:'#1C2F5E', lime:'#4A7A1E'
  };

  container.innerHTML = assets.map(a => `
    <div class="report-asset-block" style="margin-top:6px;">
      <div class="report-asset-header">
        <h3>${a.employee_name || a.name}</h3>
        <span class="a-sub">${a.name} · ${a.category}</span>
      </div>

      ${CHECKLIST.map(s => `
        <div class="report-section-block">
          <div class="report-check-row">
            <span class="report-check-label" style="font-weight:600;font-size:13px;">${s}</span>
            <div class="result-btns">
              <button class="result-btn" id="btn-${slugify(a.id+s)}-pass"
                onclick="setSectionResult('${a.id}','${s}','pass')">PASS</button>
              <button class="result-btn" id="btn-${slugify(a.id+s)}-ok"
                onclick="setSectionResult('${a.id}','${s}','ok')">OK</button>
              <button class="result-btn" id="btn-${slugify(a.id+s)}-fail"
                onclick="setSectionResult('${a.id}','${s}','fail')">FAIL</button>
            </div>
          </div>
          <div class="section-note-row">
            <input type="text" placeholder="Note (optional)"
              id="note-${slugify(a.id+s)}"
              onchange="setSectionNote('${a.id}','${s}',this.value)"/>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function slugify(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'k' + Math.abs(hash).toString(36);
}

function setSectionResult(assetId, section, result) {
  if (!reportState[assetId]) reportState[assetId] = {};
  reportState[assetId][section] = result;
  const key = slugify(assetId + section);
  ['pass','ok','fail'].forEach(r => {
    const btn = document.getElementById(`btn-${key}-${r}`);
    if (btn) btn.className = 'result-btn' + (r === result ? ` selected-${r}` : '');
  });
}

function setSectionNote(assetId, section, value) {
  if (!reportSectionNotes[assetId]) reportSectionNotes[assetId] = {};
  reportSectionNotes[assetId][section] = value;
}



function closeReportModal() {
  document.getElementById('report-modal-overlay').classList.remove('open');
}

// ═══════════════════════════════════════════════════════
//  Save (create + edit)
// ═══════════════════════════════════════════════════════
async function saveVisitReport() {
  const errEl = document.getElementById('report-form-error');
  errEl.style.display = 'none';
  const saveBtn = document.getElementById('report-save-btn');
  saveBtn.disabled = true;

  const existingReportId = document.getElementById('rform-report-id').value;
  const customer_id   = document.getElementById('rform-customer-id').value;
  const visit_number  = document.getElementById('rform-visit-number').value.trim();
  const visit_date    = document.getElementById('rform-visit-date').value;
  const engineer_name = document.getElementById('rform-engineer').value.trim();
  const overall_notes = document.getElementById('rform-overall-notes').value.trim();

  if (!customer_id || !visit_number || !visit_date || !engineer_name) {
    errEl.textContent = 'Customer, visit number, date and engineer name are required.';
    errEl.style.display = 'block'; saveBtn.disabled = false; return;
  }

  const selectedAssets = reportCustomerAssets.filter(a =>
    document.getElementById(`asset-chk-${a.id}`)?.checked
  );
  if (!selectedAssets.length) {
    errEl.textContent = 'Please select at least one asset.';
    errEl.style.display = 'block'; saveBtn.disabled = false; return;
  }

  let reportId = existingReportId;

  if (existingReportId) {
    const { error } = await sb.from('visit_reports')
      .update({ customer_id, visit_number, visit_date, engineer_name, overall_notes, status: 'completed' })
      .eq('id', existingReportId);
    if (error) { errEl.textContent = 'Update failed: ' + error.message; errEl.style.display = 'block'; saveBtn.disabled = false; return; }
    await sb.from('visit_report_assets').delete().eq('visit_report_id', existingReportId);
  } else {
    const { data: report, error } = await sb.from('visit_reports')
      .insert({ customer_id, visit_number, visit_date, engineer_name, overall_notes, status: 'completed' })
      .select().single();
    if (error) { errEl.textContent = 'Failed: ' + error.message; errEl.style.display = 'block'; saveBtn.disabled = false; return; }
    reportId = report.id;
  }

  for (const asset of selectedAssets) {
    const section_notes = reportSectionNotes[asset.id] || {};
    const results = Object.values(reportState[asset.id] || {}).filter(Boolean);
    const overall_status = results.includes('fail') ? 'fail'
      : results.includes('ok') ? 'ok'
      : results.length ? 'pass' : null;

    const { data: vra, error: vraError } = await sb.from('visit_report_assets')
      .insert({ visit_report_id: reportId, asset_id: asset.id, overall_status, section_notes })
      .select().single();
    if (vraError || !vra) continue;

    // One row per section
    const checks = CHECKLIST.map(s => ({
      visit_report_asset_id: vra.id,
      section: s,
      sub_check: s,
      result: reportState[asset.id]?.[s] || null
    }));
    await sb.from('visit_report_checks').insert(checks);

    // ── Auto-assign status based on section results ──────
    await autoAssignStatus(asset.id, customer_id, reportState[asset.id] || {});
  }

  saveBtn.disabled = false;
  closeReportModal();
  loadReportsList();
}

// ── Auto-assign status rules ─────────────────────────────────
// Critical-rule sections: any FAIL → Critical
// Warning-rule sections: any FAIL → Warning (only if no Critical)
// All results non-fail → Pass
const CRITICAL_SECTIONS = [
  'System Health Check',
  'Security Check',
  'Backup Verification',
  'Network Check',
  'Hardware Inspection',
  'Compliance Check'
];
const WARNING_SECTIONS = [
  'Performance Optimization'
];

async function autoAssignStatus(assetId, customerId, sectionResults) {
  // Determine the highest severity status
  let targetStatusId = null;

  const hasCriticalFail = CRITICAL_SECTIONS.some(s => sectionResults[s] === 'fail');
  const hasWarningFail  = WARNING_SECTIONS.some(s => sectionResults[s] === 'fail');
  const allResults = Object.values(sectionResults).filter(Boolean);
  const allPass = allResults.length > 0 && allResults.every(r => r === 'pass' || r === 'ok');

  if (hasCriticalFail) {
    targetStatusId = '00000000-0000-0000-0000-000000000001'; // Critical
  } else if (hasWarningFail) {
    targetStatusId = '00000000-0000-0000-0000-000000000002'; // Warning
  } else if (allPass) {
    targetStatusId = '00000000-0000-0000-0000-000000000003'; // Pass
  }

  if (!targetStatusId) return;

  // Resolve all existing active status assignments for this asset
  await sb.from('asset_status_assignments')
    .update({ is_resolved: true, resolved_at: new Date().toISOString() })
    .eq('asset_id', assetId)
    .eq('is_resolved', false);

  // Insert or reopen the new status assignment
  const { data: existing } = await sb.from('asset_status_assignments')
    .select('id')
    .eq('asset_id', assetId)
    .eq('status_id', targetStatusId)
    .maybeSingle();

  if (existing) {
    await sb.from('asset_status_assignments')
      .update({ is_resolved: false, resolved_at: null, notes: 'Auto-assigned from visit report' })
      .eq('id', existing.id);
  } else {
    await sb.from('asset_status_assignments')
      .insert({
        asset_id: assetId,
        status_id: targetStatusId,
        customer_id: customerId,
        is_resolved: false,
        notes: 'Auto-assigned from visit report'
      });
  }
}

async function deleteReport(reportId, name) {
  if (!confirm(`Delete report "${name}"? This cannot be undone.`)) return;
  const { error } = await sb.from('visit_reports').delete().eq('id', reportId);
  if (error) { alert('Failed: ' + error.message); return; }
  loadReportsList();
}

// ═══════════════════════════════════════════════════════
//  Detail view (admin + customer)
// ═══════════════════════════════════════════════════════
async function openReportDetail(reportId) {
  document.getElementById('report-detail-body').innerHTML = '<div class="empty-state">Loading…</div>';
  document.getElementById('report-detail-overlay').classList.add('open');

  const { data: report } = await sb.from('visit_reports')
    .select('*, profiles!visit_reports_customer_id_fkey(name)')
    .eq('id', reportId).single();

  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, assets(name, employee_name, category)')
    .eq('visit_report_id', reportId);

  const { data: allChecks } = await sb.from('visit_report_checks')
    .select('*')
    .in('visit_report_asset_id', (vras || []).map(v => v.id));

  document.getElementById('report-detail-title').textContent = `${report.visit_number} — ${fmtDate(report.visit_date)}`;

  let html = `
    <div class="contract-grid" style="margin-bottom:18px;">
      <div class="contract-field"><div class="lbl">Customer</div><div class="val">${report.profiles?.name || '—'}</div></div>
      <div class="contract-field"><div class="lbl">Visit Number</div><div class="val">${report.visit_number}</div></div>
      <div class="contract-field"><div class="lbl">Visit Date</div><div class="val">${fmtDate(report.visit_date)}</div></div>
      <div class="contract-field"><div class="lbl">Engineer</div><div class="val">${report.engineer_name}</div></div>
    </div>
    ${report.overall_notes ? `<div style="margin-bottom:16px;"><div class="contract-field"><div class="lbl">Overall Notes</div><div class="val" style="font-weight:400;">${report.overall_notes}</div></div></div>` : ''}
  `;

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
          // Find result for this section
          const match = assetChecks.find(c => c.section === s);
          const result = match?.result || null;
          const note = sectionNotes[s];
          return `
            <div class="report-section-block">
              <div class="report-check-row">
                <span class="report-check-label" style="font-weight:600;font-size:13px;">${s}</span>
                ${result
                  ? `<span class="result-badge ${result}">${result.toUpperCase()}</span>`
                  : `<span class="result-badge none">—</span>`
                }
              </div>
              ${note ? `<div style="padding:4px 0 2px;font-size:12px;color:var(--ink-soft);font-style:italic;">Note: ${note}</div>` : ''}
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
