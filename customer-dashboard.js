// customer-dashboard.js — dashboard sections

// ── Retry utility: retries a fn up to maxTries on error/empty ──
async function withRetry(fn, elId, maxTries = 2, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      if (attempt === maxTries) {
        // Show retry button on the element if provided
        const el = elId ? document.getElementById(elId) : null;
        if (el && el.innerHTML.includes('Loading')) {
          el.innerHTML = `<div class="empty-state" style="display:flex;flex-direction:column;align-items:center;gap:8px;">
            <span>Failed to load.</span>
            <button class="secondary" style="padding:4px 14px;font-size:12px;" onclick="this.closest('.empty-state').innerHTML='Loading…';${fn.toString().startsWith('async') ? fn.name + '()' : ''}">↻ Retry</button>
          </div>`;
        }
        console.error('withRetry failed after', maxTries, 'attempts:', err);
      } else {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
}

// ── Safe Supabase query: auto-retries once on network error ──
async function sbQuery(queryFn) {
  try {
    const result = await queryFn();
    if (result.error) throw new Error(result.error.message);
    return result;
  } catch (err) {
    // Wait 1.5s and try once more
    await new Promise(r => setTimeout(r, 1500));
    const result = await queryFn();
    if (result.error) throw new Error(result.error.message);
    return result;
  }
}

// customer.js — customer dashboard, statuses, visit scores, visit dates

// ── Dash Issue Tags tab toggle ───────────────────────────────
// ═══════════════════════════════════════════════════════
//  VISIT REPORTS — Customer view
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  VISIT DASHBOARD — Section scores + per-asset cards
// ═══════════════════════════════════════════════════════
function openSectionDetailModal(section, overallLabel) {
  const RESULT_STYLE = {
    pass: { hex: '#27AE60', bg: '#EAFAF1', label: 'Pass' },
    ok:   { hex: '#D4A017', bg: '#FEF9E7', label: 'OK' },
    fail: { hex: '#C0392B', bg: '#FDEDEC', label: 'Fail' },
  };

  const assetResults = window._dashAssetResults || [];
  const withData = assetResults.filter(r => r.checks?.length);

  document.getElementById('section-detail-modal-title').textContent = section;

  // Group by result
  const groups = { fail: [], ok: [], pass: [], none: [] };
  withData.forEach(({ asset, checks }) => {
    const match = checks.find(c => c.section === section);
    const result = match?.result || 'none';
    groups[result].push(asset);
  });

  const body = document.getElementById('section-detail-modal-body');
  if (!withData.length) {
    body.innerHTML = '<div class="empty-state">No visit data yet.</div>';
  } else {
    body.innerHTML = ['fail','ok','pass'].map(result => {
      const assets = groups[result];
      if (!assets.length) return '';
      const s = RESULT_STYLE[result];
      return `
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
            color:${s.hex};margin-bottom:8px;">${s.label} (${assets.length})</div>
          ${assets.map(a => `
            <div style="display:flex;align-items:center;justify-content:space-between;
              padding:9px 12px;border-radius:7px;background:${s.bg};
              border:1px solid ${s.hex}25;margin-bottom:6px;">
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--ink);">${a?.employee_name || a?.name || '—'}</div>
                <div style="font-size:11.5px;color:#8A8377;margin-top:1px;">${a?.name || ''} · ${a?.category || ''}</div>
              </div>
              <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;
                background:${s.hex};color:#fff;">${s.label}</span>
            </div>`).join('')}
        </div>`;
    }).join('') + (groups.none.length ? `
      <div style="margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;margin-bottom:8px;">Not Checked (${groups.none.length})</div>
        ${groups.none.map(a => `
          <div style="padding:9px 12px;border-radius:7px;background:#F8FAFC;border:1px solid #E2E8F0;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:700;color:#94A3B8;">${a?.employee_name || a?.name || '—'}</div>
            <div style="font-size:11.5px;color:#B0BAC6;margin-top:1px;">${a?.name || ''} · ${a?.category || ''}</div>
          </div>`).join('')}
      </div>` : '');
  }
  document.getElementById('section-detail-modal-overlay').classList.add('open');
}

function openAssetHealthModal(label) {
  const TILE_STYLES = {
    'Critical':         { hex: '#C0392B', bg: '#FDEDEC' },
    'Warning':          { hex: '#D4A017', bg: '#FEF9E7' },
    'Pass':             { hex: '#27AE60', bg: '#EAFAF1' },
    'No Active Status': { hex: '#94A3B8', bg: '#F8FAFC' },
  };
  const style = TILE_STYLES[label] || { hex: '#94A3B8', bg: '#F8FAFC' };
  const displayAssets = window._assetHealthGroups?.[label]?.assets || [];

  document.getElementById('asset-health-modal-title').textContent = label;
  document.getElementById('asset-health-modal-title').style.color = style.hex;

  const body = document.getElementById('asset-health-modal-body');
  if (!displayAssets.length) {
    body.innerHTML = '<div class="empty-state">No assets in this status.</div>';
  } else {
    body.innerHTML = displayAssets.map(a => `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 14px;border-radius:8px;background:${style.bg};
        border:1px solid ${style.hex}30;margin-bottom:8px;">
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);">${a?.employee_name || a?.name || '—'}</div>
          <div style="font-size:12px;color:#8A8377;margin-top:2px;">${a?.name || ''} · ${a?.category || ''}</div>
        </div>
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;
          background:${style.hex};color:#fff;">${label}</span>
      </div>`).join('');
  }
  document.getElementById('asset-health-modal-overlay').classList.add('open');
}

