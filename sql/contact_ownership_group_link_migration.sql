-- Sprint 18: Optional contact -> ownership group link.
-- Safe to run more than once. Does not force any existing contact to link.

alter table public.contacts
  add column if not exists ownership_group_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_ownership_group_id_fkey'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_ownership_group_id_fkey
      foreign key (ownership_group_id)
      references public.ownership_groups(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_contacts_ownership_group_id
  on public.contacts (ownership_group_id);

comment on column public.contacts.ownership_group_id is
  'Optional link to ownership_groups. Contacts may remain unlinked.';
