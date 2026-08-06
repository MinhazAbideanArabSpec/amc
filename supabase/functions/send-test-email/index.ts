// send-test-email — admin-only. Sends a single test email using the exact
// same template as a real expiry alert, so testing SMTP settings shows
// exactly what recipients will actually receive.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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

    const { to } = await req.json();
    if (!to || typeof to !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing recipient email' }), { status: 400, headers: corsHeaders });
    }

    const { data: secrets } = await admin.from('app_secrets').select('key, value');
    const cfg: Record<string, string> = {};
    (secrets || []).forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
    if (!cfg.smtp_host || !cfg.smtp_username || !cfg.smtp_password) {
      return new Response(JSON.stringify({ error: 'SMTP not configured yet — save your SMTP settings first.' }), { status: 400, headers: corsHeaders });
    }

    const client = new SMTPClient({
      connection: {
        hostname: cfg.smtp_host,
        port: parseInt(cfg.smtp_port || '465'),
        tls: cfg.smtp_secure === 'true',
        auth: { username: cfg.smtp_username, password: cfg.smtp_password },
      },
    });

    // Same template shape as a real contract-expiry alert (see send-expiry-alerts),
    // just with sample data and a clear TEST marker so it's never mistaken for real.
    const sampleDays = 30;
    const sampleDate = new Date();
    sampleDate.setDate(sampleDate.getDate() + sampleDays);
    const subject = `[TEST] Contract AMC-SAMPLE expires in ${sampleDays} days`;
    const body = `Hi,\n\nThis is a reminder that contract AMC-SAMPLE for Sample Company is set to expire in ${sampleDays} days (on ${sampleDate.toISOString().split('T')[0]}).\n\nPlease reach out if you'd like to discuss renewal.\n\n— ArabSpec AMC Portal\n\n---\nThis is a TEST message sent from the SMTP settings page to confirm your email configuration works. No real contract is expiring.`;

    await client.send({ from: cfg.smtp_username, to: [to], subject, content: body });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
