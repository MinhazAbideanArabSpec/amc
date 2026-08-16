// marketing-track-click — PUBLIC (recipients click this straight from the
// email, no login). Verifies the signed campaign+email token before
// recording a click, then redirects to the original link. Only redirects on
// a valid token — never blindly redirects to whatever "u" says, since that
// would make this endpoint an open redirector. Deployed with --no-verify-jwt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hmacHex, htmlPage } from '../_shared/marketing.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get('c') || '';
  const email = (url.searchParams.get('e') || '').trim().toLowerCase();
  const token = url.searchParams.get('t') || '';
  const target = url.searchParams.get('u') || '';

  if (!campaignId || !email || !token || !target) {
    return htmlPage('Invalid link', 'This link is missing information and could not be processed.');
  }
  if (!/^https?:\/\//i.test(target)) {
    return htmlPage('Invalid link', 'This link could not be processed.');
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: secretRow } = await admin.from('app_secrets').select('value').eq('key', 'marketing_unsubscribe_secret').single();
  if (!secretRow?.value) {
    return htmlPage('Unavailable', 'This link is not active right now.');
  }

  const expected = await hmacHex(secretRow.value, `${campaignId}:${email}`);
  if (expected !== token) {
    return htmlPage('Invalid link', 'This link is invalid or has expired.');
  }

  const { data: row } = await admin.from('marketing_campaign_recipients')
    .select('click_count, clicked_at').eq('campaign_id', campaignId).eq('email', email).single();
  if (row) {
    await admin.from('marketing_campaign_recipients').update({
      click_count: (row.click_count || 0) + 1,
      clicked_at: row.clicked_at || new Date().toISOString(),
    }).eq('campaign_id', campaignId).eq('email', email);
  }

  return Response.redirect(target, 302);
});
