// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: pure engine (single source of truth)
//
// Dependency-free, isomorphic logic shared by the serverless ingestion pipeline
// (api/*) and the frontend hook (src/lib/marketIntelligence.js re-exports this,
// the same pattern as _activityAnalytics.js). No network, no Supabase, no Node
// built-ins — so both runtimes and the Node test runner use identical logic.
//
// External titles/excerpts are UNTRUSTED input. Nothing here executes or trusts
// their content; they are only normalized, hashed, scored, and bounded.
// ─────────────────────────────────────────────────────────────────────────────

// ── Categories ───────────────────────────────────────────────────────────────
export const CATEGORIES = {
  self_storage: 'Self-Storage',
  cre: 'Commercial Real Estate',
  rates: 'Rates & Monetary Policy',
  private_credit: 'Private Credit',
  private_equity: 'Private Equity & Capital Markets',
  macro: 'Broker-Relevant Macro',
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Keyword signals per category. Deliberately conservative — a generic market
// story only lands in a category if it actually names the concept.
const CATEGORY_SIGNALS = {
  self_storage: [
    'self-storage', 'self storage', 'selfstorage', 'storage facility',
    'storage portfolio', 'extra space', 'public storage', 'cubesmart',
    'national storage', 'life storage', 'storage reit', 'climate-controlled storage',
    'storage occupancy', 'storage development', 'storage acquisition',
  ],
  cre: [
    'commercial real estate', 'cap rate', 'cre', 'cmbs', 'net lease',
    'industrial real estate', 'multifamily', 'office loan', 'property sale',
    'portfolio acquisition', 'disposition', 'refinanc', 'debt maturity',
    'foreclosure', 'distress', 'recapitaliz', 'transaction volume',
  ],
  rates: [
    'federal reserve', 'fomc', 'fed funds', 'interest rate', 'rate cut',
    'rate hike', 'sofr', 'treasury yield', 'yield curve', 'inflation',
    'cpi', 'pce', 'jerome powell', 'monetary policy', 'basis point',
    'balance sheet', 'quantitative', 'jobs report', 'nonfarm payroll',
  ],
  private_credit: [
    'private credit', 'direct lending', 'private debt', 'mezzanine',
    'preferred equity', 'rescue capital', 'credit fund', 'loan origination',
    'bridge loan', 'debt fund',
  ],
  private_equity: [
    'private equity', 'buyout', 'fundraising', 'merger', 'acquisition',
    'recapitalization', 'capital allocation', 'institutional investor',
    'real estate fund', 'reit', 'blackstone', 'kkr', 'carlyle', 'apollo',
  ],
  macro: [
    'unemployment', 'employment', 'labor market', 'consumer', 'gdp',
    'bank lending', 'credit spread', 'construction cost', 'recession',
    'regional bank', 'liquidity',
  ],
};

// Publisher authority tiers → an additive score boost. Official government /
// central-bank sources are most trusted; established trade press next.
export const SOURCE_AUTHORITY = {
  federal_reserve: 30,
  treasury: 30,
  fred: 28,
  official: 25,
  trade_press: 12,
  major_press: 8,
  wire: 6,
  unknown: 0,
};

const OFFICIAL_DOMAINS = [
  'federalreserve.gov', 'home.treasury.gov', 'treasury.gov', 'sec.gov',
  'bls.gov', 'bea.gov', 'stlouisfed.org', 'newyorkfed.org', 'fdic.gov',
  'occ.gov', 'consumerfinance.gov',
];

// ── Deterministic scoring weights (all in one place, per the spec) ───────────
export const SCORING_WEIGHTS = {
  selfStorageDirect: 45,   // names self-storage explicitly
  creTransaction: 22,      // CRE deal / debt / refinancing
  debtFinancing: 20,       // financing, lending, credit conditions
  monetaryPolicy: 18,      // Fed / rates / inflation
  privateCredit: 16,       // private credit / direct lending
  privateEquity: 12,       // PE / capital markets flows
  sourceAuthorityMax: 30,  // scaled by SOURCE_AUTHORITY
  freshnessMax: 20,        // scaled by freshnessScore (0..1)
  materialSizeMax: 10,     // stated transaction size (millions → capped)
  priorityMarket: 8,       // a configured priority market is named
  duplicatePenalty: -40,   // near-duplicate of an already-seen item
  genericMarketPenalty: -18, // reads as generic market noise, no CRE/storage hook
};

// FRED series allowlist. Every id must be verified against the official
// provider before enabling in production; `verified: false` means the adapter
// should skip it until confirmed. `restrictiveWhen` documents interpretation.
export const FRED_SERIES = [
  { key: 'fed_funds',      seriesId: 'DFF',        label: 'Effective Fed Funds', unit: '%',     frequency: 'daily',   category: 'rates',  restrictiveWhen: 'higher', maxStaleDays: 7,  verified: true },
  { key: 'sofr',           seriesId: 'SOFR',       label: 'SOFR',                unit: '%',     frequency: 'daily',   category: 'rates',  restrictiveWhen: 'higher', maxStaleDays: 7,  verified: true },
  { key: 'fed_balance',    seriesId: 'WALCL',      label: 'Fed Balance Sheet',   unit: '$MM',   frequency: 'weekly',  category: 'rates',  restrictiveWhen: 'lower',  maxStaleDays: 14, verified: true },
  { key: 'cpi',            seriesId: 'CPIAUCSL',   label: 'CPI (All Urban)',     unit: 'index', frequency: 'monthly', category: 'macro',  restrictiveWhen: 'higher', maxStaleDays: 45, verified: true },
  { key: 'unemployment',   seriesId: 'UNRATE',     label: 'Unemployment Rate',   unit: '%',     frequency: 'monthly', category: 'macro',  restrictiveWhen: 'higher', maxStaleDays: 45, verified: true },
  { key: 'ig_spread',      seriesId: 'BAMLC0A0CM', label: 'IG Credit Spread',    unit: 'bp',    frequency: 'daily',   category: 'private_credit', restrictiveWhen: 'higher', maxStaleDays: 7, verified: true },
  { key: 'hy_spread',      seriesId: 'BAMLH0A0HYM2', label: 'High-Yield Spread', unit: 'bp',    frequency: 'daily',   category: 'private_credit', restrictiveWhen: 'higher', maxStaleDays: 7, verified: true },
  { key: 'cre_delinquency', seriesId: 'DRCRELEXFACBS', label: 'CRE Loan Delinquency', unit: '%', frequency: 'quarterly', category: 'cre', restrictiveWhen: 'higher', maxStaleDays: 120, verified: true },
  { key: 'cre_loans',      seriesId: 'CREACBM027NBOG', label: 'Bank CRE Loans',  unit: '$B',    frequency: 'monthly', category: 'cre',    restrictiveWhen: 'lower',  maxStaleDays: 60, verified: true },
];

// Treasury constant-maturity tenors captured from the official daily feed.
export const TREASURY_TENORS = [
  { key: 'm1',  label: '1M',  months: 1 },
  { key: 'm3',  label: '3M',  months: 3 },
  { key: 'm6',  label: '6M',  months: 6 },
  { key: 'y1',  label: '1Y',  months: 12 },
  { key: 'y2',  label: '2Y',  months: 24 },
  { key: 'y5',  label: '5Y',  months: 60 },
  { key: 'y10', label: '10Y', months: 120 },
  { key: 'y20', label: '20Y', months: 240 },
  { key: 'y30', label: '30Y', months: 360 },
];

// ── Small helpers ────────────────────────────────────────────────────────────
export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function boundedString(value, max = 2000) {
  const s = value == null ? '' : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export function boundedArray(value, max = 50) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

// Stable, isomorphic 52-bit hash (FNV-1a style) — no node:crypto so it runs in
// the browser too. Used for content hashes / dedupe keys, not for security.
export function contentHash(...parts) {
  const str = parts.map(p => (p == null ? '' : String(p))).join(' ');
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000163) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}

// ── URL canonicalization ─────────────────────────────────────────────────────
const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|mkt_|ref$|ref_src$|cmpid$|icid$|ncid$|spm$|igshid$|wt_|__twitter|guccounter)/i;

