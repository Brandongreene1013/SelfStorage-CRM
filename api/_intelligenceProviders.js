// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: provider adapters.
//
// Two layers:
//  1. PURE parsers (parse*): raw provider payload → normalized internal model.
//     No network, fully unit-tested against fixtures. This is where every
//     provider-specific shape is flattened so nothing provider-specific leaks
//     onward.
//  2. Thin network adapters (fetch*): use safeFetch (timeout / size cap /
//     content-type / host allowlist) then delegate to a pure parser, returning
//     { status, items | dataPoints }.
//
// Normalized news item: { canonical_url, provider, source_name, source_domain,
//   title, published_at, raw_excerpt }.
// Normalized data point:  { series_key, provider, observation_date, value, unit }.
// ─────────────────────────────────────────────────────────────────────────────

import { canonicalizeUrl, domainOf, boundedString, boundedArray, clamp } from './_marketIntelligence.js';
import {
  OFFICIAL_RSS, INDUSTRY_RSS, NEWS_QUERY_GROUPS, GDELT_QUERY_GROUPS, ALPHA_VANTAGE_SYMBOLS,
  PROVIDER_DEFAULTS, allowlistedFeedHosts,
} from './_intelligenceConfig.js';

// API hosts the adapters may contact beyond the RSS allowlist.
const API_HOSTS = new Set([
  'home.treasury.gov', 'api.stlouisfed.org', 'api.gdeltproject.org', 'www.alphavantage.co',
  'www.bing.com', 'bing.com', 'news.google.com',
]);

// ── Structured provider status ───────────────────────────────────────────────
export function providerStatus(provider, state, extra = {}) {
  // state ∈ success | partial | rate_limited | malformed | timeout | missing_config | stale_fallback | error
  return { provider, state, at: new Date().toISOString(), ...extra };
}

