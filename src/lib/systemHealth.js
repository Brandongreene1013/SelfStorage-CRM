import { classifySchemaProbe } from './supabaseErrors.js';

export const SYSTEM_HEALTH_PROBES = [
  { key: 'contacts', table: 'contacts', label: 'Master Database contacts', required: true },
  { key: 'opportunities', table: 'clients', label: 'Pipeline opportunities', required: true },
  { key: 'tasks', table: 'tasks', label: 'Universal tasks', required: true, migration: 'sql/tasks_table_migration.sql' },
  { key: 'core_clients', table: 'core_clients', label: 'Core Clients', required: true, migration: 'sql/core_clients_pipeline_migration.sql' },
  { key: 'continuum_history', table: 'brokerage_continuum_history', label: 'Brokerage Continuum audit', required: true, migration: 'sql/brokerage_continuum_migration.sql' },
  { key: 'pipeline_history', table: 'pipeline_stage_history', label: 'Pipeline stage audit', required: true, migration: 'sql/core_clients_pipeline_migration.sql' },
  { key: 'list_memberships', table: 'contact_list_memberships', label: 'Targeted call-list membership', required: true, migration: 'sql/contact_list_memberships_migration.sql' },
  { key: 'ownership_groups', table: 'ownership_groups', label: 'Ownership groups', required: true },
  { key: 'properties', table: 'properties', label: 'Properties', required: true },
  { key: 'mailer_lists', table: 'mailer_lists', label: 'Mailer lists', required: true, migration: 'sql/mailer_lists_migration.sql' },
  { key: 'daily_reviews', table: 'daily_activity_reviews', label: 'Daily activity reviews', required: true },
  { key: 'market_stories', table: 'market_stories', label: 'Persisted market news', required: false, migration: 'sql/market_intelligence_migration.sql' },
  { key: 'salesforce_import', table: 'salesforce_screenshot_imports', label: 'Salesforce screenshot import', required: false, serverOnly: true },
  { key: 'salesforce_rows', table: 'salesforce_screenshot_import_rows', label: 'Salesforce import rows', required: false, migration: 'sql/salesforce_screenshot_import_migration.sql' },
];

export function normalizeProbeStatus(probe, error) {
  const status = classifySchemaProbe(error);
  if (status === 'server_only' && probe.serverOnly) return 'ready';
  return status;
}

