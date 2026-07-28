-- Sprint 18: Lead / relationship source tracking for contacts.
-- Safe to run more than once.

alter table public.contacts
  add column if not exists lead_source text;

create index if not exists idx_contacts_lead_source
  on public.contacts (lead_source);

comment on column public.contacts.lead_source is
  'Optional canonical prospecting source: Salesforce, TractIQ, Facebook, CoStar, Reonomy, Crexi, LoopNet, or BusinessesForSale.';
