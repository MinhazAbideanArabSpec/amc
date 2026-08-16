// send-marketing-email — admin-only. Sends a bulk marketing email (subject +
// admin-authored HTML) to a caller-supplied recipient list (parsed client-side
// from an uploaded Excel file), via the same Zoho SMTP credentials used for
// alert emails. Anyone already on the unsubscribe list is silently skipped.
// Every email gets: an unsubscribe footer, a 1x1 open-tracking pixel, and its
// links rewritten to route through a click-tracking redirect — each signed
// per-recipient so results can't be spoofed and no portal login is needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { hmacHex } from '../_shared/marketing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEND_DELAY_MS = 200; // spread sends out to avoid tripping the SMTP provider's bulk/rate limits
const SEND_TIMEOUT_MS = 20000; // bound each individual send so one stuck connection can't hang the whole request

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Rewrites every absolute http(s) link in the admin's own HTML to route
// through the click-tracking redirect. Run before the unsubscribe footer /
// tracking pixel are appended, so our own links are never wrapped.
function rewriteLinksForTracking(html: string, baseUrl: string, campaignId: string, email: string, token: string): string {
  return html.replace(/href=(["'])(https?:\/\/.*?)\1/gi, (_match, quote, url) => {
    const redirectUrl = `${baseUrl}/functions/v1/marketing-track-click?c=${campaignId}&e=${encodeURIComponent(email)}&t=${token}&u=${encodeURIComponent(url)}`;
    return `href=${quote}${redirectUrl}${quote}`;
  });
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

    let marketingSecret = cfg.marketing_unsubscribe_secret;
    if (!marketingSecret) {
      marketingSecret = crypto.randomUUID() + crypto.randomUUID();
      await admin.from('app_secrets').upsert({ key: 'marketing_unsubscribe_secret', value: marketingSecret });
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

    // Create the campaign row first — its id is embedded in every recipient's
    // tracking pixel/click links, so it has to exist before anything sends.
    const { data: campaign, error: campaignErr } = await admin.from('marketing_campaigns')
      .insert({ subject, total_recipients: totalRecipients, skipped_unsubscribed: skippedUnsubscribed, created_by: user.id })
      .select('id').single();
    if (campaignErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Could not create campaign record: ' + (campaignErr?.message || 'unknown error') }), { status: 500, headers: corsHeaders });
    }
    const campaignId = campaign.id as string;

    if (toSend.length) {
      await admin.from('marketing_campaign_recipients').insert(toSend.map(email => ({ campaign_id: campaignId, email })));
    }

    const smtpConn = {
      hostname: cfg.smtp_host,
      port: parseInt(cfg.smtp_port || '465'),
      tls: cfg.smtp_secure === 'true',
      auth: { username: cfg.smtp_username, password: cfg.smtp_password },
    };

    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    let sentCount = 0;
    const failedEmails: { email: string; error: string }[] = [];

    for (const email of toSend) {
      try {
        const trackToken = await hmacHex(marketingSecret, `${campaignId}:${email}`);
        const trackedHtml = rewriteLinksForTracking(html, baseUrl, campaignId, email, trackToken);

        const unsubToken = await hmacHex(marketingSecret, email);
        const unsubUrl = `${baseUrl}/functions/v1/marketing-unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;
        const pixelUrl = `${baseUrl}/functions/v1/marketing-track-open?c=${campaignId}&e=${encodeURIComponent(email)}&t=${trackToken}`;
        const footer = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#94A3B8;font-family:Arial,sans-serif;">
          You received this email from ArabSpec AMC. <a href="${unsubUrl}" style="color:#94A3B8;">Unsubscribe</a>
        </div><img src="${pixelUrl}" width="1" height="1" style="display:none;" alt=""/>`;
        const finalHtml = trackedHtml.includes('</body>') ? trackedHtml.replace('</body>', `${footer}</body>`) : `${trackedHtml}${footer}`;

        // A fresh connection per recipient — bounded by its own timeout — so a
        // single stuck TLS handshake or unresponsive server can't hang every
        // send behind it (denomailer normally shares one connection across
        // sends, which turns one bad connection into a full request hang).
        const client = new SMTPClient({ connection: smtpConn });
        try {
          await withTimeout(client.send({
            from: cfg.smtp_username,
            to: [email],
            subject,
            content: 'This email requires an HTML-capable email client to view.',
            html: finalHtml,
          }), SEND_TIMEOUT_MS, 'SMTP send');
          sentCount++;
        } finally {
          try {
            await withTimeout(client.close(), 5000, 'SMTP close');
          } catch (closeErr) {
            // Some SMTP providers (Zoho included) tear down the connection before
            // the client's QUIT round-trip finishes — a send that already
            // succeeded above must never be reported as failed because of this.
            console.error('SMTP close error (non-fatal):', closeErr);
          }
        }
      } catch (err) {
        failedEmails.push({ email, error: String(err) });
      }

      // Write progress after every recipient so the admin UI can poll and
      // show a live "sent X of Y" bar instead of a single opaque wait.
      try {
        await admin.from('marketing_campaigns').update({
          sent_count: sentCount,
          failed_emails: failedEmails,
        }).eq('id', campaignId);
      } catch (progressErr) {
        console.error('Campaign progress update error (non-fatal):', progressErr);
      }

      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }

    return new Response(JSON.stringify({
      ok: true, total: totalRecipients, sent: sentCount,
      skippedUnsubscribed, failed: failedEmails.length, failedEmails,
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