async function loadVisitDashboard(customerId) {
  const sectionEl = document.getElementById('visit-section-summary');
  const metaEl    = document.getElementById('visit-summary-meta');
  const cardsEl   = document.getElementById('visit-asset-cards'); // may be null

  // Fetch all assets for this customer
  let { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', customerId)
    .order('employee_name');

  // Retry once if null (flaky connection)
  if (!assets) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: assets } = await sb.from('assets')
      .select('id, name, employee_name, category')
      .eq('customer_id', customerId)
      .order('employee_name'));
  }

  if (!assets || !assets.length) {
    if (sectionEl) sectionEl.innerHTML = '<div class="empty-state">No assets registered yet.</div>';
    if (cardsEl)   cardsEl.innerHTML   = '<div class="empty-state">No assets registered yet.</div>';
    return;
  }

  // Batch fetch: all VRAs for these assets in ONE query, then all checks in ONE query
  const assetIds = assets.map(a => a.id);

  const { data: allVras } = await sb.from('visit_report_assets')
    .select('id, asset_id, overall_status, visit_report_id, visit_reports(visit_number, visit_date)')
    .in('asset_id', assetIds)
    .order('created_at', { ascending: false });

  // Keep only the most recent VRA per asset
  const latestVraMap = {};
  (allVras || []).forEach(v => {
    if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v;
  });
  const activeVraIds = Object.values(latestVraMap).map(v => v.id);

  // Batch fetch all checks for those VRAs in ONE query
  const { data: allChecks } = activeVraIds.length
    ? await sb.from('visit_report_checks')
        .select('visit_report_asset_id, section, sub_check, result')
        .in('visit_report_asset_id', activeVraIds)
    : { data: [] };

  const checksByVra = {};
  (allChecks || []).forEach(c => {
    if (!checksByVra[c.visit_report_asset_id]) checksByVra[c.visit_report_asset_id] = [];
    checksByVra[c.visit_report_asset_id].push(c);
  });

  const assetResults = assets.map(a => {
    const vra = latestVraMap[a.id] || null;
    const checks = vra ? (checksByVra[vra.id] || []) : [];
    return { asset: a, vra, checks };
  });

  // ── Section scores (aggregate across all assets' most recent visits) ──
  const SECTION_NAMES = CHECKLIST; // now a flat array of section name strings
  const sectionTotals = {};
  SECTION_NAMES.forEach(s => { sectionTotals[s] = { pass: 0, ok: 0, fail: 0, total: 0 }; });

  let grandPass = 0, grandOk = 0, grandFail = 0;

  assetResults.forEach(({ checks }) => {
    checks.forEach(c => {
      if (!c.result || !sectionTotals[c.section]) return;
      sectionTotals[c.section][c.result]++;
      sectionTotals[c.section].total++;
      if (c.result === 'pass') grandPass++;
      else if (c.result === 'ok') grandOk++;
      else if (c.result === 'fail') grandFail++;
    });
  });

  // Cache for PDF generation
  window._dashSectionTotals = sectionTotals;
  window._dashGrandTotals = { pass: grandPass, ok: grandOk, fail: grandFail };
  window._dashAssetResults = assetResults;

  const grandTotal = grandPass + grandOk + grandFail;
  if (metaEl) metaEl.textContent = grandTotal ? `${grandTotal} total checks across all assets` : '';

  // Render section scorecard grid
  if (grandTotal === 0) {
    if (sectionEl) sectionEl.innerHTML = `<div class="empty-state">${t('no_visit_data')}</div>`;
  } else {
    // Overall summary row at top
    const overallColor = grandFail > 0 ? '#C0392B' : grandOk > 0 ? '#D4A017' : '#27AE60';
    const overallBg    = grandFail > 0 ? '#FDEDEC'  : grandOk > 0 ? '#FEF9E7'  : '#EAFAF1';
    const overallLabel = grandFail > 0 ? t('result_fail') : grandOk > 0 ? t('result_ok') : t('result_pass');

    if (sectionEl) sectionEl.innerHTML = `
      <!-- Overall summary pill -->
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 14px;border-radius:8px;background:${overallBg};
        border:1.5px solid ${overallColor}30;margin-bottom:14px;">
        <span style="font-size:13px;font-weight:700;color:${overallColor};">
          ${t('overall_total')}
        </span>
        <div style="display:flex;gap:14px;font-size:12px;font-weight:700;">
          <span style="color:#27AE60;">${grandPass} ${t('result_pass')}</span>
          <span style="color:#D4A017;">${grandOk} ${t('result_ok')}</span>
          <span style="color:#C0392B;">${grandFail} ${t('result_fail')}</span>
        </div>
      </div>

      <!-- Section scorecard grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${SECTION_NAMES.map(s => {
          const sec = sectionTotals[s];
          const noData = sec.total === 0;
          const secColor = noData ? '#94A3B8' : sec.fail > 0 ? '#C0392B' : sec.ok > 0 ? '#D4A017' : '#27AE60';
          const secBg    = noData ? '#F8FAFC'  : sec.fail > 0 ? '#FDEDEC'  : sec.ok > 0 ? '#FEF9E7'  : '#EAFAF1';
          const secLabel = noData ? '—' : sec.fail > 0 ? t('result_fail') : sec.ok > 0 ? t('result_ok') : t('result_pass');
          const sName = tSection ? tSection(s) : s;
          return `
            <div onclick="openSectionDetailModal('${s.replace(/'/g,"\\'")}','${secLabel}')"
              style="border-radius:8px;padding:10px 12px;background:${secBg};border:1px solid ${secColor}25;cursor:${noData ? 'default' : 'pointer'};transition:opacity 0.15s;"
              onmouseover="this.style.opacity='${noData ? '1' : '0.8'}'" onmouseout="this.style.opacity='1'">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:11.5px;font-weight:700;color:var(--ink);">${sName}</span>
                <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;
                  background:${secColor};color:#fff;">${secLabel}</span>
              </div>
              ${noData
                ? `<span style="font-size:11px;color:#94A3B8;">No data</span>`
                : `<div style="display:flex;gap:8px;font-size:11px;font-weight:600;">
                    <span style="color:#27AE60;">${sec.pass} Pass</span>
                    <span style="color:#D4A017;">${sec.ok} OK</span>
                    <span style="color:#C0392B;">${sec.fail} Fail</span>
                  </div>
                  <div style="display:flex;gap:2px;margin-top:5px;height:4px;border-radius:2px;overflow:hidden;">
                    ${sec.pass ? `<div style="flex:${sec.pass};background:#27AE60;"></div>` : ''}
                    ${sec.ok   ? `<div style="flex:${sec.ok};background:#D4A017;"></div>` : ''}
                    ${sec.fail ? `<div style="flex:${sec.fail};background:#C0392B;"></div>` : ''}
                  </div>`
              }
            </div>`;
        }).join('')}
      </div>`;
  }

  // ── Per-asset score cards ──
  if (cardsEl) cardsEl.innerHTML = `<div class="visit-asset-grid">` +
    assetResults.map(({ asset: a, vra, checks }) => {
      if (!vra) return `
        <div class="visit-asset-card no-report">
          <div class="va-name">${a.employee_name || a.name}</div>
          <div class="va-sub">${a.name} · ${a.category}</div>
          <div class="va-date" style="font-style:italic;">No visit report yet</div>
        </div>`;

      const pass = checks.filter(c => c.result === 'pass').length;
      const ok   = checks.filter(c => c.result === 'ok').length;
      const fail = checks.filter(c => c.result === 'fail').length;
      const total = pass + ok + fail;
      const visitDate = vra.visit_reports?.visit_date ? fmtDate(vra.visit_reports.visit_date) : '—';
      const visitNum  = vra.visit_reports?.visit_number || '—';

      return `
        <div class="visit-asset-card">
          <div class="va-name">${a.employee_name || a.name}</div>
          <div class="va-sub">${a.name} · ${a.category}</div>
          <div class="va-date">${visitNum} · ${visitDate}</div>
          <div class="va-counts">
            <span class="va-count pass">${pass} Pass</span>
            <span class="va-count ok">${ok} OK</span>
            <span class="va-count fail">${fail} Fail</span>
          </div>
          ${total > 0 ? `
          <div class="va-bar">
            ${pass ? `<div class="score-bar-seg pass" style="width:${(pass/total*100).toFixed(1)}%"></div>` : ''}
            ${ok   ? `<div class="score-bar-seg ok"   style="width:${(ok/total*100).toFixed(1)}%"></div>` : ''}
            ${fail ? `<div class="score-bar-seg fail" style="width:${(fail/total*100).toFixed(1)}%"></div>` : ''}
          </div>` : ''}
        </div>`;
    }).join('') + `</div>`;
}

