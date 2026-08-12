// Shared by github-site-backup and github-site-publish: resolves which
// caller is asking, which repo/branch their company is connected to, and
// the GitHub token to use — or returns a Response to send back immediately
// (no session, no site connected, hosting not configured yet).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type SiteContext = { repo: string; branch: string; token: string };

export async function resolveCallerSite(req: Request): Promise<SiteContext | Response> {
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

  const { data: profile } = await admin.from('profiles').select('id, customer_id').eq('id', user.id).single();
  if (!profile) {
    return new Response(JSON.stringify({ error: 'No profile found' }), { status: 403, headers: corsHeaders });
  }
  const customerId = profile.customer_id || profile.id;

  const { data: site } = await admin.from('customer_sites').select('repo, branch').eq('customer_id', customerId).single();
  if (!site) {
    return new Response(JSON.stringify({ error: "Your website isn't connected yet — contact ArabSpec." }), { status: 404, headers: corsHeaders });
  }

  const { data: secret } = await admin.from('app_secrets').select('value').eq('key', 'github_token').single();
  if (!secret?.value) {
    return new Response(JSON.stringify({ error: 'Hosting is not configured yet — contact ArabSpec.' }), { status: 500, headers: corsHeaders });
  }

  return { repo: site.repo, branch: site.branch, token: secret.value };
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}

export function ghHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
