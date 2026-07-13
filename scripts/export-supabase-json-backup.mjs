import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp';

const TABLES = [
  'clients',
  'contacts',
  'lists',
  'tasks',
  'meetings',
  'calendar_event',
  'daily_progress',
  'ownership_groups',
  'properties',
  'mailer_lists',
  'mailer_list_members',
  'duplicate_dismissals',
];

const outputDir = process.env.BACKUP_OUTPUT_DIR || join(process.cwd(), 'backups');
mkdirSync(outputDir, { recursive: true });

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchTable(table) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);

    if (error) return { table, rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { table, rows, error: null };
}

const exportedAt = new Date().toISOString();
const stamp = exportedAt.replace(/[:.]/g, '-');
const results = await Promise.all(TABLES.map(fetchTable));

const payload = {
  product: 'Storage Hunters CRM',
  exportedAt,
  source: 'automated-supabase-json-export',
  projectRef: 'rpoiphoqwgvbiyygfjrm',
  restoreNotes: 'This is a table-level JSON backup for emergency recovery and inspection. Prefer Supabase PITR or a pg_dump custom backup when available.',
  tables: Object.fromEntries(results.map(result => [result.table, result.rows])),
  tableCounts: Object.fromEntries(results.map(result => [result.table, result.rows.length])),
  errors: results.filter(result => result.error).map(({ table, error }) => ({ table, error })),
};

const backupPath = join(outputDir, `storage-hunters-crm-json-${stamp}.json`);
const manifestPath = join(outputDir, `storage-hunters-crm-json-${stamp}-MANIFEST.txt`);

writeFileSync(backupPath, JSON.stringify(payload, null, 2));
writeFileSync(manifestPath, [
  'product=Storage Hunters CRM',
  `created_utc=${exportedAt}`,
  'format=json table export',
  'project_ref=rpoiphoqwgvbiyygfjrm',
  `tables=${TABLES.join(',')}`,
  `errors=${payload.errors.length}`,
  '',
].join('\n'));

console.log(`BACKUP_JSON=${backupPath}`);
console.log(`BACKUP_MANIFEST=${manifestPath}`);
console.log(`TABLE_COUNTS=${JSON.stringify(payload.tableCounts)}`);

// A backup that silently exported nothing is worse than a failed backup —
// fail the process (and the GitHub workflow) so it alarms instead.
if (payload.errors.length > 0) {
  console.error('Backup FAILED — table export errors:');
  payload.errors.forEach(error => console.error(`${error.table}: ${error.error}`));
  process.exit(1);
}

// Core tables can never legitimately be empty once the CRM is in daily use.
const CORE_TABLES = ['contacts', 'lists', 'clients'];
const emptyCore = CORE_TABLES.filter(table => (payload.tableCounts[table] ?? 0) === 0);
if (emptyCore.length > 0) {
  console.error(`Backup FAILED sanity check — core tables exported 0 rows: ${emptyCore.join(', ')}`);
  console.error('This usually means an RLS or key problem, not an actually-empty database.');
  process.exit(1);
}

