// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: HTTP endpoint.
//
//  GET  ?mode=dashboard   → cached read only (no provider/AI/secret exposure)
//  POST  {mode: refresh|refresh-markets|refresh-news|generate-brief|scheduled|status}
//        → protected; requires x-intelligence-secret or Bearer CRON_SECRET
//  POST  {mode: flag, id, is_saved?|is_read?|is_hidden?} → per-item UI state
//
// Note: the pre-existing api/intelligence.js (deal-lookup) is a DIFFERENT
// endpoint and is left untouched.
// ─────────────────────────────────────────────────────────────────────────────

import * as db from './_intelligenceDatabase.js';
import { REFRESH_MODES, tasksForMode } from './_intelligenceScheduling.js';
import { runTasks, buildDeps } from './_marketIntelligenceRun.js';

export const maxDuration = 60;

// ── Auth (pure, testable) — never reads secrets from the query string ────────
export function authorizeRefresh(headers = {}, env = process.env) {
  const secret = env.MARKET_INTELLIGENCE_SECRET;
  const cron = env.CRON_SECRET;
  if (!secret && !cron) return { ok: false, reason: 'refresh_disabled' }; // do not default-open ingestion
  const provided = headers['x-intelligence-secret'];
  const bearer = String(headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (secret && provided === secret) return { ok: true };
  if (cron && bearer === cron) return { ok: true };
  return { ok: false, reason: 'unauthorized' };
}

// ── Core request handler (testable with injected deps) ───────────────────────
export async function handleIntelligence(reqLike, deps) {
  const { method, query = {}, body = {}, headers = {} } = reqLike;
  const env = deps.env ?? process.env;
  const now = deps.now ? deps.now() : Date.now();

  // Cached dashboard read — the only thing the browser calls on render.
  if (method === 'GET') {
    const mode = query.mode || 'dashboard';
    if (mode !== 'dashboard') return { status: 400, body: { ok: false, error: 'unknown GET mode' } };
    if (!deps.client) return { status: 200, body: { ok: true, migrationNeeded: false, configured: false, stale: true, marketTape: [], topStories: [], categories: {}, savedStories: [], providerStatus: [] } };
    const payload = await deps.readDashboard(deps.client, { now });
    return { status: 200, cache: 'public, max-age=60, stale-while-revalidate=600', body: payload };
  }

  if (method !== 'POST') return { status: 405, body: { ok: false, error: 'method not allowed' } };

  const mode = body.mode || query.mode;

  // Per-item UI flags (save/read/hide) — harmless bounded state, no secret.
  if (mode === 'flag') {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return { status: 400, body: { ok: false, error: 'invalid id' } };
    if (!deps.client) return { status: 503, body: { ok: false, error: 'not configured' } };
    const r = await deps.setItemFlag(deps.client, id, {
      is_saved: body.is_saved, is_read: body.is_read, is_hidden: body.is_hidden,
    });
    if (r.migrationNeeded) return { status: 200, body: { ok: true, migrationNeeded: true } };
    return { status: r.error ? 500 : 200, body: r.error ? { ok: false, error: r.error } : { ok: true } };
  }

  // Everything below is a protected refresh/status mode.
  if (!REFRESH_MODES.has(mode)) return { status: 400, body: { ok: false, error: 'unknown mode' } };
  const auth = deps.authorizeRefresh(headers, env);
  if (!auth.ok) return { status: auth.reason === 'refresh_disabled' ? 503 : 401, body: { ok: false, error: auth.reason } };

  if (!deps.client) return { status: 503, body: { ok: false, error: 'not configured' } };

  if (mode === 'status') {
    const dash = await deps.readDashboard(deps.client, { now });
    return { status: 200, body: { ok: true, migrationNeeded: !!dash.migrationNeeded, generatedAt: dash.generatedAt ?? null, providerStatus: dash.providerStatus ?? [] } };
  }

  const tasks = tasksForMode(mode, new Date(now));
  if (tasks.length === 0) return { status: 200, body: { ok: true, skipped: 'nothing_due' } };

  // Concurrency guard: unique run bucket key.
  const runKey = deps.deriveRunKey(mode, new Date(now));
  const claim = await deps.claimRun(deps.client, runKey, body.trigger || 'api');
  if (claim.migrationNeeded) return { status: 200, body: { ok: true, migrationNeeded: true } };
  if (claim.claimed === false) return { status: 200, body: { ok: true, skipped: 'already_running', runKey } };
  if (claim.error) return { status: 500, body: { ok: false, error: claim.error } };

  const summary = await deps.runTasks(tasks, deps.runDeps);
  await deps.finishRun(deps.client, claim.id, {
    status: summary.migrationNeeded ? 'migration_needed' : (summary.errors.length ? 'partial' : 'success'),
    items_discovered: summary.itemsDiscovered,
    items_inserted: summary.itemsInserted,
    items_updated: summary.itemsUpdated,
    items_ai_processed: summary.itemsAiProcessed,
    provider_results: summary.statuses,
    errors: summary.errors,
  });
  return { status: 200, body: { ok: true, mode, tasks, summary: { ...summary, statuses: undefined }, providerStatus: summary.statuses } };
}

// ── Vercel entrypoint ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const client = db.intelligenceSupabase();
  const deps = {
    client, env: process.env, now: () => Date.now(),
    readDashboard: db.readDashboard, setItemFlag: db.setItemFlag,
    claimRun: db.claimRun, finishRun: db.finishRun, deriveRunKey: db.deriveRunKey,
    authorizeRefresh, runTasks, runDeps: buildDeps(process.env),
  };
  try {
    const result = await handleIntelligence({
      method: req.method, query: req.query || {}, body: req.body || {}, headers: req.headers || {},
    }, deps);
    if (result.cache) res.setHeader('Cache-Control', result.cache);
    return res.status(result.status).json(result.body);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? 'error').slice(0, 160) });
  }
}
