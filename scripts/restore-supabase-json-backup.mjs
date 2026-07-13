// Restore CRM tables into Supabase from a JSON backup produced by
// export-supabase-json-backup.mjs or the in-app Backup button.
//
// Usage:
//   node scripts/restore-supabase-json-backup.mjs <backup.json>                # dry run (default)
//   node scripts/restore-supabase-json-backup.mjs <backup.json> --execute      # actually restore
//   node scripts/restore-supabase-json-backup.mjs <backup.json> --tables contacts,lists --execute
//
// Restores by UPSERT on primary key: existing rows are overwritten with the
// backup's version, missing rows are re-created. Rows created AFTER the backup
// are never deleted — this script only adds/repairs, it never removes data.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp';

// Parents before children so foreign keys resolve during restore.
const RESTORE_ORDER = [
  'lists',
  'clients',
  'ownership_groups',
  'contacts',
  'properties',
  'tasks',
  'meetings',
  'calendar_event',
  'daily_progress',
  'daily_email_events',
  'daily_activity_reviews',
  'mailer_lists',
  'mailer_list_members',
  'duplicate_dismissals',
];

const args = process.argv.slice(2);
const backupPath = args.find(a => !a.startsWith('--'));
const execute = args.includes('--execute');
const tablesArg = args.find(a => a.startsWith('--tables'));
const onlyTables = tablesArg ? tablesArg.split('=')[1]?.split(',') ?? args[args.indexOf(tablesArg) + 1]?.split(',') : null;

if (!backupPath) {
  console.error('Usage: node scripts/restore-supabase-json-backup.mjs <backup.json> [--tables t1,t2] [--execute]');
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(readFileSync(backupPath, 'utf8'));
} catch (err) {
  console.error(`Could not read/parse backup file: ${err.message}`);
  process.exit(1);
}

if (!payload.tables || typeof payload.tables !== 'object') {
  console.error('This does not look like a CRM backup: no "tables" object found.');
  process.exit(1);
}

console.log(`Backup file:   ${backupPath}`);
console.log(`Exported at:   ${payload.exportedAt ?? 'unknown'}`);
console.log(`Source:        ${payload.source ?? 'unknown'}`);
if ((payload.errors ?? []).length > 0) {
  console.warn(`WARNING: this backup recorded export errors for: ${payload.errors.map(e => e.table).join(', ')}`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = RESTORE_ORDER.filter(t => {
  if (onlyTables && !onlyTables.includes(t)) return false;
  return Array.isArray(payload.tables[t]);
});

const unknownRequested = (onlyTables ?? []).filter(t => !RESTORE_ORDER.includes(t));
if (unknownRequested.length > 0) {
  console.error(`Unknown table(s) requested: ${unknownRequested.join(', ')}`);
  process.exit(1);
}

async function liveCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return error ? `error: ${error.message}` : count;
}

console.log(`\n${execute ? 'RESTORING' : 'DRY RUN (pass --execute to actually restore)'}\n`);
console.log('table                     backup rows   live rows now');
console.log('─'.repeat(56));
for (const table of tables) {
  const rows = payload.tables[table];
  const live = await liveCount(table);
  console.log(`${table.padEnd(26)}${String(rows.length).padStart(11)}   ${String(live).padStart(13)}`);
}

if (!execute) {
  console.log('\nDry run complete. Nothing was written.');
  process.exit(0);
}

const BATCH = 500;
let failed = false;

for (const table of tables) {
  const rows = payload.tables[table];
  if (rows.length === 0) { console.log(`${table}: 0 rows in backup, skipping.`); continue; }

  let restored = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(batch);
    if (error) {
      console.error(`${table}: upsert failed at rows ${i}-${i + batch.length - 1}: ${error.message}`);
      failed = true;
      break;
    }
    restored += batch.length;
  }
  console.log(`${table}: restored ${restored}/${rows.length} rows.`);
}

if (failed) {
  console.error('\nRestore finished WITH ERRORS — review the messages above.');
  process.exit(1);
}
console.log('\nRestore complete.');
