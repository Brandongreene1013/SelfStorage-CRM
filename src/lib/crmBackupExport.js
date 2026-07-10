import { supabase } from './supabase';

const BACKUP_TABLES = [
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

function backupFilename(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `storage-hunters-crm-backup-${stamp}.json`;
}

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

    if (error) {
      return { table, rows, error: error.message };
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { table, rows, error: null };
}

export async function downloadCrmBackup() {
  const exportedAt = new Date().toISOString();
  const results = await Promise.all(BACKUP_TABLES.map(fetchTable));
  const payload = {
    product: 'Storage Hunters CRM',
    exportedAt,
    source: 'in-app-manual-export',
    warning: 'This JSON is a convenience export. Disaster recovery should use the encrypted Postgres dumps from the backup workflow.',
    tables: Object.fromEntries(results.map(result => [result.table, result.rows])),
    tableCounts: Object.fromEntries(results.map(result => [result.table, result.rows.length])),
    errors: results.filter(result => result.error).map(({ table, error }) => ({ table, error })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFilename(new Date(exportedAt));
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return payload;
}

