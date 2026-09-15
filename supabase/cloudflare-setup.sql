-- Run this once in Supabase Dashboard → SQL Editor.
-- Adds the per-customer Cloudflare identifiers to the existing
-- customer_sites table (see hosting-setup.sql). The shared API token and
-- account ID are NOT stored here — they reuse app_secrets (see
-- CLOUDFLARE_SETUP.md), under keys 'cloudflare_api_token' and
-- 'cloudflare_account_id', which only Edge Functions can read.

alter table customer_sites add column if not exists cloudflare_zone_id text;
alter table customer_sites add column if not exists cloudflare_site_tag text;
