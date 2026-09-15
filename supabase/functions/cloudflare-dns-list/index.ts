// cloudflare-dns-list — read-only. Lists every DNS record for the caller's
// connected zone via Cloudflare's DNS Records REST API, using the shared
// API token from app_secrets and the per-customer cloudflare_zone_id on
// customer_sites.

import { resolveCallerCloudflare, isResponse, corsHeaders } from '../_shared/cloudflare.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const requestedCustomerId = new URL(req.url).searchParams.get('customerId');
    const ctx = await resolveCallerCloudflare(req, requestedCustomerId);
    if (isResponse(ctx)) return ctx;
    const { site, apiToken } = ctx;

    if (!site.cloudflare_zone_id) {
      return new Response(JSON.stringify({ error: "DNS isn't connected for this site yet — contact ArabSpec." }), { status: 404, headers: corsHeaders });
    }

    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${site.cloudflare_zone_id}/dns_records?per_page=100`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      const msg = body.errors?.[0]?.message || `Could not load DNS records (Cloudflare ${res.status})`;
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ domain: site.domain, records: body.result || [] }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
