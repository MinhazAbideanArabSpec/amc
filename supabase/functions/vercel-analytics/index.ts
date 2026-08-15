// vercel-analytics — read-only. Queries Vercel's Web Analytics API for
// the caller's connected site: headline visitors/pageviews, the daily
// trend, and breakdowns by page, referrer, country, device, and browser
// — everything the "Visits" dataset exposes — over the last 7 days.
// Uses the shared Vercel access token from app_secrets and the
// per-customer vercel_project_id/vercel_team_id on customer_sites.
//
// requestedCustomerId lets an admin viewing a client via "Login as
// Client" pull that client's analytics rather than their own (same
// pattern as the GitHub hosting functions) — only honored when the real
// caller's own profile is role='admin'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: corsHeaders });
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile } = await admin.from('profiles').select('id, customer_id, role').eq('id', user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: 'No profile found' }), { status: 403, headers: corsHeaders });
    }

    const requestedCustomerId = new URL(req.url).searchParams.get('customerId');
    const customerId = (profile.role === 'admin' && requestedCustomerId)
      ? requestedCustomerId
      : (profile.customer_id || profile.id);

    const { data: site } = await admin.from('customer_sites')
      .select('vercel_project_id, vercel_team_id').eq('customer_id', customerId).single();
    if (!site?.vercel_project_id) {
      return new Response(JSON.stringify({ error: 'Analytics isn\'t connected for this site yet — contact ArabSpec.' }), { status: 404, headers: corsHeaders });
    }

    const { data: secret } = await admin.from('app_secrets').select('value').eq('key', 'vercel_token').single();
    if (!secret?.value) {
      return new Response(JSON.stringify({ error: 'Analytics is not configured yet — contact ArabSpec.' }), { status: 500, headers: corsHeaders });
    }

    const vercelHeaders = { Authorization: `Bearer ${secret.value}` };
    const baseParams = new URLSearchParams({ projectId: site.vercel_project_id });
    if (site.vercel_team_id) baseParams.set('teamId', site.vercel_team_id);

    const until = new Date();
    const since = new Date(until.getTime() - 7 * 86400000);
    const dateParams = new URLSearchParams(baseParams);
    dateParams.set('since', since.toISOString().split('T')[0]);
    dateParams.set('until', until.toISOString().split('T')[0]);

    function aggregateUrl(by: string, limit = 10) {
      const p = new URLSearchParams(dateParams);
      p.set('by', by);
      p.set('limit', String(limit));
      return `https://api.vercel.com/v1/query/web-analytics/visits/aggregate?${p}`;
    }

    const [
      countRes, dailyRes, pagesRes, referrersRes, countriesRes, devicesRes, browsersRes, osRes,
    ] = await Promise.all([
      fetch(`https://api.vercel.com/v1/query/web-analytics/visits/count?${dateParams}`, { headers: vercelHeaders }),
      fetch(aggregateUrl('day', 31), { headers: vercelHeaders }),
      fetch(aggregateUrl('requestPath'), { headers: vercelHeaders }),
      fetch(aggregateUrl('referrerHostname'), { headers: vercelHeaders }),
      fetch(aggregateUrl('country'), { headers: vercelHeaders }),
      fetch(aggregateUrl('deviceType'), { headers: vercelHeaders }),
      fetch(aggregateUrl('browserName'), { headers: vercelHeaders }),
      fetch(aggregateUrl('osName'), { headers: vercelHeaders }),
    ]);

    if (!countRes.ok) {
      const errBody = await countRes.json().catch(() => ({} as any));
      return new Response(JSON.stringify({ error: errBody.error?.message || `Could not read analytics (Vercel ${countRes.status})` }), { status: 502, headers: corsHeaders });
    }

    const asJson = async (res: Response) => (res.ok ? await res.json() : { data: [] });
    const countData = await countRes.json();
    const [dailyData, pagesData, referrersData, countriesData, devicesData, browsersData, osData] = await Promise.all(
      [dailyRes, pagesRes, referrersRes, countriesRes, devicesRes, browsersRes, osRes].map(asJson)
    );

    return new Response(JSON.stringify({
      visitors: countData.data?.visitors ?? 0,
      pageviews: countData.data?.pageviews ?? 0,
      sinceDate: dateParams.get('since'),
      untilDate: dateParams.get('until'),
      dailyTrend: (dailyData.data || []).map((row: any) => ({
        date: row.timestamp, pageviews: row.pageviews, visitors: row.visitors,
      })),
      topPages: (pagesData.data || []).map((row: any) => ({
        path: row.requestPath, pageviews: row.pageviews, visitors: row.visitors,
      })),
      topReferrers: (referrersData.data || []).map((row: any) => ({
        referrer: row.referrerHostname || 'Direct', pageviews: row.pageviews, visitors: row.visitors,
      })),
      topCountries: (countriesData.data || []).map((row: any) => ({
        country: row.country || 'Unknown', pageviews: row.pageviews, visitors: row.visitors,
      })),
      devices: (devicesData.data || []).map((row: any) => ({
        device: row.deviceType || 'Unknown', pageviews: row.pageviews, visitors: row.visitors,
      })),
      browsers: (browsersData.data || []).map((row: any) => ({
        browser: row.browserName || 'Unknown', pageviews: row.pageviews, visitors: row.visitors,
      })),
      operatingSystems: (osData.data || []).map((row: any) => ({
        os: row.osName || 'Unknown', pageviews: row.pageviews, visitors: row.visitors,
      })),
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
