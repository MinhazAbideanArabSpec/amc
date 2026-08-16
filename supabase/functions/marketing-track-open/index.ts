// marketing-track-open — PUBLIC (loaded as an <img> by the recipient's email
// client, no login involved). Verifies the signed campaign+email token
// before recording an open, then always returns a 1x1 transparent GIF so the
// pixel never renders as broken — invalid/tampered requests are silently
// no-ops. Deployed with --no-verify-jwt.
//
// Caveat worth knowing: many mail clients (Gmail, Apple Mail with Mail
// Privacy Protection, Outlook with blocked images) either proxy-cache this
// pixel or don't load remote images at all, so open counts are a floor, not
// an exact number — industry-standard limitation of pixel tracking.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hmacHex, TRACKING_PIXEL } from '../_shared/marketing.ts';

const pixelHeaders = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get('c') || '';
  const email = (url.searchParams.get('e') || '').trim().toLowerCase();
  const token = url.searchParams.get('t') || '';

  if (campaignId && email && token) {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: secretRow } = await admin.from('app_secrets').select('value').eq('key', 'marketing_unsubscribe_secret').single();
    if (secretRow?.value) {
      const expected = await hmacHex(secretRow.value, `${campaignId}:${email}`);
      if (expected === token) {
        const { data: row } = await admin.from('marketing_campaign_recipients')
          .select('open_count, opened_at').eq('campaign_id', campaignId).eq('email', email).single();
        if (row) {
          await admin.from('marketing_campaign_recipients').update({
            open_count: (row.open_count || 0) + 1,
            opened_at: row.opened_at || new Date().toISOString(),
          }).eq('campaign_id', campaignId).eq('email', email);
        }
      }
    }
  }

  return new Response(TRACKING_PIXEL, { headers: pixelHeaders });
});