// ═══════════════════════════════════════════════════════
//  STATUS — Admin
// ═══════════════════════════════════════════════════════
var selectedStatusColor = 'slate';
var selectedStatusIcon = null;
var allStatusDefs = [];

var STATUS_COLORS = {
  red:    { hex: '#C0392B', bg: '#FDEDEC' },
  amber:  { hex: '#92660F', bg: '#FAF1E0' },
  blue:   { hex: '#1E5F8E', bg: '#E6F0F8' },
  purple: { hex: '#5B21B6', bg: '#EDE9FE' },
  teal:   { hex: '#0EA5A0', bg: '#E0F7F6' },
  slate:  { hex: '#475569', bg: '#EEF0F2' },
  green:  { hex: '#1A6B3A', bg: '#E4F3EB' },
  orange: { hex: '#C2510E', bg: '#FDF0E8' },
  pink:   { hex: '#9D2C6E', bg: '#F9E8F3' },
  brown:  { hex: '#6B3A2A', bg: '#F2EAE6' },
  navy:   { hex: '#1C2F5E', bg: '#E5E9F4' },
  lime:   { hex: '#4A7A1E', bg: '#EBF4E0' }
};

// ── Icon master library: 50 professional stroke icons ──
// Each value is the inner SVG markup for a 24×24 stroke icon.
var ICON_LIBRARY = {
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  memory: '<rect x="2" y="7" width="20" height="10" rx="1"/><line x1="6" y1="17" x2="6" y2="20"/><line x1="10" y1="17" x2="10" y2="20"/><line x1="14" y1="17" x2="14" y2="20"/><line x1="18" y1="17" x2="18" y2="20"/><line x1="7" y1="11" x2="7" y2="13"/><line x1="12" y1="11" x2="12" y2="13"/><line x1="17" y1="11" x2="17" y2="13"/>',
  harddrive: '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  shieldalert: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  shieldcheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/>',
  bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2"/><path d="M5 7l3 2"/><path d="M19 16l-3-2"/><path d="M5 16l3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/>',
  alerttriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  alertcircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  checkcircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  xcircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  network: '<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  battery: '<rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="13" x2="23" y2="11"/>',
  batterylow: '<rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="13" x2="23" y2="11"/><line x1="4" y1="9" x2="4" y2="15"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  barchart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  trendingup: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  trendingdown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
};

