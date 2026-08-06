-- Run this once in Supabase Dashboard → SQL Editor.
-- Creates the locked-down secrets table, the sent-alerts log, and the
-- daily cron schedule that triggers send-expiry-alerts.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Holds SMTP credentials. RLS is enabled with NO policies granted to
-- anon/authenticated, so the anon key (used by the browser app) can never
-- read or write this table — only the service role (used inside Edge
-- Functions) can, since the service role bypasses RLS entirely.
create table if not exists app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;

-- Tracks which alerts have already been sent, so re-running the cron job
-- on the same day never double-sends an email for the same contract/
-- subscription/threshold combination.
create table if not exists alert_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  threshold_days int not null,
  sent_at timestamptz not null default now(),
  unique (entity_type, entity_id, threshold_days)
);
alter table alert_log enable row level security;

-- ── Daily cron job ──────────────────────────────────────────────────
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> below with your actual
-- values before running (Project Settings → API in the Supabase dashboard).
-- The service role key is highly sensitive — it bypasses all RLS. It will
-- live inside this scheduled job definition in your own database, which is
-- the standard pattern Supabase recommends for pg_cron + pg_net triggers.
select cron.schedule(
  'send-expiry-alerts-daily',
  '0 6 * * *', -- 6:00 AM UTC every day — adjust if you want a different time
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-expiry-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check the job is registered:
-- select * from cron.job;

-- To remove it later if needed:
-- select cron.unschedule('send-expiry-alerts-daily');
