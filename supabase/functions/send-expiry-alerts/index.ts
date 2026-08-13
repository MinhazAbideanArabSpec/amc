// send-expiry-alerts — runs on a daily cron schedule (see supabase/SETUP.md).
// Checks contracts and software renewals for 60/30/14/7-day expiry thresholds
// and emails the affected customer and their staff accounts directly (To),
// with all admins copied privately (Bcc) so recipients never see each
// other's addresses, via the Zoho SMTP credentials saved through Settings.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { renderAlertEmailHtml, renderAlertEmailText, renderAlertSubject } from '../_shared/emailTemplate.ts';

const THRESHOLDS = [60, 30, 14, 7];

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

async function getRecipients(admin: ReturnType<typeof createClient>, customerId: string, adminEmails: string[]): Promise<{ to: string[]; bcc: string[] }> {
  const { data: customer } = await admin.from('profiles').select('email').eq('id', customerId).single();
  const { data: staff } = await admin.from('profiles').select('email').eq('customer_id', customerId);
  const to = new Set<string>();
  if (customer?.email) to.add(customer.email);
  (staff || []).forEach((s: { email: string | null }) => { if (s.email) to.add(s.email); });

  // No customer/staff email on file for this account — fall back to
  // notifying admins directly rather than silently dropping the alert.
  if (to.size === 0) return { to: adminEmails, bcc: [] };

  const bcc = adminEmails.filter(e => !to.has(e));
  return { to: Array.from(to), bcc };
}

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: secrets } = await admin.from('app_secrets').select('key, value');
  const cfg: Record<string, string> = {};
  (secrets || []).forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
  if (!cfg.smtp_host || !cfg.smtp_username || !cfg.smtp_password) {
    return new Response(JSON.stringify({ error: 'SMTP not configured yet — set it up in Settings.' }), { status: 400 });
  }

  const client = new SMTPClient({
    connection: {
      hostname: cfg.smtp_host,
      port: parseInt(cfg.smtp_port || '465'),
      tls: cfg.smtp_secure === 'true',
      auth: { username: cfg.smtp_username, password: cfg.smtp_password },
    },
  });

  const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin').eq('is_active', true);
  const adminEmails = (admins || []).map((a: { email: string | null }) => a.email).filter(Boolean) as string[];

  let sentCount = 0;

  const { data: contracts } = await admin.from('contracts').select('id, contract_number, end_date, customer_id').eq('status', 'active');
  for (const c of contracts || []) {
    const days = daysUntil(c.end_date);
    if (!THRESHOLDS.includes(days)) continue;

    const { data: existing } = await admin.from('alert_log').select('id')
      .eq('entity_type', 'contract').eq('entity_id', c.id).eq('threshold_days', days).maybeSingle();
    if (existing) continue;

    const { data: customer } = await admin.from('profiles').select('name').eq('id', c.customer_id).single();
    const { to, bcc } = await getRecipients(admin, c.customer_id, adminEmails);
    if (!to.length) continue;

    const alertData = {
      type: 'contract' as const,
      itemName: c.contract_number,
      customerName: customer?.name || 'your organization',
      expiryDate: c.end_date,
      daysLeft: days,
    };

    await client.send({
      from: cfg.smtp_username,
      to,
      bcc,
      subject: renderAlertSubject(alertData),
      content: renderAlertEmailText(alertData),
      html: renderAlertEmailHtml(alertData),
    });
    await admin.from('alert_log').insert({ entity_type: 'contract', entity_id: c.id, threshold_days: days });
    sentCount++;
  }

  const { data: subs } = await admin.from('subscriptions').select('id, software_name, vendor, end_date, customer_id');
  for (const s of subs || []) {
    const days = daysUntil(s.end_date);
    if (!THRESHOLDS.includes(days)) continue;

    const { data: existing } = await admin.from('alert_log').select('id')
      .eq('entity_type', 'subscription').eq('entity_id', s.id).eq('threshold_days', days).maybeSingle();
    if (existing) continue;

    const { data: customer } = await admin.from('profiles').select('name').eq('id', s.customer_id).single();
    const { to, bcc } = await getRecipients(admin, s.customer_id, adminEmails);
    if (!to.length) continue;

    const alertData = {
      type: 'subscription' as const,
      itemName: s.software_name,
      vendor: s.vendor || undefined,
      customerName: customer?.name || 'your organization',
      expiryDate: s.end_date,
      daysLeft: days,
    };

    await client.send({
      from: cfg.smtp_username,
      to,
      bcc,
      subject: renderAlertSubject(alertData),
      content: renderAlertEmailText(alertData),
      html: renderAlertEmailHtml(alertData),
    });
    await admin.from('alert_log').insert({ entity_type: 'subscription', entity_id: s.id, threshold_days: days });
    sentCount++;
  }

  await client.close();
  return new Response(JSON.stringify({ ok: true, sent: sentCount }));
});
