// status.js — fixed 3-status system: Critical, Warning, Pass

var FIXED_STATUSES = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Critical', color: 'red',   hex: '#C0392B', bg: '#FDEDEC' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Warning',  color: 'amber', hex: '#D4A017', bg: '#FEF9E7' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Pass',     color: 'sage',  hex: '#27AE60', bg: '#EAFAF1' }
];

// STATUS_COLORS used by other files
var STATUS_COLORS = {
  red:    { hex: '#C0392B', bg: '#FDEDEC' },
  amber:  { hex: '#D4A017', bg: '#FEF9E7' },
  sage:   { hex: '#27AE60', bg: '#EAFAF1' },
};

var COLOR_HEX = {
  red: '#C0392B', amber: '#D4A017', sage: '#27AE60',
  slate: '#94A3B8', blue: '#1E5F8E', purple: '#5B21B6',
  teal: '#0EA5A0', green: '#27AE60', orange: '#C2510E',
  pink: '#9D2C6E', brown: '#6B3A2A', navy: '#1C2F5E', lime: '#4A7A1E'
};

var ICON_LIBRARY = {};
function iconSvg() { return ''; }
function renderIconPicker() {}
function selectStatusIcon() {}

// ── Admin Status Tab ─────────────────────────────────────────
async function loadStatusTab() {
  const el = document.getElementById('status-definitions-list');
  if (el) {
    el.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
        ${FIXED_STATUSES.map(s => `
          <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid ${s.hex};border-radius:6px;background:${s.bg};">
            <div style="width:12px;height:12px;border-radius:50%;background:${s.hex};"></div>
            <span style="font-weight:700;color:${s.hex};font-size:13px;">${s.name}</span>
          </div>
        `).join('')}
      </div>
      <p style="font-size:12.5px;color:#8A8377;margin-top:4px;">These three statuses are fixed and cannot be changed.</p>
    `;
  }

  // Populate customer dropdown for assignment
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').order('name');
  const custSel = document.getElementById('assign-customer-id');
  if (custSel) {
    custSel.innerHTML = '<option value="">— Select Customer —</option>' +
      (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  const statusSel = document.getElementById('assign-status-id');
  if (statusSel) {
    statusSel.innerHTML = '<option value="">— Select Status —</option>' +
      FIXED_STATUSES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
}

// Stub functions no longer needed but may be called from HTML
function openCreateStatusModal() {}
function closeStatusModal() {}
function saveStatus() {}
function deleteStatusDef() {}
function openEditStatusModal() {}
var selectedStatusColor = 'red';
var selectedStatusIcon = null;
var allStatusDefs = FIXED_STATUSES;

async function onAssignStatusChange() { await loadAssignmentList(); }
async function onAssignCustomerChange() { await loadAssignmentList(); }

async function loadAssignmentList() {
  const statusId   = document.getElementById('assign-status-id')?.value;
  const customerId = document.getElementById('assign-customer-id')?.value;
  const el = document.getElementById('assign-assets-list');
  if (!el) return;

  if (!statusId || !customerId) {
    el.innerHTML = '<div class="empty-state">Select a status and customer to manage assignments.</div>';
    return;
  }

  const { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', customerId).order('employee_name');

  const { data: assignments } = await sb.from('asset_status_assignments')
    .select('*').eq('status_id', statusId).eq('customer_id', customerId);

  if (!assets || !assets.length) {
    el.innerHTML = '<div class="empty-state">This customer has no assets.</div>';
    return;
  }

  const assignMap = {};
  (assignments || []).forEach(a => { assignMap[a.asset_id] = a; });

  el.innerHTML = assets.map(a => {
    const asgn = assignMap[a.id];
    const isAssigned = !!asgn && !asgn.is_resolved;
    const isResolved = !!asgn && asgn.is_resolved;
    return `
      <div class="assign-asset-row">
        <div class="assign-asset-left">
          <input type="checkbox" ${isAssigned ? 'checked' : ''} ${isResolved ? 'disabled' : ''}
            onchange="toggleAssetAssignment('${a.id}','${statusId}','${customerId}',this.checked)"
            style="width:16px;height:16px;cursor:pointer;margin-bottom:0;flex-shrink:0;"/>
          <div>
            <div class="assign-asset-name">${a.employee_name || a.name}</div>
            <div class="assign-asset-sub">${a.name} · ${a.category}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:flex-end;">
          ${(isAssigned || isResolved) ? `
            <input type="text" id="note-${a.id}"
              placeholder="Add note…"
              value="${(asgn?.notes || '').replace(/"/g,'&quot;')}"
              ${isResolved ? 'disabled' : ''}
              onblur="saveAssignmentNote('${asgn.id}', this.value)"
              style="width:200px;margin-bottom:0;font-size:12.5px;padding:6px 10px;"/>
          ` : ''}
          ${isResolved ? `<span class="resolved-tag">Resolved</span>` : ''}
          ${asgn ? `<button class="secondary" style="padding:4px 10px;font-size:12px;"
            onclick="toggleResolve('${asgn.id}',${asgn.is_resolved},'${statusId}','${customerId}')">
            ${isResolved ? 'Reopen' : 'Resolve'}</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function toggleAssetAssignment(assetId, statusId, customerId, checked) {
  if (checked) {
    const { data: existing } = await sb.from('asset_status_assignments')
      .select('id, is_resolved').eq('asset_id', assetId).eq('status_id', statusId).maybeSingle();
    if (existing) {
      await sb.from('asset_status_assignments').update({ is_resolved: false, resolved_at: null }).eq('id', existing.id);
    } else {
      await sb.from('asset_status_assignments').insert({ asset_id: assetId, status_id: statusId, customer_id: customerId });
    }
  } else {
    await sb.from('asset_status_assignments').delete().eq('asset_id', assetId).eq('status_id', statusId);
  }
  await loadAssignmentList();
}

async function toggleResolve(assignmentId, currentlyResolved, statusId, customerId) {
  if (currentlyResolved) {
    await sb.from('asset_status_assignments').update({ is_resolved: false, resolved_at: null }).eq('id', assignmentId);
  } else {
    await sb.from('asset_status_assignments').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', assignmentId);
  }
  await loadAssignmentList();
}

async function saveAssignmentNote(assignmentId, note) {
  await sb.from('asset_status_assignments').update({ notes: note || null }).eq('id', assignmentId);
}

// ── Customer dashboard tiles ─────────────────────────────────
async function loadCustomerStatuses(customerId) {
  const el = document.getElementById('customer-status-tiles');
  if (!el) return;

  const { data: assignments, error } = await sb.from('asset_status_assignments')
    .select('*, asset_statuses(id, name, color), assets(name, employee_name, category)')
    .eq('customer_id', customerId)
    .eq('is_resolved', false);

  if (error) { el.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }
  if (!assignments || !assignments.length) {
    el.innerHTML = `<div class="empty-state">No active statuses assigned to your assets.</div>`;
    return;
  }

  // Group by status
  const groups = {};
  assignments.forEach(a => {
    const sid = a.asset_statuses?.id;
    if (!sid) return;
    if (!groups[sid]) groups[sid] = { status: a.asset_statuses, assets: [] };
    groups[sid].assets.push({ ...a.assets, notes: a.notes });
  });

  const statEl = document.getElementById('istat-statuses');
  if (statEl) statEl.textContent = Object.keys(groups).length;

  el.innerHTML = `<div class="status-tile-grid">` +
    Object.values(groups).map(g => {
      const fixed = FIXED_STATUSES.find(f => f.id === g.status.id) ||
                    FIXED_STATUSES.find(f => f.name === g.status.name) || {};
      return `
        <div class="status-tile c-${g.status.color || fixed.color}"
          onclick="openStatusDetail('${g.status.id}','${g.status.name.replace(/'/g,"\\'")}')">
          <div class="st-tile-head">
            <div class="st-icon" style="background:${fixed.hex || '#475569'};">
              ${g.status.name === 'Critical' ? '<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>'
              : g.status.name === 'Warning' ? '<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
              : '<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'}
            </div>
            <div class="st-count">${g.assets.length}</div>
          </div>
          <div class="st-name">${g.status.name}</div>
          <div class="st-click">Click to view assets →</div>
        </div>
      `;
    }).join('') + `</div>`;

  window._statusGroups = groups;
}

function openStatusDetail(statusId, statusName) {
  const group = window._statusGroups?.[statusId];
  if (!group) return;
  document.getElementById('status-detail-title').textContent = statusName;
  document.getElementById('status-detail-body').innerHTML = group.assets.length
    ? group.assets.map(a => `
        <div class="status-asset-row" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
          <div>
            <div class="sa-name">${a?.employee_name || a?.name || '—'}</div>
            <div class="sa-sub">${a?.name || ''} · ${a?.category || ''}</div>
          </div>
          ${a?.notes ? `<div style="font-size:12.5px;color:var(--ink-soft);text-align:right;max-width:55%;line-height:1.4;">${a.notes}</div>` : ''}
        </div>`).join('')
    : '<div class="empty-state">No assets.</div>';
  document.getElementById('status-detail-overlay').classList.add('open');
}
