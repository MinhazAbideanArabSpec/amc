// cloudflare-analytics — read-only. Queries Cloudflare's GraphQL Analytics
// API for the caller's connected site's Web Analytics (RUM) data: headline
// visits/pageviews, the daily trend, and breakdowns by page, referrer,
// country, device, browser, and OS — over the last 30 days. Uses the
// shared Cloudflare API token + account ID from app_secrets and the
// per-customer cloudflare_site_tag on customer_sites.
//
// Reshapes the response into the same JSON contract the old Vercel
// Analytics function produced, so the frontend (analytics.js) needs no
// changes to consume either.
//
// NOTE: the rumPageloadEventsAdaptiveGroups field list here (requestPath,
// refererHost, countryName, deviceType, userAgentBrowser, userAgentOS) is
// based on Cloudflare's documented AdaptiveGroups pattern, not yet
// confirmed against a live token — first real run should be checked
// against the actual response shape before relying on it.

import { resolveCallerCloudflare, isResponse, corsHeaders } from '../_shared/cloudflare.ts';

function dimGroup(alias: string, dimensionField: string, limit: number, orderBy: string) {
  return `
    ${alias}: rumPageloadEventsAdaptiveGroups(
      filter: $filter
      limit: ${limit}
      orderBy: [${orderBy}]
    ) {
      count
      sum { visits }
      dimensions { ${dimensionField} }
    }
  `;
}

const QUERY = `
  query GetWebAnalytics($accountTag: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        totals: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) {
          count
          sum { visits }
        }
        ${dimGroup('trend', 'date', 31, 'date_ASC')}
        ${dimGroup('pages', 'requestPath', 10, 'count_DESC')}
        ${dimGroup('referrers', 'refererHost', 10, 'count_DESC')}
        ${dimGroup('countries', 'countryName', 10, 'count_DESC')}
        ${dimGroup('devices', 'deviceType', 10, 'count_DESC')}
        ${dimGroup('browsers', 'userAgentBrowser', 10, 'count_DESC')}
        ${dimGroup('os', 'userAgentOS', 10, 'count_DESC')}
      }
    }
  }
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const requestedCustomerId = new URL(req.url).searchParams.get('customerId');
    const ctx = await resolveCallerCloudflare(req, requestedCustomerId);
    if (isResponse(ctx)) return ctx;
    const { site, apiToken, accountId } = ctx;

    if (!site.cloudflare_site_tag) {
      return new Response(JSON.stringify({ error: "Analytics isn't connected for this site yet — contact ArabSpec." }), { status: 404, headers: corsHeaders });
    }

    const until = new Date();
    const since = new Date(until.getTime() - 30 * 86400000);

    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          accountTag: accountId,
          filter: {
            siteTag: site.cloudflare_site_tag,
            datetime_geq: since.toISOString(),
            datetime_leq: until.toISOString(),
          },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok || body.errors) {
      const msg = body.errors?.[0]?.message || `Could not load analytics (Cloudflare ${res.status})`;
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: corsHeaders });
    }

    const account = body.data?.viewer?.accounts?.[0];
    if (!account) {
      return new Response(JSON.stringify({ error: 'No analytics data returned for this account.' }), { status: 502, headers: corsHeaders });
    }

    const visits = (row: any) => row.sum?.visits ?? row.count ?? 0;

    return new Response(JSON.stringify({
      visitors: visits(account.totals?.[0] || {}),
      pageviews: account.totals?.[0]?.count ?? 0,
      sinceDate: since.toISOString().split('T')[0],
      untilDate: until.toISOString().split('T')[0],
      dailyTrend: (account.trend || []).map((row: any) => ({
        date: row.dimensions?.date, pageviews: row.count, visitors: visits(row),
      })),
      topPages: (account.pages || []).map((row: any) => ({
        path: row.dimensions?.requestPath || '/', pageviews: row.count, visitors: visits(row),
      })),
      topReferrers: (account.referrers || []).map((row: any) => ({
        referrer: row.dimensions?.refererHost || 'Direct', pageviews: row.count, visitors: visits(row),
      })),
      topCountries: (account.countries || []).map((row: any) => ({
        country: row.dimensions?.countryName || 'Unknown', pageviews: row.count, visitors: visits(row),
      })),
      devices: (account.devices || []).map((row: any) => ({
        device: row.dimensions?.deviceType || 'Unknown', pageviews: row.count, visitors: visits(row),
      })),
      browsers: (account.browsers || []).map((row: any) => ({
        browser: row.dimensions?.userAgentBrowser || 'Unknown', pageviews: row.count, visitors: visits(row),
      })),
      operatingSystems: (account.os || []).map((row: any) => ({
        os: row.dimensions?.userAgentOS || 'Unknown', pageviews: row.count, visitors: visits(row),
      })),
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