function iconSvg(key, size = 16) {
  const inner = ICON_LIBRARY[key];
  if (!inner) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function renderIconPicker() {
  const picker = document.getElementById('sform-icon-picker');
  if (!picker) return;
  picker.innerHTML = Object.keys(ICON_LIBRARY).map(key => `
    <button type="button" class="icon-pick-btn ${key === selectedStatusIcon ? 'selected' : ''}"
      data-icon="${key}" title="${key}" onclick="selectStatusIcon('${key}')">
      ${iconSvg(key, 18)}
    </button>
  `).join('');
}

function selectStatusIcon(key) {
  selectedStatusIcon = key;
  document.querySelectorAll('.icon-pick-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.icon === key));
}

async function loadStatusTab() {
  await loadStatusDefinitions();
  // Populate dropdowns for assignment section (admin only — guard against null)
  const custSel = document.getElementById('assign-customer-id');
  const statusSel = document.getElementById('assign-status-id');
  if (!custSel || !statusSel) return;
  const { data: customers } = await sb.from('profiles').select('id, name').eq('role', 'customer').is('customer_id', null).order('name');
  custSel.innerHTML = '<option value="">— Select Customer —</option>' +
    (customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  statusSel.innerHTML = '<option value="">— Select Status —</option>' +
    allStatusDefs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function loadStatusDefinitions() {
  const { data: statuses, error } = await sb.from('asset_statuses').select('*').order('name');
  allStatusDefs = statuses || [];
  const el = document.getElementById('status-definitions-list');
  if (error) { el.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }
  if (!statuses.length) { el.innerHTML = `<div class="empty-state">No statuses yet. Create one above.</div>`; return; }
  el.innerHTML = `<div class="status-def-grid">` + statuses.map(s => `
    <div class="status-def-card">
      <div class="status-def-top">
        <div class="status-icon-badge" style="background:${STATUS_COLORS[s.color]?.hex || '#475569'};">
          ${iconSvg(s.icon || 'alerttriangle', 16)}
        </div>
        <div>
          <div class="status-def-name">${s.name}</div>
          ${s.description ? `<div class="status-def-desc">${s.description}</div>` : ''}
        </div>
      </div>
      <div class="status-def-actions">
        <button class="secondary" onclick="openEditStatusModal('${s.id}','${s.name.replace(/'/g,"\\'")}','${s.color}','${(s.description||'').replace(/'/g,"\\'")}','${s.icon||'alerttriangle'}')">Edit</button>
        <button class="danger" onclick="deleteStatusDef('${s.id}','${s.name.replace(/'/g,"\\'")}')">Delete</button>
      </div>
    </div>
  `).join('') + `</div>`;
}

function selectStatusColor(color) {
  selectedStatusColor = color;
  document.querySelectorAll('.color-btn').forEach(b => b.classList.toggle('selected', b.dataset.color === color));
}

function openCreateStatusModal() {
  selectedStatusColor = 'slate';
  selectedStatusIcon = 'alerttriangle';
  document.getElementById('sform-id').value = '';
  document.getElementById('sform-name').value = '';
  document.getElementById('sform-description').value = '';
  document.getElementById('status-form-error').style.display = 'none';
  document.getElementById('status-modal-title').textContent = 'Add Status';
  document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector('.color-btn[data-color="slate"]').classList.add('selected');
  renderIconPicker();
  document.getElementById('status-modal-overlay').classList.add('open');
}

function openEditStatusModal(id, name, color, description, icon) {
  selectedStatusColor = color;
  selectedStatusIcon = icon || 'alerttriangle';
  document.getElementById('sform-id').value = id;
  document.getElementById('sform-name').value = name;
  document.getElementById('sform-description').value = description;
  document.getElementById('status-form-error').style.display = 'none';
  document.getElementById('status-modal-title').textContent = 'Edit Status';
  document.querySelectorAll('.color-btn').forEach(b => b.classList.toggle('selected', b.dataset.color === color));
  renderIconPicker();
  document.getElementById('status-modal-overlay').classList.add('open');
}

function closeStatusModal() {
  document.getElementById('status-modal-overlay').classList.remove('open');
}

async function saveStatus() {
  const errEl = document.getElementById('status-form-error');
  errEl.style.display = 'none';
  const id   = document.getElementById('sform-id').value;
  const name = document.getElementById('sform-name').value.trim();
  const description = document.getElementById('sform-description').value.trim();
  if (!name) { errEl.textContent = 'Status name is required.'; errEl.style.display = 'block'; return; }

  const payload = { name, color: selectedStatusColor, icon: selectedStatusIcon, description: description || null };

  if (id) {
    const { error } = await sb.from('asset_statuses').update(payload).eq('id', id);
    if (error) { errEl.textContent = 'Failed: ' + error.message; errEl.style.display = 'block'; return; }
  } else {
    const { error } = await sb.from('asset_statuses').insert(payload);
    if (error) { errEl.textContent = 'Failed: ' + error.message; errEl.style.display = 'block'; return; }
  }

  closeStatusModal();
  await loadStatusDefinitions();
  document.getElementById('assign-status-id').innerHTML = '<option value="">— Select Status —</option>' +
    allStatusDefs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function deleteStatusDef(id, name) {
  if (!confirm(`Delete status "${name}"? All assignments to this status will also be removed.`)) return;
  const { error } = await sb.from('asset_statuses').delete().eq('id', id);
  if (error) { alert('Failed: ' + error.message); return; }
  await loadStatusDefinitions();
}

async function onAssignStatusChange() { await loadAssignmentList(); }
async function onAssignCustomerChange() { await loadAssignmentList(); }

async function loadAssignmentList() {
  const statusId   = document.getElementById('assign-status-id').value;
  const customerId = document.getElementById('assign-customer-id').value;
  const el = document.getElementById('assign-assets-list');

  if (!statusId || !customerId) {
    el.innerHTML = '<div class="empty-state">Select a status and customer to manage assignments.</div>';
    return;
  }

  // Fetch all assets for this customer
  const { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', customerId).order('employee_name');

  // Fetch existing assignments for this status + customer
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
    // Check if a resolved record exists — if so, reopen it
    const { data: existing } = await sb.from('asset_status_assignments')
      .select('id, is_resolved').eq('asset_id', assetId).eq('status_id', statusId).single();
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

// ═══════════════════════════════════════════════════════
//  STATUS — Customer dashboard tiles
// ═══════════════════════════════════════════════════════
async function loadCustomerStatuses(customerId) {
  const el = document.getElementById('customer-status-tiles');
  if (!el) return;

  // Get all active (unresolved) assignments for this customer with status info + asset info + notes
  let { data: assignments, error } = await sb.from('asset_status_assignments')
    .select('*, asset_statuses(id, name, color, icon), assets(name, employee_name, category)')
    .eq('customer_id', customerId)
    .eq('is_resolved', false);

  // Retry once if null (flaky connection)
  if (!assignments && !error) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: assignments, error } = await sb.from('asset_status_assignments')
      .select('*, asset_statuses(id, name, color, icon), assets(name, employee_name, category)')
      .eq('customer_id', customerId)
      .eq('is_resolved', false));
  }

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
    Object.values(groups).map(g => `
      <div class="status-tile c-${g.status.color}" onclick="openStatusDetail('${g.status.id}','${g.status.name.replace(/'/g,"\\'")}')">
        <div class="st-tile-head">
          <div class="st-icon" style="background:${STATUS_COLORS[g.status.color]?.hex || '#475569'};">
            ${iconSvg(g.status.icon || 'alerttriangle', 16)}
          </div>
          <div class="st-count">${g.assets.length}</div>
        </div>
        <div class="st-name">${g.status.name}</div>
        <div class="st-click">Click to view assets →</div>
      </div>
    `).join('') + `</div>`;

  // Store for detail modal
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

// ── Per-group tab loader (End User / Data Center) ────────────
async function loadGroupAssets(group, customerId) {
  if (!customerId) return;
  const isEU = group === 'end_user';
  const prefix = isEU ? 'eu' : 'dc';
  const listEl   = document.getElementById(isEU ? 'customer-assets-list' : 'dc-assets-list');
  const healthEl = document.getElementById(`${prefix}-health-summary`);
  const statusEl = document.getElementById(`${prefix}-status-tiles`);
  const tagsEl   = document.getElementById(`${prefix}-issue-tags`);

  // Fetch assets for this group
  let { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category, location, serial_model')
    .eq('customer_id', customerId)
    .eq('asset_group', group)
    .order('employee_name');
  // Retry once if null (flaky connection)
  if (!assets) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: assets } = await sb.from('assets')
      .select('id, name, employee_name, category, location, serial_model')
      .eq('customer_id', customerId)
      .eq('asset_group', group)
      .order('employee_name'));
  }

  if (!assets || !assets.length) {
    const msg = `<div class="empty-state">No ${isEU ? 'end user' : 'data center'} assets registered.</div>`;
    if (listEl)   listEl.innerHTML   = msg;
    if (healthEl) healthEl.innerHTML = msg;
    if (statusEl) statusEl.innerHTML = msg;
    if (tagsEl)   tagsEl.innerHTML   = msg;
    return;
  }

  const assetIds = assets.map(a => a.id);

  // ── Asset Health Breakdown ──
  const { data: assignments } = await sb.from('asset_status_assignments')
    .select('asset_id, asset_statuses(id, name, color)')
    .eq('customer_id', customerId)
    .eq('is_resolved', false)
    .in('asset_id', assetIds);

  const assetStatusMap = {};
  (assignments || []).forEach(a => {
    if (!assetStatusMap[a.asset_id]) assetStatusMap[a.asset_id] = [];
    assetStatusMap[a.asset_id].push(a.asset_statuses);
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

  if (healthEl) {
    const maxCount = Math.max(...Object.values(counts).map(c => c.count), 1);
    healthEl.innerHTML = `
      <div class="asset-bar-total">${assets.length} <span class="asset-bar-total-label">assets</span></div>
      ${Object.entries(counts).sort((a,b) => b[1].count - a[1].count).map(([label, { count, color }]) => {
        const pct = (count / maxCount * 100).toFixed(1);
        const hex = COLOR_HEX[color] || '#94A3B8';
        return `
          <div class="asset-bar-row">
            <div class="asset-bar-label">${label.length > 22 ? label.substring(0,22)+'…' : label}</div>
            <div class="asset-bar-track"><div class="asset-bar-fill" style="width:${pct}%;background:${hex};"></div></div>
            <div class="asset-bar-count">${count}</div>
          </div>`;
      }).join('')}`;
  }

  // ── Status tiles ──
  if (statusEl) {
    const groups = {};
    (assignments || []).forEach(a => {
      const sid = a.asset_statuses?.id;
      if (!sid) return;
      if (!groups[sid]) groups[sid] = { status: a.asset_statuses, assets: [] };
      const asset = assets.find(x => x.id === a.asset_id);
      if (asset) groups[sid].assets.push(asset);
    });

    if (!Object.keys(groups).length) {
      statusEl.innerHTML = '<div class="empty-state">No active statuses.</div>';
    } else {
      statusEl.innerHTML = `<div class="status-tile-grid">` +
        Object.values(groups).map(g => {
          const fixed = FIXED_STATUSES.find(f => f.id === g.status.id) || { hex: '#475569', color: 'slate' };
          return `
            <div class="status-tile c-${fixed.color}">
              <div class="st-tile-head">
                <div class="st-icon" style="background:${fixed.hex};">
                  ${g.status.name === 'Critical' ? '<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>'
                  : g.status.name === 'Warning' ? '<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
                  : '<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'}
                </div>
                <div class="st-count">${g.assets.length}</div>
              </div>
              <div class="st-name">${g.status.name}</div>
              <div style="font-size:11px;color:rgba(0,0,0,0.4);margin-top:2px;">${g.assets.map(a => a.employee_name || a.name).join(', ')}</div>
            </div>`;
        }).join('') + `</div>`;
    }
  }

  // ── Issue Tags ──
  if (tagsEl) {
    const { data: vras } = await sb.from('visit_report_assets')
      .select('id, asset_id, overall_status')
      .in('asset_id', assetIds)
      .order('created_at', { ascending: false });

    const latestVraMap = {};
    (vras || []).forEach(v => { if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v; });
    const vraIds = Object.values(latestVraMap).map(v => v.id);
    const tagMap = vraIds.length ? await fetchTagsForVras(vraIds) : {};
    const assetsWithTags = assets.filter(a => latestVraMap[a.id] && tagMap[latestVraMap[a.id].id]?.length);

    if (!assetsWithTags.length) {
      tagsEl.innerHTML = '<div class="empty-state">No asset summary data yet.</div>';
    } else {
      tagsEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">` +
        assetsWithTags.map(a => {
          const vra = latestVraMap[a.id];
          const tags = tagMap[vra.id] || [];
          const isCrit = vra.overall_status === 'fail';
          const bySection = {};
          tags.forEach(t => { if (!bySection[t.section]) bySection[t.section] = []; bySection[t.section].push(t); });
          return `
            <div class="asset-tag-card" style="border-left:3px solid ${isCrit ? '#C0392B' : '#D4A017'};">
              <div class="asset-tag-card-header">
                <span class="asset-tag-name">${a.employee_name || a.name}</span>
                <span class="asset-tag-meta">${a.name} · ${a.category}</span>
              </div>
              ${Object.entries(bySection).map(([sec, stags]) => `
                <div class="asset-tag-section">
                  <div class="asset-tag-section-label">${sec}</div>
                  <div>${stags.map(t => `<span class="issue-tag-pill ${isCrit ? 'critical' : ''}">${t.label}</span>`).join('')}</div>
                </div>`).join('')}
            </div>`;
        }).join('') + `</div>`;
    }
  }

  // ── Asset table list ──
  const groupLabel = isEU ? 'End User' : 'Data Center';
  const assetTableHtml = `
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Asset</th>
          <th>Category</th>
          <th>Serial / Model</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        ${assets.map(a => `
          <tr style="cursor:pointer;" onclick="openAssetDetail('${a.id}')">
            <td style="font-weight:600;">${a.employee_name || '—'}</td>
            <td style="color:var(--ink-soft);">${a.name}</td>
            <td>${a.category}</td>
            <td style="color:#8A8377;">${a.serial_model || '—'}</td>
            <td style="color:#8A8377;">${a.location || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  if (listEl) listEl.innerHTML = assetTableHtml;
}

async function loadCustomerIssueTags(customerId) {
  const el = document.getElementById('customer-issue-tags-list');
  if (!el) return;

  // Get all assets for this customer
  let { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category')
    .eq('customer_id', customerId)
    .order('employee_name');
  if (!assets) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: assets } = await sb.from('assets')
      .select('id, name, employee_name, category')
      .eq('customer_id', customerId)
      .order('employee_name'));
  }
  if (!assets || !assets.length) {
    el.innerHTML = '<div class="empty-state">No assets registered.</div>';
    return;
  }

  // Get the most recent visit_report_asset for each asset
  const { data: vras } = await sb.from('visit_report_assets')
    .select('id, asset_id, overall_status')
    .in('asset_id', assets.map(a => a.id))
    .order('created_at', { ascending: false });

  // Keep latest vra per asset
  const latestVraMap = {};
  (vras || []).forEach(v => {
    if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v;
  });

  const vraIds = Object.values(latestVraMap).map(v => v.id);
  if (!vraIds.length) {
    el.innerHTML = '<div class="empty-state">No visit data yet.</div>';
    return;
  }

  // Fetch issue tags for these vras
  const tagMap = await fetchTagsForVras(vraIds);

  // Only show assets that have tags
  const assetsWithTags = assets.filter(a => {
    const vra = latestVraMap[a.id];
    return vra && tagMap[vra.id]?.length;
  });

  if (!assetsWithTags.length) {
    el.innerHTML = '<div class="empty-state">No asset summary data yet.</div>';
    return;
  }

  // Group tags by section per asset
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">` +
    assetsWithTags.map(a => {
      const vra = latestVraMap[a.id];
      const tags = tagMap[vra.id] || [];
      const isCritical = vra.overall_status === 'fail';

      // Group by section
      const bySection = {};
      tags.forEach(t => {
        if (!bySection[t.section]) bySection[t.section] = [];
        bySection[t.section].push(t);
      });

      const borderColor = isCritical ? '#C0392B' : '#D4A017';

      return `
        <div class="asset-tag-card" style="border-left: 3px solid ${borderColor};">
          <div class="asset-tag-card-header">
            <span class="asset-tag-name">${a.employee_name || a.name}</span>
            <span class="asset-tag-meta">${a.name} · ${a.category}</span>
          </div>
          ${Object.entries(bySection).map(([section, stags]) => `
            <div class="asset-tag-section">
              <div class="asset-tag-section-label">${section}</div>
              <div>${stags.map(t =>
                `<span class="issue-tag-pill ${isCritical ? 'critical' : ''}">${t.label}</span>`
              ).join('')}</div>
            </div>
          `).join('')}
        </div>`;
    }).join('') + `</div>`;
}

async function loadVisitDates(customerId, nextVisitDate, _isRetry = false) {
  // Last visit — most recent completed visit report
  let { data: reports } = await sb.from('visit_reports')
    .select('visit_date')
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .order('visit_date', { ascending: false })
    .limit(1);
  if (!reports) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: reports } = await sb.from('visit_reports')
      .select('visit_date')
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .order('visit_date', { ascending: false })
      .limit(1));
  }

  const lastDate = reports?.[0]?.visit_date;
  const lastEl = document.getElementById('visit-last-date');
  const nextEl = document.getElementById('visit-next-date');

  if (lastEl) lastEl.textContent = lastDate ? fmtDate(lastDate) : t('visit_no_visits');
  if (nextEl) {
    if (nextVisitDate) {
      // Use KSA midnight for accurate day countdown
      const ksaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
      ksaNow.setHours(0, 0, 0, 0);
      const nextDate = new Date(nextVisitDate + 'T00:00:00+03:00');
      const days = Math.round((nextDate - ksaNow) / 86400000);
      const daysLabel = days < 0 ? t('visit_overdue') : days === 0 ? t('visit_today') : '(' + t('visit_in_days').replace('{n}', days) + ')';
      nextEl.textContent = fmtDate(nextVisitDate);
      // Remove any previously inserted days label
      const existingLabel = nextEl.nextElementSibling;
      if (existingLabel && existingLabel.dataset.daysLabel) existingLabel.remove();
      const labelDiv = document.createElement('div');
      labelDiv.dataset.daysLabel = '1';
      labelDiv.style.cssText = `font-size:11.5px;color:${days < 0 ? 'var(--rust)' : days <= 14 ? 'var(--amber)' : '#8A8377'};margin-top:2px;`;
      labelDiv.textContent = daysLabel;
      nextEl.insertAdjacentElement('afterend', labelDiv);
    } else {
      nextEl.textContent = t('visit_not_scheduled');
    }
  }
}

// ── Renewals tab loader ──────────────────────────────────────
async function loadCustomerRenewalsTab(customerId) {
  const el = document.getElementById('customer-renewals-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading…</div>';

  let { data: subs, error } = await sb.from('subscriptions')
    .select('*').eq('customer_id', customerId).order('end_date', { ascending: true });
  if (!subs && !error) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: subs, error } = await sb.from('subscriptions')
      .select('*').eq('customer_id', customerId).order('end_date', { ascending: true }));
  }
  if (error || !subs || !subs.length) {
    el.innerHTML = '<div class="empty-state">No renewals found.</div>';
    return;
  }
  const expiring = subs.filter(s => subStatus(s.end_date).cls === 'expiring');
  const active   = subs.filter(s => subStatus(s.end_date).cls === 'active');
  const expired  = subs.filter(s => subStatus(s.end_date).cls === 'expired');
  let html = '';
  if (expiring.length) {
    html += `<div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">⚠ Expiring Soon (${expiring.length})</div>`;
    html += `<div class="sub-grid" style="margin-bottom:20px;">` + expiring.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
  }
  if (active.length) {
    html += `<div style="font-size:11px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Active (${active.length})</div>`;
    html += `<div class="sub-grid" style="margin-bottom:20px;">` + active.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
  }
  if (expired.length) {
    html += `<div style="font-size:11px;font-weight:700;color:var(--rust);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Expired (${expired.length})</div>`;
    html += `<div class="sub-grid">` + expired.map(s => subCardHtml(s, false, false)).join('') + `</div>`;
  }
  el.innerHTML = html;
}

