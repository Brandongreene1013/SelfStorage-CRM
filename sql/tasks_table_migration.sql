-- ============================================================================
-- Sprint 2: Universal Task / Next-Action Engine — Supabase migration
-- ============================================================================
-- Run this once in the Supabase SQL Editor (https://app.supabase.com → your
-- project → SQL Editor → New query → paste → Run).
--
-- Safe to run multiple times: every statement is idempotent (IF NOT EXISTS /
-- IF EXISTS guards), so re-running it after a partial failure won't error or
-- duplicate anything.
--
-- Context: a `tasks` table already exists in production, created for the
-- Dashboard's simple to-do widget. Its shape is just (id, text, done,
-- created_at). This migration upgrades that SAME table in place to the full
-- universal task schema — it does NOT create a second table — and backfills
-- existing rows so nothing already on Brandon's Dashboard disappears.
-- ============================================================================

-- 0. Make sure the table exists at all (no-op if it already does).
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- 1. Add every new column the universal task model needs. Existing `text`
--    and `done` columns are left in place untouched (see backfill below) —
--    nothing reads them anymore after this migration, but dropping them is
--    unnecessary risk for zero benefit.
alter table public.tasks add column if not exists title         text;
alter table public.tasks add column if not exists description   text;
alter table public.tasks add column if not exists status        text        not null default 'open';
alter table public.tasks add column if not exists priority      text        not null default 'normal';
alter table public.tasks add column if not exists due_date      date;
alter table public.tasks add column if not exists completed_at  timestamptz;
alter table public.tasks add column if not exists updated_at    timestamptz not null default now();
alter table public.tasks add column if not exists related_type  text;
alter table public.tasks add column if not exists related_id    uuid;
alter table public.tasks add column if not exists related_name  text;
alter table public.tasks add column if not exists source        text        not null default 'dashboard';
alter table public.tasks add column if not exists task_type     text        not null default 'general';

-- 2. Backfill existing rows (the old simple to-dos) into the new shape so
--    they keep showing up on the Dashboard after this migration.
update public.tasks
set title = coalesce(title, text, 'Untitled task')
where title is null;

update public.tasks
set status = case when done then 'completed' else 'open' end
where status is null or status = 'open'; -- only touch rows not already migrated

update public.tasks
set completed_at = coalesce(completed_at, created_at)
where done = true and completed_at is null;

-- 3. Constrain the enum-like columns so bad data can't sneak in from a bug
--    elsewhere. Drop-and-recreate so this is safe to re-run.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'completed', 'dismissed'));

alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.tasks drop constraint if exists tasks_related_type_check;
alter table public.tasks add constraint tasks_related_type_check
  check (related_type is null or related_type in ('client', 'contact', 'meeting', 'property', 'general'));

alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('dashboard', 'client', 'database', 'pipeline', 'calendar'));

alter table public.tasks drop constraint if exists tasks_task_type_check;
alter table public.tasks add constraint tasks_task_type_check
  check (task_type in ('call', 'email', 'meeting', 'send_report', 'request_financials', 'bov', 'follow_up', 'contract', 'general'));

-- 4. Indexes for the Dashboard's overdue/today/upcoming grouping queries and
--    for "show tasks related to this client/contact" lookups.
create index if not exists idx_tasks_status_due   on public.tasks (status, due_date);
create index if not exists idx_tasks_related       on public.tasks (related_type, related_id);

-- 5. RLS. VERIFIED NEEDED IN PRODUCTION (2026-07-01): this table had RLS
--    enabled with no permissive policy attached, which silently blocked every
--    insert/update from the app's anon key (both old- and new-shape rows) —
--    even though this project's other app-data tables (clients, contacts,
--    lists, meetings) already allow the anon key full access. This step is
--    NOT optional/conditional — always run it.
alter table public.tasks enable row level security;
drop policy if exists "allow anon full access" on public.tasks;
create policy "allow anon full access" on public.tasks
  for all using (true) with check (true);

-- 6. Drop the leftover NOT NULL on the old `text` column. VERIFIED NEEDED IN
--    PRODUCTION (2026-07-01): the original simple to-do schema required
--    `text` on every row. New-shape task creation never sets `text`, so
--    every insert failed with "null value in column text violates not-null
--    constraint" until this ran. Safe no-op if `text` is already nullable.
alter table public.tasks alter column text drop not null;

-- ============================================================================
-- Done. After running this, refresh the app — the Dashboard's task widget,
-- Client/Contact "Add Task", and Pipeline's next-action indicator will all
-- start working against this same table.
--
-- This exact sequence (steps 0-6) was run against production on 2026-07-01
-- and verified end-to-end via a live create → complete → delete → bad-value-
-- rejected → select round trip using the app's real anon key. All five
-- checks passed. Nothing further should be needed.
-- ============================================================================
