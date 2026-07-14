-- Pipeline commission support columns
--
-- Run this in the Supabase SQL Editor if Pipeline/Client commission saves say
-- a SQL migration is missing. It is intentionally idempotent and consolidates
-- the client-side columns that the current Pipeline/Clients workflow writes
-- during commission edits.
--
-- Live audit on 2026-07-14 found:
-- - clients.desired_sale_price and clients.projected_commission_pct already exist.
-- - clients.mailing_addresses, clients.action_log, clients.ownership_group_id,
--   contacts.mailing_addresses, and contacts.action_log were missing.
--
-- This file adds all of them safely. Existing narrower migration files are
-- preserved; this is the one-shot repair file for the current production gap.

alter table public.clients
  add column if not exists desired_sale_price numeric(14, 2),
  add column if not exists projected_commission_pct numeric(7, 4),
  add column if not exists mailing_address text not null default '',
  add column if not exists mailing_addresses jsonb not null default '[]'::jsonb,
  add column if not exists action_log jsonb not null default '[]'::jsonb,
  add column if not exists ownership_group_id uuid null;

alter table public.contacts
  add column if not exists mailing_address text not null default '',
  add column if not exists mailing_addresses jsonb not null default '[]'::jsonb,
  add column if not exists action_log jsonb not null default '[]'::jsonb;

do $$
begin
  if to_regclass('public.ownership_groups') is not null
    and not exists (
    select 1
    from pg_constraint
    where conname = 'clients_ownership_group_id_fkey'
  ) then
    alter table public.clients
      add constraint clients_ownership_group_id_fkey
      foreign key (ownership_group_id)
      references public.ownership_groups(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_clients_ownership_group_id
  on public.clients (ownership_group_id);

comment on column public.clients.desired_sale_price is
  'Target or desired sale price for this client/deal.';

comment on column public.clients.projected_commission_pct is
  'Projected commission percentage for this client/deal, stored as a percent value such as 3 for 3%.';

comment on column public.clients.mailing_addresses is
  'Additional affiliated mailing addresses, stored as [{id,label,address}]. Primary remains mailing_address.';

comment on column public.contacts.mailing_addresses is
  'Additional affiliated mailing addresses, stored as [{id,label,address}]. Primary remains mailing_address.';

comment on column public.clients.action_log is
  'Client/pipeline activity log entries shown in Recent Activity and client cards.';

comment on column public.contacts.action_log is
  'Database contact activity log entries shown in Recent Activity and contact detail.';
