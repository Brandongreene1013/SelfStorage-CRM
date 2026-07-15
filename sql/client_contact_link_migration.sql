-- Optional client -> contact link
--
-- This is the non-destructive bridge between the old two-table world:
-- contacts remain the canonical Database / Call Mode owner record, while
-- clients can link back to that owner when they are active in Pipeline.
--
-- Run this in the Supabase SQL Editor before relying on integrated
-- contact/client syncing.

alter table public.clients
  add column if not exists contact_id uuid null;

do $$
begin
  if to_regclass('public.contacts') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'clients_contact_id_fkey'
        and conrelid = 'public.clients'::regclass
    ) then
    alter table public.clients
      add constraint clients_contact_id_fkey
      foreign key (contact_id)
      references public.contacts(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_clients_contact_id
  on public.clients (contact_id);

comment on column public.clients.contact_id is
  'Optional link to the canonical Database/Call Mode contact record for this pipeline client.';
