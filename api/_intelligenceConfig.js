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
// Start EMPTY on purpose. Each feed must be verified as a real, permitted,
// canonical, timestamped feed before it is added — the pipeline runs fine with
// none configured. Populate deliberately in a later verification pass.
export const INDUSTRY_RSS = [
  // Example shape (commented until verified):
  // { key: 'globest_cre', provider: 'industry_rss', sourceName: 'GlobeSt CRE', url: 'https://www.globest.com/feed/', category: 'cre', verified: true },
];

// ── GDELT discovery query groups ─────────────────────────────────────────────
// Separate, conservative queries (not one giant OR) so we can cache each group
// and attribute results. GDELT ranking is only a discovery signal — our own
// scoring re-ranks everything.
export const GDELT_QUERY_GROUPS = [
  { key: 'self_storage',   category: 'self_storage',   query: '("self storage" OR "self-storage") (portfolio OR acquisition OR REIT OR occupancy OR development)' },
  { key: 'cre_transactions', category: 'cre',          query: '"commercial real estate" (acquisition OR portfolio OR "cap rate" OR disposition)' },
  { key: 'cre_debt',       category: 'cre',            query: '"commercial real estate" (refinancing OR "debt maturity" OR distress OR foreclosure)' },
  { key: 'private_credit', category: 'private_credit', query: '"private credit" (real estate OR "direct lending" OR "loan origination")' },
  { key: 'private_equity', category: 'private_equity', query: '"private equity" ("real estate" OR REIT OR fundraising OR recapitalization)' },
  { key: 'fed_rates',      category: 'rates',          query: '(Federal Reserve OR FOMC) (rate OR inflation OR "monetary policy")' },
  { key: 'cmbs',           category: 'cre',            query: 'CMBS (delinquency OR spread OR issuance OR distress)' },
  { key: 'regional_bank_cre', category: 'cre',         query: '"regional bank" "commercial real estate" (exposure OR losses OR lending)' },
  { key: 'storage_operators', category: 'self_storage', query: '("Public Storage" OR "Extra Space" OR CubeSmart OR "National Storage")' },
  { key: 'distress',       category: 'cre',            query: '"commercial real estate" (recapitalization OR "rescue capital" OR default)' },
];

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
  gdeltMaxRecordsPerGroup: 25,  // conservative
  fredObservationLimit: 400,
  userAgent: 'StorageHuntersCRM-Intelligence/1.0 (+contact: broker ops)',
};

// Default priority markets can be overridden by INTELLIGENCE_PRIORITY_MARKETS.
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
