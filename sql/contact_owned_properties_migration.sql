-- Multi-property owners: additional properties held by a contact.
-- Safe to run more than once.

alter table public.contacts
  add column if not exists owned_properties jsonb not null default '[]'::jsonb;

comment on column public.contacts.owned_properties is
  'Additional properties this owner holds beyond the primary facility_name/address: [{facilityName, address, state, addedAt}]. Populated by the same-owner radar merge and by manual adds on the contact card.';
