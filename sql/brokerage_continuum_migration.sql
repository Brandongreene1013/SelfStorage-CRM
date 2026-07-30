-- Storage Hunters CRM: Brokerage Continuum
--
-- Run this entire file in the Supabase SQL Editor. It is additive and safe to
-- rerun. It creates the canonical person-level relationship stage, immutable
-- transition history, and one transactional RPC for every stage change.
-- Prerequisite: sql/core_clients_pipeline_migration.sql has already been run.
--
-- The CRM currently identifies its single broker with assigned_user text
-- rather than authenticated staff UUIDs, so changed_by follows that existing
-- convention. Related Pipeline work uses public.clients because the current
-- schema has no separate listing or transaction tables.

alter table public.core_clients
  add column if not exists brokerage_continuum_stage text not null default 'research',
  add column if not exists brokerage_continuum_stage_entered_at timestamptz not null default now(),
  add column if not exists brokerage_continuum_updated_at timestamptz not null default now(),
  add column if not exists brokerage_continuum_updated_by text not null default 'Brandon Greene',
  add column if not exists brokerage_continuum_note text not null default '',
  add column if not exists brokerage_continuum_legacy text;

-- Preserve any value from the provisional, undeployed free-text implementation
-- if that column happens to exist in an environment.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'core_clients'
      and column_name = 'brokerage_continuum'
  ) then
    execute $copy$
      update public.core_clients
      set brokerage_continuum_legacy = nullif(trim(brokerage_continuum), '')
      where brokerage_continuum_legacy is null
    $copy$;
  end if;
end $$;

-- Map only the legacy values with an unambiguous operational meaning.
update public.core_clients
set brokerage_continuum_stage = case lower(trim(brokerage_continuum_legacy))
  when 'valuation' then 'second_appointment'
  when 'listing candidate' then 'second_appointment'
  when 'active listing' then 'market_sell'
  when 'under contract' then 'contract'
  when 'closed' then 'post_close'
  when 'prospect' then 'research'
  else brokerage_continuum_stage
end
where nullif(trim(brokerage_continuum_legacy), '') is not null;

alter table public.core_clients
  drop column if exists brokerage_continuum;

alter table public.core_clients
  drop constraint if exists core_clients_brokerage_continuum_stage_check;
alter table public.core_clients
  add constraint core_clients_brokerage_continuum_stage_check
  check (brokerage_continuum_stage in (
    'research',
    'cold_call',
    'first_appointment',
    'second_appointment',
    'exclusive_listing',
    'market_sell',
    'field_offers',
    'contract',
    'due_diligence',
    'close',
    'post_close'
  ));

