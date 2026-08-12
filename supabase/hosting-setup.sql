-- Run this once in Supabase Dashboard → SQL Editor.
-- Creates the customer_sites table that maps each client company to the
-- GitHub repo/branch their website lives in. The GitHub token itself is
-- NOT stored here — it reuses the existing app_secrets table (see
-- setup.sql), under key 'github_token', which only Edge Functions can read.

create table if not exists customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references profiles(id) on delete cascade,
  repo text not null,              -- 'owner/repo'
  branch text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table customer_sites enable row level security;

-- The client's own company row, its staff (profiles.customer_id pointing at
-- the company), and admins can all see the mapping.
create policy "site visible to owner and staff" on customer_sites
for select using (
  customer_id = auth.uid()
  or customer_id = (select customer_id from profiles where id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Only admins set/change which repo a client is connected to. This is a
-- plain metadata write (no secrets involved), so — like profile edits — it's
-- safe to do directly from the browser client, gated by this policy, rather
-- than going through an Edge Function.
create policy "admins manage sites" on customer_sites
for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Keep updated_at current on every change.
create or replace function set_customer_sites_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_customer_sites_updated_at on customer_sites;
create trigger trg_customer_sites_updated_at
before update on customer_sites
for each row execute function set_customer_sites_updated_at();
