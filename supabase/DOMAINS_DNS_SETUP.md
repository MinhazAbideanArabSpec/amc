# GoDaddy DNS viewing — deployment steps

This feature has two parts: code already live in the app (read-only
Domains subtab under Hosting for clients, GoDaddy DNS card in admin
Settings, Website modal's Domain field for admins), and server-side pieces
that need to be deployed to Supabase directly. Follow these steps once. If
you've already done the steps in [`SETUP.md`](SETUP.md), you can skip step
1 (CLI install) and step 2 (login/link).

Clients can only **view** DNS records from the portal — there's no add/
edit/delete. That's a deliberate match to the token scope below, not just
a UI restriction: the shared token should only ever be granted read
access, so there's nothing sensitive to protect against a client-side bug
or a compromised session.

## 1. Install the Supabase CLI (Windows)

See [`SETUP.md`](SETUP.md) §1 if you haven't already.

## 2. Log in and link this project

See [`SETUP.md`](SETUP.md) §2 if you haven't already.

## 3. Deploy the Edge Functions

Run from the project folder (`C:\Users\Minhaz\Documents\amc`):

```powershell
supabase functions deploy save-godaddy-token
supabase functions deploy godaddy-dns-list
supabase functions deploy get-settings-status
```

All three get `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` automatically — no extra secret-setting step.
(`get-settings-status` is re-deployed because it now also reports the
GoDaddy token's length, for the masked Settings input.)

## 4. Run the SQL setup

Open **Supabase Dashboard → SQL Editor**, paste in the contents of
[`domains-dns-setup.sql`](domains-dns-setup.sql), and run it. This adds the
`domain` column to the existing `customer_sites` table.

## 5. Generate a GoDaddy Personal Access Token

DNS record reading lives on GoDaddy's newer v3 API, which requires a
**Personal Access Token (PAT)** — a single token, not the older API
key/secret pair. In GoDaddy:
**[developer.godaddy.com/en/personal-access-token](https://developer.godaddy.com/en/personal-access-token)**
→ **+ Generate Token**.

- In the scope picker, grant **read-only** access — just
  `domains.domain:read`, not the full "Domains & DNS" bundle (which also
  includes write access this feature never uses). Expand the bundle in the
  picker to select the individual read scope instead of the whole thing.
- Copy the token — it's shown only once at creation.
- This token can read every domain on the GoDaddy account it was created
  under, so use an account that has (or will have) all the customer
  domains you want visible from the portal.
- PATs can expire — GoDaddy will prompt you to generate a replacement
  before that happens; re-enter the new one in Settings when you do.

## 6. Enter the token in the app

Log in as admin → **Settings** tab → **GoDaddy DNS** card → paste the
token → **Save Token**.

## 7. Connect each client to their domain

Admin → **Clients** tab → find the client → **Website** button → enter the
domain in the **Domain** field (e.g. `al-noor.ae`, no `https://` or `www.`)
→ **Save**.

## 8. Test it

"Login as Client" for that client (or have them log in themselves) →
**Hosting → Domains** subtab → confirm the current DNS records load and
match what's shown in GoDaddy's own DNS management page for that domain.
