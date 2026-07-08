-- Sprint 21b: Optional client -> ownership group link.
-- Run after sql/ownership_property_foundation_migration.sql.
-- Safe to run more than once. This lets active Clients use the same
-- "one owner, many property addresses" model as Master Database contacts.

alter table public.clients
  add column if not exists ownership_group_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_ownership_group_id_fkey'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_ownership_group_id_fkey
      foreign key (ownership_group_id)
      references public.ownership_groups(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_clients_ownership_group_id
  on public.clients (ownership_group_id);

comment on column public.clients.ownership_group_id is
  'Optional link to ownership_groups. Active pipeline clients can share the same multi-property address list as database contacts.';
