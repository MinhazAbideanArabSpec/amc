-- Run this once in Supabase Dashboard → SQL Editor.
-- Adds the domain name needed to manage DNS via GoDaddy, alongside the
-- repo/branch/vercel columns customer_sites already has. The GoDaddy API
-- key and secret themselves are NOT stored here — they reuse the existing
-- app_secrets table (see setup.sql), under keys 'godaddy_api_key' and
-- 'godaddy_api_secret', which only Edge Functions can read.

alter table customer_sites add column if not exists domain text;
