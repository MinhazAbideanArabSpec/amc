# Website hosting — deployment steps

This feature has two parts: code already live in the app (Website tab for
clients, Website modal + GitHub Hosting card for admins), and server-side
pieces that need to be deployed to Supabase directly. Follow these steps
once. If you've already done the steps in [`SETUP.md`](SETUP.md), you can
skip step 1 (CLI install) and step 2 (login/link).

## 1. Install the Supabase CLI (Windows)

See [`SETUP.md`](SETUP.md) §1 if you haven't already.

## 2. Log in and link this project

See [`SETUP.md`](SETUP.md) §2 if you haven't already.

## 3. Deploy the three Edge Functions

Run from the project folder (`C:\Users\Minhaz\Documents\amc`):

```powershell
supabase functions deploy save-github-token
supabase functions deploy github-site-backup
supabase functions deploy github-site-publish
```

All three get `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` automatically — no extra secret-setting step.

## 4. Run the SQL setup

Open **Supabase Dashboard → SQL Editor**, paste in the contents of
[`hosting-setup.sql`](hosting-setup.sql), and run it. This creates the
`customer_sites` table (which client is connected to which GitHub repo) and
its row-level-security policies.

## 5. Generate a GitHub personal access token

In GitHub: **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**.

- **Repository access**: select only the repos this portal should be able to
  publish to (you can add more later by editing the token).
- **Permissions**: Repository permissions → **Contents: Read and write**.
  Nothing else is needed.
- Copy the token — GitHub only shows it once.

## 6. Enter the token in the app

Log in as admin → **Settings** tab → **GitHub Hosting** card → paste the
token → **Save Token**.

## 7. Connect each client to their repo

Admin → **Clients** tab → find the client → **Website** button → enter the
repo as `owner/repo` (e.g. `arabspec/al-noor-site`) and the branch (usually
`main`) → **Save**.

## 8. Test it

"Login as Client" for that client (or have them log in themselves) →
**Website** tab → **Download Backup** to confirm it pulls the repo's current
files, then edit a file, re-zip it, and **Publish Changes**. Check the repo
on GitHub afterward — you should see a new commit on the branch you set,
authored by `ArabSpec Hosting Bot <hosting@arabspec.com>`. If the repo has an
existing Vercel deployment connected via GitHub, it will redeploy on its own
— this app makes no calls related to Vercel at all.
