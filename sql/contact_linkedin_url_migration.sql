-- LinkedIn profile links for contacts.
-- Safe to run more than once.

alter table public.contacts
  add column if not exists linkedin_url text;

comment on column public.contacts.linkedin_url is
  'Saved LinkedIn profile URL for the person (or company page for entity owners). When set, the LinkedIn research button opens this directly instead of a LinkedIn search.';
