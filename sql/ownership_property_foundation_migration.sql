-- Sprint 17: Ownership / Property model foundation.
-- Run this once in the Supabase SQL Editor. Safe to run more than once.
--
-- Creates the two foundation tables for modeling "one owner, many facilities"
-- WITHOUT touching the existing contacts table or forcing any contact into a
-- group. Contacts remain people/relationship records; a future sprint adds
-- optional contact -> ownership_group / property links and the UI layer.
-- Nothing here is destructive and nothing changes existing app behavior.

-- One record per legal/person ownership group (e.g. "Teekam Holdings" —
-- the human/legal owner behind one or more facilities).
create table if not exists public.ownership_groups (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  owner_entity text not null default '',
  relationship_type text not null default 'storage_owner_seller',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ownership_groups is
  'One record per legal/person ownership group. An owner can hold many facilities; contacts/properties link here in a later sprint.';
comment on column public.ownership_groups.display_name is
  'Human-readable owner name shown in the app, e.g. "Dr. Teekam" or "Teekam Holdings".';
comment on column public.ownership_groups.owner_entity is
  'Legal entity name (LLC/corp/trust) when known; blank when the owner holds personally.';
comment on column public.ownership_groups.relationship_type is
  'Same vocabulary as contacts.relationship_type (storage_owner_seller, buyer, institution, developer, broker, vendor, lender, attorney_consultant, other).';

-- One record per facility/property, optionally linked to an ownership group.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  ownership_group_id uuid references public.ownership_groups(id) on delete set null,
  facility_name text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  market text not null default '',
  property_type text not null default 'Self-Storage',
  notes text not null default '',
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.properties is
  'One record per facility/property. ownership_group_id is optional — a property can exist before its owner is modeled.';
comment on column public.properties.ownership_group_id is
  'Optional link to ownership_groups. ON DELETE SET NULL so deleting a group never deletes its properties.';
comment on column public.properties.property_type is
  'Matches the app''s PROPERTY_TYPES: Self-Storage, Boat/RV Storage, Land.';

create index if not exists idx_properties_ownership_group_id on public.properties (ownership_group_id);
create index if not exists idx_properties_state on public.properties (state);
create index if not exists idx_ownership_groups_relationship_type on public.ownership_groups (relationship_type);

-- Match the app-data convention: permissive RLS (the anon key reads/writes).
alter table public.ownership_groups enable row level security;
drop policy if exists "ownership_groups_all" on public.ownership_groups;
create policy "ownership_groups_all" on public.ownership_groups
  for all using (true) with check (true);

alter table public.properties enable row level security;
drop policy if exists "properties_all" on public.properties;
create policy "properties_all" on public.properties
  for all using (true) with check (true);
