// marketing-unsubscribe — PUBLIC (no login required; recipients click this
// straight from their email client). Verifies the signed token matches the
// email before recording the suppression, so nobody can unsubscribe an
// address that isn't theirs to click. Deployed with --no-verify-jwt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hmacHex, htmlPage } from '../_shared/marketing.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  const token = url.searchParams.get('token') || '';

  if (!email || !token) {
    return htmlPage('Invalid link', 'This unsubscribe link is missing information and could not be processed.');
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: secretRow } = await admin.from('app_secrets').select('value').eq('key', 'marketing_unsubscribe_secret').single();
  if (!secretRow?.value) {
    return htmlPage('Unavailable', 'This unsubscribe link is not active right now. Please contact us directly.');
  }

  const expected = await hmacHex(secretRow.value, email);
  if (expected !== token) {
    return htmlPage('Invalid link', 'This unsubscribe link is invalid or has expired.');
  }

  await admin.from('marketing_unsubscribes').upsert({ email });

  return htmlPage('You’re unsubscribed', `${email} will not receive any further marketing emails from us.`);
});
