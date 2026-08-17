// save-smtp-settings — admin-only. Stores Zoho SMTP credentials in the
// locked-down app_secrets table (no RLS policies granted to anon/authenticated,
// so only this function's service-role client can ever read them back).

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

    // Client scoped to the caller's own session, just to identify who they are
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders });
    }

    // Service-role client — bypasses RLS, used to verify admin role and write secrets
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders });
    }

    const { host, port, username, password, secure } = await req.json();
    if (!host || !port || !username) {
      return new Response(JSON.stringify({ error: 'Missing SMTP fields' }), { status: 400, headers: corsHeaders });
    }
    if (!password) {
      const { data: existing } = await admin.from('app_secrets').select('value').eq('key', 'smtp_password').single();
      if (!existing?.value) {
        return new Response(JSON.stringify({ error: 'A password is required the first time SMTP is configured.' }), { status: 400, headers: corsHeaders });
      }
    }

    const entries: [string, string][] = [
      ['smtp_host', String(host)],
      ['smtp_port', String(port)],
      ['smtp_username', String(username)],
      ['smtp_secure', String(!!secure)],
    ];
    // Only overwrite the saved password if a new one was actually entered —
    // leaving the field blank means "keep what's already there."
    if (password) entries.push(['smtp_password', String(password)]);
    for (const [key, value] of entries) {
      const { error } = await admin.from('app_secrets').upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
