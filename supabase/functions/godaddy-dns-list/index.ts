// godaddy-dns-list — read-only. Lists every DNS record for the caller's
// connected domain via GoDaddy's v3 Domains API, using the shared PAT from
// app_secrets and the per-customer domain on customer_sites. Paginates
// through the full result set (100 per page, GoDaddy's max) since a zone
// can have more records than fit on one page.

import { resolveCallerDomain, isResponse, gdHeaders, corsHeaders, zoneRecordsUrl } from '../_shared/godaddyDns.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const requestedCustomerId = new URL(req.url).searchParams.get('customerId');
    const ctx = await resolveCallerDomain(req, requestedCustomerId);
    if (isResponse(ctx)) return ctx;
    const { domain, pat } = ctx;
    const headers = gdHeaders(pat);

    const records: any[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(`${zoneRecordsUrl(domain)}?page=${page}&pageSize=100`, { headers });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as any));
        return new Response(
          JSON.stringify({ error: errBody.message || `Could not load DNS records (GoDaddy ${res.status})` }),
          { status: 502, headers: corsHeaders }
        );
      }
      const body = await res.json();
      const items = body.items || [];
      records.push(...items);
      if (items.length < 100) break;
      page++;
      if (page > 50) break; // safety cap — 5000 records is far beyond any realistic zone
    }

    return new Response(JSON.stringify({ domain, records }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
