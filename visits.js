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
// Which section names apply to each asset — defaults to CHECKLIST, but older
// reports saved under a since-removed per-category checklist keep their own
// original section names so their data still displays and edits correctly.
var reportAssetSections = {};
var reportCustomerAssets = [];
// Issue tags selected in this visit: { assetId: { section: [tagId, ...] } }
var reportIssueTags = {};
var allVisitStatuses = [];

// ═══════════════════════════════════════════════════════
//  Admin list
// ═══════════════════════════════════════════════════════
var _reportsData = [];

async function loadReportsList() {
  const tbody = document.getElementById('reports-tbody');

  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').is('customer_id', null).order('name');
  const filterSel = document.getElementById('report-customer-filter');
  const currentFilter = filterSel.value;
  filterSel.innerHTML = '<option value="">All Customers</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  filterSel.value = currentFilter;

  let query = sb.from('visit_reports')
    .select('*, profiles!visit_reports_customer_id_fkey(name), visit_report_assets(assets(name, employee_name))')
    .order('visit_date', { ascending: false });
  if (currentFilter) query = query.eq('customer_id', currentFilter);

  const { data: reports, error } = await query;
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${error.message}</td></tr>`; return; }

  _reportsData = (reports || []).map(r => ({
    ...r,
    _assetNames: (r.visit_report_assets || [])
      .map(vra => vra.assets?.employee_name || vra.assets?.name)
      .filter(Boolean).join(', ')
  }));
  renderReportsTable();
}

function renderReportsTable() {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;

  const q = document.getElementById('reports-search')?.value.trim().toLowerCase() || '';
  const rows = q
    ? _reportsData.filter(r =>
        r.visit_number.toLowerCase().includes(q) ||
        (r.profiles?.name || '').toLowerCase().includes(q) ||
        (r.engineer_name || '').toLowerCase().includes(q) ||
        r._assetNames.toLowerCase().includes(q))
    : _reportsData;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${_reportsData.length ? 'No visit reports match your search.' : 'No visit reports yet.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-weight:600;">${r.visit_number}</td>
      <td>${r.profiles?.name || '—'}</td>
      <td>${fmtDate(r.visit_date)}</td>
      <td>${r.engineer_name}</td>
      <td style="font-size:12px;color:var(--accent);font-weight:600;">${r._assetNames || '—'}</td>
      <td><span class="badge ${r.status === 'completed' ? 'active-badge' : 'pending-badge'}">${r.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditReportModal('${r.id}')">Edit</button>
          <button class="secondary" onclick="openReportDetail('${r.id}')">View</button>
          <button class="danger" onclick="deleteReport('${r.id}', '${r.visit_number.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════
//  Create modal
// ═══════════════════════════════════════════════════════
async function openCreateReportModal() {
  reportState = {};
  reportIssueTags = {};
  await fetchAllTagDefs();
  reportSectionNotes = {};
  reportAssetSections = {};
  reportCustomerAssets = [];


  document.getElementById('report-modal-title').textContent = 'New Visit Report';
  document.getElementById('rform-report-id').value = '';
  document.getElementById('report-form-error').style.display = 'none';
  document.getElementById('rform-visit-number').value = '';
  document.getElementById('rform-visit-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rform-engineer').value = myProfile?.name || '';
  document.getElementById('rform-overall-notes').value = '';
  document.getElementById('rform-assets-container').innerHTML = '<div class="empty-state">Select a customer to load their assets.</div>';

  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').is('customer_id', null).order('name');
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
  reportAssetSections = {};
  reportIssueTags = {};
  await fetchAllTagDefs();
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

  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').is('customer_id', null).order('name');
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
      vraId: vra.id,
      sectionNotes: vra.section_notes || {},
      checks: vra.visit_report_checks || []
    };
  });

  // Fetch existing issue tags for each VRA
  const vraIds = (vras || []).map(v => v.id);
  if (vraIds.length) {
    const { data: existingTags } = await sb.from('visit_issue_tags')
      .select('visit_report_asset_id, issue_tag_definitions(id, section)')
      .in('visit_report_asset_id', vraIds);

    // Build vraId → assetId map
    const vraToAsset = {};
    (vras || []).forEach(v => { vraToAsset[v.id] = v.asset_id; });

    (existingTags || []).forEach(vit => {
      const assetId = vraToAsset[vit.visit_report_asset_id];
      const tagId = vit.issue_tag_definitions?.id;
      const section = vit.issue_tag_definitions?.section;
      if (!assetId || !tagId || !section) return;
      if (!reportIssueTags[assetId]) reportIssueTags[assetId] = {};
      if (!reportIssueTags[assetId][section]) reportIssueTags[assetId][section] = [];
      if (!reportIssueTags[assetId][section].includes(tagId))
        reportIssueTags[assetId][section].push(tagId);
    });
  }

  // Initialize state — one result per section.
  // Older reports may have been saved under a different (now-removed)
  // per-category checklist, so use whichever section names the report
  // actually has saved rather than assuming today's CHECKLIST.
  assets.forEach(a => {
    const existing = existingMap[a.id];
    reportState[a.id] = {};
    reportSectionNotes[a.id] = existing?.sectionNotes || {};
    const savedSections = existing?.checks.length
      ? [...new Set(existing.checks.map(ch => ch.section))]
      : null;
    reportAssetSections[a.id] = savedSections || CHECKLIST.slice();
    reportAssetSections[a.id].forEach(s => {
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
    // Restore PASS/OK/FAIL, section notes, and issue tag checkboxes
    setTimeout(() => {
      selectedAssets.forEach(a => {
        (reportAssetSections[a.id] || CHECKLIST).forEach(s => {
          const result = reportState[a.id]?.[s];
          if (result) {
            const key = slugify(a.id + s);
            ['pass','ok','fail'].forEach(r => {
              const btn = document.getElementById(`btn-${key}-${r}`);
              if (btn) btn.className = 'result-btn' + (r === result ? ` selected-${r}` : '');
            });
            // Show issue tags wrap if result is ok or fail
            if (result === 'ok' || result === 'fail') {
              const wrap = document.getElementById(`issue-wrap-${slugify(a.id + s)}`);
              if (wrap) wrap.style.display = 'block';
            }
          }
          const noteEl = document.getElementById(`note-${slugify(a.id + s)}`);
          if (noteEl && reportSectionNotes[a.id]?.[s]) noteEl.value = reportSectionNotes[a.id][s];
        });

        // Restore tag checkboxes
        const assetTags = reportIssueTags[a.id] || {};
        Object.entries(assetTags).forEach(([section, tagIds]) => {
          tagIds.forEach(tagId => {
            const chk = document.getElementById(`itag-${slugify(a.id + tagId)}`);
            if (chk) chk.checked = true;
          });
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
      reportAssetSections[a.id] = CHECKLIST.slice();
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

      ${(reportAssetSections[a.id] || CHECKLIST).map(s => `
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
          <div id="issue-wrap-${slugify(a.id+s)}" style="display:none;">
            ${renderIssueTags(a.id, s)}
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

function onTagChange(assetId, section, tagId, checked) {
  if (!reportIssueTags[assetId]) reportIssueTags[assetId] = {};
  if (!reportIssueTags[assetId][section]) reportIssueTags[assetId][section] = [];
  if (checked) {
    if (!reportIssueTags[assetId][section].includes(tagId))
      reportIssueTags[assetId][section].push(tagId);
  } else {
    reportIssueTags[assetId][section] = reportIssueTags[assetId][section].filter(id => id !== tagId);
  }
}

function setSectionResult(assetId, section, result) {
  if (!reportState[assetId]) reportState[assetId] = {};
  reportState[assetId][section] = result;
  const key = slugify(assetId + section);
  ['pass','ok','fail'].forEach(r => {
    const btn = document.getElementById(`btn-${key}-${r}`);
    if (btn) btn.className = 'result-btn' + (r === result ? ` selected-${r}` : '');
  });
  toggleIssueTags(assetId, section, result);
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

    // One row per section (asset's own section list — preserves legacy
    // checklist names for older reports instead of overwriting them)
    const sections = reportAssetSections[asset.id] || CHECKLIST;
    const checks = sections.map(s => ({
      visit_report_asset_id: vra.id,
      section: s,
      sub_check: s,
      result: reportState[asset.id]?.[s] || null
    }));
    await sb.from('visit_report_checks').insert(checks);

    // Save issue tags (delete old first to avoid duplicates)
    const { data: existingVra } = await sb.from('visit_report_assets')
      .select('id').eq('visit_report_id', reportId).eq('asset_id', asset.id).maybeSingle();
    if (existingVra) {
      await sb.from('visit_issue_tags').delete().eq('visit_report_asset_id', existingVra.id);
    }
    await saveIssueTags(vra.id, asset.id);

    // Auto-assign status
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
async function openVisitDetail(visitNumber, customerId) {
  document.getElementById('report-detail-body').innerHTML = '<div class="empty-state">Loading…</div>';
  document.getElementById('report-detail-overlay').classList.add('open');

  // Fetch all reports with this visit number for this customer
  const { data: reports } = await sb.from('visit_reports')
    .select('*, profiles!visit_reports_customer_id_fkey(name)')
    .eq('customer_id', customerId)
    .eq('visit_number', visitNumber)
    .order('visit_date', { ascending: false });

  if (!reports?.length) {
    document.getElementById('report-detail-body').innerHTML = '<div class="empty-state">No report found.</div>';
    return;
  }

  const report = reports[0]; // Use first for header info

  // Fetch all VRAs for all reports in this visit
  const allReportIds = reports.map(r => r.id);
  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, assets(name, employee_name, category)')
    .in('visit_report_id', allReportIds);

  const { data: allChecks } = await sb.from('visit_report_checks')
    .select('*')
    .in('visit_report_asset_id', (vras || []).map(v => v.id));

  const vraIds = (vras || []).map(v => v.id);
  const tagMap = await fetchTagsForVras(vraIds);

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
    const vraTags = tagMap[vra.id] || [];
    const overall = vra.overall_status;
    const overallColor = overall === 'pass' ? '#27AE60' : overall === 'ok' ? '#D4A017' : overall === 'fail' ? '#C0392B' : '#94A3B8';
    const overallBg    = overall === 'pass' ? '#EAFAF1' : overall === 'ok' ? '#FEF9E7' : overall === 'fail' ? '#FDEDEC' : '#F8FAFC';

    html += `
      <div style="border:1.5px solid #E2E8F0;border-radius:10px;margin-bottom:14px;overflow:hidden;">

        <!-- Asset header -->
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:12px 16px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--ink);">${asset?.employee_name || asset?.name || '—'}</div>
            <div style="font-size:11.5px;color:#8A8377;margin-top:2px;">${asset?.name || ''} · ${asset?.category || ''}</div>
          </div>
          ${overall ? `<span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;
            background:${overallBg};color:${overallColor};border:1px solid ${overallColor}30;">
            ${overall.toUpperCase()}</span>` : ''}
        </div>

        <!-- Checklist sections (uses this report's own saved section names —
             older reports may use a different, now-removed checklist) -->
        <div style="padding:0 16px;">
          ${(() => {
            const reportSections = [...new Set(assetChecks.map(c => c.section))];
            return reportSections.map((s, i) => {
            const chk = assetChecks.find(c => c.section === s);
            const result = chk?.result || null;
            const note = sectionNotes[s] || chk?.notes || '';
            const sectionTags = vraTags.filter(t => t.section === s);
            if (!result) return '';
            const resultColor = result === 'pass' ? '#27AE60' : result === 'ok' ? '#D4A017' : '#C0392B';
            const resultBg    = result === 'pass' ? '#EAFAF1' : result === 'ok' ? '#FEF9E7' : '#FDEDEC';
            return `
              <div style="display:flex;align-items:flex-start;justify-content:space-between;
                padding:10px 0;${i < reportSections.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''}">
                <div style="flex:1;padding-right:12px;">
                  <div style="font-size:13px;font-weight:600;color:var(--ink);">${s}</div>
                  ${note ? `<div style="font-size:11.5px;color:#8A8377;margin-top:3px;">${note}</div>` : ''}
                  ${sectionTags.length ? `<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;">
                    ${sectionTags.map(t => `<span class="issue-tag-pill ${result === 'fail' ? 'critical' : ''}">${t.label}</span>`).join('')}
                  </div>` : ''}
                </div>
                <span style="flex-shrink:0;font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;
                  background:${resultBg};color:${resultColor};border:1px solid ${resultColor}30;white-space:nowrap;">
                  ${result.toUpperCase()}
                </span>
              </div>`;
            }).join('');
          })()}
        </div>

      </div>`;
  });

  document.getElementById('report-detail-body').innerHTML = html;
}

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

  // Fetch issue tags for this report
  const vraIds = (vras || []).map(v => v.id);
  const tagMap = await fetchTagsForVras(vraIds);

  document.getElementById('report-detail-title').textContent = `${report.visit_number} — ${fmtDate(report.visit_date)}`;

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;
      padding:16px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;">
      <div><div style="font-size:11px;font-weight:700;color:#8A8377;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Customer</div>
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);">${report.profiles?.name || '—'}</div></div>
      <div><div style="font-size:11px;font-weight:700;color:#8A8377;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Visit Number</div>
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);">${report.visit_number}</div></div>
      <div><div style="font-size:11px;font-weight:700;color:#8A8377;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Visit Date</div>
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);">${fmtDate(report.visit_date)}</div></div>
      <div><div style="font-size:11px;font-weight:700;color:#8A8377;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Engineer</div>
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);">${report.engineer_name}</div></div>
    </div>
    ${report.overall_notes ? `<div style="margin-bottom:16px;padding:12px 16px;background:#FEF9E7;border-radius:8px;border:1px solid #F0C06A;">
      <div style="font-size:11px;font-weight:700;color:#92660F;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Notes</div>
      <div style="font-size:13px;color:#7a5a0a;">${report.overall_notes}</div></div>` : ''}
  `;

  (vras || []).forEach(vra => {
    const asset = vra.assets;
    const assetChecks = (allChecks || []).filter(c => c.visit_report_asset_id === vra.id);
    const sectionNotes = vra.section_notes || {};
    const vraTags = tagMap[vra.id] || [];
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
        ${(assetChecks.length ? [...new Set(assetChecks.map(c => c.section))] : CHECKLIST).map(s => {
          const match = assetChecks.find(c => c.section === s);
          const result = match?.result || null;
          const note = sectionNotes[s];
          const sectionTags = vraTags.filter(t => t.section === s);
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
              ${sectionTags.length ? `<div style="margin-top:4px;">${renderTagPills(sectionTags, result === 'fail')}</div>` : ''}
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
