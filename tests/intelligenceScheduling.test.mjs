import assert from 'node:assert/strict';
import {
  easternParts, isWeekendET, dueTasks, tasksForMode, REFRESH_MODES,
} from '../api/_intelligenceScheduling.js';
import { authorizeRefresh, handleIntelligence } from '../api/market-intelligence.js';

// ── Eastern time + DST awareness ─────────────────────────────────────────────
{
  // July → EDT (UTC-4): 12:00Z = 08:00 ET
  const summer = easternParts(new Date('2026-07-22T12:00:00Z'));
  assert.equal(summer.hour, 8, 'EDT offset applied');
  // January → EST (UTC-5): 12:00Z = 07:00 ET
  const winter = easternParts(new Date('2026-01-22T12:00:00Z'));
  assert.equal(winter.hour, 7, 'EST offset applied (DST handled by TZ, not fixed UTC math)');

  assert.equal(isWeekendET(new Date('2026-07-25T18:00:00Z')), true, 'Saturday ET');
  assert.equal(isWeekendET(new Date('2026-07-22T18:00:00Z')), false, 'Wednesday ET');
}

// ── dueTasks windows ─────────────────────────────────────────────────────────
{
  // Wed 08:00 ET (12:00Z summer): markets + news + fed
  const morning = dueTasks(new Date('2026-07-22T12:00:00Z'));
  assert.ok(morning.includes('markets') && morning.includes('news') && morning.includes('fed'));
  // Wed 09:00 ET: brief
  assert.ok(dueTasks(new Date('2026-07-22T13:00:00Z')).includes('brief'));
  // Wed 17:00 ET (21:00Z summer): markets (after close)
  assert.ok(dueTasks(new Date('2026-07-22T21:00:00Z')).includes('markets'));
  // Wed 02:00 ET (06:00Z): nothing due (overnight)
  assert.deepEqual(dueTasks(new Date('2026-07-22T06:00:00Z')), []);
  // Sat 10:00 ET (14:00Z): reduced — news only, no markets/fed/brief
  const weekend = dueTasks(new Date('2026-07-25T14:00:00Z'));
  assert.deepEqual(weekend, ['news'], 'weekend reduced to news discovery');
}

// ── tasksForMode ─────────────────────────────────────────────────────────────
{
  assert.deepEqual(tasksForMode('refresh-markets'), ['markets']);
  assert.deepEqual(tasksForMode('generate-brief'), ['brief']);
  assert.deepEqual(tasksForMode('refresh'), ['markets', 'news', 'fed']);
  assert.deepEqual(tasksForMode('bogus'), []);
  assert.ok(REFRESH_MODES.has('scheduled'));
}

// ── Auth ─────────────────────────────────────────────────────────────────────
{
  // No secret configured → refresh disabled (do NOT default-open ingestion).
  assert.equal(authorizeRefresh({}, {}).ok, false);
  assert.equal(authorizeRefresh({}, {}).reason, 'refresh_disabled');
  // Wrong secret → unauthorized.
  assert.equal(authorizeRefresh({ 'x-intelligence-secret': 'nope' }, { MARKET_INTELLIGENCE_SECRET: 'sekret' }).ok, false);
  // Correct header secret → ok.
  assert.equal(authorizeRefresh({ 'x-intelligence-secret': 'sekret' }, { MARKET_INTELLIGENCE_SECRET: 'sekret' }).ok, true);
  // Bearer CRON_SECRET → ok.
  assert.equal(authorizeRefresh({ authorization: 'Bearer cronval' }, { CRON_SECRET: 'cronval' }).ok, true);
}

// ── Request handling (injected deps) ─────────────────────────────────────────
function baseDeps(over = {}) {
  return {
    client: {}, env: {}, now: () => new Date('2026-07-22T12:00:00Z').getTime(),
    readDashboard: async () => ({ ok: true, migrationNeeded: false, generatedAt: null, marketTape: [], topStories: [], categories: {}, savedStories: [], providerStatus: [] }),
    setItemFlag: async () => ({ ok: true }),
    claimRun: async () => ({ claimed: true, id: 1 }),
    finishRun: async () => ({ ok: true }),
    deriveRunKey: () => 'refresh:2026-07-22:08',
    authorizeRefresh: () => ({ ok: true }),
    runTasks: async () => ({ statuses: [{ provider: 'gdelt', state: 'success' }], itemsDiscovered: 3, itemsInserted: 2, itemsUpdated: 1, itemsAiProcessed: 0, dataPointsWritten: 0, errors: [], migrationNeeded: false }),
    runDeps: {},
    ...over,
  };
}

{
  // GET dashboard → cached read, no secret required.
  const g = await handleIntelligence({ method: 'GET', query: { mode: 'dashboard' } }, baseDeps());
  assert.equal(g.status, 200);
  assert.equal(g.body.ok, true);
  assert.match(g.cache, /max-age=60/);

  // GET dashboard with no client → configured:false, still 200 (dashboard renders).
  const gnc = await handleIntelligence({ method: 'GET', query: { mode: 'dashboard' } }, baseDeps({ client: null }));
  assert.equal(gnc.status, 200);
  assert.equal(gnc.body.configured, false);

  // POST refresh unauthorized → 401.
  const un = await handleIntelligence({ method: 'POST', body: { mode: 'refresh' } }, baseDeps({ authorizeRefresh: () => ({ ok: false, reason: 'unauthorized' }) }));
  assert.equal(un.status, 401);

  // POST refresh with no configured secret → 503 refresh_disabled.
  const dis = await handleIntelligence({ method: 'POST', body: { mode: 'refresh' } }, baseDeps({ authorizeRefresh: () => ({ ok: false, reason: 'refresh_disabled' }) }));
  assert.equal(dis.status, 503);

  // POST refresh authorized → claims run, runs tasks, finishes. No secrets echoed.
  const ok = await handleIntelligence({ method: 'POST', body: { mode: 'refresh-markets' } }, baseDeps());
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.ok(ok.body.summary.itemsInserted === 2);
  assert.ok(!JSON.stringify(ok.body).includes('sekret'), 'no secret leaked in response');

  // Concurrency: claimRun already running → skipped.
  const busy = await handleIntelligence({ method: 'POST', body: { mode: 'refresh' } }, baseDeps({ claimRun: async () => ({ claimed: false }) }));
  assert.equal(busy.body.skipped, 'already_running');

  // Migration needed surfaced from claim.
  const mig = await handleIntelligence({ method: 'POST', body: { mode: 'refresh' } }, baseDeps({ claimRun: async () => ({ migrationNeeded: true }) }));
  assert.equal(mig.body.migrationNeeded, true);

  // flag mutation (no secret) validates id.
  const badFlag = await handleIntelligence({ method: 'POST', body: { mode: 'flag', id: 'x' } }, baseDeps());
  assert.equal(badFlag.status, 400);
  const goodFlag = await handleIntelligence({ method: 'POST', body: { mode: 'flag', id: 5, is_saved: true } }, baseDeps());
  assert.equal(goodFlag.status, 200);

  // unknown mode → 400.
  const bad = await handleIntelligence({ method: 'POST', body: { mode: 'nope' } }, baseDeps());
  assert.equal(bad.status, 400);
}

console.log('intelligence scheduling + api tests passed');
