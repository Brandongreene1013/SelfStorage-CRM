// Subtle source-freshness surface. Never shows raw stack traces — just a
// per-provider state chip and an "as of" line.
const STATE_TONE = {
  success: 'text-emerald-300',
  partial: 'text-amber-300',
  rate_limited: 'text-amber-300',
  stale_fallback: 'text-amber-300',
  timeout: 'text-red-300',
  malformed: 'text-red-300',
  missing_config: 'text-slate-500',
  error: 'text-red-300',
};
const STATE_LABEL = {
  success: 'OK', partial: 'Partial', rate_limited: 'Throttled', stale_fallback: 'Stale',
  timeout: 'Timeout', malformed: 'Bad data', missing_config: 'Not set', error: 'Error',
};

export default function ProviderStatus({ statuses = [], generatedAt, stale }) {
  // Collapse to one row per provider, worst state wins.
  const worst = new Map();
  const rank = { success: 0, missing_config: 1, partial: 2, rate_limited: 2, stale_fallback: 3, timeout: 4, malformed: 4, error: 4 };
  for (const s of statuses ?? []) {
    const cur = worst.get(s.provider);
    if (!cur || (rank[s.state] ?? 9) > (rank[cur.state] ?? 9)) worst.set(s.provider, s);
  }
  const rows = [...worst.values()];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span className="uppercase tracking-wider font-semibold text-slate-600">Sources</span>
      {rows.length === 0 && <span className="italic">No refresh recorded yet</span>}
      {rows.map(s => (
        <span key={s.provider} className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${STATE_TONE[s.state]?.replace('text-', 'bg-') ?? 'bg-slate-600'}`} />
          <span className="text-slate-400">{prettyProvider(s.provider)}</span>
          <span className={STATE_TONE[s.state] ?? 'text-slate-500'}>{STATE_LABEL[s.state] ?? s.state}</span>
        </span>
      ))}
      {generatedAt && (
        <span className={`ml-auto ${stale ? 'text-amber-400' : 'text-slate-600'}`}>
          as of {new Date(generatedAt).toLocaleString('default', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          {stale ? ' · stale' : ''}
        </span>
      )}
    </div>
  );
}

function prettyProvider(p) {
  return ({ federal_reserve: 'Fed', treasury: 'Treasury', fred: 'FRED', bing_news: 'Bing News', google_news: 'Google News', gdelt: 'GDELT', industry_rss: 'Trade', alpha_vantage: 'Equities' })[p] ?? p;
}
