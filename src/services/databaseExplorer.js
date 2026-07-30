import { supabase } from '../lib/supabase';
import { isMissingColumnError, isMissingTableError, supabaseErrorText } from '../lib/supabaseErrors';

export function dbToDatabaseFolder(row) {
  return {
    id: row.id,
    workspaceKey: row.workspace_key ?? 'default',
    name: row.name,
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order ?? null,
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isDatabaseExplorerMigrationError(error) {
  return isMissingTableError(error, 'database_folders')
    || isMissingColumnError(error, 'folder_id')
    || /create_database_folder|move_database_folder|move_database_lists|delete_database_folder|set_database_list_archived/i.test(supabaseErrorText(error))
      && ['PGRST202', '42883'].includes(error?.code);
}

export function databaseExplorerError(error, fallback = 'The Database Explorer could not save this change.') {
  if (!error) return fallback;
  const text = supabaseErrorText(error);
  if (isDatabaseExplorerMigrationError(error)) return 'Database Explorer setup is not installed yet.';
  if (error.code === '23505' || /already exists/i.test(text)) return 'A folder with this name already exists in that location.';
  if (/descendant|itself|circular/i.test(text)) return 'A folder cannot be moved into itself or one of its descendants.';
  if (/maximum depth|depth of 10/i.test(text)) return 'Database folders support a maximum depth of 10 levels.';
  if (/destination folder.*available|no longer available/i.test(text)) return 'That destination no longer exists. The Explorer has been refreshed.';
  if (/changed in another session/i.test(text)) return 'This item changed in another tab. The Explorer has been refreshed.';
  if (error.code === '42501' || /permission denied|workspace/i.test(text)) return 'You do not have access to that folder location.';
  if (/contains items/i.test(text)) return 'This folder contains items. Move its contents to the parent or cancel.';
  return fallback;
}

export async function fetchDatabaseFolders() {
  const { data, error } = await supabase
    .from('database_folders')
    .select('*')
    .eq('workspace_key', 'default')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) return { error, folders: [] };
  return { folders: (data ?? []).map(dbToDatabaseFolder) };
}

export async function createDatabaseFolder({ name, parentId }) {
  const { data, error } = await supabase.rpc('create_database_folder', {
    p_name: name,
    p_parent_id: parentId || null,
    p_workspace_key: 'default',
  });
  return error ? { error } : { folder: dbToDatabaseFolder(data) };
}

export async function renameDatabaseFolder(folder, name) {
  const { data, error } = await supabase.rpc('rename_database_folder', {
    p_folder_id: folder.id,
    p_name: name,
    p_expected_updated_at: folder.updatedAt || null,
  });
  return error ? { error } : { folder: dbToDatabaseFolder(data) };
}

export async function moveDatabaseFolder(folder, parentId) {
  const { data, error } = await supabase.rpc('move_database_folder', {
    p_folder_id: folder.id,
    p_parent_id: parentId || null,
    p_expected_updated_at: folder.updatedAt || null,
  });
  return error ? { error } : { folder: dbToDatabaseFolder(data) };
}

export async function moveDatabaseLists(listIds, folderId) {
  const { data, error } = await supabase.rpc('move_database_lists', {
    p_list_ids: listIds,
    p_folder_id: folderId || null,
    p_workspace_key: 'default',
  });
  return error ? { error } : { result: data };
}

export async function deleteDatabaseFolder(folder, mode) {
  const { data, error } = await supabase.rpc('delete_database_folder', {
    p_folder_id: folder.id,
    p_mode: mode,
    p_expected_updated_at: folder.updatedAt || null,
  });
  return error ? { error } : { result: data };
}

export async function setDatabaseListArchived(listId, archived) {
  const { data, error } = await supabase.rpc('set_database_list_archived', {
    p_list_id: listId,
    p_archived: archived,
    p_workspace_key: 'default',
  });
  return error ? { error } : { row: data };
}