export function canonicalizeUrl(rawUrl) {
  const input = String(rawUrl ?? '').trim();
  if (!input) return '';
  let url;
  try {
    url = new URL(input);
  } catch {
    return input.toLowerCase();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  // Drop tracking params, keep the rest (some sites need id params).
  const kept = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (!TRACKING_PARAM.test(k)) kept.push([k, v]);
  }
  kept.sort((a, b) => a[0].localeCompare(b[0]));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);
  let out = url.toString();
  // Normalize trailing slash on a bare path.
  out = out.replace(/\/(\?|$)/, '$1');
  return out;
}

export function domainOf(rawUrl) {
  try {
    return new URL(String(rawUrl)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ── Title normalization + near-duplicate similarity ──────────────────────────
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'as',
  'at', 'by', 'from', 'is', 'are', 'be', 'this', 'that', 'it', 'its', 'amid',
  'after', 'over', 'into', 'says', 'said', 'report', 'reports', 'update',
]);

export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9%$. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleTokens(title) {
  return new Set(
    normalizeTitle(title).split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t)),
  );
}

// Jaccard similarity of significant title tokens (0..1).
export function titleSimilarity(a, b) {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ── Category classification ──────────────────────────────────────────────────
export function classifyCategory(text) {
  const haystack = String(text ?? '').toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const key of CATEGORY_KEYS) {
    let hits = 0;
    for (const signal of CATEGORY_SIGNALS[key]) if (haystack.includes(signal)) hits += 1;
    // Self-storage wins ties (it is the narrowest, highest-value bucket).
    if (hits > bestHits || (hits === bestHits && hits > 0 && key === 'self_storage')) {
      best = key;
      bestHits = hits;
    }
  }
  return { category: best, hits: bestHits };
}

