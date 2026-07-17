-- Persistent sent/not-sent tracking for each recipient on a mailer list.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.mailer_list_members
  add column if not exists sent_at timestamptz;

create index if not exists idx_mailer_members_sent_at
  on public.mailer_list_members (list_id, sent_at);

comment on column public.mailer_list_members.sent_at is
  'When this exact mailer-list recipient/address was marked as mailed. Null means not sent.';
