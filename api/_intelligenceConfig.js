// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: static configuration (no network).
//
// Source registries and query groups live here so adapters never carry
// hardcoded, unreviewed endpoints. Every feed URL is an explicit allowlist
// entry; the fetch layer refuses to request anything not registered here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Official government / central-bank feeds (high source authority) ─────────
// These are stable, publicly documented feeds. Treasury/FRED have dedicated
// adapters; the RSS ones are parsed by the generic RSS adapter.
export const OFFICIAL_RSS = [
  { key: 'fed_press',    provider: 'federal_reserve', sourceName: 'Federal Reserve — Press Releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { key: 'fed_monetary', provider: 'federal_reserve', sourceName: 'Federal Reserve — Monetary Policy', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
  { key: 'fed_speeches', provider: 'federal_reserve', sourceName: 'Federal Reserve — Speeches',        url: 'https://www.federalreserve.gov/feeds/speeches.xml' },
  { key: 'fed_testimony',provider: 'federal_reserve', sourceName: 'Federal Reserve — Testimony',       url: 'https://www.federalreserve.gov/feeds/testimony.xml' },
  { key: 'fed_banking',  provider: 'federal_reserve', sourceName: 'Federal Reserve — Banking/Regulation', url: 'https://www.federalreserve.gov/feeds/press_bcreg.xml' },
];

// ── Industry / trade-press RSS registry (allowlist) ──────────────────────────
// Verified 2026-07-27 with HTTP 200 + parseable, timestamped RSS. These are
// first-party publisher feeds, giving the daily batch a dependable trade-news
// spine even when a broad discovery API is throttled.
export const INDUSTRY_RSS = [
  { key: 'inside_self_storage', provider: 'industry_rss', sourceName: 'Inside Self-Storage', url: 'https://www.insideselfstorage.com/rss.xml', category: 'self_storage', verified: true },
  { key: 'commercial_observer', provider: 'industry_rss', sourceName: 'Commercial Observer', url: 'https://commercialobserver.com/feed/', category: 'cre', verified: true },
];

// ── Broad news discovery query groups ────────────────────────────────────────
// Bing News RSS is used as the no-key discovery layer. Links are unwrapped to
// the original publisher URL before storage. GDELT remains an opt-in fallback
// because its public endpoint repeatedly returned 429/timeouts in production.
export const NEWS_QUERY_GROUPS = [
  { key: 'self_storage', category: 'self_storage', query: 'self-storage acquisition portfolio development REIT' },
  { key: 'storage_operators', category: 'self_storage', query: 'Public Storage Extra Space Storage CubeSmart SmartStop' },
  { key: 'cre_transactions', category: 'cre', query: 'commercial real estate acquisitions sales cap rates transactions' },
  { key: 'cre_debt', category: 'cre', query: 'CRE refinancing CMBS distress debt maturity' },
  { key: 'private_credit', category: 'private_credit', query: 'private credit real estate lending' },
  { key: 'private_equity', category: 'private_equity', query: 'private equity real estate fund acquisitions' },
];

// Kept small and disabled by default. Set ENABLE_GDELT_NEWS=true to include it.
export const GDELT_QUERY_GROUPS = NEWS_QUERY_GROUPS;

export function marketNewsQueryGroups(markets = []) {
  return markets.slice(0, 4).map((market, index) => {
    const label = String(market?.label ?? market ?? '').trim();
    return {
      key: `active_market_${index + 1}`,
      category: 'self_storage',
      query: `"${label}" (development OR business OR economy OR "real estate" OR construction OR zoning)`,
      market: label,
    };
  }).filter(group => group.market);
}

// ── Alpha Vantage optional watchlist (verified public tickers only) ──────────
// Disabled unless ALPHA_VANTAGE_API_KEY is set. End-of-day only — never labeled
// live. Verify each symbol before enabling defaults.
export const ALPHA_VANTAGE_SYMBOLS = [
  { symbol: 'PSA',  label: 'Public Storage',   verified: true },
  { symbol: 'EXR',  label: 'Extra Space',      verified: true },
  { symbol: 'CUBE', label: 'CubeSmart',        verified: true },
  { symbol: 'NSA',  label: 'National Storage', verified: true },
];

// ── Provider fetch defaults (cost + safety controls) ─────────────────────────
export const PROVIDER_DEFAULTS = {
  timeoutMs: 12000,
  maxBytes: 4_000_000,          // reject oversized responses
  newsMaxRecordsPerGroup: 20,
  gdeltMaxRecordsPerGroup: 15,
  fredObservationLimit: 400,
  userAgent: 'StorageHuntersCRM-Intelligence/1.0 (+contact: broker ops)',
};

// Fallback only. The production pipeline first derives current markets from
// live CRM pipeline/tasks/activity and uses these when no active signal exists.
export const DEFAULT_PRIORITY_MARKETS = [
  'dallas', 'fort worth', 'houston', 'austin', 'san antonio', 'texas',
  'atlanta', 'georgia', 'florida', 'phoenix', 'nashville',
];

// The full set of hosts the fetch layer is permitted to contact. Anything not
// derivable from this list (plus FRED/GDELT/Treasury/Alpha Vantage API hosts,
// added in the providers module) is refused — an SSRF guardrail.
export function allowlistedFeedHosts() {
  const hosts = new Set();
  for (const f of [...OFFICIAL_RSS, ...INDUSTRY_RSS]) {
    try { hosts.add(new URL(f.url).hostname.toLowerCase()); } catch { /* skip malformed */ }
  }
  return hosts;
}