// ── Safe fetch ───────────────────────────────────────────────────────────────
// Timeout via AbortController, host allowlist (SSRF guard), content-type check,
// and a hard byte cap read incrementally so a malicious huge body can't OOM us.
export async function safeFetch(url, {
  timeoutMs = PROVIDER_DEFAULTS.timeoutMs,
  maxBytes = PROVIDER_DEFAULTS.maxBytes,
  accept = 'application/json',
  allowHosts,
  fetchImpl = globalThis.fetch,
} = {}) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { throw new Error('invalid url'); }
  const permitted = allowHosts ?? new Set([...allowlistedFeedHosts(), ...API_HOSTS]);
  if (!permitted.has(host)) throw new Error(`host not allowlisted: ${host}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept, 'user-agent': PROVIDER_DEFAULTS.userAgent },
    });
    if (!res.ok) {
      const err = new Error(`http ${res.status}`);
      err.httpStatus = res.status;
      throw err;
    }
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    // read as text with a byte guard
    const text = await res.text();
    if (text.length > maxBytes) throw new Error('response too large');
    return { text, contentType: ct };
  } finally {
    clearTimeout(timer);
  }
}

// ── XML/HTML helpers (dependency-free) ───────────────────────────────────────
function decodeEntities(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#0*38;|&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}
function stripTags(s) {
  // Unwrap CDATA + decode entities FIRST, then remove any remaining markup, so
  // a CDATA wrapper isn't mistaken for a tag.
  const unwrapped = decodeEntities(String(s ?? ''));
  return unwrapped.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function firstTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : null;
}
function firstAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : null;
}

// ── RSS / Atom parser (Federal Reserve + industry feeds) ─────────────────────
export function parseRssFeed(xml, { provider = 'industry_rss', sourceName = '', category = null } = {}) {
  const text = String(xml ?? '');
  const items = [];
  const blocks = text.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, 200)) {
    const isAtom = /^<entry/i.test(block);
    const title = stripTags(firstTag(block, 'title') || '');
    let link = isAtom
      ? (firstAttr(block, 'link', 'href') || stripTags(firstTag(block, 'id') || ''))
      : stripTags(firstTag(block, 'link') || '');
    if (provider === 'bing_news') link = unwrapBingNewsUrl(link);
    const rawDate = firstTag(block, 'pubDate') || firstTag(block, 'published') || firstTag(block, 'updated') || firstTag(block, 'dc:date');
    const excerpt = stripTags(firstTag(block, 'description') || firstTag(block, 'summary') || firstTag(block, 'content') || '');
    const itemSource = stripTags(firstTag(block, 'News:Source') || firstTag(block, 'source') || '');
    const canonical = canonicalizeUrl(link);
    if (!title || !canonical) continue;
    const published = rawDate ? new Date(decodeEntities(rawDate)) : null;
    items.push({
      canonical_url: canonical,
      provider,
      source_name: itemSource || sourceName,
      source_domain: domainOf(canonical),
      title: boundedString(title, 400),
      published_at: published && Number.isFinite(published.getTime()) ? published.toISOString() : null,
      raw_excerpt: boundedString(excerpt, 1000),
      category,
    });
  }
  return items;
}

export function unwrapBingNewsUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl ?? ''));
    if (!/(^|\.)bing\.com$/i.test(url.hostname)) return rawUrl;
    const destination = url.searchParams.get('url');
    return destination ? decodeURIComponent(destination) : rawUrl;
  } catch {
    return rawUrl;
  }
}

function isUsefulMarketItem(item, market) {
  if (!market) return true;
  const city = String(market).split(',')[0].trim().toLowerCase();
  const text = `${item.title} ${item.raw_excerpt}`.toLowerCase();
  if (!city || !String(item.title).toLowerCase().includes(city)) return false;
  if (/\brealtor\.com\b|\bzillow\b|\bredfin\b|\btrulia\b|\bobituar|\bfuneral home\b/i.test(`${item.source_name} ${item.title}`)) return false;
  return /\b(storage|real estate|develop|econom|construction|zoning|project|jobs?|employ|facility|investment|industrial|retail|housing|population|permit|infrastructure|acqui|sale|loan|bank|capital)\b/i.test(text);
}

// ── Treasury daily par-yield XML parser ──────────────────────────────────────
// Maps the official BC_* tags to our tenor keys → { tenorKey: [{date, value}] }.
const TREASURY_TAG_MAP = {
  BC_1MONTH: 'm1', BC_3MONTH: 'm3', BC_6MONTH: 'm6', BC_1YEAR: 'y1',
  BC_2YEAR: 'y2', BC_5YEAR: 'y5', BC_10YEAR: 'y10', BC_20YEAR: 'y20', BC_30YEAR: 'y30',
};
export function parseTreasuryXml(xml) {
  const text = String(xml ?? '');
  const series = {};
  const entries = text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const entry of entries.slice(0, 500)) {
    const rawDate = firstTag(entry, 'd:NEW_DATE') || firstTag(entry, 'd:QUOTE_DATE');
    if (!rawDate) continue;
    const date = String(decodeEntities(rawDate)).slice(0, 10);
    for (const [tag, key] of Object.entries(TREASURY_TAG_MAP)) {
      const raw = firstTag(entry, `d:${tag}`);
      if (raw == null) continue;
      const value = parseFloat(decodeEntities(raw));
      if (!Number.isFinite(value)) continue;
      (series[key] ??= []).push({ date, value });
    }
  }
  return series;
}

// ── FRED observations parser ─────────────────────────────────────────────────
export function parseFredObservations(json, seriesMeta) {
  const obs = boundedArray(json?.observations, PROVIDER_DEFAULTS.fredObservationLimit);
  const points = [];
  for (const o of obs) {
    if (!o || o.value == null || o.value === '.') continue; // FRED uses "." for missing
    const value = parseFloat(o.value);
    if (!Number.isFinite(value)) continue;
    const date = String(o.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    points.push({
      series_key: seriesMeta.key,
      provider: 'fred',
      observation_date: date,
      value,
      unit: seriesMeta.unit,
    });
  }
  return points;
}

// ── GDELT article-list parser ────────────────────────────────────────────────
export function parseGdelt(json, { queryGroup = null, category = null } = {}) {
  const articles = boundedArray(json?.articles, 100);
  const items = [];
  for (const a of articles) {
    const canonical = canonicalizeUrl(a?.url);
    const title = stripTags(a?.title || '');
    if (!canonical || !title) continue;
    // GDELT seendate like "20260722T131500Z"
    let published = null;
    const sd = String(a?.seendate ?? '');
    const m = sd.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (m) published = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString();
    items.push({
      canonical_url: canonical,
      provider: 'gdelt',
      source_name: boundedString(a?.domain || domainOf(canonical), 120),
      source_domain: domainOf(canonical),
      title: boundedString(title, 400),
      published_at: published,
      raw_excerpt: '', // GDELT artlist has no body excerpt — copyright-safe
      category,
      queryGroup,
    });
  }
  return items;
}

// ── Alpha Vantage (optional, EOD only) ───────────────────────────────────────
export function parseAlphaVantageQuote(json, meta) {
  const q = json?.['Global Quote'] || json?.['Global Quote - DATA DELAYED BY 15 MINUTES'];
  if (!q) return null;
  const price = parseFloat(q['05. price']);
  const changePct = parseFloat(String(q['10. change percent'] ?? '').replace('%', ''));
  const day = String(q['07. latest trading day'] ?? '').slice(0, 10);
  if (!Number.isFinite(price)) return null;
  return {
    series_key: `equity_${meta.symbol.toLowerCase()}`,
    provider: 'alpha_vantage',
    observation_date: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10),
    value: price,
    unit: 'USD',
    metadata: { symbol: meta.symbol, label: meta.label, changePct: Number.isFinite(changePct) ? changePct : null, delayed: true },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Network adapters — thin; each isolates its own failure and returns a status.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTreasury(month, deps = {}) {
  const yyyymm = month || new Date().toISOString().slice(0, 7).replace('-', '');
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${yyyymm}`;
  try {
    const { text } = await safeFetch(url, { accept: 'application/xml', ...deps });
    const series = parseTreasuryXml(text);
    const tenorCount = Object.keys(series).length;
    if (tenorCount === 0) return { status: providerStatus('treasury', 'malformed'), series: {} };
    return { status: providerStatus('treasury', 'success', { tenors: tenorCount }), series };
  } catch (e) {
    return { status: providerStatus('treasury', classifyError(e), { message: safeErr(e) }), series: {} };
  }
}

