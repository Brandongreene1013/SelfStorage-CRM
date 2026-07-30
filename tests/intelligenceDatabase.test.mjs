import assert from 'node:assert/strict';
import {
  planItemWrites,
  treasurySeriesFromDataPoints,
  buildMarketTape,
  toStory,
  assembleDashboard,
  isCurrentStory,
  storyRank,
  deriveRunKey,
  upsertItems,
  claimRun,
} from '../api/_intelligenceDatabase.js';

// ── planItemWrites (pure) ────────────────────────────────────────────────────
{
  const existing = new Set(['https://a.com/1']);
  const items = [
    { canonical_url: 'https://a.com/1' },                 // existing → update
    { canonical_url: 'https://a.com/2?utm_source=x' },    // new (canonicalized) → insert
    { canonical_url: 'https://a.com/2' },                 // in-batch dupe of #2 → dropped
    { url: '' },                                          // no url → dropped
  ];
  const plan = planItemWrites(existing, items);
  assert.equal(plan.toInsert.length, 1);
  assert.equal(plan.toInsert[0].canonical_url, 'https://a.com/2', 'canonicalized');
  assert.equal(plan.toUpdate.length, 1);
}

// ── treasury series reconstruction + market tape (pure) ──────────────────────
{
  const now = new Date('2026-07-23T12:00:00Z').getTime();
  const dataPoints = [
    { series_key: 'ust_y2',  provider: 'treasury', observation_date: '2026-07-21', value: 4.50 },
    { series_key: 'ust_y2',  provider: 'treasury', observation_date: '2026-07-22', value: 4.55 },
    { series_key: 'ust_y10', provider: 'treasury', observation_date: '2026-07-22', value: 4.25 },
    { series_key: 'ust_y30', provider: 'treasury', observation_date: '2026-07-22', value: 4.60 },
    { series_key: 'fed_funds', provider: 'fred', observation_date: '2026-07-22', value: 4.33 },
    { series_key: 'fed_funds', provider: 'fred', observation_date: '2026-07-20', value: 4.30 }, // older, ignored for "latest"
  ];
  const series = treasurySeriesFromDataPoints(dataPoints);
  assert.equal(series.y2.length, 2);

  const tape = buildMarketTape(dataPoints, { now });
  const y2 = tape.find(t => t.key === 'ust_y2');
  assert.equal(y2.value, 4.55);
  assert.equal(y2.dailyBp, 5, 'daily change +5bp');
  const spread = tape.find(t => t.key === 'spread_2s10s');
  assert.equal(spread.value, -30);
  assert.equal(spread.inverted, true);
  const ff = tape.find(t => t.key === 'fed_funds');
  assert.equal(ff.value, 4.33, 'latest fed funds used, not the older 4.30');
}

// ── toStory drops provider payload; assembleDashboard shapes response ─────────
{
  const now = new Date('2026-07-23T12:00:00Z').getTime();
  const rows = [
    { id: 1, canonical_url: 'https://a.com/1', provider: 'gdelt', source_name: 'GlobeSt', title: 'Storage portfolio trades', published_at: '2026-07-23T10:00:00Z', category: 'self_storage', importance_score: 90, is_saved: true, is_hidden: false, tags: ['portfolio'], provider_payload: { secret: 'x' } },
    { id: 2, canonical_url: 'https://a.com/2', provider: 'gdelt', source_name: 'AP', title: 'Fed holds', published_at: '2026-07-22T18:00:00Z', category: 'rates', importance_score: 70, is_hidden: false, tags: [] },
    { id: 3, canonical_url: 'https://a.com/3', provider: 'gdelt', title: 'Hidden', published_at: '2026-07-23T11:00:00Z', category: 'macro', importance_score: 99, is_hidden: true },
  ];
  const story = toStory(rows[0]);
  assert.equal(story.source, 'GlobeSt');
  assert.ok(!('provider_payload' in story), 'raw payload never leaks to the client');

  const dash = assembleDashboard({
    snapshot: { snapshot_date: '2026-07-23', generated_at: new Date(now - 3.6e6).toISOString(), headline: 'Steady', executive_brief: { confidence: 'medium' }, evidence_item_ids: [1] },
    items: rows,
    dataPoints: [],
    latestRun: { provider_results: [{ provider: 'gdelt', state: 'success' }] },
  }, { now });

  assert.equal(dash.ok, true);
  assert.equal(dash.migrationNeeded, false);
  assert.equal(dash.stale, false, 'brief 1h old is fresh');
  assert.equal(dash.topStories.length, 2, 'hidden item excluded');
  assert.equal(dash.topStories[0].id, 1, 'sorted by importance among visible');
  assert.equal(dash.savedStories.length, 1);
  assert.ok(dash.categories.self_storage && dash.categories.rates);
  assert.equal(dash.snapshot.confidence, 'medium');
  assert.equal(dash.providerStatus[0].provider, 'gdelt');

  const crowded = assembleDashboard({
    snapshot: null,
    items: [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: index + 10,
        canonical_url: `https://fed.example/${index}`,
        provider: 'federal_reserve',
        title: `Fed story ${index}`,
        published_at: '2026-07-22T12:00:00Z',
        category: 'rates',
        importance_score: 100 - index,
        is_hidden: false,
      })),
      {
        id: 99,
        canonical_url: 'https://pe.example/deal',
        provider: 'google_news',
        title: 'Private equity real estate fund closes',
        published_at: '2026-07-22T13:00:00Z',
        category: 'private_equity',
        importance_score: 50,
        is_hidden: false,
      },
      {
        id: 100,
        canonical_url: 'https://local.example/sherman',
        provider: 'google_news',
        title: 'Sherman infrastructure project advances',
        published_at: '2026-07-22T14:00:00Z',
        category: 'cre',
        importance_score: 1,
        tags: ['market:Sherman, TX'],
        is_hidden: false,
      },
    ],
    dataPoints: [],
    latestRun: null,
  }, { now });
  assert.ok(crowded.topStories.some(item => item.category === 'private_equity'), 'category balancing prevents rates from crowding out PE');
  assert.ok(crowded.topStories.some(item => item.tags.includes('market:Sherman, TX')), 'active-market evidence reaches synthesis despite a low national score');

  assert.equal(isCurrentStory({ publishedAt: '2026-07-01T12:00:00Z' }, now), false, 'old stories expire from the live radar');
  assert.equal(isCurrentStory({ publishedAt: '2026-07-23T11:00:00Z', relevanceScore: 0 }, now), false, 'fresh discovery noise does not enter the live radar');
  assert.ok(
    storyRank({ publishedAt: '2026-07-23T11:00:00Z', importanceScore: 50 }, now)
      > storyRank({ publishedAt: '2026-07-15T11:00:00Z', importanceScore: 50 }, now),
    'equally important stories are re-ranked using current freshness',
  );

  // Stale when brief is old / missing.
  const staleDash = assembleDashboard({ snapshot: null, items: rows, dataPoints: [], latestRun: null }, { now });
  assert.equal(staleDash.stale, true);
  assert.equal(staleDash.snapshot, null);
}

