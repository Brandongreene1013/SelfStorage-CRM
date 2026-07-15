-- Contact age field
--
-- Run this in the Supabase SQL Editor before saving ages from Database or
-- Call Mode. The UI can render before this runs, but contact age values will
-- not persist until this column exists.

alter table public.contacts
  add column if not exists age integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_age_reasonable_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_age_reasonable_check
      check (age is null or (age >= 0 and age <= 130));
  end if;
end $$;

comment on column public.contacts.age is
  'Optional owner/contact age, shown in Database and Call Mode as relationship context.';