async function loadNotifications(customerId, _retry = false) {
  const card    = document.getElementById('istat-notif-card');
  const icon    = document.getElementById('istat-notif-icon');
  const countEl = document.getElementById('istat-notif-count');
  const subEl   = document.getElementById('istat-notif-sub');

  // Fetch all unresolved critical assignments
  let { data: criticals } = await sb.from('asset_status_assignments')
    .select('*, assets(id, name, employee_name, category), asset_statuses(name, color)')
    .eq('customer_id', customerId)
    .eq('status_id', '00000000-0000-0000-0000-000000000001')
    .eq('is_resolved', false);
  if (!criticals) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: criticals } = await sb.from('asset_status_assignments')
      .select('*, assets(id, name, employee_name, category), asset_statuses(name, color)')
      .eq('customer_id', customerId)
      .eq('status_id', '00000000-0000-0000-0000-000000000001')
      .eq('is_resolved', false));
  }

  const count = criticals?.length || 0;
  if (countEl) countEl.textContent = count;

  if (count > 0) {
    if (card) { card.style.background = 'rgba(192,57,43,0.25)'; card.style.borderColor = 'rgba(192,57,43,0.5)'; }
    if (icon) icon.style.background = 'rgba(192,57,43,0.5)';
    if (subEl) subEl.textContent = count === 1 ? t('notif_critical').replace('{n}', count) : t('notif_criticals').replace('{n}', count);
  } else {
    if (card) { card.style.background = ''; card.style.borderColor = ''; }
    if (icon) icon.style.background = '';
    if (subEl) subEl.textContent = t('notif_all_clear');
  }

  // For each critical asset, fetch latest visit report checks
  if (criticals?.length) {
    const assetIds = criticals.map(c => c.assets?.id).filter(Boolean);
    // Get the most recent visit_report_asset for each asset
    const { data: latestVras } = await sb.from('visit_report_assets')
      .select('id, asset_id, visit_reports(visit_date)')
      .in('asset_id', assetIds)
      .order('created_at', { ascending: false });

    // Keep only the most recent vra per asset
    const latestVraMap = {};
    (latestVras || []).forEach(v => {
      if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v;
    });

    // Fetch checks for those vras
    const vraIds = Object.values(latestVraMap).map(v => v.id);
    let checkMap = {};
    if (vraIds.length) {
      const { data: checks } = await sb.from('visit_report_checks')
        .select('*')
        .in('visit_report_asset_id', vraIds)
        .eq('result', 'fail');
      (checks || []).forEach(c => {
        const assetId = Object.keys(latestVraMap).find(id => latestVraMap[id].id === c.visit_report_asset_id);
        if (assetId) {
          if (!checkMap[assetId]) checkMap[assetId] = [];
          checkMap[assetId].push(c.section);
        }
      });
    }
    window._criticalAssets = criticals.map(c => ({
      ...c,
      failedSections: checkMap[c.assets?.id] || []
    }));
  } else {
    window._criticalAssets = [];
  }
}

