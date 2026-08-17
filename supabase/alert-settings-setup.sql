-- Single-row settings table for the renewal alert thresholds, so admins can
-- adjust them from the portal instead of them being hardcoded in the
-- send-expiry-alerts Edge Function.

create table if not exists alert_settings (
  id int primary key default 1,
  threshold_days int[] not null default '{60,30,14,7}',
  updated_at timestamptz not null default now(),
  constraint alert_settings_singleton check (id = 1)
);

insert into alert_settings (id, threshold_days)
values (1, '{60,30,14,7}')
on conflict (id) do nothing;

alter table alert_settings enable row level security;

create policy "alert_settings_admin_all" on alert_settings
for all using (is_admin()) with check (is_admin());