create table if not exists public.brokerage_continuum_history (
  id uuid primary key default gen_random_uuid(),
  core_client_id uuid not null references public.core_clients(id) on delete cascade,
  previous_stage text,
  new_stage text not null,
  changed_at timestamptz not null default now(),
  effective_at timestamptz not null default now(),
  changed_by text not null default 'Brandon Greene',
  change_reason text,
  change_note text not null default '',
  source text not null default 'manual',
  related_property_id uuid references public.properties(id) on delete set null,
  related_client_id uuid references public.clients(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint brokerage_continuum_history_previous_check
    check (previous_stage is null or previous_stage in (
      'research', 'cold_call', 'first_appointment', 'second_appointment',
      'exclusive_listing', 'market_sell', 'field_offers', 'contract',
      'due_diligence', 'close', 'post_close'
    )),
  constraint brokerage_continuum_history_new_check
    check (new_stage in (
      'research', 'cold_call', 'first_appointment', 'second_appointment',
      'exclusive_listing', 'market_sell', 'field_offers', 'contract',
      'due_diligence', 'close', 'post_close'
    )),
  constraint brokerage_continuum_history_source_check
    check (source in (
      'manual', 'migration', 'automation', 'property_stage_suggestion',
      'bulk_update', 'api', 'import', 'data_correction'
    ))
);

create index if not exists idx_core_clients_continuum_stage
  on public.core_clients (brokerage_continuum_stage);
create index if not exists idx_core_clients_continuum_entered
  on public.core_clients (brokerage_continuum_stage, brokerage_continuum_stage_entered_at);
create index if not exists idx_continuum_history_client_changed
  on public.brokerage_continuum_history (core_client_id, changed_at desc);
create index if not exists idx_continuum_history_new_stage
  on public.brokerage_continuum_history (new_stage, changed_at desc);

create or replace function public.brokerage_continuum_stage_order(p_stage text)
returns integer
language sql
immutable
as $$
  select case p_stage
    when 'research' then 1
    when 'cold_call' then 2
    when 'first_appointment' then 3
    when 'second_appointment' then 4
    when 'exclusive_listing' then 5
    when 'market_sell' then 6
    when 'field_offers' then 7
    when 'contract' then 8
    when 'due_diligence' then 9
    when 'close' then 10
    when 'post_close' then 11
    else null
  end
$$;

-- Seed one authoritative initial event for every existing Core Client.
insert into public.brokerage_continuum_history (
  core_client_id,
  previous_stage,
  new_stage,
  effective_at,
  changed_by,
  change_reason,
  change_note,
  source,
  metadata
)
select
  c.id,
  null,
  c.brokerage_continuum_stage,
  coalesce(c.brokerage_continuum_stage_entered_at, c.created_at, now()),
  coalesce(nullif(c.assigned_user, ''), 'Brandon Greene'),
  'initial_migration',
  'Initial Brokerage Continuum migration',
  'migration',
  jsonb_build_object(
    'legacy_value', c.brokerage_continuum_legacy,
    'migration_version', 'brokerage_continuum_v1',
    'migration_needs_review',
      c.brokerage_continuum_legacy is not null
      and lower(trim(c.brokerage_continuum_legacy)) in ('advisory')
  )
from public.core_clients c
where not exists (
  select 1
  from public.brokerage_continuum_history h
  where h.core_client_id = c.id
);

create or replace function public.seed_brokerage_continuum_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.brokerage_continuum_history (
    core_client_id, previous_stage, new_stage, effective_at, changed_by,
    change_reason, change_note, source
  ) values (
    new.id, null, new.brokerage_continuum_stage,
    new.brokerage_continuum_stage_entered_at,
    coalesce(nullif(new.assigned_user, ''), 'Brandon Greene'),
    'initial_creation', 'Initial Brokerage Continuum stage', 'manual'
  );
  return new;
end
$$;

drop trigger if exists seed_brokerage_continuum_history_trigger on public.core_clients;
create trigger seed_brokerage_continuum_history_trigger
after insert on public.core_clients
for each row execute function public.seed_brokerage_continuum_history();

-- Prevent a direct client update from silently bypassing the audit history.
create or replace function public.guard_brokerage_continuum_stage_update()
returns trigger
language plpgsql
as $$
begin
  if (
    old.brokerage_continuum_stage is distinct from new.brokerage_continuum_stage
    or old.brokerage_continuum_stage_entered_at is distinct from new.brokerage_continuum_stage_entered_at
    or old.brokerage_continuum_updated_at is distinct from new.brokerage_continuum_updated_at
    or old.brokerage_continuum_updated_by is distinct from new.brokerage_continuum_updated_by
    or old.brokerage_continuum_note is distinct from new.brokerage_continuum_note
  )
    and coalesce(current_setting('app.brokerage_continuum_rpc', true), '') <> 'on'
  then
    raise exception 'Brokerage Continuum stage changes must use change_brokerage_continuum_stage';
  end if;
  return new;
end
$$;

drop trigger if exists guard_brokerage_continuum_stage_update_trigger on public.core_clients;
create trigger guard_brokerage_continuum_stage_update_trigger
before update on public.core_clients
for each row execute function public.guard_brokerage_continuum_stage_update();

create or replace function public.prevent_brokerage_continuum_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Brokerage Continuum history is immutable';
end
$$;

drop trigger if exists prevent_brokerage_continuum_history_update on public.brokerage_continuum_history;
create trigger prevent_brokerage_continuum_history_update
before update or delete on public.brokerage_continuum_history
for each row execute function public.prevent_brokerage_continuum_history_mutation();

create or replace function public.change_brokerage_continuum_stage(
  p_core_client_id uuid,
  p_new_stage text,
  p_changed_by text default 'Brandon Greene',
  p_change_reason text default null,
  p_change_note text default '',
  p_effective_at timestamptz default now(),
  p_source text default 'manual',
  p_related_property_id uuid default null,
  p_related_client_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.core_clients%rowtype;
  v_history public.brokerage_continuum_history%rowtype;
  v_previous_stage text;
  v_previous_order integer;
  v_new_order integer;
  v_reason_required boolean;
begin
  select * into v_client
  from public.core_clients
  where id = p_core_client_id
  for update;

  if not found then raise exception 'Core Client not found'; end if;

  v_previous_stage := v_client.brokerage_continuum_stage;
  v_previous_order := public.brokerage_continuum_stage_order(v_previous_stage);
  v_new_order := public.brokerage_continuum_stage_order(p_new_stage);

  if v_new_order is null then raise exception 'Invalid Brokerage Continuum stage'; end if;
  if v_previous_stage = p_new_stage then raise exception 'Brokerage Continuum stage is unchanged'; end if;
  if coalesce(p_effective_at, now()) > now() then raise exception 'Effective date cannot be in the future'; end if;
  if p_change_reason is not null and p_change_reason not in (
    'owner_paused', 'listing_withdrawn', 'listing_expired', 'lost_contact',
    'contract_terminated', 'buyer_defaulted', 'offers_rejected',
    'property_not_for_sale', 'data_correction', 'relationship_reactivated',
    'new_transaction_cycle', 'stage_progression', 'other'
  ) then
    raise exception 'Invalid transition reason';
  end if;

  v_reason_required :=
    v_new_order < v_previous_order
    or v_new_order - v_previous_order > 2
    or (v_previous_order >= 5 and v_new_order < 5)
    or p_source in ('bulk_update', 'data_correction');

  if v_reason_required and nullif(trim(coalesce(p_change_reason, '')), '') is null then
    raise exception 'A transition reason is required';
  end if;
  if p_change_reason in (
    'other', 'data_correction', 'contract_terminated',
    'listing_withdrawn', 'relationship_reactivated'
  ) and nullif(trim(coalesce(p_change_note, '')), '') is null then
    raise exception 'A transition note is required for this reason';
  end if;

  perform set_config('app.brokerage_continuum_rpc', 'on', true);

  update public.core_clients
  set
    brokerage_continuum_stage = p_new_stage,
    brokerage_continuum_stage_entered_at = coalesce(p_effective_at, now()),
    brokerage_continuum_updated_at = now(),
    brokerage_continuum_updated_by = coalesce(nullif(trim(p_changed_by), ''), assigned_user, 'Brandon Greene'),
    brokerage_continuum_note = trim(coalesce(p_change_note, '')),
    updated_at = now()
  where id = p_core_client_id
  returning * into v_client;

  insert into public.brokerage_continuum_history (
    core_client_id, previous_stage, new_stage, effective_at, changed_by,
    change_reason, change_note, source, related_property_id, related_client_id
  ) values (
    p_core_client_id, v_previous_stage, p_new_stage, coalesce(p_effective_at, now()),
    coalesce(nullif(trim(p_changed_by), ''), v_client.assigned_user, 'Brandon Greene'),
    nullif(trim(coalesce(p_change_reason, '')), ''), trim(coalesce(p_change_note, '')),
    p_source, p_related_property_id, p_related_client_id
  )
  returning * into v_history;

  return jsonb_build_object('core_client', to_jsonb(v_client), 'history', to_jsonb(v_history));
end
$$;

alter table public.brokerage_continuum_history enable row level security;
drop policy if exists "brokerage_continuum_history_read" on public.brokerage_continuum_history;
create policy "brokerage_continuum_history_read"
  on public.brokerage_continuum_history for select using (true);

revoke insert, update, delete on public.brokerage_continuum_history from anon, authenticated;
grant select on public.brokerage_continuum_history to anon, authenticated;
grant execute on function public.change_brokerage_continuum_stage(
  uuid, text, text, text, text, timestamptz, text, uuid, uuid
) to anon, authenticated;

comment on column public.core_clients.brokerage_continuum_stage is
  'Canonical person-level Brokerage Continuum relationship stage.';
comment on table public.brokerage_continuum_history is
  'Immutable audit history for every person-level Brokerage Continuum transition.';
