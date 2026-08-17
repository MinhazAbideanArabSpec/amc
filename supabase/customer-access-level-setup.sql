-- Adds a per-client access tier, independent of role. 'full' (default)
-- keeps today's behavior; 'hosting' restricts a client-side account to only
-- the Hosting tab, everything else shows a "no permission" message instead
-- of real content. Set on the top-level company profile (customer_id is
-- null) — staff sub-accounts inherit their parent company's access_level,
-- same as they already inherit next_visit_date.

alter table profiles add column if not exists access_level text not null default 'full';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_access_level_check'
  ) then
    alter table profiles add constraint profiles_access_level_check check (access_level in ('full', 'hosting'));
  end if;
end $$;
