// admin-overview.js — dashboard overview

// admin.js — admin overview, users, contracts, assets
// ── Admin: load overview stats ───────────────────────────
async function loadAdminOverview() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  // Fetch all data in parallel
  const [
    { data: customers },
    { data: assets },
    { data: contracts },
    { data: assignments },
    { data: recentVisits },
    { data: upcomingVisits },
    { data: subscriptions },
    { data: topTags }
  ] = await Promise.all([
    sb.from('profiles').select('id, name, next_visit_date').eq('role', 'customer').is('customer_id', null),
    sb.from('assets').select('id, customer_id'),
    sb.from('contracts').select('*, profiles!contracts_customer_id_fkey(name)'),
    sb.from('asset_status_assignments')
      .select('asset_id, customer_id, is_resolved, asset_statuses(name, color), assets(name, employee_name, category), profiles!asset_status_assignments_customer_id_fkey(name)')
      .eq('is_resolved', false),
    sb.from('visit_reports')
      .select('visit_number, visit_date, engineer_name, profiles!visit_reports_customer_id_fkey(name)')
      .order('visit_date', { ascending: false }).limit(10),
    sb.from('profiles').select('id, name, next_visit_date').eq('role', 'customer').is('customer_id', null)
      .not('next_visit_date', 'is', null).order('next_visit_date', { ascending: true }),
    sb.from('subscriptions')
      .select('software_name, vendor, end_date, profiles!subscriptions_customer_id_fkey(name)')
      .not('end_date', 'is', null).order('end_date', { ascending: true }),
    sb.from('visit_issue_tags')
      .select('issue_tag_definitions(label, section)')
  ]);

  const allContracts = contracts || [];
  const activeContracts = allContracts.filter(c => c.status === 'active');

  // ── Stat cards ───────────────────────────────────────────
  document.getElementById('stat-total-customers').textContent = (customers || []).length;
  document.getElementById('stat-total-assets-admin').textContent = (assets || []).length;
  document.getElementById('stat-active-contracts').textContent = activeContracts.length;

  const expiring = activeContracts
    .map(c => ({ ...c, daysLeft: Math.round((new Date(c.end_date) - today) / 86400000) }))
    .filter(c => c.daysLeft >= 0 && c.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  document.getElementById('stat-expiring-soon').textContent = expiring.length;

  const visitsThisMonth = (recentVisits || []).filter(v => v.visit_date >= monthStart);
  const uniqueVisitsMonth = new Set(visitsThisMonth.map(v => v.visit_number)).size;
  document.getElementById('stat-visits-month').textContent = uniqueVisitsMonth;

  // ── Contracts Expiring ────────────────────────────────────
  const expEl = document.getElementById('expiring-tbody');
  if (!expiring.length) {
    expEl.innerHTML = `<tr><td colspan="4" class="empty-state">No contracts expiring within 60 days.</td></tr>`;
  } else {
    expEl.innerHTML = expiring.map(c => `<tr>
      <td style="font-weight:600;">${c.contract_number}</td>
      <td>${c.profiles?.name || '—'}</td>
      <td>${fmtDate(c.end_date)}</td>
      <td style="font-weight:600;color:${c.daysLeft <= 30 ? 'var(--rust)' : 'var(--amber)'};">${c.daysLeft}d</td>
    </tr>`).join('');
  }

  // ── Recent Visit Reports ──────────────────────────────────
  const rvEl = document.getElementById('admin-recent-visits-tbody');
  const uniqueVisits = [];
  const seen = new Set();
  (recentVisits || []).forEach(v => {
    const key = `${v.visit_number}-${v.profiles?.name}`;
    if (!seen.has(key)) { seen.add(key); uniqueVisits.push(v); }
  });
  rvEl.innerHTML = uniqueVisits.length
    ? uniqueVisits.map(v => `<tr>
        <td style="font-weight:600;">${v.visit_number}</td>
        <td>${v.profiles?.name || '—'}</td>
        <td>${fmtDate(v.visit_date)}</td>
        <td style="color:#8A8377;">${v.engineer_name}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">No visit reports yet.</td></tr>`;

  // ── Upcoming Scheduled Visits ─────────────────────────────
  const upEl = document.getElementById('admin-upcoming-tbody');
  const upcoming = (upcomingVisits || [])
    .map(p => ({ ...p, days: Math.round((new Date(p.next_visit_date) - today) / 86400000) }))
    .filter(p => p.days >= 0 && p.days <= 30);
  upEl.innerHTML = upcoming.length
    ? upcoming.map(p => `<tr>
        <td style="font-weight:600;">${p.name}</td>
        <td>${fmtDate(p.next_visit_date)}</td>
        <td style="font-weight:600;color:${p.days <= 7 ? 'var(--rust)' : 'var(--amber)'};">${p.days}d</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">No visits scheduled in next 30 days.</td></tr>`;

  // ── Asset Health by Customer ──────────────────────────────
  const healthEl = document.getElementById('admin-health-tbody');
  const healthMap = {};
  (customers || []).forEach(c => {
    healthMap[c.id] = { name: c.name, critical: 0, warning: 0, pass: 0, none: 0 };
  });
  const assetsByCustomer = {};
  (assets || []).forEach(a => {
    if (!assetsByCustomer[a.customer_id]) assetsByCustomer[a.customer_id] = 0;
    assetsByCustomer[a.customer_id]++;
  });
  (assignments || []).forEach(a => {
    const h = healthMap[a.customer_id];
    if (!h) return;
    const name = a.asset_statuses?.name;
    if (name === 'Critical') h.critical++;
    else if (name === 'Warning') h.warning++;
    else if (name === 'Pass') h.pass++;
  });
  Object.entries(healthMap).forEach(([cid, h]) => {
    const total = assetsByCustomer[cid] || 0;
    const assigned = h.critical + h.warning + h.pass;
    h.none = Math.max(0, total - assigned);
  });
  const healthRows = Object.values(healthMap).filter(h => (assetsByCustomer[Object.keys(healthMap).find(k => healthMap[k] === h)] || 0) > 0);
  healthEl.innerHTML = healthRows.length
    ? healthRows.map(h => `<tr>
        <td style="font-weight:600;">${h.name}</td>
        <td style="color:#C0392B;font-weight:${h.critical > 0 ? '700' : '400'};">${h.critical}</td>
        <td style="color:#D4A017;font-weight:${h.warning > 0 ? '700' : '400'};">${h.warning}</td>
        <td style="color:#27AE60;font-weight:${h.pass > 0 ? '700' : '400'};">${h.pass}</td>
        <td style="color:#94A3B8;">${h.none}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">No asset data yet.</td></tr>`;

  // ── Top Issue Tags ────────────────────────────────────────
  const tagsEl = document.getElementById('admin-top-tags');
  const tagCount = {};
  (topTags || []).forEach(vit => {
    const lbl = vit.issue_tag_definitions?.label;
    if (!lbl) return;
    tagCount[lbl] = (tagCount[lbl] || 0) + 1;
  });
  const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  tagsEl.innerHTML = sorted.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0;">` +
      sorted.map(([lbl, cnt]) => `
        <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;
          border:1px solid #444441;background:#F1EFE8;font-size:12px;font-weight:600;color:#2C2C2A;">
          ${lbl}
          <span style="background:#444441;color:#fff;border-radius:10px;font-size:10px;padding:1px 6px;">${cnt}</span>
        </span>`).join('') + `</div>`
    : `<div class="empty-state">No issue tags recorded yet.</div>`;

  // ── Renewals Expiring ────────────────────────────────
  const subEl = document.getElementById('admin-subs-expiring-tbody');
  const expSubs = (subscriptions || [])
    .map(s => ({ ...s, daysLeft: Math.round((new Date(s.end_date) - today) / 86400000) }))
    .filter(s => s.daysLeft >= 0 && s.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  subEl.innerHTML = expSubs.length
    ? expSubs.map(s => `<tr>
        <td style="font-weight:600;">${s.software_name}</td>
        <td>${s.profiles?.name || '—'}</td>
        <td style="color:#8A8377;">${s.vendor || '—'}</td>
        <td>${fmtDate(s.end_date)}</td>
        <td style="font-weight:600;color:${s.daysLeft <= 30 ? 'var(--rust)' : 'var(--amber)'};">${s.daysLeft}d</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">No renewals expiring within 60 days.</td></tr>`;
}

// ── Customer view ────────────────────────────────────────
async function renderCustomerProfile(p) {
  // If this is a staff account, load the parent company profile
  let profile = p;
  if (p.customer_id) {
    const { data: company } = await sb.from('profiles').select('*').eq('id', p.customer_id).single();
    if (company) profile = company;
  }
  document.getElementById('customer-profile-rows').innerHTML = `
    <div class="profile-row"><span class="lbl">Company</span><span class="val">${profile.name}</span></div>
    <div class="profile-row"><span class="lbl">Email</span><span class="val">${profile.email}</span></div>
    <div class="profile-row"><span class="lbl">Contact Person</span><span class="val">${profile.contact_person || '—'}</span></div>
    <div class="profile-row"><span class="lbl">Phone</span><span class="val">${profile.phone || '—'}</span></div>
    <div class="profile-row"><span class="lbl">Status</span><span class="val">${profile.is_active ? 'Active' : 'Inactive'}</span></div>
    ${p.customer_id ? `<div class="profile-row"><span class="lbl">Signed in as</span><span class="val">${p.email}</span></div>` : ''}
  `;
  // Update hero name to company name for staff
  const heroName = document.getElementById('dash-hero-name');
  if (heroName) heroName.textContent = profile.name;
  // Load logo from company profile
  if (profile.logo_path) {
    const { data: logoData } = sb.storage.from('logos').getPublicUrl(profile.logo_path);
    const heroRight = document.getElementById('dash-hero-right');
    if (logoData?.publicUrl && heroRight) {
      heroRight.innerHTML = `<img src="${logoData.publicUrl}" alt="Logo" style="height:80px;max-width:160px;object-fit:contain;border-radius:8px;background:#fff;padding:8px;"/>`;
    }
  }
}
