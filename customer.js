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
    // Collect all unique asset names across all reports in this visit
    const allAssets = [];
    g.reports.forEach(r => {
      (r.visit_report_assets || []).forEach(vra => {
        const name = vra.assets?.employee_name || vra.assets?.name;
        if (name && !allAssets.includes(name)) allAssets.push(name);
      });
    });
    // Use first report id for "View Report" (opens detail of first)
    const firstId = g.reports[0].id;
    return `
    <div class="report-list-item">
      <div class="report-list-main">
        <span class="report-list-num">${g.visitNumber}</span>
        <span class="report-list-sub">${fmtDate(g.date)} · ${g.engineer}</span>
        ${allAssets.length ? `<span style="font-size:12px;color:var(--accent);font-weight:600;margin-top:2px;">${allAssets.join(', ')}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="secondary" style="padding:6px 14px;font-size:12.5px;"
          onclick="openVisitDetail('${g.visitNumber.replace(/'/g,"\\'")}', '${customerId}')">View Report</button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  PDF GENERATION
