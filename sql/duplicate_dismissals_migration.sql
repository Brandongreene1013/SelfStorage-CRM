-- Sprint 12: Persistent "Not a duplicate" dismissals for the Duplicate Review Center.
-- Run this once in the Supabase SQL Editor. Safe to run more than once.
--
-- pair_key is the duplicate GROUP key from src/lib/duplicateReview.js:
-- the member contact ids sorted and joined with '|'. Order-independent by
-- construction. If any member contact is later deleted, the group can never
-- regenerate with that key, so stale rows are harmless (and cleaned up
-- opportunistically by the app).

create table if not exists public.duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null unique,
  contact_ids jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.duplicate_dismissals is
  'Duplicate Review groups Brandon marked "Not a duplicate" — hidden from future scans.';

-- Match the app-data convention: permissive RLS (the anon key reads/writes).
alter table public.duplicate_dismissals enable row level security;

drop policy if exists "duplicate_dismissals_all" on public.duplicate_dismissals;
create policy "duplicate_dismissals_all" on public.duplicate_dismissals
  for all using (true) with check (true);
