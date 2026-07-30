-- Storage Hunters CRM — hierarchical Database Explorer
-- Safe, additive production migration. Existing lists remain at Database root.
-- Run after contact_list_memberships_migration.sql.
--
-- This migration never updates contacts, contact_list_memberships, tasks,
-- activities, Pipeline records, ownership records, or source metadata.
--
-- Rollback (organization only; CRM/list/contact data is preserved):
--   update public.lists set folder_id = null;
--   drop function if exists public.delete_database_folder(uuid, text, timestamptz);
--   drop function if exists public.move_database_lists(uuid[], uuid, text);
--   drop function if exists public.set_database_list_archived(uuid, boolean, text);
--   drop function if exists public.move_database_folder(uuid, uuid, timestamptz);
--   drop function if exists public.rename_database_folder(uuid, text, timestamptz);
--   drop function if exists public.create_database_folder(text, uuid, text);
--   alter table public.lists drop constraint if exists lists_folder_id_fkey;
--   alter table public.lists drop column if exists folder_id;
--   alter table public.lists drop column if exists database_workspace_key;
--   alter table public.lists drop column if exists is_archived;
--   -- Keep lists.updated_at if other features have begun using it.
--   drop table if exists public.database_explorer_audit;
--   drop table if exists public.database_folders;

begin;

create table if not exists public.database_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  name text not null,
  parent_id uuid references public.database_folders(id) on delete restrict,
  sort_order integer,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint database_folders_name_check
    check (name = btrim(name) and char_length(name) between 1 and 120),
  constraint database_folders_workspace_check
    check (workspace_key = btrim(workspace_key) and char_length(workspace_key) between 1 and 120)
);

create table if not exists public.database_explorer_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  action text not null,
  item_type text not null,
  item_id uuid,
  source_parent_id uuid,
  destination_parent_id uuid,
  item_count integer not null default 1,
  actor text not null default 'Brandon Greene',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint database_explorer_audit_action_check
    check (action in ('folder_created', 'folder_renamed', 'folder_moved', 'folder_deleted', 'lists_moved', 'list_archived')),
  constraint database_explorer_audit_type_check
    check (item_type in ('folder', 'list', 'list_batch'))
);

