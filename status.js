// status.js — fixed 3-status system: Critical, Warning, Pass

var FIXED_STATUSES = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Critical', color: 'red',   hex: '#C0392B', bg: '#FDEDEC' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Warning',  color: 'amber', hex: '#D4A017', bg: '#FEF9E7' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Pass',     color: 'sage',  hex: '#27AE60', bg: '#EAFAF1' }
];

var STATUS_COLORS = {
  red:   { hex: '#C0392B', bg: '#FDEDEC' },
  amber: { hex: '#D4A017', bg: '#FEF9E7' },
  sage:  { hex: '#27AE60', bg: '#EAFAF1' },
};

var COLOR_HEX = {
  red: '#C0392B', amber: '#D4A017', sage: '#27AE60',
  slate: '#94A3B8', blue: '#1E5F8E', purple: '#5B21B6',
  teal: '#0EA5A0', green: '#27AE60', orange: '#C2510E',
  pink: '#9D2C6E', brown: '#6B3A2A', navy: '#1C2F5E', lime: '#4A7A1E'
};

// Stubs kept for compatibility
var ICON_LIBRARY = {};
var allStatusDefs = FIXED_STATUSES;
var selectedStatusColor = 'red';
var selectedStatusIcon = null;
function iconSvg() { return ''; }
function renderIconPicker() {}
function selectStatusIcon() {}
function openCreateStatusModal() {}
function closeStatusModal() {}
function saveStatus() {}
function deleteStatusDef() {}
function openEditStatusModal() {}

// ── Admin Status Tab ─────────────────────────────────────────
async function loadStatusTab() {
  const el = document.getElementById('status-definitions-list');
  if (el) {
    el.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
        ${FIXED_STATUSES.map(s => `
          <div style="display:flex;align-items:center;gap:8px;padding:12px 20px;border:1.5px solid ${s.hex};border-radius:8px;background:${s.bg};">
            <div style="width:12px;height:12px;border-radius:50%;background:${s.hex};"></div>
            <span style="font-weight:700;color:${s.hex};font-size:13px;">${s.name}</span>
          </div>
        `).join('')}
      </div>
      <p style="font-size:12.5px;color:#8A8377;margin-top:8px;">
        Statuses are automatically assigned based on visit report results.
      </p>
    `;
  }
}

// ── Customer dashboard status tiles ─────────────────────────
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
    const statEl = document.getElementById('istat-statuses');
    if (statEl) statEl.textContent = 0;
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
                    FIXED_STATUSES.find(f => f.name === g.status.name) ||
                    { hex: '#475569', color: 'slate' };
      const icon = g.status.name === 'Critical'
        ? `<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`
        : g.status.name === 'Warning'
        ? `<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        : `<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      return `
        <div class="status-tile c-${fixed.color}"
          onclick="openStatusDetail('${g.status.id}','${g.status.name.replace(/'/g,"\\'")}')">
          <div class="st-tile-head">
            <div class="st-icon" style="background:${fixed.hex};">${icon}</div>
            <div class="st-count">${g.assets.length}</div>
          </div>
          <div class="st-name">${g.status.name}</div>
          <div class="st-click">Click to view assets →</div>
        </div>`;
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
