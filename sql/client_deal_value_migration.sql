-- Client deal value fields
-- Run this in the Supabase SQL Editor before using Desired Sale Price /
-- Commission % in production. The app also has a fallback so the CRM keeps
-- working before this migration is run, but the new fields will not persist
-- until these columns exist.

alter table public.clients
  add column if not exists desired_sale_price numeric(14, 2),
  add column if not exists projected_commission_pct numeric(7, 4);

comment on column public.clients.desired_sale_price is
  'Target or desired sale price for this client/deal.';

comment on column public.clients.projected_commission_pct is
  'Projected commission percentage for this client/deal, stored as a percent value such as 3 for 3%.';
