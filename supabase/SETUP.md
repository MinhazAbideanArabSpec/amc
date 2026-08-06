# Email expiry alerts — deployment steps

This feature has two parts: code already live in the app (Settings tab UI),
and server-side pieces that need to be deployed to Supabase directly. Follow
these steps once.

## 1. Install the Supabase CLI (Windows)

The Supabase CLI blocks plain `npm install -g supabase` — use one of these
instead, run from PowerShell.

**Option A — Scoop (installs it permanently, recommended if you'll use the
CLI again later):**

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Option B — npx (no install, prefix every command below with `npx`):**

```powershell
npx supabase --version
```
If that prints a version number, just prepend `npx ` to every `supabase ...`
command in the rest of this guide instead of installing anything.

## 2. Log in and link this project

```powershell
supabase login
supabase link --project-ref <PROJECT_REF>
```

(If using npx: `npx supabase login` and `npx supabase link --project-ref <PROJECT_REF>`.)

`<PROJECT_REF>` is in your Supabase dashboard URL, e.g.
`supabase.com/dashboard/project/taihtmdhismfnhmboryy` → ref is `taihtmdhismfnhmboryy`.

Run this from the project folder (`C:\Users\Minhaz\Documents\amc`) so it
finds the `supabase/` directory.

## 3. Deploy the two Edge Functions

```powershell
supabase functions deploy save-smtp-settings
supabase functions deploy send-expiry-alerts
```

Both need the service role key available to them automatically —
Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to every Edge Function by default, so no
extra secret-setting step is needed here.

## 4. Run the SQL setup

Open **Supabase Dashboard → SQL Editor**, paste in the contents of
[`setup.sql`](setup.sql), replace `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`
with your actual values (find both under **Project Settings → API**), and
run it. This creates the secrets table, the sent-alerts log, and the daily
cron schedule.

## 5. Enter your Zoho SMTP details in the app

Log in as admin → **Settings** tab → **Email Alerts (SMTP)** card → fill in
your Zoho host/port/username/password → Save.

Typical Zoho values:
- Host: `smtp.zoho.com` (or `smtp.zoho.eu` / `smtp.zoho.in` depending on your
  account's data center)
- Port: `465` with "Use SSL" checked, or `587` without
- Username: your full Zoho email address
- Password: a Zoho **app-specific password** (Zoho requires this for SMTP,
  not your regular login password — generate one under Zoho Mail →
  Settings → Security → App Passwords)

## 6. Test it

You can manually trigger the function once to confirm it works, instead of
waiting for the daily 6 AM run:

```powershell
supabase functions invoke send-expiry-alerts
```
(or `npx supabase functions invoke send-expiry-alerts` if using npx)

Check the response for `{ "sent": N }`. If `N` is 0, that just means nothing
currently falls on exactly 60/30/14/7 days from today — it's still a fully
successful test.
