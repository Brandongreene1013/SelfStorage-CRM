// The synthesized daily brief. Plain text only. Clearly labeled as system
// synthesis with a confidence + evidence count and an "as of" line.
const CONF_TONE = { high: 'text-emerald-300', medium: 'text-amber-300', low: 'text-slate-400' };

export default function DailyBrief({ snapshot }) {
  if (!snapshot || !snapshot.headline) {
    return (
      <div className="text-xs text-slate-600 italic py-3">
        The daily brief generates each weekday morning once market and news data are ingested.
      </div>
    );
  }
  const b = snapshot.brief ?? {};
  const developments = Array.isArray(b.keyDevelopments) ? b.keyDevelopments : [];
  const evidence = Array.isArray(snapshot.evidenceItemIds) ? snapshot.evidenceItemIds.length : 0;
  const confidence = snapshot.confidence ?? b.confidence;

  return (
    <div>
      <p className="text-[15px] font-bold text-white leading-snug tracking-tight">{snapshot.headline}</p>

      {developments.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {developments.slice(0, 5).map((d, i) => (
            <li key={i} className="flex gap-2 text-xs text-slate-300 leading-snug">
              <span className="text-amber-500/80 mt-px flex-shrink-0">▸</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}

      {b.whatItMeans && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 mb-0.5">What this means for your deals</p>
          <p className="text-xs text-slate-200 leading-snug">{b.whatItMeans}</p>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
        <span className="uppercase tracking-wider">System synthesis</span>
        {confidence && <span>· confidence <span className={CONF_TONE[confidence] ?? 'text-slate-400'}>{confidence}</span></span>}
        {evidence > 0 && <span>· {evidence} source{evidence === 1 ? '' : 's'}</span>}
        {snapshot.generatedAt && <span>· {new Date(snapshot.generatedAt).toLocaleString('default', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
}
