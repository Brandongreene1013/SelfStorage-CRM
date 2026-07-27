// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: ingestion orchestration.
//
// collect → normalize → dedupe → score → AI-enrich → synthesize → persist.
// Every external dependency (providers, AI, db client, env, clock) is injected
// so the whole flow is testable offline. One broken provider is isolated: its
// status is recorded and the run continues on the others.
// ─────────────────────────────────────────────────────────────────────────────

import { dedupeItems, scoreItem, freshnessScore, contentHash, canonicalizeUrl, boundedArray } from './_marketIntelligence.js';
import * as providers from './_intelligenceProviders.js';
import * as ai from './_intelligenceAI.js';
import * as db from './_intelligenceDatabase.js';
import { FRED_SERIES } from './_marketIntelligence.js';
import { DEFAULT_PRIORITY_MARKETS, marketNewsQueryGroups } from './_intelligenceConfig.js';
import { loadActiveMarkets } from './_intelligenceMarkets.js';

function priorityMarkets(env = process.env) {
  const raw = env.INTELLIGENCE_PRIORITY_MARKETS;
  if (!raw) return DEFAULT_PRIORITY_MARKETS;
  return String(raw).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Default production wiring; tests pass their own `deps`.
export function buildDeps(env = process.env) {
  return {
    providers, ai, db,
    client: db.intelligenceSupabase(),
    env,
    now: () => Date.now(),
    startedAt: Date.now(),
    fredKey: env.FRED_API_KEY || '',
    alphaKey: env.ALPHA_VANTAGE_API_KEY || '',
    loadActiveMarkets,
  };
}

// ── Markets: Treasury curve + FRED series → data points ──────────────────────
export async function runMarkets(deps) {
  const { providers: P, client } = deps;
  const statuses = [];
  const points = [];

  // Fetch Treasury + all FRED series concurrently so the run fits the function
  // time budget; one provider failing never blocks the others.
  const [t, ...fredResults] = await Promise.all([
    P.fetchTreasury(),
    ...FRED_SERIES.filter(s => s.verified).map(meta => P.fetchFredSeries(meta, deps.fredKey)),
  ]);
  statuses.push(t.status);
  for (const [tenor, obs] of Object.entries(t.series ?? {})) {
    for (const o of obs) points.push({ series_key: `ust_${tenor}`, provider: 'treasury', observation_date: o.date, value: o.value, unit: '%' });
  }
  for (const r of fredResults) {
    statuses.push(r.status);
    points.push(...(r.dataPoints ?? []));
  }

  let written = { count: 0 };
  if (points.length && client) written = await deps.db.upsertDataPoints(client, points);
  return { statuses, dataPointsWritten: written.count ?? 0, migrationNeeded: written.migrationNeeded };
}

// ── News: official + industry RSS + GDELT → dedupe → score → items ───────────
export async function runNews(deps, { includeFed = true } = {}) {
  const { providers: P, client, now } = deps;
  const statuses = [];
  let raw = [];
  const activeMarkets = await (deps.loadActiveMarkets ?? loadActiveMarkets)(client, { now: now() });
  deps.activeMarkets = activeMarkets;

  // Fetch every feed + broad/active-market discovery query concurrently.
  // GDELT is opt-in because its public endpoint is frequently throttled; Bing
  // News RSS plus verified publisher feeds form the default redundant path.
  const feeds = [...(includeFed ? P.officialFeeds() : []), ...P.industryFeeds()];
  const searchGroups = [...P.newsSearchGroups(), ...marketNewsQueryGroups(activeMarkets)];
  const gdeltGroups = String(deps.env?.ENABLE_GDELT_NEWS).toLowerCase() === 'true'
    ? P.gdeltGroups()
    : [];
  const settled = await Promise.allSettled([
    ...feeds.map(feed => P.fetchRss(feed)),
    ...searchGroups.map(group => P.fetchNewsSearchGroup(group)),
    ...searchGroups.map(group => P.fetchGoogleNewsGroup(group)),
    ...gdeltGroups.map(group => P.fetchGdeltGroup(group)),
  ]);
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    statuses.push(s.value.status);
    raw.push(...(s.value.items ?? []));
  }

  const nowMs = now();
  const markets = activeMarkets.length
    ? activeMarkets.map(market => market.label.toLowerCase())
    : priorityMarkets(deps.env);
  const deduped = dedupeItems(raw);
  const scored = deduped.map(it => {
    const s = scoreItem(it, { priorityMarkets: markets, now: nowMs });
    return {
      ...it,
      canonical_url: canonicalizeUrl(it.canonical_url ?? it.url),
      category: it.category ?? s.category,
      relevance_score: s.relevanceScore,
      importance_score: s.importanceScore,
      freshness_score: freshnessScore(it.published_at, nowMs),
      content_hash: contentHash(it.canonical_url, it.title),
      tags: Array.isArray(it.tags) ? it.tags : [],
    };
  });

  let written = { inserted: 0, updated: 0 };
  if (scored.length && client) written = await deps.db.upsertItems(client, scored);
  return {
    statuses,
    activeMarkets,
    itemsDiscovered: scored.length,
    itemsInserted: written.inserted ?? 0,
    itemsUpdated: written.updated ?? 0,
    migrationNeeded: written.migrationNeeded,
    scored,
  };
}

