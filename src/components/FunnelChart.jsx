import { PIPELINE_STAGES } from '../data/constants';

export default function FunnelChart({ clients, filter }) {
  const filtered = filter === 'All' ? clients : clients.filter(c => c.type === filter);
  const total = filtered.length;

  const counts = PIPELINE_STAGES.map(s => ({
    ...s,
    count: filtered.filter(c => c.stageId === s.id).length,
  }));

  const maxCount = Math.max(...counts.map(c => c.count), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wide">
        Brokerage Continuum — Pipeline Funnel
      </h3>
      <div className="space-y-2">
        {counts.map((stage, i) => {
          const barPct = total === 0 ? 0 : (stage.count / maxCount) * 100;
          const pct = total === 0 ? 0 : Math.round((stage.count / total) * 100);
          return (
            <div key={stage.id} className="flex items-center gap-3 group">
              {/* Stage number */}
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow"
                style={{ background: stage.hex }}
              >
                {stage.id}
              </div>

              {/* Label */}
              <span className="flex-shrink-0 text-xs text-slate-400 w-28 truncate group-hover:text-slate-200 transition-colors">
                {stage.label}
              </span>

              {/* Bar */}
              <div className="flex-1 bg-slate-800 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${barPct}%`,
                    background: `${stage.hex}cc`,
                    minWidth: stage.count > 0 ? '2rem' : '0',
                  }}
                >
                  {stage.count > 0 && (
                    <span className="text-xs font-bold text-white">{stage.count}</span>
                  )}
                </div>
              </div>

              {/* Pct */}
              <span className="flex-shrink-0 text-xs text-slate-500 w-10 text-right">
                {pct > 0 ? `${pct}%` : '–'}
              </span>
            </div>
          );
        })}
      </div>

      {total === 0 && (
        <p className="text-center text-slate-600 text-sm mt-4">No clients to display.</p>
      )}
    </div>
  );
}
