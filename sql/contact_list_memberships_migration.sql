-- Additive contact membership for targeted call lists.
--
-- Contacts keep one canonical row and one home/source list in contacts.list_id.
-- This join table lets the same contact appear in any number of targeted call
-- lists without moving or duplicating the contact. Safe to run more than once.

create table if not exists public.contact_list_memberships (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contact_id, list_id)
);

create index if not exists idx_contact_list_memberships_list
  on public.contact_list_memberships (list_id, created_at);

create index if not exists idx_contact_list_memberships_contact
  on public.contact_list_memberships (contact_id);

alter table public.contact_list_memberships enable row level security;

drop policy if exists "allow anon full access" on public.contact_list_memberships;
create policy "allow anon full access"
  on public.contact_list_memberships
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "allow authenticated full access" on public.contact_list_memberships;
create policy "allow authenticated full access"
  on public.contact_list_memberships
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.contact_list_memberships is
  'Additive membership of one canonical contact in targeted call lists.';

-- Verification after running:
-- select to_regclass('public.contact_list_memberships') as membership_table;
-- select policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename = 'contact_list_memberships';
