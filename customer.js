// customer.js — visit reports, contracts, profile, subscriptions, assets

async function loadCustomerReports() {// customer.js — visit reports, contracts, profile, subscriptions, assets

  const container = document.getElementById('customer-reports-list');
  const customerId = getCustomerId();
  const { data: reports, error } = await sb.from('visit_reports')
    .select('*, visit_report_assets(assets(name, employee_name))')
    .eq('customer_id', customerId)
    .order('visit_date', { ascending: false });

  if (error) { container.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }
  if (!reports.length) { container.innerHTML = `<div class="empty-state">No visit reports yet.</div>`; return; }

  // Group by visit_number — same visit number = same visit
  const grouped = {};
  reports.forEach(r => {
    if (!grouped[r.visit_number]) {
      grouped[r.visit_number] = { visitNumber: r.visit_number, date: r.visit_date, engineer: r.engineer_name, reports: [] };
    }
    grouped[r.visit_number].reports.push(r);
  });

  container.innerHTML = Object.values(grouped).map(g => {
    const allAssets = [];
    g.reports.forEach(r => {
      (r.visit_report_assets || []).forEach(vra => {
        const name = vra.assets?.employee_name || vra.assets?.name;
        if (name && !allAssets.includes(name)) allAssets.push(name);
      });
    });
    const assetPills = allAssets.map(name =>
      `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:var(--slate-bg);color:var(--ink-soft);font-size:11px;font-weight:500;border:1px solid var(--line);">${name}</span>`
    ).join('');
    return `
    <div style="border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:12px;background:#fff;border-left:3px solid var(--accent);transition:box-shadow 0.15s;"
      onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span style="font-size:13px;font-weight:700;color:#fff;background:var(--accent);padding:2px 10px;border-radius:20px;">Visit #${g.visitNumber}</span>
            <span style="font-size:12px;color:var(--ink-soft);">${fmtDate(g.date)} &nbsp;·&nbsp; ${g.engineer}</span>
          </div>
          ${allAssets.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${assetPills}</div>` : ''}
        </div>
        <button style="flex-shrink:0;padding:7px 16px;font-size:12.5px;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;"
          onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'"
          onclick="openVisitDetail('${g.visitNumber.replace(/'/g,"\\'")}', '${customerId}')">
          View Report →
        </button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  PDF GENERATION
