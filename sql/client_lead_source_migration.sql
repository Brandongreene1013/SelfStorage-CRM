-- Canonical lead-source tracking for pipeline clients.
--
-- Run this in the Supabase SQL Editor before saving a lead source from the
-- Add/Edit Client modal. Safe to run more than once.

alter table public.clients
  add column if not exists lead_source text;

create index if not exists idx_clients_lead_source
  on public.clients (lead_source);

comment on column public.clients.lead_source is
  'Optional canonical prospecting source shared with contacts, such as Salesforce, TractIQ, Facebook, CoStar, Reonomy, Crexi, LoopNet, or BusinessesForSale.';
