// dns.js — customer-facing DNS record viewer (GoDaddy v3 API), under
// Hosting → Domains. Read-only: the shared GoDaddy token is scoped to
// read access only, so this just lists records grouped by (type, name)
// for display — no add/edit/delete.

async function loadCustomerDomainsTab(customerId) {
  const el = document.getElementById('domains-body');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading…</div>';

  const { data: { session } } = await sb.auth.getSession();
  let result;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/godaddy-dns-list?customerId=${encodeURIComponent(customerId)}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not load DNS records.');
  } catch (err) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(err.message || 'Could not load DNS records.')}</div>`;
    return;
  }

  renderDnsGroups(result.records || []);
}

function dnsRecordKey(type, name) { return `${type} ${name}`; }

function groupDnsRecords(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = dnsRecordKey(r.type, r.name);
    if (!byKey.has(key)) byKey.set(key, { type: r.type, name: r.name, records: [] });
    byKey.get(key).records.push(r);
  }
  return Array.from(byKey.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

// DNS names and values vary wildly in length (a bare "@" next to a DKIM
// selector like "selector1._domainkey"; a short IP next to a long DKIM
// public-key TXT value) — a fixed-width single-line row overlaps as soon as
// real-world records show up. Stacking type+name above value+TTL, both
// wrapping freely, means no combination of lengths can ever overlap.
function renderDnsGroups(records) {
  const el = document.getElementById('domains-body');
  if (!el) return;

  const groups = groupDnsRecords(records);
  if (!groups.length) {
    el.innerHTML = '<div class="empty-state">No DNS records found for this domain.</div>';
    return;
  }

  const rows = groups.flatMap(g => g.records.map(r => ({ ...r, type: g.type, name: g.name })));
  const primaryTypes = ['A', 'AAAA', 'CNAME'];

  el.innerHTML = `
    <p class="hosting-lede">These records are view-only — contact ArabSpec to request a change.</p>
    <div class="hosting-list">
      ${rows.map(r => `
        <div class="hosting-row" style="flex-direction:column;align-items:stretch;gap:6px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="hosting-dns-type ${primaryTypes.includes(r.type) ? 'primary' : 'muted'}">${escapeHtml(r.type)}</span>
            <span class="hosting-mono" style="font-weight:600;color:var(--ink);">${escapeHtml(r.name)}</span>
          </div>
          <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 16px;">
            <span class="hosting-mono" style="color:var(--ink-soft);overflow-wrap:anywhere;">${escapeHtml(r.data)}${r.priority != null ? ` <span style="color:#8A8377;">(priority ${r.priority})</span>` : ''}</span>
            <span style="font-size:11.5px;color:#8A8377;white-space:nowrap;">TTL ${r.ttl}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