export async function fetchFredSeries(seriesMeta, apiKey, deps = {}) {
  if (!apiKey) return { status: providerStatus('fred', 'missing_config', { key: seriesMeta.key }), dataPoints: [] };
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesMeta.seriesId)}`
    + `&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${PROVIDER_DEFAULTS.fredObservationLimit}`;
  try {
    const { text } = await safeFetch(url, { accept: 'application/json', ...deps });
    const json = JSON.parse(text);
    const dataPoints = parseFredObservations(json, seriesMeta);
    return { status: providerStatus('fred', dataPoints.length ? 'success' : 'malformed', { key: seriesMeta.key, points: dataPoints.length }), dataPoints };
  } catch (e) {
    return { status: providerStatus('fred', classifyError(e), { key: seriesMeta.key, message: safeErr(e) }), dataPoints: [] };
  }
}

export async function fetchRss(feed, deps = {}) {
  try {
    const { text } = await safeFetch(feed.url, { accept: 'application/xml', ...deps });
    const items = parseRssFeed(text, { provider: feed.provider, sourceName: feed.sourceName, category: feed.category ?? null });
    return { status: providerStatus(feed.provider, 'success', { feed: feed.key, items: items.length }), items };
  } catch (e) {
    return { status: providerStatus(feed.provider, classifyError(e), { feed: feed.key, message: safeErr(e) }), items: [] };
  }
}

export async function fetchGdeltGroup(group, deps = {}) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(group.query)}`
    + `&mode=artlist&format=json&sort=datedesc&maxrecords=${PROVIDER_DEFAULTS.gdeltMaxRecordsPerGroup}&timespan=3d`;
  try {
    const { text } = await safeFetch(url, { accept: 'application/json', ...deps });
    const json = JSON.parse(text);
    const items = parseGdelt(json, { queryGroup: group.key, category: group.category });
    return { status: providerStatus('gdelt', 'success', { group: group.key, items: items.length }), items };
  } catch (e) {
    return { status: providerStatus('gdelt', classifyError(e), { group: group.key, message: safeErr(e) }), items: [] };
  }
}

