-- Client age field
--
-- Run this in the Supabase SQL Editor before saving client ages in production.
-- The app keeps working before this migration is run, but age values will not
-- persist until this column exists.

alter table public.clients
  add column if not exists age integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_age_reasonable_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_age_reasonable_check
      check (age is null or (age >= 0 and age <= 130));
  end if;
end $$;

comment on column public.clients.age is
  'Optional client age, used as a small relationship detail in the CRM.';
