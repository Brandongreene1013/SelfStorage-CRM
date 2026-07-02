-- Sprint 8: Additional phone numbers for Database contacts
-- Run this once in the Supabase SQL Editor before using the Additional Phones editor.
-- Safe to run more than once.

alter table public.contacts
  add column if not exists alternate_phones jsonb not null default '[]'::jsonb;

comment on column public.contacts.alternate_phones is
  'JSON array of additional contact phone numbers, e.g. [{"label":"Mobile","phone":"(555) 000-0000"}]. Primary phone remains contacts.phone.';