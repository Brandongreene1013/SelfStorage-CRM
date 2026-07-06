-- Sprint 16: Database expansion foundation
-- Adds optional relationship/contact classification and owner-entity fields
-- to Database contacts. Safe to run more than once.
--
-- Run this in the Supabase SQL Editor for project rpoiphoqwgvbiyygfjrm.

alter table public.contacts
  add column if not exists relationship_type text not null default 'storage_owner_seller',
  add column if not exists owner_entity text;

alter table public.contacts
  drop constraint if exists contacts_relationship_type_check;

alter table public.contacts
  add constraint contacts_relationship_type_check
  check (relationship_type in (
    'storage_owner_seller',
    'buyer',
    'institution',
    'developer',
    'broker',
    'vendor',
    'lender',
    'attorney_consultant',
    'other'
  ));

create index if not exists idx_contacts_relationship_type
  on public.contacts (relationship_type);

comment on column public.contacts.relationship_type is
  'Sprint 16 relationship/contact classification. Default storage_owner_seller preserves existing owner/seller cold-call records.';

comment on column public.contacts.owner_entity is
  'Optional legal/ownership entity for the contact or property, e.g. ABC Storage LLC. Separate from owner_name/person.';
