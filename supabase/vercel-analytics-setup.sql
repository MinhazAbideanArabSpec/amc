-- Run this once in Supabase Dashboard -> SQL Editor (or via
-- `supabase db query --linked -f supabase/vercel-analytics-setup.sql`).
-- Adds the Vercel project identifiers needed to query that customer's
-- Web Analytics, alongside the repo/branch columns customer_sites
-- already has. The Vercel access token itself lives in app_secrets
-- (key 'vercel_token'), same pattern as the GitHub token — shared across
-- customers, never exposed to the browser.

alter table customer_sites add column if not exists vercel_project_id text;
alter table customer_sites add column if not exists vercel_team_id text;
