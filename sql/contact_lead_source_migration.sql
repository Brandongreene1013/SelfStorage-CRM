-- Sprint 18: Lead / relationship source tracking for contacts.
-- Safe to run more than once.

alter table public.contacts
  add column if not exists lead_source text;

create index if not exists idx_contacts_lead_source
  on public.contacts (lead_source);

comment on column public.contacts.lead_source is
  'Optional source/origin for the person or relationship, e.g. Cold Call, Facebook Group, LinkedIn, CoStar, Reonomy, TractIQ, Referral.';
