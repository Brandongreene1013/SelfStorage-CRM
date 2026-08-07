-- Storage Hunters CRM: connected Master Database / Core Clients / Pipeline
-- Run in the Supabase SQL Editor before enabling the Core Clients workspace.
-- Safe to run more than once. No contacts, properties, clients, tasks, or
-- activity history are deleted or replaced.

create table if not exists public.core_clients (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  primary_property_id uuid references public.properties(id) on delete set null,
  selling_motivation text not null default '',
  motivation_strength text not null default 'unclear',
  selling_timeline text not null default 'unknown',
  price_expectations text not null default '',
  sale_barriers text not null default '',
  follow_up_frequency_days integer,
  next_action text not null default '',
  next_action_due_date date,
  assigned_user text not null default 'Brandon Greene',
  notes text not null default '',
  last_meaningful_contact_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_clients_contact_unique unique (contact_id),
  constraint core_clients_motivation_check
    check (motivation_strength in ('unclear', 'low', 'moderate', 'strong', 'immediate')),
  constraint core_clients_timeline_check
    check (selling_timeline in ('unknown', '0_3_months', '3_6_months', '6_12_months', '12_24_months', 'more_than_24_months')),
  constraint core_clients_status_check
    check (status in ('active', 'archived')),
  constraint core_clients_frequency_check
    check (follow_up_frequency_days is null or follow_up_frequency_days > 0)
);

alter table public.clients add column if not exists property_id uuid;
alter table public.clients add column if not exists opportunity_name text;
alter table public.clients add column if not exists assigned_user text not null default 'Brandon Greene';
alter table public.clients add column if not exists owner_pricing_expectation numeric;
alter table public.clients add column if not exists important_notes text not null default '';
alter table public.clients add column if not exists stage_entered_at timestamptz;
alter table public.clients add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_property_id_fkey'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_property_id_fkey
      foreign key (property_id)
      references public.properties(id)
      on delete set null;
  end if;
end $$;

update public.clients
set stage_entered_at = coalesce(stage_entered_at, updated_at, created_at, now())
where stage_entered_at is null;

create table if not exists public.pipeline_stage_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  previous_stage_id integer,
  new_stage_id integer not null,
  changed_at timestamptz not null default now(),
  changed_by text not null default 'Brandon Greene',
  note text not null default '',
  constraint pipeline_history_previous_stage_check
    check (previous_stage_id is null or previous_stage_id between 1 and 10),
  constraint pipeline_history_new_stage_check
    check (new_stage_id between 1 and 10)
);

insert into public.pipeline_stage_history (
  client_id, previous_stage_id, new_stage_id, changed_at, changed_by, note
)
select
  c.id, null, c.stage_id, coalesce(c.created_at, now()), 'System',
  'Initial history record created for an existing Pipeline opportunity.'
from public.clients c
where not exists (
  select 1 from public.pipeline_stage_history h where h.client_id = c.id
);

create index if not exists idx_core_clients_active_due
  on public.core_clients (status, next_action_due_date);
create index if not exists idx_core_clients_motivation
  on public.core_clients (motivation_strength, selling_timeline);
create index if not exists idx_core_clients_property
  on public.core_clients (primary_property_id);
create index if not exists idx_clients_property
  on public.clients (property_id);
create index if not exists idx_clients_stage_assigned
  on public.clients (stage_id, assigned_user);
create index if not exists idx_pipeline_history_client_changed
  on public.pipeline_stage_history (client_id, changed_at desc);

alter table public.core_clients enable row level security;
drop policy if exists "core_clients_all" on public.core_clients;
create policy "core_clients_all" on public.core_clients
  for all using (true) with check (true);

alter table public.pipeline_stage_history enable row level security;
drop policy if exists "pipeline_stage_history_all" on public.pipeline_stage_history;
create policy "pipeline_stage_history_all" on public.pipeline_stage_history
  for all using (true) with check (true);

comment on table public.core_clients is
  'One active or archived relationship-management profile per canonical contact. This classifies a Master Database contact; it never duplicates the person.';
comment on column public.clients.property_id is
  'Optional link to the specific property represented by this Pipeline opportunity. The same contact may therefore have several opportunities at different stages.';
comment on table public.pipeline_stage_history is
  'Append-only audit trail for every Pipeline stage transition.';