alter table public.lists
  add column if not exists folder_id uuid,
  add column if not exists database_workspace_key text not null default 'default',
  add column if not exists is_archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lists_folder_id_fkey'
      and conrelid = 'public.lists'::regclass
  ) then
    alter table public.lists
      add constraint lists_folder_id_fkey
      foreign key (folder_id)
      references public.database_folders(id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_database_folders_parent
  on public.database_folders (workspace_key, parent_id, is_archived, sort_order, name);
create index if not exists idx_database_folders_updated
  on public.database_folders (workspace_key, updated_at desc);
create unique index if not exists uq_database_folders_sibling_name
  on public.database_folders (
    workspace_key,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  where is_archived = false;
create index if not exists idx_lists_folder
  on public.lists (database_workspace_key, folder_id, is_archived, updated_at desc);
create index if not exists idx_database_explorer_audit_created
  on public.database_explorer_audit (workspace_key, created_at desc);

create or replace function public.database_explorer_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists database_folders_set_updated_at on public.database_folders;
create trigger database_folders_set_updated_at
before update on public.database_folders
for each row execute function public.database_explorer_set_updated_at();

drop trigger if exists lists_database_explorer_set_updated_at on public.lists;
create trigger lists_database_explorer_set_updated_at
before update on public.lists
for each row execute function public.database_explorer_set_updated_at();

create or replace function public.validate_database_folder_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_workspace text;
  v_parent_depth integer := 0;
  v_subtree_height integer := 1;
begin
  new.name := btrim(new.name);
  new.workspace_key := btrim(coalesce(new.workspace_key, 'default'));

  if new.parent_id is null then
    v_parent_depth := 0;
  else
    if new.parent_id = new.id then
      raise exception using errcode = '23514', message = 'A folder cannot be moved into itself.';
    end if;

    select workspace_key
    into v_parent_workspace
    from public.database_folders
    where id = new.parent_id
      and is_archived = false;

    if not found then
      raise exception using errcode = '23503', message = 'The destination folder is no longer available.';
    end if;
    if v_parent_workspace <> new.workspace_key then
      raise exception using errcode = '42501', message = 'Folders cannot be moved between workspaces.';
    end if;

    with recursive ancestors as (
      select id, parent_id, 1 as depth
      from public.database_folders
      where id = new.parent_id
      union all
      select folder.id, folder.parent_id, ancestors.depth + 1
      from public.database_folders folder
      join ancestors on folder.id = ancestors.parent_id
      where ancestors.depth < 11
    )
    select coalesce(max(depth), 0)
    into v_parent_depth
    from ancestors;

    if exists (
      with recursive ancestors as (
        select id, parent_id
        from public.database_folders
        where id = new.parent_id
        union all
        select folder.id, folder.parent_id
        from public.database_folders folder
        join ancestors on folder.id = ancestors.parent_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception using errcode = '23514', message = 'A folder cannot be moved into one of its descendants.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    with recursive descendants as (
      select id, 1 as depth
      from public.database_folders
      where id = new.id
      union all
      select folder.id, descendants.depth + 1
      from public.database_folders folder
      join descendants on folder.parent_id = descendants.id
      where descendants.depth < 11
    )
    select coalesce(max(depth), 1)
    into v_subtree_height
    from descendants;
  end if;

  if v_parent_depth + v_subtree_height > 10 then
    raise exception using errcode = '23514', message = 'Database folders support a maximum depth of 10 levels.';
  end if;

  return new;
end;
$$;

drop trigger if exists database_folders_validate_hierarchy on public.database_folders;
create trigger database_folders_validate_hierarchy
before insert or update of name, parent_id, workspace_key, is_archived
on public.database_folders
for each row execute function public.validate_database_folder_hierarchy();

create or replace function public.create_database_folder(
  p_name text,
  p_parent_id uuid default null,
  p_workspace_key text default 'default'
)
returns public.database_folders
language plpgsql
set search_path = public
as $$
declare
  v_folder public.database_folders%rowtype;
begin
  insert into public.database_folders (name, parent_id, workspace_key)
  values (btrim(p_name), p_parent_id, coalesce(nullif(btrim(p_workspace_key), ''), 'default'))
  returning * into v_folder;

  insert into public.database_explorer_audit (
    workspace_key, action, item_type, item_id, destination_parent_id
  ) values (
    v_folder.workspace_key, 'folder_created', 'folder', v_folder.id, v_folder.parent_id
  );
  return v_folder;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'A folder with this name already exists in that location.';
end;
$$;

create or replace function public.rename_database_folder(
  p_folder_id uuid,
  p_name text,
  p_expected_updated_at timestamptz default null
)
returns public.database_folders
language plpgsql
set search_path = public
as $$
declare
  v_folder public.database_folders%rowtype;
begin
  update public.database_folders
  set name = btrim(p_name)
  where id = p_folder_id
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning * into v_folder;

  if not found then
    raise exception using errcode = 'P0001', message = 'The folder changed in another session. Refresh and try again.';
  end if;
  insert into public.database_explorer_audit (
    workspace_key, action, item_type, item_id, destination_parent_id
  ) values (
    v_folder.workspace_key, 'folder_renamed', 'folder', v_folder.id, v_folder.parent_id
  );
  return v_folder;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'A folder with this name already exists in that location.';
end;
$$;

create or replace function public.move_database_folder(
  p_folder_id uuid,
  p_parent_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns public.database_folders
language plpgsql
set search_path = public
as $$
declare
  v_folder public.database_folders%rowtype;
  v_source_parent uuid;
begin
  select parent_id
  into v_source_parent
  from public.database_folders
  where id = p_folder_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The folder is no longer available.';
  end if;

  update public.database_folders
  set parent_id = p_parent_id
  where id = p_folder_id
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning * into v_folder;

  if not found then
    raise exception using errcode = 'P0001', message = 'The folder changed in another session. Refresh and try again.';
  end if;
  insert into public.database_explorer_audit (
    workspace_key, action, item_type, item_id, source_parent_id, destination_parent_id
  ) values (
    v_folder.workspace_key, 'folder_moved', 'folder', v_folder.id, v_source_parent, v_folder.parent_id
  );
  return v_folder;
end;
$$;

create or replace function public.move_database_lists(
  p_list_ids uuid[],
  p_folder_id uuid default null,
  p_workspace_key text default 'default'
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ids uuid[];
  v_expected integer;
  v_updated integer;
  v_destination_workspace text := coalesce(nullif(btrim(p_workspace_key), ''), 'default');
begin
  select array_agg(distinct id)
  into v_ids
  from unnest(coalesce(p_list_ids, '{}'::uuid[])) as input(id);
  v_expected := coalesce(cardinality(v_ids), 0);
  if v_expected = 0 then
    raise exception using errcode = '22023', message = 'Select at least one list to move.';
  end if;

  if p_folder_id is not null then
    select workspace_key
    into v_destination_workspace
    from public.database_folders
    where id = p_folder_id
      and is_archived = false;
    if not found then
      raise exception using errcode = '23503', message = 'The destination folder is no longer available.';
    end if;
  end if;

  if exists (
    select 1
    from public.lists
    where id = any(v_ids)
      and name = 'Master Database'
  ) then
    raise exception using errcode = '23514', message = 'Master Database cannot be moved into a folder.';
  end if;

  update public.lists
  set
    folder_id = p_folder_id,
    database_workspace_key = v_destination_workspace
  where id = any(v_ids)
    and database_workspace_key = v_destination_workspace;
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception using errcode = 'P0001', message = 'One or more lists changed or belong to another workspace. Nothing was moved.';
  end if;

  insert into public.database_explorer_audit (
    workspace_key, action, item_type, destination_parent_id, item_count, metadata
  ) values (
    v_destination_workspace,
    'lists_moved',
    case when v_expected = 1 then 'list' else 'list_batch' end,
    p_folder_id,
    v_expected,
    jsonb_build_object('list_ids', to_jsonb(v_ids))
  );

  return jsonb_build_object(
    'ok', true,
    'moved_count', v_updated,
    'list_ids', to_jsonb(v_ids),
    'folder_id', p_folder_id
  );
end;
$$;

create or replace function public.set_database_list_archived(
  p_list_id uuid,
  p_archived boolean,
  p_workspace_key text default 'default'
)
returns public.lists
language plpgsql
set search_path = public
as $$
declare
  v_list public.lists%rowtype;
begin
  update public.lists
  set is_archived = coalesce(p_archived, false)
  where id = p_list_id
    and database_workspace_key = coalesce(nullif(btrim(p_workspace_key), ''), 'default')
    and name <> 'Master Database'
  returning * into v_list;

  if not found then
    raise exception using errcode = 'P0001', message = 'The list is protected, unavailable, or belongs to another workspace.';
  end if;

  insert into public.database_explorer_audit (
    workspace_key, action, item_type, item_id, destination_parent_id, metadata
  ) values (
    v_list.database_workspace_key,
    'list_archived',
    'list',
    v_list.id,
    v_list.folder_id,
    jsonb_build_object('archived', v_list.is_archived)
  );
  return v_list;
end;
$$;

create or replace function public.delete_database_folder(
  p_folder_id uuid,
  p_mode text default 'empty_only',
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_folder public.database_folders%rowtype;
  v_folder_count integer;
  v_list_count integer;
begin
  select *
  into v_folder
  from public.database_folders
  where id = p_folder_id
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The folder changed or was deleted in another session. Refresh and try again.';
  end if;

  select count(*) into v_folder_count
  from public.database_folders
  where parent_id = p_folder_id;
  select count(*) into v_list_count
  from public.lists
  where folder_id = p_folder_id;

  if (v_folder_count > 0 or v_list_count > 0) and p_mode <> 'move_to_parent' then
    raise exception using errcode = '23514', message = 'This folder contains items. Choose Move contents to parent or cancel.';
  end if;

  if p_mode = 'move_to_parent' then
    update public.database_folders
    set parent_id = v_folder.parent_id
    where parent_id = p_folder_id;
    update public.lists
    set folder_id = v_folder.parent_id
    where folder_id = p_folder_id;
  elsif p_mode <> 'empty_only' then
    raise exception using errcode = '22023', message = 'Unsupported folder deletion mode.';
  end if;

  delete from public.database_folders where id = p_folder_id;
  insert into public.database_explorer_audit (
    workspace_key, action, item_type, item_id, source_parent_id, destination_parent_id, item_count,
    metadata
  ) values (
    v_folder.workspace_key,
    'folder_deleted',
    'folder',
    v_folder.id,
    v_folder.parent_id,
    v_folder.parent_id,
    v_folder_count + v_list_count,
    jsonb_build_object('mode', p_mode, 'moved_folders', v_folder_count, 'moved_lists', v_list_count)
  );
  return jsonb_build_object(
    'ok', true,
    'moved_folders', v_folder_count,
    'moved_lists', v_list_count,
    'parent_id', v_folder.parent_id
  );
end;
$$;

alter table public.database_folders enable row level security;
drop policy if exists "database_folders_all" on public.database_folders;
create policy "database_folders_all" on public.database_folders
  for all using (true) with check (true);

alter table public.database_explorer_audit enable row level security;
drop policy if exists "database_explorer_audit_all" on public.database_explorer_audit;
create policy "database_explorer_audit_all" on public.database_explorer_audit
  for all using (true) with check (true);

grant select, insert, update, delete on public.database_folders to anon, authenticated;
grant select, insert on public.database_explorer_audit to anon, authenticated;
grant execute on function public.create_database_folder(text, uuid, text) to anon, authenticated;
grant execute on function public.rename_database_folder(uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.move_database_folder(uuid, uuid, timestamptz) to anon, authenticated;
grant execute on function public.move_database_lists(uuid[], uuid, text) to anon, authenticated;
grant execute on function public.set_database_list_archived(uuid, boolean, text) to anon, authenticated;
grant execute on function public.delete_database_folder(uuid, text, timestamptz) to anon, authenticated;

comment on table public.database_folders is
  'Organizational folder tree for prospecting lists. Folders never own or contain CRM contact records.';
comment on column public.lists.folder_id is
  'Optional Database Explorer location. Null means the list appears at Database root.';
comment on function public.move_database_lists(uuid[], uuid, text) is
  'Atomically relocates one or more list records without changing contacts, memberships, imports, or source history.';

commit;
