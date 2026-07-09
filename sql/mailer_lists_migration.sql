-- ============================================================================
-- Mailer Lists — Supabase migration
-- ============================================================================
-- Run once in the Supabase SQL Editor. Safe to re-run: everything is
-- idempotent (IF NOT EXISTS / drop-and-recreate policies).
--
-- Two tables: mailer_lists (the named lists) and mailer_list_members
-- (contacts/clients on a list, referenced by id — the mailing address itself
-- stays on the contact/client record so edits there flow through).
-- ============================================================================

create table if not exists public.mailer_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mailer_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.mailer_lists(id) on delete cascade,
  member_type text not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  unique (list_id, member_type, member_id)
);

alter table public.mailer_list_members drop constraint if exists mailer_member_type_check;
alter table public.mailer_list_members add constraint mailer_member_type_check
  check (member_type in ('contact', 'client'));

create index if not exists idx_mailer_members_list   on public.mailer_list_members (list_id);
create index if not exists idx_mailer_members_member on public.mailer_list_members (member_type, member_id);

-- RLS: same permissive anon-access pattern as the other app-data tables.
-- Always run — tables created with RLS on and no policy silently block the app
-- (this bit the tasks table once already; see sql/tasks_table_migration.sql).
alter table public.mailer_lists enable row level security;
drop policy if exists "allow anon full access" on public.mailer_lists;
create policy "allow anon full access" on public.mailer_lists
  for all using (true) with check (true);

alter table public.mailer_list_members enable row level security;
drop policy if exists "allow anon full access" on public.mailer_list_members;
create policy "allow anon full access" on public.mailer_list_members
  for all using (true) with check (true);
