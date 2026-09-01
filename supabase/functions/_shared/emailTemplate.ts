// Shared HTML email template for expiry alerts, used by both
// send-expiry-alerts (real alerts) and send-test-email (test mode), so a
// test email always looks exactly like what recipients actually receive.

export interface AlertEmailData {
  type: 'contract' | 'subscription';
  itemName: string;      // contract number, or software name
  vendor?: string;       // subscriptions only
  customerName: string;
  expiryDate: string;    // ISO date
  daysLeft: number;
  isTest?: boolean;
}

const LOGO_URL = 'https://taihtmdhismfnhmboryy.supabase.co/storage/v1/object/public/logos/site/logo';
const INK = '#1C2127';
const RED = '#C0392B';
const RED_BG = '#FDEDEC';
const AMBER = '#92660F';
const AMBER_BG = '#FAF1E0';
const ACCENT = '#3B5773';
const ACCENT_BG = '#E9EEF3';
const MUTED = '#6B7280';
const LINE = '#E5E1D8';

function urgency(days: number) {
  if (days <= 14) return { fg: RED, bg: RED_BG, label: 'Urgent' };
  if (days <= 30) return { fg: AMBER, bg: AMBER_BG, label: 'Action needed soon' };
  return { fg: ACCENT, bg: ACCENT_BG, label: 'Advance notice' };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function renderAlertEmailHtml(data: AlertEmailData): string {
  const { type, itemName, vendor, customerName, expiryDate, daysLeft, isTest } = data;
  const u = urgency(daysLeft);
  const typeLabel = type === 'contract' ? 'Contract' : 'Software Renewal';
  // Lines that are pure whitespace (e.g. an empty ${testBanner} slot on real
  // alerts) get quoted-printable-encoded as a trailing "=20" by some SMTP
  // pipelines. Clients that don't decode QP show that escape sequence
  // literally instead of a blank line, so trailing whitespace is stripped
  // from every line of the final HTML before it's returned.
  const stripTrailingWhitespace = (html: string) => html.split('\n').map(line => line.replace(/[ \t]+$/, '')).join('\n');

  const testBanner = isTest ? `
        <tr><td style="background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;text-align:center;padding:8px;letter-spacing:0.04em;text-transform:uppercase;">
          Test email — no action needed
        </td></tr>` : '';

  const vendorRow = vendor ? `
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;">Vendor</td>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};text-align:right;font-weight:600;font-size:14px;color:${INK};">${vendor}</td>
              </tr>` : '';

  return stripTrailingWhitespace(`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#FAFAF9;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid ${LINE};">
        ${testBanner}
        <tr>
          <td style="background:${INK};padding:20px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;">
                <img src="${LOGO_URL}" alt="ArabSpec" height="32" style="display:block;border-radius:5px;background:#fff;padding:4px 6px;"/>
              </td>
              <td style="color:#ffffff;font-size:16px;font-weight:600;vertical-align:middle;">ArabSpec Orbit Portal</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${typeLabel} Expiring</p>
            <h1 style="margin:0 0 16px;font-size:20px;color:${INK};">${itemName}</h1>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${u.bg};border-radius:6px;margin-bottom:20px;">
              <tr>
                <td style="padding:16px 18px;">
                  <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${u.fg};margin-bottom:6px;">${u.label}</span>
                  <span style="font-size:26px;font-weight:700;color:${u.fg};">${daysLeft} day${daysLeft === 1 ? '' : 's'}</span>
                  <span style="font-size:13px;color:${u.fg};"> remaining</span>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;">Customer</td>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};text-align:right;font-weight:600;font-size:14px;color:${INK};">${customerName}</td>
              </tr>${vendorRow}
              <tr>
                <td style="padding:8px 0;color:${MUTED};font-size:14px;">Expiry Date</td>
                <td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;color:${INK};">${fmtDate(expiryDate)}</td>
              </tr>
            </table>

            <p style="margin:0;font-size:14px;line-height:1.6;color:${INK};">
              Please reach out to your ArabSpec account contact if you'd like to discuss renewal options.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;padding:16px 28px;border-top:1px solid ${LINE};">
            <p style="margin:0;font-size:11px;color:${MUTED};">ArabSpec Orbit Portal — Automated notification. Please do not reply directly to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`);
}

export function renderAlertEmailText(data: AlertEmailData): string {
  const typeLabel = data.type === 'contract' ? 'Contract' : 'Software Renewal';
  return `${data.isTest ? '[TEST EMAIL — no action needed]\n\n' : ''}${typeLabel} Expiring: ${data.itemName}\nCustomer: ${data.customerName}${data.vendor ? `\nVendor: ${data.vendor}` : ''}\nExpiry Date: ${fmtDate(data.expiryDate)}\nDays Remaining: ${data.daysLeft}\n\nPlease reach out to your ArabSpec account contact if you'd like to discuss renewal options.\n\n— ArabSpec Orbit Portal`;
}

export function renderAlertSubject(data: AlertEmailData): string {
  const prefix = data.isTest ? '[TEST] ' : '';
  return data.type === 'contract'
    ? `${prefix}Contract ${data.itemName} expires in ${data.daysLeft} days`
    : `${prefix}${data.itemName} renewal expires in ${data.daysLeft} days`;
}
