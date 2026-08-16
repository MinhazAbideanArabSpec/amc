// marketing-unsubscribe — PUBLIC (no login required; recipients click this
// straight from their email client). Verifies the signed token matches the
// email before recording the suppression, so nobody can unsubscribe an
// address that isn't theirs to click. Deployed with --no-verify-jwt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function page(title: string, message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body{font-family:Arial,sans-serif;background:#F8FAFC;color:#1C2127;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;}
    .box{max-width:420px;text-align:center;background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:36px 28px;}
    h1{font-size:18px;margin:0 0 10px;}
    p{font-size:14px;color:#64748B;margin:0;}
  </style></head>
  <body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  const token = url.searchParams.get('token') || '';

  if (!email || !token) {
    return page('Invalid link', 'This unsubscribe link is missing information and could not be processed.');
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: secretRow } = await admin.from('app_secrets').select('value').eq('key', 'marketing_unsubscribe_secret').single();
  if (!secretRow?.value) {
    return page('Unavailable', 'This unsubscribe link is not active right now. Please contact us directly.');
  }

  const expected = await hmacHex(secretRow.value, email);
  if (expected !== token) {
    return page('Invalid link', 'This unsubscribe link is invalid or has expired.');
  }

  await admin.from('marketing_unsubscribes').upsert({ email });

  return page('You’re unsubscribed', `${email} will not receive any further marketing emails from us.`);
});
