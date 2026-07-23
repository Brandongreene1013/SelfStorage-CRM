-- Storage Hunters CRM: free-text context for how a lead/relationship came about.
-- Safe to run more than once.
--
-- Before running:
-- 1. Download an in-app backup.
-- 2. Paste this file into the Supabase SQL Editor and run it.
-- 3. Refresh the app and verify the Source Notes field saves on a contact.

alter table public.contacts
  add column if not exists lead_source_notes text not null default '';

comment on column public.contacts.lead_source_notes is
  'Free-text context for the lead_source dropdown (who referred, which event, etc.).';

-- Rollback: alter table public.contacts drop column lead_source_notes;
