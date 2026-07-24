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
import { DEFAULT_PRIORITY_MARKETS } from './_intelligenceConfig.js';

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
    fredKey: env.FRED_API_KEY || '',
    alphaKey: env.ALPHA_VANTAGE_API_KEY || '',
  };
}

// ── Markets: Treasury curve + FRED series → data points ──────────────────────
export async function runMarkets(deps) {
  const { providers: P, client } = deps;
  const statuses = [];
  const points = [];

  const t = await P.fetchTreasury();
  statuses.push(t.status);
  for (const [tenor, obs] of Object.entries(t.series ?? {})) {
    for (const o of obs) points.push({ series_key: `ust_${tenor}`, provider: 'treasury', observation_date: o.date, value: o.value, unit: '%' });
  }

  for (const meta of FRED_SERIES.filter(s => s.verified)) {
    const r = await P.fetchFredSeries(meta, deps.fredKey);
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

  const feeds = [...(includeFed ? P.officialFeeds() : []), ...P.industryFeeds()];
  for (const feed of feeds) {
    const r = await P.fetchRss(feed);
    statuses.push(r.status);
    raw.push(...(r.items ?? []));
  }
  for (const group of P.gdeltGroups()) {
    const r = await P.fetchGdeltGroup(group);
    statuses.push(r.status);
    raw.push(...(r.items ?? []));
  }

  const nowMs = now();
  const markets = priorityMarkets(deps.env);
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
    };
  });

  let written = { inserted: 0, updated: 0 };
  if (scored.length && client) written = await deps.db.upsertItems(client, scored);
  return { statuses, itemsDiscovered: scored.length, itemsInserted: written.inserted ?? 0, itemsUpdated: written.updated ?? 0, migrationNeeded: written.migrationNeeded, scored };
}

// ── AI enrichment: top unprocessed items, bounded by cost caps ───────────────
export async function runEnrichment(deps, candidateItems) {
  const { ai: A, client } = deps;
  const selected = A.selectItemsForEnrichment(candidateItems, {});
  let processed = 0;
  const model = A.intelligenceModel();
  for (const item of selected) {
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
        tags: res.value.tags,
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
  const metrics = { marketTape: dash.marketTape };
  const gen = await A.generateSnapshot(topItems, metrics);
  if (!gen.ok) return { error: gen.error };

  const snapshotDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now()));
  const brief = gen.value;
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
  const summary = { statuses: [], itemsDiscovered: 0, itemsInserted: 0, itemsUpdated: 0, itemsAiProcessed: 0, dataPointsWritten: 0, errors: [], migrationNeeded: false };
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
      if (r.migrationNeeded) summary.migrationNeeded = true;
      // enrich freshly-scored items (they carry no id until re-read; enrich reads back)
      if (deps.client && !r.migrationNeeded) {
        const back = await deps.client.from('market_intelligence_items').select('*')
          .is('ai_generated_at', null).order('importance_score', { ascending: false, nullsFirst: false }).limit(60);
        const e = await runEnrichment(deps, back?.data ?? []);
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
