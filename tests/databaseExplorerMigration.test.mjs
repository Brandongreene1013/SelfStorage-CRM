import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../sql/database_explorer_migration.sql', import.meta.url), 'utf8');
for (const fragment of [
  'create table if not exists public.database_folders',
  'add column if not exists folder_id',
  'create or replace function public.create_database_folder',
  'create or replace function public.move_database_folder',
  'create or replace function public.move_database_lists',
  'create or replace function public.set_database_list_archived',
  'create or replace function public.delete_database_folder',
  'maximum depth of 10',
  'database_explorer_audit',
]) {
  assert.ok(sql.toLowerCase().includes(fragment.toLowerCase()), `migration missing: ${fragment}`);
}
assert.match(sql, /parent_id uuid references public\.database_folders\(id\) on delete restrict/i);
assert.match(sql, /foreign key\s*\(folder_id\)[\s\S]*on delete restrict/i);
assert.match(sql, /p_mode[\s\S]*empty_only[\s\S]*move_to_parent/i);
assert.doesNotMatch(sql, /delete\s+from\s+public\.contacts/i, 'folder migration must never delete contacts');

console.log('databaseExplorer migration contract tests passed');
