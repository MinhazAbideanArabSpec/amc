# Cloudflare DNS + Web Analytics setup

One-time setup to let clients view their domain's DNS records and Web
Analytics from their own Hosting tab, backed by Cloudflare.

## 1. Run the migration

In Supabase Dashboard → SQL Editor, run `supabase/cloudflare-setup.sql`.
This adds `cloudflare_zone_id` and `cloudflare_site_tag` columns to the
existing `customer_sites` table (see `hosting-setup.sql`).

## 2. Create a scoped Cloudflare API token

Cloudflare Dashboard → My Profile → API Tokens → Create Token → Custom
Token, with:
- **Zone → DNS → Read** (all zones, or the specific zones you manage)
- **Account → Account Analytics → Read**

## 3. Find your Account ID

Cloudflare Dashboard → any domain's Overview page → right sidebar, "API"
section → Account ID.

## 4. Save both in the portal

Settings → Cloudflare card → paste the Account ID and API Token → Save.

## 5. Per customer: connect DNS

Clients → (customer) → Website → Zone ID field. Find it on that domain's
Cloudflare Overview page, same sidebar as the Account ID.

## 6. Per customer: connect Web Analytics

1. Cloudflare Dashboard → Analytics & Logs → Web Analytics → Add a site →
   enter the domain.
2. Cloudflare shows a JS snippet like:
   ```html
   <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "abcd1234...", "siteTag": "xyz987654321"}'></script>
   ```
3. Add that snippet once to the site's HTML (e.g. before `</body>`) via the
   client's own Website tab publish flow. It persists through future
   publishes since it's baked into the file.
4. Copy the `siteTag` value from the snippet into Clients → (customer) →
   Website → Site Tag field.

Data starts appearing once real visitors load the page with the snippet in
place — there's no backfill for time before it was added.
