-- Daily Activity Intelligence foundation.
-- Safe to run more than once.
--
-- Stores email/activity evidence, daily review drafts, and the final counters
-- that merge into daily_progress.

alter table public.daily_progress
  add column if not exists owners_identified integer not null default 0,
  add column if not exists unique_owners_worked integer not null default 0,
  add column if not exists total_owner_actions integer not null default 0;

create table if not exists public.daily_email_events (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,
  direction text not null default 'sent',
  counterparty_email text not null,
  counterparty_name text,
  subject text,
  summary text,
  body_preview text,
  sent_at timestamptz not null,
  activity_date date not null,
  matched_table text,
  matched_id uuid,
  match_method text,
  confidence numeric,
  needs_review boolean not null default false,
  important boolean not null default false,
  importance_reasons text[] not null default '{}',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists daily_email_events_activity_date_idx
  on public.daily_email_events(activity_date);

create index if not exists daily_email_events_match_idx
  on public.daily_email_events(matched_table, matched_id);

create table if not exists public.daily_activity_reviews (
  activity_date date primary key,
  status text not null default 'draft'
    check (status in ('draft', 'review_sent', 'approved', 'auto_logged')),
  generated_at timestamptz not null default now(),
  review_sent_at timestamptz,
  finalized_at timestamptz,
  email_status text,
  summary jsonb not null default '{}'::jsonb,
  important_items jsonb not null default '[]'::jsonb,
  slipped_items jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  approved_counts jsonb,
  error text
);

comment on table public.daily_email_events is
  'Normalized sent/received email evidence used by Daily Activity Intelligence. Unknown/unmatched emails are retained for slipped-through-the-cracks review.';

comment on table public.daily_activity_reviews is
  'One daily draft/final activity intelligence summary. 5pm review and 8pm auto-log update this row.';

comment on column public.daily_progress.owners_identified is
  'Daily Activity Intelligence/manual count of unique owners identified that day.';

comment on column public.daily_progress.unique_owners_worked is
  'Daily Activity Intelligence/manual count of unique owners touched that day.';

comment on column public.daily_progress.total_owner_actions is
  'Daily Activity Intelligence/manual count of total owner-touch actions that day.';