function openNotificationsModal() {
  const criticals = window._criticalAssets || [];
  const body = document.getElementById('notif-modal-body');
  if (!body) return;

  if (!criticals.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:32px;margin-bottom:8px;">✅</div>
        <div style="font-size:15px;font-weight:600;color:var(--ink);">All Clear</div>
        <div style="font-size:13px;color:#8A8377;margin-top:4px;">No critical assets at this time.</div>
      </div>`;
  } else {
    body.innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--rust);font-weight:600;">
        ⚠ ${criticals.length} Critical Asset${criticals.length > 1 ? 's' : ''} Require Attention
      </div>
      ${criticals.map(a => `
        <div style="padding:14px;border-radius:8px;background:#FDEDEC;border:1px solid #f5b7b1;margin-bottom:10px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:8px;">
            <div>
              <div style="font-size:13.5px;font-weight:700;color:#C0392B;">
                ${a.assets?.employee_name || a.assets?.name || '—'}
              </div>
              <div style="font-size:12px;color:#8A8377;margin-top:2px;">
                ${a.assets?.name || ''} · ${a.assets?.category || ''}
              </div>
            </div>
            <span style="flex-shrink:0;padding:3px 10px;border-radius:20px;
              background:#C0392B;color:#fff;font-size:11px;font-weight:700;">CRITICAL</span>
          </div>
          ${a.failedSections?.length ? `
            <div style="margin-top:6px;">
              <div style="font-size:11px;font-weight:700;color:#922B21;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">Failed Checks</div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;">
                ${a.failedSections.map(s => `
                  <span style="padding:2px 9px;border-radius:4px;background:#C0392B;color:#fff;font-size:11px;font-weight:600;">${s}</span>
                `).join('')}
              </div>
            </div>
          ` : a.notes ? `
            <div style="font-size:12.5px;color:#922B21;margin-top:6px;font-style:italic;">${a.notes}</div>
          ` : ''}
        </div>
      `).join('')}`;
  }

  document.getElementById('notif-modal-overlay').classList.add('open');
}

