// send-test-email — admin-only. Sends two sample emails (one styled as a
// contract expiry, one as a software renewal expiry) using the exact same
// shared template as real alerts, so testing SMTP settings shows exactly
// what recipients will actually receive for both alert types.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { renderAlertEmailHtml, renderAlertEmailText, renderAlertSubject, AlertEmailData } from '../_shared/emailTemplate.ts';

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

    const sampleDate = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const samples: AlertEmailData[] = [
      {
        type: 'contract',
        itemName: 'AMC-SAMPLE',
        customerName: 'Sample Company LLC',
        expiryDate: sampleDate(30),
        daysLeft: 30,
        isTest: true,
      },
      {
        type: 'subscription',
        itemName: 'Microsoft 365 Business Standard',
        vendor: 'Microsoft',
        customerName: 'Sample Company LLC',
        expiryDate: sampleDate(7),
        daysLeft: 7,
        isTest: true,
      },
    ];

    for (const sample of samples) {
      await client.send({
        from: cfg.smtp_username,
        to: [to],
        subject: renderAlertSubject(sample),
        content: renderAlertEmailText(sample),
        html: renderAlertEmailHtml(sample),
      });
    }

    await client.close();
    return new Response(JSON.stringify({ ok: true, sent: samples.length }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
