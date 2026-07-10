-- Multiple mailing addresses for contacts/clients and address-specific mailer recipients.
-- Run this in Supabase SQL Editor after the original mailing/mailer migrations.

alter table public.contacts
  add column if not exists mailing_addresses jsonb not null default '[]'::jsonb;

alter table public.clients
  add column if not exists mailing_addresses jsonb not null default '[]'::jsonb;

alter table public.mailer_list_members
  add column if not exists mailing_address text not null default '',
  add column if not exists address_label text not null default '';

alter table public.mailer_list_members
  drop constraint if exists mailer_list_members_list_id_member_type_member_id_key;

create unique index if not exists idx_mailer_members_unique_address
  on public.mailer_list_members (list_id, member_type, member_id, mailing_address);

create index if not exists idx_mailer_members_address
  on public.mailer_list_members (mailing_address);

comment on column public.contacts.mailing_addresses is
  'Additional affiliated mailing addresses, stored as [{id,label,address}]. Primary remains mailing_address.';

comment on column public.clients.mailing_addresses is
  'Additional affiliated mailing addresses, stored as [{id,label,address}]. Primary remains mailing_address.';

comment on column public.mailer_list_members.mailing_address is
  'Exact address selected for this recipient row, allowing one person on a list at multiple addresses.';

comment on column public.mailer_list_members.address_label is
  'Label for the selected mailing address, such as Primary, Home, PO Box, Registered Agent, Office.';