export async function fetchNewsSearchGroup(group, deps = {}) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(group.query)}`
    + `&format=rss&count=${PROVIDER_DEFAULTS.newsMaxRecordsPerGroup}`;
  try {
    const { text } = await safeFetch(url, { accept: 'application/rss+xml, application/xml', ...deps });
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const items = parseRssFeed(text, {
      provider: 'bing_news',
      sourceName: 'Bing News',
      category: group.category,
    }).filter(item => !item.published_at || new Date(item.published_at).getTime() >= cutoff)
      .filter(item => isUsefulMarketItem(item, group.market))
      .map(item => ({
        ...item,
        queryGroup: group.key,
        tags: group.market ? [`market:${group.market}`] : [],
      }));
    return { status: providerStatus('bing_news', 'success', { group: group.key, items: items.length }), items };
  } catch (e) {
    return { status: providerStatus('bing_news', classifyError(e), { group: group.key, message: safeErr(e) }), items: [] };
  }
}

export async function fetchGoogleNewsGroup(group, deps = {}) {
  const query = `${group.query} when:14d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const { text } = await safeFetch(url, { accept: 'application/rss+xml, application/xml', ...deps });
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const items = parseRssFeed(text, {
      provider: 'google_news',
      sourceName: 'Google News',
      category: group.category,
    }).filter(item => !item.published_at || new Date(item.published_at).getTime() >= cutoff)
      .filter(item => isUsefulMarketItem(item, group.market))
      .slice(0, PROVIDER_DEFAULTS.newsMaxRecordsPerGroup)
      .map(item => ({
        ...item,
        queryGroup: group.key,
        tags: group.market ? [`market:${group.market}`] : [],
      }));
    return { status: providerStatus('google_news', 'success', { group: group.key, items: items.length }), items };
  } catch (e) {
    return { status: providerStatus('google_news', classifyError(e), { group: group.key, message: safeErr(e) }), items: [] };
  }
}

export async function fetchAlphaVantage(symbolMeta, apiKey, deps = {}) {
  if (!apiKey) return { status: providerStatus('alpha_vantage', 'missing_config'), dataPoint: null };
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbolMeta.symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const { text } = await safeFetch(url, { accept: 'application/json', ...deps });
    const json = JSON.parse(text);
    if (json?.Note || json?.Information) return { status: providerStatus('alpha_vantage', 'rate_limited', { symbol: symbolMeta.symbol }), dataPoint: null };
    const dataPoint = parseAlphaVantageQuote(json, symbolMeta);
    return { status: providerStatus('alpha_vantage', dataPoint ? 'success' : 'malformed', { symbol: symbolMeta.symbol }), dataPoint };
  } catch (e) {
    return { status: providerStatus('alpha_vantage', classifyError(e), { symbol: symbolMeta.symbol, message: safeErr(e) }), dataPoint: null };
  }
}

// Convenience: the configured feed sets (used by the pipeline).
export function officialFeeds() { return OFFICIAL_RSS; }
export function industryFeeds() { return INDUSTRY_RSS.filter(f => f.verified); }
export function newsSearchGroups() { return NEWS_QUERY_GROUPS; }
export function gdeltGroups() { return GDELT_QUERY_GROUPS; }
export function alphaVantageSymbols() { return ALPHA_VANTAGE_SYMBOLS.filter(s => s.verified); }

// ── Error classification (never leak secrets/headers) ────────────────────────
function classifyError(e) {
  if (e?.name === 'AbortError') return 'timeout';
  if (e?.httpStatus === 429) return 'rate_limited';
  if (/too large/.test(e?.message || '')) return 'malformed';
  if (/not allowlisted|invalid url/.test(e?.message || '')) return 'error';
  return 'error';
}
function safeErr(e) {
  // bounded, no headers/keys — messages here are our own strings or "http NNN"
  return boundedString(e?.message || 'error', 120);
}

export const __private = { decodeEntities, stripTags, classifyError, clamp };