// ── Source authority ─────────────────────────────────────────────────────────
export function sourceAuthorityTier(provider, domain) {
  if (provider === 'federal_reserve') return 'federal_reserve';
  if (provider === 'treasury') return 'treasury';
  if (provider === 'fred') return 'fred';
  const d = String(domain ?? '').toLowerCase();
  if (OFFICIAL_DOMAINS.some(o => d === o || d.endsWith('.' + o))) return 'official';
  return provider === 'industry_rss' ? 'trade_press' : 'unknown';
}

// ── Freshness / staleness ────────────────────────────────────────────────────
// 1.0 for < 6h old, decaying to 0 by ~10 days.
export function freshnessScore(publishedAt, now = Date.now()) {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const hours = (now - t) / 3.6e6;
  if (hours <= 6) return 1;
  if (hours >= 240) return 0;
  return clamp(1 - (hours - 6) / (240 - 6), 0, 1);
}

export function isObservationStale(observationDate, maxStaleDays, now = Date.now()) {
  const t = new Date(observationDate).getTime();
  if (!Number.isFinite(t)) return true;
  const days = (now - t) / 8.64e7;
  return days > Number(maxStaleDays ?? 7);
}

// ── Deterministic relevance scoring ──────────────────────────────────────────
// Transparent, additive factors. Returns { relevanceScore, importanceScore,
// category, factors } — importance folds in source authority + freshness so a
// major official release outranks a minor blog post of equal topicality.
export function scoreItem(item, options = {}) {
  const priorityMarkets = (options.priorityMarkets ?? []).map(m => String(m).toLowerCase());
  const now = options.now ?? Date.now();
  const text = `${item.title ?? ''} ${item.excerpt ?? item.raw_excerpt ?? ''}`.toLowerCase();
  const factors = {};
  let score = 0;

  const { category, hits } = classifyCategory(text);
  const has = signals => signals.some(s => text.includes(s));

  if (has(CATEGORY_SIGNALS.self_storage)) { score += SCORING_WEIGHTS.selfStorageDirect; factors.selfStorage = SCORING_WEIGHTS.selfStorageDirect; }
  if (has(CATEGORY_SIGNALS.cre))          { score += SCORING_WEIGHTS.creTransaction;   factors.cre = SCORING_WEIGHTS.creTransaction; }
  if (/refinanc|lending|loan|debt|credit|maturit/.test(text)) { score += SCORING_WEIGHTS.debtFinancing; factors.debt = SCORING_WEIGHTS.debtFinancing; }
  if (has(CATEGORY_SIGNALS.rates))          { score += SCORING_WEIGHTS.monetaryPolicy; factors.rates = SCORING_WEIGHTS.monetaryPolicy; }
  if (has(CATEGORY_SIGNALS.private_credit)) { score += SCORING_WEIGHTS.privateCredit;  factors.privateCredit = SCORING_WEIGHTS.privateCredit; }
  if (has(CATEGORY_SIGNALS.private_equity)) { score += SCORING_WEIGHTS.privateEquity;  factors.privateEquity = SCORING_WEIGHTS.privateEquity; }

  // Material transaction size, when stated (e.g. "$450 million portfolio").
  const sizeMatch = text.match(/\$\s?([\d.]+)\s?(billion|bn|million|mm|m)\b/);
  if (sizeMatch) {
    const millions = parseFloat(sizeMatch[1]) * (/b/i.test(sizeMatch[2]) ? 1000 : 1);
    const sizeScore = clamp(Math.log10(Math.max(millions, 1)) * 3, 0, SCORING_WEIGHTS.materialSizeMax);
    score += sizeScore; factors.materialSize = Math.round(sizeScore);
  }

  if (priorityMarkets.length && priorityMarkets.some(m => text.includes(m))) {
    score += SCORING_WEIGHTS.priorityMarket; factors.priorityMarket = SCORING_WEIGHTS.priorityMarket;
  }

  // Generic-market penalty: reads like markets noise with no CRE/storage hook.
  const genericOnly = /stock|s&p 500|nasdaq|dow jones|bitcoin|crypto|earnings/.test(text)
    && !factors.selfStorage && !factors.cre && !factors.debt;
  if (genericOnly) { score += SCORING_WEIGHTS.genericMarketPenalty; factors.genericPenalty = SCORING_WEIGHTS.genericMarketPenalty; }

  if (item.isDuplicate) { score += SCORING_WEIGHTS.duplicatePenalty; factors.duplicatePenalty = SCORING_WEIGHTS.duplicatePenalty; }

  const relevanceScore = clamp(Math.round(score), 0, 100);

  const tier = sourceAuthorityTier(item.provider, item.source_domain ?? domainOf(item.canonical_url ?? item.url));
  const authorityBoost = clamp(SOURCE_AUTHORITY[tier] ?? 0, 0, SCORING_WEIGHTS.sourceAuthorityMax);
  const fresh = freshnessScore(item.published_at ?? item.publishedAt, now);
  const importanceScore = clamp(
    Math.round(relevanceScore * 0.6 + authorityBoost + fresh * SCORING_WEIGHTS.freshnessMax),
    0, 100,
  );

  return { relevanceScore, importanceScore, category: category ?? 'macro', categoryHits: hits, factors, authorityTier: tier };
}

