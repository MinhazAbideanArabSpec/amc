// get-settings-status — admin-only. Reports which admin-configured integrations
// are already saved, without ever exposing secret values (passwords/tokens
// stay write-only). app_secrets has zero client-facing RLS policies, so this
// is the only way the Settings UI can show "already configured" instead of
// looking empty every time the page loads.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
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

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders });
    }

    const { data: secrets } = await admin.from('app_secrets').select('key, value');
    const cfg: Record<string, string> = {};
    (secrets || []).forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });

    return new Response(JSON.stringify({
      smtp: {
        host: cfg.smtp_host || '',
        port: cfg.smtp_port || '',
        username: cfg.smtp_username || '',
        secure: cfg.smtp_secure === 'true',
        hasPassword: !!cfg.smtp_password,
      },
      hasGithubToken: !!cfg.github_token,
      hasVercelToken: !!cfg.vercel_token,
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
