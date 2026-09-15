// Shared by cloudflare-dns-list and cloudflare-analytics: resolves which
// caller is asking, their customer_sites row, and the shared Cloudflare
// API token/account ID — or returns a Response to send back immediately
// (no session, no Cloudflare configured, this specific feature not
// connected for this customer yet).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SiteRow = { domain: string | null; cloudflare_zone_id: string | null; cloudflare_site_tag: string | null };

export async function resolveCallerCloudflare(req: Request, requestedCustomerId?: string | null): Promise<
  { site: SiteRow; apiToken: string; accountId: string } | Response
> {
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
  const customerId = (profile.role === 'admin' && requestedCustomerId)
    ? requestedCustomerId
    : (profile.customer_id || profile.id);

  const { data: site } = await admin.from('customer_sites')
    .select('domain, cloudflare_zone_id, cloudflare_site_tag').eq('customer_id', customerId).single();
  if (!site) {
    return new Response(JSON.stringify({ error: "Your website isn't connected yet — contact ArabSpec." }), { status: 404, headers: corsHeaders });
  }

  const { data: secrets } = await admin.from('app_secrets').select('key, value')
    .in('key', ['cloudflare_api_token', 'cloudflare_account_id']);
  const cfg: Record<string, string> = {};
  (secrets || []).forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
  if (!cfg.cloudflare_api_token || !cfg.cloudflare_account_id) {
    return new Response(JSON.stringify({ error: 'Cloudflare is not configured yet — contact ArabSpec.' }), { status: 500, headers: corsHeaders });
  }

  return { site, apiToken: cfg.cloudflare_api_token, accountId: cfg.cloudflare_account_id };
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}
