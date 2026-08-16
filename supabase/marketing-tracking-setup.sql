-- Per-recipient open/click tracking for marketing campaigns. One row per
-- recipient per campaign, created at send time and updated by the public
-- tracking pixel / click-redirect Edge Functions as events come in.

create table if not exists marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  email text not null,
  opened_at timestamptz,
  open_count int not null default 0,
  clicked_at timestamptz,
  click_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index if not exists marketing_campaign_recipients_campaign_idx
  on marketing_campaign_recipients (campaign_id);

alter table marketing_campaign_recipients enable row level security;

-- Admins read recipient-level detail from the client; all writes happen via
-- the service-role key inside the send/tracking Edge Functions.
create policy "marketing_campaign_recipients_admin_read" on marketing_campaign_recipients
for select using (is_admin());