// ── Dedupe ───────────────────────────────────────────────────────────────────
// Collapses items that are the same story: identical canonical URL, identical
// normalized-title hash, or high title similarity from the same story. When two
// collide, the more authoritative source (official > trade > unknown) wins.
export function dedupeItems(items, { similarityThreshold = 0.82 } = {}) {
  const authorityRank = it =>
    (SOURCE_AUTHORITY[sourceAuthorityTier(it.provider, it.source_domain ?? domainOf(it.canonical_url ?? it.url))] ?? 0);

  const kept = [];
  const byUrl = new Map();
  const byTitleHash = new Map();

  for (const raw of items) {
    const url = canonicalizeUrl(raw.canonical_url ?? raw.url ?? '');
    const titleHash = contentHash(normalizeTitle(raw.title));
    const item = { ...raw, canonical_url: url || raw.canonical_url || raw.url, _titleHash: titleHash };

    // 1) exact canonical URL
    if (url && byUrl.has(url)) { reconcile(byUrl.get(url), item, authorityRank); continue; }
    // 2) exact normalized-title hash
    if (byTitleHash.has(titleHash)) { reconcile(byTitleHash.get(titleHash), item, authorityRank); continue; }
    // 3) near-duplicate title (scan kept — bounded, ingestion batches are small)
    let dup = null;
    for (const k of kept) {
      if (titleSimilarity(k.title, item.title) >= similarityThreshold) { dup = k; break; }
    }
    if (dup) { reconcile(dup, item, authorityRank); continue; }

    kept.push(item);
    if (url) byUrl.set(url, item);
    byTitleHash.set(titleHash, item);
  }
  return kept;

  function reconcile(existing, incoming, rankFn) {
    existing.duplicateCount = (existing.duplicateCount ?? 1) + 1;
    // Prefer the more authoritative source's URL/title/excerpt.
    if (rankFn(incoming) > rankFn(existing)) {
      existing.canonical_url = incoming.canonical_url;
      existing.title = incoming.title;
      existing.provider = incoming.provider;
      existing.source_name = incoming.source_name;
      existing.source_domain = incoming.source_domain;
      if (incoming.raw_excerpt) existing.raw_excerpt = incoming.raw_excerpt;
    }
  }
}

