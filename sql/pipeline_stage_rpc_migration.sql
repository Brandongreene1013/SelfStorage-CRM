-- Storage Hunters CRM: atomic Pipeline stage transitions
-- Proposed stabilization migration. Safe to run more than once.
-- This file is intentionally not executed by the application or Codex.
--
-- Apply after:
--   sql/core_clients_pipeline_migration.sql
--
-- Rollback:
--   drop function if exists public.change_pipeline_stage(uuid, integer, text, text);
--
-- Dropping the function restores the application's compatibility fallback.
-- No opportunity or history data is removed by that rollback.

create or replace function public.change_pipeline_stage(
  p_client_id uuid,
  p_new_stage_id integer,
  p_changed_by text default 'Brandon Greene',
  p_note text default ''
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_previous_stage integer;
  v_changed_at timestamptz := now();
  v_history public.pipeline_stage_history%rowtype;
  v_event jsonb;
begin
  if p_new_stage_id is null or p_new_stage_id not between 1 and 10 then
    raise exception 'Pipeline stage must be between 1 and 10';
  end if;

  select *
  into v_client
  from public.clients
  where id = p_client_id
  for update;

  if not found then
    raise exception 'Pipeline opportunity % was not found', p_client_id;
  end if;

  v_previous_stage := v_client.stage_id;
  if v_previous_stage = p_new_stage_id then
    return jsonb_build_object(
      'client', to_jsonb(v_client),
      'history', null,
      'unchanged', true
    );
  end if;

  v_event := jsonb_build_object(
    'eventId', gen_random_uuid(),
    'type', 'pipeline_stage_changed',
    'analytics', false,
    'previousStageId', v_previous_stage,
    'newStageId', p_new_stage_id,
    'changedBy', coalesce(nullif(trim(p_changed_by), ''), 'Brandon Greene'),
    'date', to_char(v_changed_at at time zone 'UTC', 'YYYY-MM-DD'),
    'at', v_changed_at,
    'note', coalesce(nullif(trim(p_note), ''),
      format('Pipeline moved from stage %s to stage %s.', v_previous_stage, p_new_stage_id))
  );

  update public.clients
  set
    stage_id = p_new_stage_id,
    stage_entered_at = v_changed_at,
    action_log = coalesce(action_log, '[]'::jsonb) || jsonb_build_array(v_event),
    updated_at = v_changed_at
  where id = p_client_id
  returning * into v_client;

  insert into public.pipeline_stage_history (
    client_id,
    previous_stage_id,
    new_stage_id,
    changed_at,
    changed_by,
    note
  )
  values (
    p_client_id,
    v_previous_stage,
    p_new_stage_id,
    v_changed_at,
    coalesce(nullif(trim(p_changed_by), ''), 'Brandon Greene'),
    coalesce(p_note, '')
  )
  returning * into v_history;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'history', to_jsonb(v_history),
    'unchanged', false
  );
end;
$$;

grant execute on function public.change_pipeline_stage(uuid, integer, text, text)
  to anon, authenticated;

comment on function public.change_pipeline_stage(uuid, integer, text, text) is
  'Atomically moves one Pipeline opportunity and appends its stage audit history.';

