import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  domainOf,
  contentHash,
  normalizeTitle,
  titleSimilarity,
  classifyCategory,
  scoreItem,
  dedupeItems,
  yieldCurveMetrics,
  bpChange,
  freshnessScore,
  isObservationStale,
  validateAiEnrichment,
  CATEGORY_KEYS,
} from '../src/lib/marketIntelligence.js';

// ── URL canonicalization ─────────────────────────────────────────────────────
{
  assert.equal(
    canonicalizeUrl('https://www.Example.com/a/?utm_source=x&utm_medium=y&id=7#frag'),
    'https://example.com/a?id=7',
    'strips www, tracking params, fragment, and trailing slash; keeps real params',
  );
  assert.equal(canonicalizeUrl('HTTPS://Example.com/Path/'), 'https://example.com/Path');
  assert.equal(canonicalizeUrl('ftp://example.com/x'), '', 'non-http(s) protocol rejected');
  assert.equal(canonicalizeUrl(''), '');
  // tracking-only query collapses to a clean URL
  assert.equal(canonicalizeUrl('https://a.com/x?fbclid=abc&gclid=def'), 'https://a.com/x');
  assert.equal(domainOf('https://www.federalreserve.gov/news'), 'federalreserve.gov');
}

// ── Content hash + title normalization ───────────────────────────────────────
{
  assert.equal(contentHash('a', 'b'), contentHash('a', 'b'), 'stable');
  assert.notEqual(contentHash('a'), contentHash('b'));
  assert.equal(normalizeTitle('  Fed HOLDS Rates — Powell Speaks!  '), 'fed holds rates powell speaks');
  assert.ok(titleSimilarity('Fed holds rates steady', 'Fed holds rates steady amid inflation') > 0.5);
  assert.ok(titleSimilarity('Self-storage portfolio sells', 'Apollo raises credit fund') < 0.2);
}

// ── Category classification ──────────────────────────────────────────────────
{
  assert.equal(classifyCategory('Public Storage acquires a self-storage portfolio').category, 'self_storage');
  assert.equal(classifyCategory('FOMC holds the fed funds rate; Powell on inflation').category, 'rates');
  assert.equal(classifyCategory('Blackstone closes private equity real estate fund').category, 'private_equity');
  assert.equal(classifyCategory('nothing relevant here about gardening').category, null);
}

// ── Deterministic scoring ────────────────────────────────────────────────────
{
  const storage = scoreItem({
    title: 'CubeSmart buys $450 million self-storage portfolio with new debt financing',
    provider: 'industry_rss', source_domain: 'rebusinessonline.com',
    published_at: new Date().toISOString(),
  });
  const generic = scoreItem({
    title: 'S&P 500 closes higher as tech earnings beat',
    provider: 'wire', source_domain: 'example.com',
    published_at: new Date().toISOString(),
  });
  assert.ok(storage.relevanceScore > generic.relevanceScore, 'self-storage deal beats generic market news');
  assert.equal(storage.category, 'self_storage');
  assert.ok(storage.factors.selfStorage > 0 && storage.factors.debt > 0 && storage.factors.materialSize > 0);
  assert.ok(generic.factors.genericPenalty < 0, 'generic stock story is penalized');

  // Official Fed release gets an authority boost → higher importance than a blog.
  const official = scoreItem({
    title: 'Federal Reserve issues FOMC statement on interest rate policy',
    provider: 'federal_reserve', source_domain: 'federalreserve.gov',
    published_at: new Date().toISOString(),
  });
  const blog = scoreItem({
    title: 'Federal Reserve issues FOMC statement on interest rate policy',
    provider: 'unknown', source_domain: 'randomblog.com',
    published_at: new Date().toISOString(),
  });
  assert.ok(official.importanceScore > blog.importanceScore, 'official source outranks blog for identical topic');

  // Freshness penalty: an old story scores lower importance than a fresh one.
  const old = scoreItem({
    title: 'CRE cap rates rise amid refinancing distress',
    provider: 'industry_rss', source_domain: 'globest.com',
    published_at: new Date(Date.now() - 12 * 24 * 3.6e6).toISOString(),
  });
  const fresh = scoreItem({
    title: 'CRE cap rates rise amid refinancing distress',
    provider: 'industry_rss', source_domain: 'globest.com',
    published_at: new Date().toISOString(),
  });
  assert.ok(fresh.importanceScore > old.importanceScore, 'fresh story outranks stale');

  // Duplicate penalty applies.
  const dup = scoreItem({ title: 'Self-storage occupancy rises', provider: 'wire', isDuplicate: true, published_at: new Date().toISOString() });
  const notDup = scoreItem({ title: 'Self-storage occupancy rises', provider: 'wire', published_at: new Date().toISOString() });
  assert.ok(dup.relevanceScore < notDup.relevanceScore, 'duplicate penalized');

  // Priority markets add a boost when named.
  const priority = scoreItem(
    { title: 'Self-storage deal closes in Dallas', provider: 'wire', published_at: new Date().toISOString() },
    { priorityMarkets: ['dallas'] },
  );
  assert.ok(priority.factors.priorityMarket > 0);
}

