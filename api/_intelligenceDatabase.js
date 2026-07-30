// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: persistence layer.
//
// Server-side only (service-role client). Graceful migration detection, idempotent
// upserts, a run-log concurrency guard, and PURE assembly helpers (planItemWrites,
// treasurySeriesFromDataPoints, buildMarketTape, assembleDashboard, deriveRunKey)
// that are unit-tested without any Supabase connection.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import {
  canonicalizeUrl, boundedArray, boundedString, clamp,
  yieldCurveMetrics, TREASURY_TENORS, FRED_SERIES, isObservationStale, freshnessScore,
} from './_marketIntelligence.js';

const TREASURY_PREFIX = 'ust_';

// ── Service-role client (lazy; ingestion bypasses RLS) ───────────────────────
let _client = null;
export function intelligenceSupabase() {
  if (_client) return _client;
  // Match the repo convention (_dailyActivity.js): the project URL is not a
  // secret and is defaulted; only the service-role KEY must come from env.
  const url = process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null; // caller treats null as missing_config (configured:false)
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function isMissingTableError(error) {
  if (!error) return false;
  const msg = error.message ?? '';
  return error.code === '42P01' || error.code === 'PGRST205'
    || /relation .*market_intelligence.* does not exist|could not find the table/i.test(msg);
}

// ── PURE: split a batch into inserts vs updates for accurate run counters ─────
export function planItemWrites(existingUrls, items) {
  const seen = existingUrls instanceof Set ? existingUrls : new Set(existingUrls ?? []);
  const toInsert = [];
  const toUpdate = [];
  const batchSeen = new Set();
  for (const it of boundedArray(items, 2000)) {
    const url = canonicalizeUrl(it.canonical_url ?? it.url ?? '');
    if (!url || batchSeen.has(url)) continue; // drop in-batch dupes
    batchSeen.add(url);
    (seen.has(url) ? toUpdate : toInsert).push({ ...it, canonical_url: url });
  }
  return { toInsert, toUpdate };
}

// ── PURE: reconstruct the treasury tenor series from stored data points ──────
export function treasurySeriesFromDataPoints(dataPoints) {
  const series = {};
  for (const p of boundedArray(dataPoints, 5000)) {
    if (!String(p.series_key ?? '').startsWith(TREASURY_PREFIX)) continue;
    const key = p.series_key.slice(TREASURY_PREFIX.length);
    if (!TREASURY_TENORS.some(t => t.key === key)) continue;
    (series[key] ??= []).push({ date: p.observation_date, value: Number(p.value) });
  }
  return series;
}

// ── PURE: market tape rows from data points (rates/curve/credit) ─────────────
export function buildMarketTape(dataPoints, { now = Date.now() } = {}) {
  const latestBySeries = new Map();
  for (const p of boundedArray(dataPoints, 5000)) {
    const prev = latestBySeries.get(p.series_key);
    if (!prev || String(p.observation_date) > String(prev.observation_date)) latestBySeries.set(p.series_key, p);
  }
  const tape = [];

  // Treasury curve summary rows
  const curve = yieldCurveMetrics(treasurySeriesFromDataPoints(dataPoints), { now });
  for (const key of ['y2', 'y10', 'y30']) {
    const t = curve.tenors[key];
    if (t) tape.push({ key: `ust_${key}`, label: `UST ${t.label}`, value: t.value, unit: '%', asOf: t.date, dailyBp: t.dailyBp, weekBp: t.weekBp, stale: t.stale, kind: 'rate' });
  }
  if (curve.spread2s10s != null) tape.push({ key: 'spread_2s10s', label: '2s10s', value: curve.spread2s10s, unit: 'bp', asOf: curve.latestDate, inverted: curve.inverted2s10s, stale: curve.stale, kind: 'spread' });
  if (curve.spread3m10y != null) tape.push({ key: 'spread_3m10y', label: '3m10y', value: curve.spread3m10y, unit: 'bp', asOf: curve.latestDate, inverted: curve.inverted3m10y, stale: curve.stale, kind: 'spread' });

  // FRED series rows (fed funds, SOFR, spreads, etc.)
  for (const meta of FRED_SERIES) {
    const p = latestBySeries.get(meta.key);
    if (!p) continue;
    tape.push({
      key: meta.key, label: meta.label, value: Number(p.value), unit: meta.unit,
      asOf: p.observation_date, stale: isObservationStale(p.observation_date, meta.maxStaleDays, now), kind: 'series',
    });
  }
  return tape;
}

// ── PURE: DB item row → API story shape (no provider payload leaked) ─────────
export function toStory(row) {
  return {
    id: row.id,
    url: row.canonical_url,
    provider: row.provider,
    source: row.source_name || row.source_domain,
    sourceDomain: row.source_domain,
    title: row.title,
    publishedAt: row.published_at,
    category: row.category,
    subcategory: row.subcategory,
    summary: row.summary || row.raw_excerpt || '',
    whyItMatters: row.why_it_matters || '',
    brokerTakeaway: row.broker_takeaway || '',
    impact: row.impact,
    confidence: row.confidence,
    relevanceScore: row.relevance_score,
    importanceScore: row.importance_score,
    tags: Array.isArray(row.tags) ? row.tags : [],
    entities: Array.isArray(row.entities) ? row.entities : [],
    isRead: !!row.is_read,
    isSaved: !!row.is_saved,
  };
}

// ── PURE: assemble the cached dashboard payload from fetched rows ────────────
export function assembleDashboard({ snapshot, items = [], dataPoints = [], latestRun = null }, { now = Date.now() } = {}) {
  const visible = items.filter(r => !r.is_hidden).map(toStory);
  const current = visible.filter(story => isCurrentStory(story, now));
  const rankedCurrent = [...current].sort((a, b) => storyRank(b, now) - storyRank(a, now));
  const categories = {};
  for (const s of rankedCurrent) {
    if (!s.category) continue;
    (categories[s.category] ??= []).push(s);
  }
  const generatedAt = newestIso(snapshot?.generated_at, latestRun?.finished_at);
  const stale = generatedAt ? ((now - new Date(generatedAt).getTime()) > 26 * 3.6e6) : true;
  return {
    ok: true,
    generatedAt,
    stale,
    migrationNeeded: false,
    snapshot: snapshot ? {
      date: snapshot.snapshot_date,
      generatedAt: snapshot.generated_at,
      headline: snapshot.headline,
      brief: snapshot.executive_brief ?? null,
      marketRegime: snapshot.market_regime ?? null,
      dealEnvironment: snapshot.deal_environment ?? null,
      evidenceItemIds: snapshot.evidence_item_ids ?? [],
      confidence: snapshot.executive_brief?.confidence ?? null,
    } : null,
    marketTape: buildMarketTape(dataPoints, { now }),
    topStories: balancedTopStories(rankedCurrent, 36),
    categories,
    savedStories: visible.filter(s => s.isSaved),
    providerStatus: boundedArray(latestRun?.provider_results, 40),
  };
}

export function isCurrentStory(story, now = Date.now(), maxAgeDays = 10) {
  const published = new Date(story?.publishedAt).getTime();
  if (!Number.isFinite(published)) return false;
  if (story?.relevanceScore != null && Number(story.relevanceScore) < 10) return false;
  const age = now - published;
  return age >= -3.6e6 && age <= maxAgeDays * 8.64e7;
}

export function storyRank(story, now = Date.now()) {
  const importance = clamp(story?.importanceScore ?? 0, 0, 100);
  const currentFreshness = freshnessScore(story?.publishedAt, now);
  return importance * 0.65 + currentFreshness * 35;
}

function newestIso(...values) {
  const valid = values
    .map(value => ({ value, time: new Date(value).getTime() }))
    .filter(entry => entry.value && Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time);
  return valid[0]?.value ?? null;
}

export function balancedTopStories(stories, limit = 24) {
  const categoryOrder = ['self_storage', 'cre', 'private_equity', 'private_credit', 'rates', 'macro'];
  const selected = [];
  const selectedIds = new Set();
  for (const category of categoryOrder) {
    for (const story of stories.filter(item => item.category === category).slice(0, 5)) {
      const key = story.id ?? story.url;
      if (!selectedIds.has(key)) {
        selected.push(story);
        selectedIds.add(key);
      }
    }
  }
  const representedMarkets = new Set();
  for (const story of stories) {
    const marketTag = story.tags?.find(tag => String(tag).startsWith('market:'));
    if (!marketTag || representedMarkets.has(marketTag)) continue;
    const key = story.id ?? story.url;
    if (!selectedIds.has(key)) {
      selected.push(story);
      selectedIds.add(key);
    }
    representedMarkets.add(marketTag);
  }
  for (const story of stories) {
    if (selected.length >= limit) break;
    const key = story.id ?? story.url;
    if (!selectedIds.has(key)) {
      selected.push(story);
      selectedIds.add(key);
    }
  }
  return selected.slice(0, limit);
}

// ── PURE: eastern-time-bucketed idempotency key ──────────────────────────────
export function deriveRunKey(mode, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now instanceof Date ? now : new Date(now));
  const get = t => parts.find(p => p.type === t)?.value ?? '';
  return `${mode}:${get('year')}-${get('month')}-${get('day')}:${get('hour')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin DB operations (use the injected/real client). Each returns a plain object
// and surfaces migrationNeeded rather than throwing on a missing table.
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertItems(client, items) {
  if (!items?.length) return { inserted: 0, updated: 0 };
  const urls = items.map(i => canonicalizeUrl(i.canonical_url ?? i.url ?? '')).filter(Boolean);
  const { data: existing, error: selErr } = await client
    .from('market_intelligence_items').select('canonical_url').in('canonical_url', urls);
  if (selErr && isMissingTableError(selErr)) return { migrationNeeded: true, inserted: 0, updated: 0 };
  const plan = planItemWrites(new Set((existing ?? []).map(r => r.canonical_url)), items);
  const rows = [...plan.toInsert, ...plan.toUpdate].map(sanitizeItemRow);
  const { error } = await client.from('market_intelligence_items').upsert(rows, { onConflict: 'canonical_url' });
  if (error) {
    if (isMissingTableError(error)) return { migrationNeeded: true, inserted: 0, updated: 0 };
    return { error: boundedString(error.message, 160), inserted: 0, updated: 0 };
  }
  return { inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

export async function upsertDataPoints(client, points) {
  if (!points?.length) return { count: 0 };
  const rows = boundedArray(points, 5000).map(p => ({
    series_key: p.series_key, provider: p.provider,
    observation_date: p.observation_date, value: p.value, unit: p.unit ?? null,
    metadata: p.metadata ?? {},
  }));
  const { error } = await client.from('market_data_points')
    .upsert(rows, { onConflict: 'provider,series_key,observation_date' });
  if (error) {
    if (isMissingTableError(error)) return { migrationNeeded: true, count: 0 };
    return { error: boundedString(error.message, 160), count: 0 };
  }
  return { count: rows.length };
}

export async function upsertSnapshot(client, snapshot) {
  const { error } = await client.from('market_intelligence_snapshots')
    .upsert([snapshot], { onConflict: 'snapshot_date' });
  if (error) {
    if (isMissingTableError(error)) return { migrationNeeded: true };
    return { error: boundedString(error.message, 160) };
  }
  return { ok: true };
}

// Concurrency guard: a unique run_key means a second invocation for the same
// bucket fails the insert and is told the run is already claimed.
export async function claimRun(client, runKey, trigger) {
  const { data, error } = await client.from('market_intelligence_runs')
    .insert([{ run_key: runKey, trigger, status: 'running' }]).select('id').single();
  if (!error) return { claimed: true, id: data.id };
  if (isMissingTableError(error)) return { migrationNeeded: true };
  if (error.code !== '23505') return { error: boundedString(error.message, 160) };

  // Bucket already exists. Only a genuinely in-flight run should block; a run
  // that already FINISHED (success or error) may be re-claimed for a retry.
  const existing = await client.from('market_intelligence_runs')
    .select('id,status,finished_at').eq('run_key', runKey).maybeSingle();
  if (existing.error || !existing.data) return { claimed: false };
  if (existing.data.status === 'running' && !existing.data.finished_at) return { claimed: false };
  const reclaim = await client.from('market_intelligence_runs')
    .update({ status: 'running', trigger, started_at: new Date().toISOString(), finished_at: null })
    .eq('id', existing.data.id);
  if (reclaim.error) return { claimed: false };
  return { claimed: true, id: existing.data.id };
}

export async function finishRun(client, id, patch) {
  const { error } = await client.from('market_intelligence_runs')
    .update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id);
  return error ? { error: boundedString(error.message, 160) } : { ok: true };
}

export async function setItemFlag(client, id, flags) {
  const allowed = {};
  if (flags.is_saved !== undefined) allowed.is_saved = !!flags.is_saved;
  if (flags.is_read !== undefined) allowed.is_read = !!flags.is_read;
  if (flags.is_hidden !== undefined) allowed.is_hidden = !!flags.is_hidden;
  const { error } = await client.from('market_intelligence_items').update(allowed).eq('id', id);
  if (error && isMissingTableError(error)) return { migrationNeeded: true };
  return error ? { error: boundedString(error.message, 160) } : { ok: true };
}

export async function readDashboard(client, { now = Date.now() } = {}) {
  const snap = await client.from('market_intelligence_snapshots')
    .select('*').order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
  if (snap.error && isMissingTableError(snap.error)) return { ok: true, migrationNeeded: true };

  const [items, points, run] = await Promise.all([
    client.from('market_intelligence_items').select('*')
      .order('importance_score', { ascending: false, nullsFirst: false }).limit(500),
    client.from('market_data_points').select('*')
      .order('observation_date', { ascending: false }).limit(2000),
    client.from('market_intelligence_runs').select('*')
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [items, points, run]) {
    if (r.error && isMissingTableError(r.error)) return { ok: true, migrationNeeded: true };
  }
  return assembleDashboard({
    snapshot: snap.data ?? null,
    items: items.data ?? [],
    dataPoints: points.data ?? [],
    latestRun: run.data ?? null,
  }, { now });
}

// Bound + whitelist columns actually written to items (no arbitrary payload).
function sanitizeItemRow(it) {
  return {
    canonical_url: it.canonical_url,
    provider: boundedString(it.provider, 40),
    source_name: boundedString(it.source_name, 200),
    source_domain: boundedString(it.source_domain, 200),
    title: boundedString(it.title, 400),
    published_at: it.published_at ?? null,
    category: it.category ?? null,
    subcategory: boundedString(it.subcategory, 80) || null,
    tags: boundedArray(it.tags, 12),
    raw_excerpt: boundedString(it.raw_excerpt, 1000) || null,
    summary: boundedString(it.summary, 600) || null,
    why_it_matters: boundedString(it.why_it_matters ?? it.whyItMatters, 600) || null,
    broker_takeaway: boundedString(it.broker_takeaway ?? it.brokerTakeaway, 400) || null,
    relevance_score: it.relevance_score != null ? clamp(it.relevance_score, 0, 100) : null,
    importance_score: it.importance_score != null ? clamp(it.importance_score, 0, 100) : null,
    freshness_score: it.freshness_score ?? null,
    impact: boundedString(it.impact, 20) || null,
    confidence: boundedString(it.confidence, 20) || null,
    entities: boundedArray(it.entities, 12),
    content_hash: boundedString(it.content_hash, 32) || null,
    ai_model: boundedString(it.ai_model, 60) || null,
    ai_generated_at: it.ai_generated_at ?? null,
  };
}

export const __private = { sanitizeItemRow, TREASURY_PREFIX };
