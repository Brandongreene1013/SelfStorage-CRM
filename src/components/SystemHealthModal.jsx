import { ModalLayout, Button } from './ui';
import { useSystemHealth } from '../hooks/useSystemHealth';

const STATUS = {
  ready: { label: 'Ready', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  migration_needed: { label: 'Migration needed', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  server_only: { label: 'Server only', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  error: { label: 'Check failed', className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  unknown: { label: 'Not verified', className: 'border-slate-600 bg-slate-800 text-slate-400' },
};

function StatusPill({ status }) {
  const meta = STATUS[status] || STATUS.unknown;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>;
}

export default function SystemHealthModal({ signals, onClose }) {
  const health = useSystemHealth(true);
  const requiredIssues = health.probes.filter(probe => probe.required && probe.status !== 'ready');
  const optionalIssues = health.probes.filter(probe => !probe.required && probe.status !== 'ready');
  const signalRows = [
    { label: 'Task columns', status: signals.taskMigrationNeeded ? 'migration_needed' : 'ready', migration: 'sql/tasks_table_migration.sql' },
    { label: 'Core Client profile', status: signals.coreMigrationNeeded ? 'migration_needed' : 'ready', migration: 'sql/core_clients_pipeline_migration.sql' },
    { label: 'Brokerage Continuum RPC', status: signals.continuumMigrationNeeded ? 'migration_needed' : 'ready', migration: 'sql/brokerage_continuum_migration.sql' },
    { label: 'Deal-value columns', status: signals.dealValueMigrationNeeded ? 'migration_needed' : 'ready', migration: 'sql/client_deal_value_migration.sql' },
    { label: 'Activity analytics columns', status: signals.analyticsMigrationNeeded ? 'migration_needed' : 'ready', migration: 'sql/analytics_integrity_migration.sql' },
    { label: 'Mailer sent tracking', status: signals.mailerMigrationNeeded ? 'migration_needed' : 'ready', migration: 'sql/mailer_sent_tracking_migration.sql' },
    {
      label: 'Atomic Pipeline stage RPC',
      status: signals.pipelineStageRpcStatus === 'ready'
        ? 'ready'
        : signals.pipelineStageRpcStatus === 'missing' ? 'migration_needed' : 'unknown',
      migration: 'sql/pipeline_stage_rpc_migration.sql',
    },
  ];

  return (
    <ModalLayout onClose={onClose} size="lg" className="overflow-hidden">
      <div className="border-b border-slate-800 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-400">Read-only diagnostics</p>
        <h2 className="mt-1 text-xl font-bold text-white">System health</h2>
        <p className="mt-1 text-sm text-slate-500">Checks schema availability without changing CRM data.</p>
      </div>

      <div className="max-h-[68vh] space-y-5 overflow-y-auto p-6">
        <div className={`rounded-xl border p-4 ${
          requiredIssues.length
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-emerald-500/30 bg-emerald-500/10'
        }`}>
          <p className={`text-sm font-bold ${requiredIssues.length ? 'text-amber-300' : 'text-emerald-300'}`}>
            {health.loading
              ? 'Checking production schema…'
              : requiredIssues.length
                ? `${requiredIssues.length} required capability${requiredIssues.length === 1 ? '' : 'ies'} need attention`
                : 'Required CRM capabilities are available'}
          </p>
          {!health.loading && optionalIssues.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">{optionalIssues.length} optional or dark-launched capability checks are not active.</p>
          )}
        </div>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Runtime signals</h3>
          <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/50">
            {signalRows.map(row => (
              <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{row.label}</p>
                  {row.status !== 'ready' && <p className="mt-0.5 text-xs text-slate-500">{row.migration}</p>}
                </div>
                <StatusPill status={row.status} />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Schema probes</h3>
          <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/50">
            {health.probes.map(probe => (
              <div key={probe.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{probe.label}</p>
                  {probe.status !== 'ready' && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {probe.migration || (probe.required ? 'Inspect Supabase permissions and connectivity.' : 'Optional feature is not active.')}
                    </p>
                  )}
                </div>
                <StatusPill status={probe.status} />
              </div>
            ))}
            {!health.loading && health.probes.length === 0 && (
              <p className="px-4 py-5 text-sm text-slate-500">No checks have run yet.</p>
            )}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
        <p className="text-xs text-slate-600">
          {health.lastCheckedAt ? `Checked ${new Date(health.lastCheckedAt).toLocaleTimeString()}` : 'Not checked yet'}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={health.refresh} disabled={health.loading}>Refresh checks</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </ModalLayout>
  );
}
