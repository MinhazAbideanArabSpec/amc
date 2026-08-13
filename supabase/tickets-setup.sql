-- Run this once in Supabase Dashboard -> SQL Editor (or via
-- `supabase db query --linked -f supabase/tickets-setup.sql`).
-- Creates the support ticketing tables: one row per ticket, one row per
-- message in its conversation thread.

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  created_by uuid not null references profiles(id),
  subject text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tickets enable row level security;

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
alter table ticket_messages enable row level security;

create index if not exists idx_ticket_messages_ticket_id on ticket_messages(ticket_id);
create index if not exists idx_tickets_customer_id on tickets(customer_id);

-- ── tickets policies ──────────────────────────────────────────
create policy "tickets_select_admin" on tickets
for select using (is_admin());

create policy "customers_read_own_tickets" on tickets
for select using (customer_id = get_customer_id());

create policy "customers_create_own_tickets" on tickets
for insert with check (customer_id = get_customer_id());

create policy "tickets_update_admin" on tickets
for update using (is_admin());

create policy "tickets_delete_admin" on tickets
for delete using (is_admin());

-- ── ticket_messages policies ──────────────────────────────────
create policy "messages_admin_all" on ticket_messages
for all using (is_admin()) with check (is_admin());

create policy "customers_read_own_ticket_messages" on ticket_messages
for select using (
  exists (select 1 from tickets t where t.id = ticket_messages.ticket_id and t.customer_id = get_customer_id())
);

create policy "customers_insert_own_ticket_messages" on ticket_messages
for insert with check (
  exists (select 1 from tickets t where t.id = ticket_messages.ticket_id and t.customer_id = get_customer_id())
);

-- Keep the parent ticket's updated_at (and therefore its position in any
-- "most recently active" sort) current whenever a new message lands,
-- regardless of who posted it. Runs as the function owner (security
-- definer) since a customer posting a reply has no UPDATE grant on
-- tickets themselves — this is the one narrow, deliberate exception.
create or replace function set_ticket_updated_at()
returns trigger as $$
begin
  update public.tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_ticket_message_updates_ticket on ticket_messages;
create trigger trg_ticket_message_updates_ticket
after insert on ticket_messages
for each row execute function set_ticket_updated_at();
