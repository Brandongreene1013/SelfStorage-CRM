-- Deceased-owner and inheritance relationship support for Database / Call Mode.
-- Safe to run more than once.
--
-- Run in the Supabase SQL Editor for project rpoiphoqwgvbiyygfjrm.

alter table public.contacts
  add column if not exists is_deceased boolean not null default false,
  add column if not exists deceased_date date,
  add column if not exists inherited_by_contact_id uuid,
  add column if not exists inheritor_relationship text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_inherited_by_contact_id_fkey'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_inherited_by_contact_id_fkey
      foreign key (inherited_by_contact_id)
      references public.contacts(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_contacts_is_deceased
  on public.contacts (is_deceased);

create index if not exists idx_contacts_inherited_by_contact_id
  on public.contacts (inherited_by_contact_id)
  where inherited_by_contact_id is not null;

comment on column public.contacts.is_deceased is
  'Marks a person as deceased without deleting their contact, call history, or ownership history.';
comment on column public.contacts.deceased_date is
  'Optional known date of death.';
comment on column public.contacts.inherited_by_contact_id is
  'Optional contact who inherited or now controls the deceased owner''s property interest.';
comment on column public.contacts.inheritor_relationship is
  'Free-text relationship to the deceased owner, e.g. son, daughter, spouse, trustee, or executor.';