// ── Dedupe ───────────────────────────────────────────────────────────────────
{
  const items = [
    { title: 'Fed holds rates steady', canonical_url: 'https://reuters.com/a?utm_source=x', provider: 'wire', source_domain: 'reuters.com' },
    { title: 'Fed holds rates steady', canonical_url: 'https://reuters.com/a', provider: 'wire', source_domain: 'reuters.com' }, // same canonical URL
    { title: 'Fed Holds Rates Steady', canonical_url: 'https://apnews.com/b', provider: 'wire', source_domain: 'apnews.com' }, // same title hash
    { title: 'Federal Reserve keeps interest rates unchanged at meeting today', canonical_url: 'https://federalreserve.gov/c', provider: 'federal_reserve', source_domain: 'federalreserve.gov' }, // official, distinct enough
    { title: 'Self-storage REIT reports record occupancy', canonical_url: 'https://globest.com/d', provider: 'industry_rss', source_domain: 'globest.com' }, // genuinely different
  ];
  const deduped = dedupeItems(items);
  // The three "Fed holds rates steady" variants collapse; the official + the
  // storage story remain → 3 distinct stories total.
  assert.equal(deduped.length, 3, 'syndicated/near-dup Fed stories collapse; distinct stories preserved');
  const storageStory = deduped.find(d => /self-storage/i.test(d.title));
  assert.ok(storageStory, 'genuinely different story preserved');
}

// ── Yield-curve calculations ─────────────────────────────────────────────────
{
  const series = {
    y2:  [{ date: '2026-07-15', value: 4.30 }, { date: '2026-07-21', value: 4.50 }, { date: '2026-07-22', value: 4.55 }],
    y10: [{ date: '2026-07-15', value: 4.10 }, { date: '2026-07-21', value: 4.20 }, { date: '2026-07-22', value: 4.25 }],
    m3:  [{ date: '2026-07-22', value: 4.80 }],
  };
  const m = yieldCurveMetrics(series, { now: new Date('2026-07-23T12:00:00Z').getTime(), maxStaleDays: 5 });
  assert.equal(m.latestDate, '2026-07-22');
  assert.equal(m.spread2s10s, -30, '2s10s = (4.25 - 4.55) * 100 = -30bp');
  assert.equal(m.inverted2s10s, true);
  assert.equal(m.tenors.y2.dailyBp, 5, 'daily change 4.50 → 4.55 = +5bp');
  assert.equal(m.tenors.y2.weekBp, 25, '7-day change 4.30 → 4.55 = +25bp');
  assert.equal(m.tenors.m3.dailyBp, null, 'no prior obs → null, not a fabricated 0');
  assert.equal(m.stale, false);

  // Missing everything → stale, null spreads, not a crash.
  const empty = yieldCurveMetrics({}, { now: Date.now() });
  assert.equal(empty.spread2s10s, null);
  assert.equal(empty.stale, true);

  assert.equal(bpChange(4.30, 4.25), 5);
  assert.equal(bpChange(4.30, undefined), null);
}

// ── Freshness / staleness ────────────────────────────────────────────────────
{
  assert.equal(freshnessScore(new Date().toISOString()), 1);
  assert.equal(freshnessScore(new Date(Date.now() - 20 * 24 * 3.6e6).toISOString()), 0);
  assert.equal(freshnessScore('not a date'), 0);
  assert.equal(isObservationStale('2026-07-01', 5, new Date('2026-07-23').getTime()), true);
  assert.equal(isObservationStale('2026-07-22', 5, new Date('2026-07-23').getTime()), false);
  assert.equal(isObservationStale(null, 5), true);
}

// ── AI enrichment validation (untrusted-input safety) ────────────────────────
{
  const good = validateAiEnrichment({
    category: 'self_storage', subcategory: 'acquisition',
    summary: 'A REIT bought a portfolio.', whyItMatters: 'Signals institutional demand.',
    brokerTakeaway: 'Sellers may expect firmer pricing.', impact: 'BULLISH', confidence: 'Medium',
    entities: ['CubeSmart'], tags: ['portfolio'], relevanceScore: 88, importanceScore: 200,
  });
  assert.equal(good.ok, true);
  assert.equal(good.value.impact, 'bullish');
  assert.equal(good.value.confidence, 'medium');
  assert.equal(good.value.importanceScore, 100, 'out-of-range score clamped to 100');

  assert.equal(validateAiEnrichment(null).ok, false);
  assert.equal(validateAiEnrichment({ category: 'not_real', summary: 'x' }).ok, false, 'invalid category rejected');
  assert.equal(validateAiEnrichment({ category: 'rates', summary: '' }).ok, false, 'empty summary rejected');
  // Oversized fields are truncated, not rejected outright.
  const big = validateAiEnrichment({ category: 'rates', summary: 'x'.repeat(5000) });
  assert.equal(big.ok, true);
  assert.ok(big.value.summary.length <= 600, 'summary truncated');
  assert.ok(CATEGORY_KEYS.includes(big.value.category));
}

console.log('market intelligence tests passed');