// ── deriveRunKey (eastern-time bucket) ───────────────────────────────────────
{
  const k1 = deriveRunKey('refresh-news', new Date('2026-07-22T18:30:00Z')); // 14:30 ET
  const k2 = deriveRunKey('refresh-news', new Date('2026-07-22T18:45:00Z')); // same ET hour
  const k3 = deriveRunKey('refresh-news', new Date('2026-07-22T19:30:00Z')); // next ET hour
  assert.equal(k1, k2, 'same mode+ET-hour bucket → identical key (idempotent)');
  assert.notEqual(k1, k3, 'different ET hour → different key');
  assert.match(k1, /^refresh-news:2026-07-22:14$/);
}

// ── Thin ops via injected mock client (migration + concurrency guard) ────────
function mockClient(handlers) {
  return {
    from() {
      const ctx = { op: null };
      const res = kind => Promise.resolve(handlers[kind]?.(ctx) ?? { data: null, error: null });
      const chain = {
        select() { if (ctx.op == null) ctx.op = 'select'; return chain; },
        insert(rows) { ctx.op = 'insert'; ctx.rows = rows; return chain; },
        update(patch) { ctx.op = 'update'; ctx.patch = patch; return chain; },
        upsert(rows) { return Promise.resolve(handlers.upsert?.(rows) ?? { error: null }); },
        in() { return res('select'); },
        eq() { return ctx.op === 'update' ? res('update') : chain; },
        single() { return res(ctx.op); },
        maybeSingle() { return res(ctx.op); },
      };
      return chain;
    },
  };
}

{
  // Missing table anywhere → migrationNeeded, never throws.
  const missing = mockClient({ select: () => ({ data: null, error: { code: '42P01', message: 'relation "market_intelligence_items" does not exist' } }) });
  const r = await upsertItems(missing, [{ canonical_url: 'https://a.com/1', title: 't' }]);
  assert.equal(r.migrationNeeded, true);

  // Success path → accurate insert/update counts.
  const ok = mockClient({
    select: () => ({ data: [{ canonical_url: 'https://a.com/1' }], error: null }),
    upsert: () => ({ error: null }),
  });
  const r2 = await upsertItems(ok, [
    { canonical_url: 'https://a.com/1', title: 'existing' },
    { canonical_url: 'https://a.com/2', title: 'new' },
  ]);
  assert.deepEqual({ inserted: r2.inserted, updated: r2.updated }, { inserted: 1, updated: 1 });

  // claimRun fresh bucket → claimed.
  const fresh = mockClient({ insert: () => ({ data: { id: 42 }, error: null }) });
  const claim = await claimRun(fresh, 'refresh:2026-07-22:15', 'cron');
  assert.equal(claim.claimed, true);
  assert.equal(claim.id, 42);

  // Bucket exists + prior run STILL RUNNING → blocked (genuine concurrency).
  const running = mockClient({
    insert: () => ({ data: null, error: { code: '23505' } }),
    select: () => ({ data: { id: 8, status: 'running', finished_at: null }, error: null }),
  });
  assert.equal((await claimRun(running, 'refresh:2026-07-22:14', 'cron')).claimed, false);

  // Bucket exists + prior run FINISHED (errored) → re-claimed for retry.
  const finished = mockClient({
    insert: () => ({ data: null, error: { code: '23505' } }),
    select: () => ({ data: { id: 7, status: 'error', finished_at: '2026-07-27T16:00:00Z' }, error: null }),
    update: () => ({ error: null }),
  });
  const retry = await claimRun(finished, 'generate-brief:2026-07-27:12', 'api');
  assert.equal(retry.claimed, true);
  assert.equal(retry.id, 7);
}

console.log('intelligence database tests passed');
