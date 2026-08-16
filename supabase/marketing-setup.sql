-- Marketing email module: admin-only bulk sends to an uploaded recipient
-- list, with a persistent unsubscribe suppression list honored across
-- every future campaign regardless of what list they're re-uploaded in.

create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  total_recipients int not null default 0,
  sent_count int not null default 0,
  skipped_unsubscribed int not null default 0,
  failed_emails jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists marketing_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now()
);

alter table marketing_campaigns enable row level security;
alter table marketing_unsubscribes enable row level security;

-- Only admins ever read/write campaign history from the client.
create policy "marketing_campaigns_admin_all" on marketing_campaigns
for all using (is_admin()) with check (is_admin());

-- Admins can view the suppression list; writes only happen via the
-- public unsubscribe Edge Function using the service-role key (bypasses RLS),
-- same deny-by-default pattern as app_secrets.
create policy "marketing_unsubscribes_admin_read" on marketing_unsubscribes
for select using (is_admin());