// ── Yield-curve calculations ─────────────────────────────────────────────────
// `series` maps tenor key → array of { date, value } (any order). Returns the
// latest valid observation per tenor, the 2s10s / 3m10y spreads, daily and
// 7-day basis-point changes, inversion status, and staleness.
export function yieldCurveMetrics(series, { now = Date.now(), maxStaleDays = 5 } = {}) {
  const latestByTenor = {};
  let latestDate = null;

  for (const tenor of TREASURY_TENORS) {
    const obs = boundedArray(series?.[tenor.key], 500)
      .filter(o => o && o.date != null && Number.isFinite(Number(o.value)))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (obs.length === 0) { latestByTenor[tenor.key] = null; continue; }

    const last = obs[obs.length - 1];
    const prior = obs[obs.length - 2] ?? null;
    // 7-day-ago observation: latest at or before (lastDate - 7d).
    const target = shiftDays(last.date, -7);
    let weekAgo = null;
    for (let i = obs.length - 1; i >= 0; i--) {
      if (String(obs[i].date) <= target) { weekAgo = obs[i]; break; }
    }
    const value = Number(last.value);
    latestByTenor[tenor.key] = {
      label: tenor.label,
      date: last.date,
      value,
      dailyBp: prior ? bpChange(value, Number(prior.value)) : null,
      weekBp: weekAgo ? bpChange(value, Number(weekAgo.value)) : null,
      stale: isObservationStale(last.date, maxStaleDays, now),
    };
    if (!latestDate || String(last.date) > latestDate) latestDate = String(last.date);
  }

  const y2 = latestByTenor.y2?.value;
  const y10 = latestByTenor.y10?.value;
  const m3 = latestByTenor.m3?.value;
  const spread2s10s = Number.isFinite(y2) && Number.isFinite(y10) ? round2((y10 - y2) * 100) : null; // bp
  const spread3m10y = Number.isFinite(m3) && Number.isFinite(y10) ? round2((y10 - m3) * 100) : null; // bp

  return {
    latestDate,
    tenors: latestByTenor,
    spread2s10s,
    spread3m10y,
    inverted2s10s: spread2s10s == null ? null : spread2s10s < 0,
    inverted3m10y: spread3m10y == null ? null : spread3m10y < 0,
    stale: latestDate ? isObservationStale(latestDate, maxStaleDays, now) : true,
  };
}

// basis-point change between two percentage-point yields (e.g. 4.25% → 4.30% = +5bp)
export function bpChange(latest, prior) {
  if (!Number.isFinite(latest) || !Number.isFinite(prior)) return null;
  return round2((latest - prior) * 100);
}

function shiftDays(dateString, days) {
  const d = new Date(`${String(dateString).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return String(dateString);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function round2(n) { return Math.round(n * 100) / 100; }

// ── AI enrichment validation ─────────────────────────────────────────────────
// Every AI field is treated as untrusted: bounded, type-checked, and rejected
// if the shape is wrong. Returns { ok, value | error }.
const VALID_IMPACT = new Set(['bullish', 'bearish', 'neutral', 'mixed', 'high', 'medium', 'low']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);

export function validateAiEnrichment(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not an object' };
  const category = CATEGORY_KEYS.includes(raw.category) ? raw.category : null;
  if (!category) return { ok: false, error: 'invalid category' };
  const value = {
    category,
    subcategory: boundedString(raw.subcategory, 80),
    summary: boundedString(raw.summary, 600),
    whyItMatters: boundedString(raw.whyItMatters, 600),
    brokerTakeaway: boundedString(raw.brokerTakeaway, 400),
    impact: VALID_IMPACT.has(String(raw.impact).toLowerCase()) ? String(raw.impact).toLowerCase() : 'neutral',
    confidence: VALID_CONFIDENCE.has(String(raw.confidence).toLowerCase()) ? String(raw.confidence).toLowerCase() : 'low',
    entities: boundedArray(raw.entities, 12).map(e => boundedString(e, 80)),
    tags: boundedArray(raw.tags, 12).map(t => boundedString(t, 40)),
    relevanceScore: clamp(raw.relevanceScore, 0, 100),
    importanceScore: clamp(raw.importanceScore, 0, 100),
  };
  if (!value.summary) return { ok: false, error: 'empty summary' };
  return { ok: true, value };
}