// ── AI enrichment: top unprocessed items, bounded by cost caps ───────────────
export async function runEnrichment(deps, candidateItems, { deadline = Infinity } = {}) {
  const { ai: A, client } = deps;
  const selected = A.selectItemsForEnrichment(candidateItems, {});
  let processed = 0;
  const model = A.intelligenceModel();
  for (const item of selected) {
    if (Date.now() > deadline) break; // stop before the function times out; rest enriched next run
    const res = await A.enrichItem(item);
    if (!res.ok) continue;
    processed += 1;
    if (client && item.id != null) {
      await deps.db.setItemFlag(client, item.id, {}); // no-op guard; real update below
      await client.from('market_intelligence_items').update({
        category: res.value.category,
        subcategory: res.value.subcategory,
        summary: res.value.summary,
        why_it_matters: res.value.whyItMatters,
        broker_takeaway: res.value.brokerTakeaway,
        impact: res.value.impact,
        confidence: res.value.confidence,
        entities: res.value.entities,
        tags: [...new Set([...(Array.isArray(item.tags) ? item.tags : []), ...res.value.tags])].slice(0, 12),
        relevance_score: res.value.relevanceScore,
        importance_score: res.value.importanceScore,
        ai_model: model,
        ai_generated_at: new Date().toISOString(),
      }).eq('id', item.id);
    }
  }
  return { itemsAiProcessed: processed };
}

// ── Daily brief synthesis ────────────────────────────────────────────────────
export async function runBrief(deps) {
  const { client, ai: A, now } = deps;
  if (!client) return { skipped: 'no_client' };
  const dash = await deps.db.readDashboard(client, { now: now() });
  if (dash.migrationNeeded) return { migrationNeeded: true };
  const topItems = boundedArray(dash.topStories, 30);
  const activeMarkets = deps.activeMarkets
    ?? await (deps.loadActiveMarkets ?? loadActiveMarkets)(client, { now: now() });
  const metrics = { marketTape: dash.marketTape, activeMarkets };
  const gen = await A.generateSnapshot(topItems, metrics);
  if (!gen.ok) return { error: gen.error };

  const snapshotDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now()));
  const brief = { ...gen.value, activeMarkets };
  const res = await deps.db.upsertSnapshot(client, {
    snapshot_date: snapshotDate,
    generated_at: new Date().toISOString(),
    headline: brief.headline,
    executive_brief: brief,
    market_regime: brief.themes?.[0] ?? null,
    deal_environment: brief.dealEnvironment,
    top_item_ids: topItems.map(i => i.id).filter(v => v != null),
    market_metrics: metrics,
    evidence_item_ids: brief.evidenceItemIds,
    content_hash: contentHash(brief.headline, JSON.stringify(brief.keyDevelopments)),
    ai_model: A.intelligenceModel(),
  });
  return { brief: brief.headline, ...res };
}

// ── Top-level: run a set of tasks, isolating failures ────────────────────────
export async function runTasks(tasks, deps) {
  const summary = { statuses: [], activeMarkets: [], itemsDiscovered: 0, itemsInserted: 0, itemsUpdated: 0, itemsAiProcessed: 0, dataPointsWritten: 0, errors: [], migrationNeeded: false };
  const wantSet = new Set(tasks);

  try {
    if (wantSet.has('markets')) {
      const r = await runMarkets(deps);
      summary.statuses.push(...r.statuses);
      summary.dataPointsWritten += r.dataPointsWritten;
      if (r.migrationNeeded) summary.migrationNeeded = true;
    }
    if (wantSet.has('news') || wantSet.has('fed')) {
      const r = await runNews(deps, { includeFed: true });
      summary.statuses.push(...r.statuses);
      summary.itemsDiscovered += r.itemsDiscovered;
      summary.itemsInserted += r.itemsInserted;
      summary.itemsUpdated += r.itemsUpdated;
      summary.activeMarkets = r.activeMarkets ?? [];
      if (r.migrationNeeded) summary.migrationNeeded = true;
      // enrich freshly-scored items (they carry no id until re-read; enrich reads
      // back). Bounded by a wall-clock deadline so the news write always lands
      // even if the model is slow — remaining items get enriched on the next run.
      if (deps.client && !r.migrationNeeded) {
        const back = await deps.client.from('market_intelligence_items').select('*')
          .is('ai_generated_at', null).order('importance_score', { ascending: false, nullsFirst: false }).limit(60);
        const deadline = (deps.startedAt ?? Date.now()) + 45000;
        const e = await runEnrichment(deps, back?.data ?? [], { deadline });
        summary.itemsAiProcessed += e.itemsAiProcessed;
      }
    }
    if (wantSet.has('brief')) {
      const r = await runBrief(deps);
      if (r.error) summary.errors.push({ task: 'brief', error: r.error });
      if (r.migrationNeeded) summary.migrationNeeded = true;
    }
  } catch (e) {
    summary.errors.push({ task: 'run', error: String(e?.message ?? e).slice(0, 160) });
  }
  return summary;
}
