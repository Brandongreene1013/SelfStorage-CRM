-- Daily production scorecard fields.
-- Safe to run more than once.
--
-- The app now tracks Brandon's manually entered end-of-day scorecard:
-- calls, voicemails, conversations, additions to database, and BOV proposals.
-- Existing legacy columns are preserved. Backfills happen only when a new
-- column is first created, so rerunning this file will not overwrite later
-- manual edits.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_progress'
      and column_name = 'voicemails'
  ) then
    alter table public.daily_progress
      add column voicemails integer not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_progress'
      and column_name = 'additions_to_database'
  ) then
    alter table public.daily_progress
      add column additions_to_database integer not null default 0;

    update public.daily_progress
    set additions_to_database = coalesce(facilities, 0);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_progress'
      and column_name = 'bov_proposals'
  ) then
    alter table public.daily_progress
      add column bov_proposals integer not null default 0;

    update public.daily_progress
    set bov_proposals = coalesce(bovs, 0);
  end if;
end $$;

comment on column public.daily_progress.voicemails is
  'Manual daily count of voicemails left.';

comment on column public.daily_progress.additions_to_database is
  'Manual daily count of contacts/leads added to the database.';

comment on column public.daily_progress.bov_proposals is
  'Manual daily count of BOV proposals sent or prepared.';
