// send-marketing-email — admin-only. Sends a bulk marketing email (subject +
// admin-authored HTML) to a caller-supplied recipient list (parsed client-side
// from an uploaded Excel file), via the same Zoho SMTP credentials used for
// alert emails. Anyone already on the unsubscribe list is silently skipped.
// Every email gets: an unsubscribe footer, a 1x1 open-tracking pixel, and its
// links rewritten to route through a click-tracking redirect — each signed
// per-recipient so results can't be spoofed and no portal login is needed.
//
// Split into two actions ('start' then repeated 'sendOne' calls, driven by
// the client) rather than one request that loops through every recipient.
// A single invocation looping through several slow SMTP round-trips proved
// fragile — the platform appears to kill the whole request mid-flight past
// some duration, silently, even after an email had already been handed off
// to the SMTP server for delivery. Bounding each invocation to exactly one
// email keeps every request short and immune to that.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { hmacHex } from '../_shared/marketing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEND_TIMEOUT_MS = 20000;

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

async function getMarketingSecret(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await admin.from('app_secrets').select('value').eq('key', 'marketing_unsubscribe_secret').single();
  if (data?.value) return data.value;
  const fresh = crypto.randomUUID() + crypto.randomUUID();
  await admin.from('app_secrets').upsert({ key: 'marketing_unsubscribe_secret', value: fresh });
  return fresh;
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

    const body = await req.json();
    const action = body.action;

    const { data: secrets } = await admin.from('app_secrets').select('key, value');
    const cfg: Record<string, string> = {};
    (secrets || []).forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
    if (!cfg.smtp_host || !cfg.smtp_username || !cfg.smtp_password) {
      return new Response(JSON.stringify({ error: 'SMTP not configured yet — set it up in Settings.' }), { status: 400, headers: corsHeaders });
    }

    // ── action: start — validate, dedupe, create the campaign record, and
    // hand the client back the exact list to iterate. No SMTP happens here,
    // so this call is always fast. ──────────────────────────────────────
    if (action === 'start') {
      const { subject, html, recipients } = body;
      if (!subject || typeof subject !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing subject' }), { status: 400, headers: corsHeaders });
      }
      if (!html || typeof html !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing email body' }), { status: 400, headers: corsHeaders });
      }
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return new Response(JSON.stringify({ error: 'No recipients provided' }), { status: 400, headers: corsHeaders });
      }

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

      return new Response(JSON.stringify({
        ok: true, campaignId, toSend, totalRecipients, skippedUnsubscribed,
      }), { headers: corsHeaders });
    }

    // ── action: sendOne — sends to exactly one recipient. Bounded, short,
    // safe to call in a tight client-side loop, one at a time. ─────────
    if (action === 'sendOne') {
      const { campaignId, email, subject, html } = body;
      if (!campaignId || !email || !subject || !html) {
        return new Response(JSON.stringify({ error: 'Missing campaignId, email, subject, or html' }), { status: 400, headers: corsHeaders });
      }

      const marketingSecret = await getMarketingSecret(admin);
      const baseUrl = Deno.env.get('SUPABASE_URL')!;

      const trackToken = await hmacHex(marketingSecret, `${campaignId}:${email}`);
      const trackedHtml = rewriteLinksForTracking(html, baseUrl, campaignId, email, trackToken);

      const unsubToken = await hmacHex(marketingSecret, email);
      const unsubUrl = `${baseUrl}/functions/v1/marketing-unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;
      const pixelUrl = `${baseUrl}/functions/v1/marketing-track-open?c=${campaignId}&e=${encodeURIComponent(email)}&t=${trackToken}`;
      const footer = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#94A3B8;font-family:Arial,sans-serif;">
        You received this email from ArabSpec AMC. <a href="${unsubUrl}" style="color:#94A3B8;">Unsubscribe</a>
      </div><img src="${pixelUrl}" width="1" height="1" style="display:none;" alt=""/>`;
      const finalHtml = trackedHtml.includes('</body>') ? trackedHtml.replace('</body>', `${footer}</body>`) : `${trackedHtml}${footer}`;

      let sendError: string | null = null;
      const client = new SMTPClient({
        connection: {
          hostname: cfg.smtp_host,
          port: parseInt(cfg.smtp_port || '465'),
          tls: cfg.smtp_secure === 'true',
          auth: { username: cfg.smtp_username, password: cfg.smtp_password },
        },
      });
      try {
        await withTimeout(client.send({
          from: cfg.smtp_username,
          to: [email],
          subject,
          content: 'This email requires an HTML-capable email client to view.',
          html: finalHtml,
        }), SEND_TIMEOUT_MS, 'SMTP send');
      } catch (err) {
        sendError = String(err);
      } finally {
        try {
          await withTimeout(client.close(), 5000, 'SMTP close');
        } catch (closeErr) {
          // A send that already succeeded above must never be reported as
          // failed just because the provider tore down the connection
          // before the QUIT round-trip finished.
          console.error('SMTP close error (non-fatal):', closeErr);
        }
      }

      // Update the shared campaign row: read-then-write, since each
      // recipient is its own isolated request now.
      let progressWriteError: string | null = null;
      const { data: current, error: readErr } = await admin.from('marketing_campaigns')
        .select('sent_count, failed_emails').eq('id', campaignId).single();
      if (readErr) {
        progressWriteError = 'read failed: ' + readErr.message;
        console.error('sendOne: could not read campaign row', campaignId, readErr);
      } else if (current) {
        const failedEmails = (current.failed_emails || []) as { email: string; error: string }[];
        if (sendError) failedEmails.push({ email, error: sendError });
        const { error: writeErr } = await admin.from('marketing_campaigns').update({
          sent_count: sendError ? current.sent_count : (current.sent_count || 0) + 1,
          failed_emails: failedEmails,
        }).eq('id', campaignId);
        if (writeErr) {
          progressWriteError = 'write failed: ' + writeErr.message;
          console.error('sendOne: could not write campaign row', campaignId, writeErr);
        }
      }

      return new Response(JSON.stringify({ ok: !sendError, error: sendError, progressWriteError }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