async function loadCustomerReportsCount(customerId) {
  const load = async () => {
    const { data, error } = await sb.from('visit_reports')
      .select('visit_number')
      .eq('customer_id', customerId)
      .eq('status', 'completed');
    if (error) throw error;
    const uniqueVisits = new Set((data || []).map(r => r.visit_number)).size;
    const el = document.getElementById('istat-visits');
    if (el) el.textContent = uniqueVisits || 0;
  };
  try { await load(); } catch(e) {
    setTimeout(async () => { try { await load(); } catch(e2) {} }, 2000);
  }
}

async function loadDashIssueTags(customerId) {
  const euEl = document.getElementById('dash-issue-tags-panel-eu');
  const dcEl = document.getElementById('dash-issue-tags-panel-dc');
  if (!euEl && !dcEl) return;

  // Get all assets for this customer with asset_group
  let { data: assets } = await sb.from('assets')
    .select('id, name, employee_name, category, asset_group')
    .eq('customer_id', customerId);
  if (!assets) {
    await new Promise(r => setTimeout(r, 1500));
    ({ data: assets } = await sb.from('assets')
      .select('id, name, employee_name, category, asset_group')
      .eq('customer_id', customerId));
  }
  if (!assets?.length) {
    if (euEl) euEl.innerHTML = '<div class="empty-state">No assets.</div>';
    if (dcEl) dcEl.innerHTML = '<div class="empty-state">No assets.</div>';
    return;
  }

  // Get latest VRA per asset
  const { data: vras } = await sb.from('visit_report_assets')
    .select('id, asset_id')
    .in('asset_id', assets.map(a => a.id))
    .order('created_at', { ascending: false });
  const latestVraMap = {};
  (vras || []).forEach(v => { if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v; });
  const vraIds = Object.values(latestVraMap).map(v => v.id);
  if (!vraIds.length) {
    if (euEl) euEl.innerHTML = '<div class="empty-state">No visit data yet.</div>';
    if (dcEl) dcEl.innerHTML = '<div class="empty-state">No visit data yet.</div>';
    return;
  }

  // Fetch all issue tags for these VRAs
  const { data: vitags } = await sb.from('visit_issue_tags')
    .select('visit_report_asset_id, issue_tag_definitions(id, label, label_ar, section)')
    .in('visit_report_asset_id', vraIds);

  // Build tag groups
  const assetMap = {};
  assets.forEach(a => { assetMap[a.id] = a; });
  const vraToAsset = {};
  Object.entries(latestVraMap).forEach(([assetId, vra]) => { vraToAsset[vra.id] = assetId; });

  const tagGroups = {};
  (vitags || []).forEach(vit => {
    const tagDef = vit.issue_tag_definitions;
    if (!tagDef) return;
    const assetId = vraToAsset[vit.visit_report_asset_id];
    const asset = assetMap[assetId];
    if (!asset) return;
    if (!tagGroups[tagDef.id]) tagGroups[tagDef.id] = { label: tagDef.label, label_ar: tagDef.label_ar, section: tagDef.section, assets: [], assetGroups: new Set() };
    if (!tagGroups[tagDef.id].assets.find(a => a.id === asset.id)) {
      tagGroups[tagDef.id].assets.push(asset);
      tagGroups[tagDef.id].assetGroups.add(asset.asset_group);
    }
  });

  window._dashTagGroups = tagGroups;

  // Split by asset_group
  function renderTagPanel(groupFilter) {
    const filtered = Object.entries(tagGroups).filter(([, t]) => t.assetGroups.has(groupFilter));
    if (!filtered.length) return '<div class="empty-state">No asset summary data yet.</div>';

    const bySection = {};
    filtered.forEach(([tagId, data]) => {
      if (!bySection[data.section]) bySection[data.section] = [];
      bySection[data.section].push({ tagId, ...data });
    });

    return Object.entries(bySection).map(([section, tags]) => `
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#8A8377;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;">${section}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${tags.map(tag => `
            <button onclick="openTagDetailModal('${tag.tagId}')"
              style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;
              border-radius:20px;border:1.5px solid #444441;background:#F1EFE8;
              color:#2C2C2A;font-size:12px;font-weight:600;cursor:pointer;transition:opacity 0.15s;"
              onmouseover="this.style.opacity='0.75'" onmouseout="this.style.opacity='1'">
              ${(currentLang === 'ar' && tag.label_ar) ? tag.label_ar : tag.label}
              <span style="background:#444441;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;">${tag.assets.length}</span>
            </button>`).join('')}
        </div>
      </div>`).join('');
  }

  if (euEl) euEl.innerHTML = renderTagPanel('end_user');
  if (dcEl) dcEl.innerHTML = renderTagPanel('data_center');
}

function openTagDetailModal(tagId) {
  const group = window._dashTagGroups?.[tagId];
  if (!group) return;

  document.getElementById('tag-detail-modal-title').textContent = group.label;
  const body = document.getElementById('tag-detail-modal-body');

  body.innerHTML = `
    <div style="font-size:12px;color:#8A8377;margin-bottom:12px;">${group.section}</div>
    ${group.assets.map(a => `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 14px;border-radius:8px;background:#FEF9E7;
        border:1px solid #F0C06A;margin-bottom:8px;">
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);">${a.employee_name || a.name}</div>
          <div style="font-size:12px;color:#8A8377;margin-top:2px;">${a.name} · ${a.category}</div>
        </div>
        <span class="issue-tag-pill">${group.label}</span>
      </div>`).join('')}`;

  document.getElementById('tag-detail-modal-overlay').classList.add('open');
}