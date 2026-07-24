export default function MetricCard({ label, value, sub, accent = 'text-white' }) {
  return (
    <div className="px-5 py-3.5">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold leading-none tracking-tight tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  );
}

export function MetricCardGrid({ metrics, cols = 'grid-cols-3 lg:grid-cols-6' }) {
  return (
    <div className="bg-slate-900 border border-slate-800/90 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/[0.03]">
      <div className={`grid ${cols} divide-y lg:divide-y-0 divide-x divide-slate-800/80`}>
        {metrics.map((m, i) => (
          <MetricCard key={i} {...m} />
        ))}
      </div>
    </div>
  );
}
