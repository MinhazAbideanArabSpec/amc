// Shared by godaddy-dns-list and godaddy-dns-write: resolves which caller
// is asking, which domain their company is connected to, and the shared
// GoDaddy Personal Access Token (PAT) to use — or returns a Response to
// send back immediately (no session, no domain connected, DNS not
// configured yet).
//
// GoDaddy's DNS management lives exclusively on their v3 Domains API
// (api.godaddy.com/v3/domains/zones/{zone}/dns-records), authenticated
// with `Authorization: Bearer <PAT>`. Their older sso-key (API key +
// secret) credential only works against v1 endpoints, which don't cover
// DNS records at all — a PAT is required here, not a key/secret pair.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const GODADDY_API_BASE = 'https://api.godaddy.com';

export type DomainContext = { domain: string; pat: string };

// requestedCustomerId lets an admin act on behalf of a client they're
// viewing via "Login as Client" — same pattern as resolveCallerSite() in
// _shared/githubSite.ts. Only honored when the real caller's own profile
// is role='admin'.
export async function resolveCallerDomain(req: Request, requestedCustomerId?: string | null): Promise<DomainContext | Response> {
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

  const { data: site } = await admin.from('customer_sites').select('domain').eq('customer_id', customerId).single();
  if (!site?.domain) {
    return new Response(JSON.stringify({ error: "Your domain isn't connected yet — contact ArabSpec." }), { status: 404, headers: corsHeaders });
  }

  const { data: secret } = await admin.from('app_secrets').select('value').eq('key', 'godaddy_pat').single();
  if (!secret?.value) {
    return new Response(JSON.stringify({ error: 'DNS management is not configured yet — contact ArabSpec.' }), { status: 500, headers: corsHeaders });
  }

  return { domain: site.domain, pat: secret.value };
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}

export function gdHeaders(pat: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${pat}`,
    'Content-Type': 'application/json',
  };
}

export function zoneRecordsUrl(domain: string, path = ''): string {
  return `${GODADDY_API_BASE}/v3/domains/zones/${encodeURIComponent(domain)}/dns-records${path}`;
}

// Record types with a full add/edit form in the UI. Everything else (NS,
// SOA, SRV, CAA, ALIAS, …) is shown read-only — GoDaddy-managed NS/SOA
// records are protected server-side anyway (409 on delete), and SRV/CAA
// need extra fields (weight/port, flags/tag) not worth building for a
// first version. Enforced here, not just hidden client-side.
export const WRITABLE_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'];
