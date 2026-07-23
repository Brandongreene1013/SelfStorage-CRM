-- Storage Hunters CRM: analytics integrity foundation.
-- Safe to run more than once.
--
-- Before running:
-- 1. Download an in-app backup.
-- 2. Run the encrypted GitHub backup workflow and confirm its artifact.
-- 3. Paste this file into the Supabase SQL Editor and run it.
-- 4. Refresh the app and verify with guarded QA records.
--
-- Existing owner names are intentionally NOT backfilled. The old schema did
-- not record when a blank owner was first identified, so inventing dates would
-- make historical analytics look precise when they are not.

alter table public.contacts
  add column if not exists owner_identified_at timestamptz;

comment on column public.contacts.owner_identified_at is
  'Immutable first successful blank-to-meaningful owner-name save. No historical backfill.';

create or replace function public.preserve_owner_identified_at()
returns trigger
language plpgsql
as $$
begin
  if old.owner_identified_at is not null then
    new.owner_identified_at := old.owner_identified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_preserve_owner_identified_at on public.contacts;
create trigger contacts_preserve_owner_identified_at
before update on public.contacts
for each row
execute function public.preserve_owner_identified_at();

alter table public.tasks drop constraint if exists tasks_task_type_check;
alter table public.tasks add constraint tasks_task_type_check
  check (task_type in (
    'call',
    'email',
    'meeting',
    'send_report',
    'tractiq_report',
    'request_financials',
    'bov',
    'follow_up',
    'contract',
    'general'
  ));

-- Rollback considerations:
-- - Dropping owner_identified_at would permanently discard new milestone data.
-- - To remove only the immutability behavior, drop the trigger and function.
-- - To remove tractiq_report support, first update any such tasks to
--   send_report, then restore the previous tasks_task_type_check constraint.
