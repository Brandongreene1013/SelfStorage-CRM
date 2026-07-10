import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL. Set it to the Supabase Postgres connection string before running this script.');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

const backupsDir = join(process.cwd(), 'backups');
if (!existsSync(backupsDir)) mkdirSync(backupsDir);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dumpPath = join(backupsDir, `storage-hunters-crm-${stamp}.dump`);
const schemaPath = join(backupsDir, `storage-hunters-crm-${stamp}-schema.sql`);
const manifestPath = join(backupsDir, `storage-hunters-crm-${stamp}-MANIFEST.txt`);

run('pg_dump', [
  dbUrl,
  '--format=custom',
  '--no-owner',
  '--no-acl',
  `--file=${dumpPath}`,
]);

run('pg_dump', [
  dbUrl,
  '--schema-only',
  '--no-owner',
  '--no-acl',
  `--file=${schemaPath}`,
]);

writeFileSync(manifestPath, [
  'product=Storage Hunters CRM',
  `created_utc=${new Date().toISOString()}`,
  'format=pg_dump custom + schema sql',
  'project_ref=rpoiphoqwgvbiyygfjrm',
  'restore_notes=Restore the .dump with pg_restore into a clean Supabase/Postgres database.',
  '',
].join('\n'));

console.log(`Backup written to ${backupsDir}`);
console.log(dumpPath);
console.log(schemaPath);

