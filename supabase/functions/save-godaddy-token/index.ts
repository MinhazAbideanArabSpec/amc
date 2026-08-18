// save-godaddy-token — admin-only. Stores a GoDaddy Personal Access Token
// (PAT) in the locked-down app_secrets table (no RLS policies granted to
// anon/authenticated, so only this function's service-role client can
// ever read it back). Used by godaddy-dns-list/godaddy-dns-write to
// manage DNS on every connected customer's behalf.

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

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders });
    }

    const { token } = await req.json();
    if (!token || typeof token !== 'string' || !token.trim()) {
      // Blank means "leave the existing token as-is" — but only if one
      // actually exists yet, so a genuinely empty setup still errors clearly.
      const { data: existing } = await admin.from('app_secrets').select('value').eq('key', 'godaddy_pat').single();
      if (!existing?.value) {
        return new Response(JSON.stringify({ error: 'Enter a token — none is saved yet.' }), { status: 400, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const { error } = await admin.from('app_secrets').upsert({
      key: 'godaddy_pat',
      value: token.trim(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
