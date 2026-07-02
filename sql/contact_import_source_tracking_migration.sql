-- Sprint 10: Import source tracking + import history metadata
-- Run this once in the Supabase SQL Editor.
-- Safe to run more than once.

alter table public.contacts
  add column if not exists source text,
  add column if not exists import_filename text,
  add column if not exists imported_at timestamptz;

comment on column public.contacts.source is
  'Import/source label for the contact, e.g. TractIQ, Reonomy, CoStar, County Records, Manual Excel, Other, filename fallback, or Manual / Unknown.';

comment on column public.contacts.import_filename is
  'Original uploaded filename, when available, for source traceability.';

comment on column public.contacts.imported_at is
  'Timestamp when the contact was imported into the CRM.';

alter table public.lists
  add column if not exists import_filename text,
  add column if not exists import_row_count integer not null default 0,
  add column if not exists ready_to_call_count integer not null default 0,
  add column if not exists duplicate_skipped_count integer not null default 0,
  add column if not exists merged_duplicate_count integer not null default 0,
  add column if not exists additional_phone_count integer not null default 0;

comment on column public.lists.import_filename is
  'Original uploaded filename for this imported list, when available.';

comment on column public.lists.import_row_count is
  'Number of new contact rows inserted during import.';

comment on column public.lists.ready_to_call_count is
  'Number of preview rows that were ready to call at import time.';

comment on column public.lists.duplicate_skipped_count is
  'Number of possible duplicate rows skipped during import.';

comment on column public.lists.merged_duplicate_count is
  'Number of possible duplicate rows appended into existing contacts during import.';

comment on column public.lists.additional_phone_count is
  'Number of additional phone numbers imported or appended during import.';
