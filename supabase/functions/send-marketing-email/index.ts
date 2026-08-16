// send-marketing-email — admin-only. Sends a bulk marketing email (subject +
// admin-authored HTML) to a caller-supplied recipient list (parsed client-side
// from an uploaded Excel file), via the same Zoho SMTP credentials used for
// alert emails. Anyone already on the unsubscribe list is silently skipped,
// and every email gets an unsubscribe footer appended with a signed link so
// recipients can opt out without needing a portal login.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEND_DELAY_MS = 200; // spread sends out to avoid tripping the SMTP provider's bulk/rate limits

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

    const { subject, html, recipients } = await req.json();
    if (!subject || typeof subject !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing subject' }), { status: 400, headers: corsHeaders });
    }
    if (!html || typeof html !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing email body' }), { status: 400, headers: corsHeaders });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'No recipients provided' }), { status: 400, headers: corsHeaders });
    }

    const { data: secrets } = await admin.from('app_secrets').select('key, value');
    const cfg: Record<string, string> = {};
    (secrets || []).forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
    if (!cfg.smtp_host || !cfg.smtp_username || !cfg.smtp_password) {
      return new Response(JSON.stringify({ error: 'SMTP not configured yet — set it up in Settings.' }), { status: 400, headers: corsHeaders });
    }

    let unsubscribeSecret = cfg.marketing_unsubscribe_secret;
    if (!unsubscribeSecret) {
      unsubscribeSecret = crypto.randomUUID() + crypto.randomUUID();
      await admin.from('app_secrets').upsert({ key: 'marketing_unsubscribe_secret', value: unsubscribeSecret });
    }

    // Normalize, dedupe, validate
    const normalized = Array.from(new Set(
      (recipients as unknown[])
        .filter((e): e is string => typeof e === 'string')
        .map(e => e.trim().toLowerCase())
        .filter(e => EMAIL_RE.test(e))
    ));
    const totalRecipients = normalized.length;
    if (totalRecipients === 0) {
      return new Response(JSON.stringify({ error: 'No valid email addresses found' }), { status: 400, headers: corsHeaders });
    }

    const { data: unsubbed } = await admin.from('marketing_unsubscribes').select('email').in('email', normalized);
    const unsubbedSet = new Set((unsubbed || []).map((u: { email: string }) => u.email));
    const toSend = normalized.filter(e => !unsubbedSet.has(e));
    const skippedUnsubscribed = normalized.length - toSend.length;

    const client = new SMTPClient({
      connection: {
        hostname: cfg.smtp_host,
        port: parseInt(cfg.smtp_port || '465'),
        tls: cfg.smtp_secure === 'true',
        auth: { username: cfg.smtp_username, password: cfg.smtp_password },
      },
    });

    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    let sentCount = 0;
    const failedEmails: { email: string; error: string }[] = [];

    for (const email of toSend) {
      try {
        const token = await hmacHex(unsubscribeSecret, email);
        const unsubUrl = `${baseUrl}/functions/v1/marketing-unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
        const footer = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#94A3B8;font-family:Arial,sans-serif;">
          You received this email from ArabSpec AMC. <a href="${unsubUrl}" style="color:#94A3B8;">Unsubscribe</a>
        </div>`;
        const finalHtml = html.includes('</body>') ? html.replace('</body>', `${footer}</body>`) : `${html}${footer}`;

        await client.send({
          from: cfg.smtp_username,
          to: [email],
          subject,
          content: 'This email requires an HTML-capable email client to view.',
          html: finalHtml,
        });
        sentCount++;
      } catch (err) {
        failedEmails.push({ email, error: String(err) });
      }
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }

    await client.close();

    await admin.from('marketing_campaigns').insert({
      subject,
      total_recipients: totalRecipients,
      sent_count: sentCount,
      skipped_unsubscribed: skippedUnsubscribed,
      failed_emails: failedEmails,
      created_by: user.id,
    });

    return new Response(JSON.stringify({
      ok: true, total: totalRecipients, sent: sentCount,
      skippedUnsubscribed, failed: failedEmails.length, failedEmails,
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
