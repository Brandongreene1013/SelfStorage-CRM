// Compact rate/credit summary. Shows the eight indicators most useful for
// brokerage and deal financing in a responsive, full-width grid.
// Shows no fabricated change when a prior observation is missing.
const VISIBLE_KEYS = [
  'ust_y2',
  'ust_y10',
  'fed_funds',
  'sofr',
  'hy_spread',
  'cre_delinquency',
  'cre_loans',
  'unemployment',
];

function fmtValue(v, unit) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (unit === 'bp') return `${n > 0 ? '+' : ''}${n.toFixed(0)}bp`;
  if (unit === '%') return `${n.toFixed(2)}%`;
  if (unit === '$MM' || unit === '$B') return n.toLocaleString();
  return n.toLocaleString();
}
function ChangeBadge({ bp }) {
  if (bp == null) return <span className="text-[10px] text-slate-600">—</span>;
  const up = bp > 0, flat = bp === 0;
  return (
    <span
      title="Movement in the metric, not a good/bad news rating"
      className={`text-[10px] tabular-nums font-semibold ${flat ? 'text-slate-500' : up ? 'text-rose-300' : 'text-cyan-300'}`}
    >
      {up ? '▲' : flat ? '' : '▼'} {Math.abs(bp).toFixed(0)}bp
    </span>
  );
}

export default function MarketTape({ tape = [] }) {
  const visibleTape = VISIBLE_KEYS
    .map(key => tape.find(cell => cell.key === key))
    .filter(Boolean);
  if (visibleTape.length === 0) {
    return <p className="text-xs text-slate-600 italic px-1 py-2">Rate & credit data will populate after the first market refresh.</p>;
  }
  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-px overflow-hidden rounded-lg border border-slate-800/90 bg-slate-800 ring-1 ring-inset ring-white/[0.03]">
        {visibleTape.map(cell => (
          <div key={cell.key} className="min-w-0 bg-slate-950/60 px-3 py-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight text-slate-500">{cell.label}</span>
              {cell.stale && <span title="Stale observation" className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-1.5">
              <span className={`text-sm font-bold tabular-nums ${cell.inverted ? 'text-red-300' : 'text-slate-100'}`}>
                {fmtValue(cell.value, cell.unit)}
              </span>
              {cell.kind === 'rate' && <ChangeBadge bp={cell.dailyBp} />}
            </div>
            {cell.asOf && <p className="text-[9px] text-slate-600 mt-0.5 tabular-nums">{String(cell.asOf).slice(5)}</p>}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-600">Arrows show market movement only; deal impact is summarized below.</p>
    </div>
  );
}
