import assert from 'node:assert/strict';
import {
  parseRssFeed,
  parseTreasuryXml,
  parseFredObservations,
  parseGdelt,
  parseAlphaVantageQuote,
  providerStatus,
  safeFetch,
  fetchFredSeries,
  fetchTreasury,
} from '../api/_intelligenceProviders.js';

// ── RSS / Atom parsing ───────────────────────────────────────────────────────
{
  const rss = `<?xml version="1.0"?><rss><channel>
    <item>
      <title>Federal Reserve issues FOMC statement</title>
      <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260722a.htm?utm_source=rss</link>
      <pubDate>Wed, 22 Jul 2026 18:00:00 GMT</pubDate>
      <description><![CDATA[The Committee decided to <b>maintain</b> the target range.]]></description>
    </item>
    <item><title>No link here</title></item>
  </channel></rss>`;
  const items = parseRssFeed(rss, { provider: 'federal_reserve', sourceName: 'Fed Press' });
  assert.equal(items.length, 1, 'item without a link is dropped');
  assert.equal(items[0].title, 'Federal Reserve issues FOMC statement');
  assert.equal(items[0].source_domain, 'federalreserve.gov');
  assert.equal(items[0].canonical_url, 'https://federalreserve.gov/newsevents/pressreleases/monetary20260722a.htm', 'tracking param stripped');
  assert.ok(items[0].published_at.startsWith('2026-07-22'));
  assert.equal(items[0].raw_excerpt, 'The Committee decided to maintain the target range.', 'CDATA + tags cleaned');

  // Atom variant
  const atom = `<feed><entry><title>Speech on the economy</title>
    <link href="https://www.federalreserve.gov/newsevents/speech/powell20260721a.htm"/>
    <published>2026-07-21T14:00:00Z</published><summary>Remarks.</summary></entry></feed>`;
  const a = parseRssFeed(atom, { provider: 'federal_reserve', sourceName: 'Fed Speeches' });
  assert.equal(a.length, 1);
  assert.equal(a[0].canonical_url, 'https://federalreserve.gov/newsevents/speech/powell20260721a.htm');
}

// ── Treasury XML parsing ─────────────────────────────────────────────────────
{
  const xml = `<feed>
    <entry><content><m:properties>
      <d:NEW_DATE>2026-07-22T00:00:00</d:NEW_DATE>
      <d:BC_1MONTH>5.10</d:BC_1MONTH><d:BC_3MONTH>4.80</d:BC_3MONTH>
      <d:BC_2YEAR>4.55</d:BC_2YEAR><d:BC_10YEAR>4.25</d:BC_10YEAR><d:BC_30YEAR>4.60</d:BC_30YEAR>
    </m:properties></content></entry>
    <entry><content><m:properties>
      <d:NEW_DATE>2026-07-21T00:00:00</d:NEW_DATE>
      <d:BC_2YEAR>4.50</d:BC_2YEAR><d:BC_10YEAR>4.20</d:BC_10YEAR>
    </m:properties></content></entry>
  </feed>`;
  const series = parseTreasuryXml(xml);
  assert.equal(series.y2.length, 2);
  assert.deepEqual(series.y2[0], { date: '2026-07-22', value: 4.55 });
  assert.equal(series.y10[1].value, 4.20);
  assert.equal(series.m1.length, 1);
  assert.ok(!series.y5, 'absent tenor is simply not present');
}

// ── FRED observations parsing ────────────────────────────────────────────────
{
  const json = { observations: [
    { date: '2026-07-22', value: '4.33' },
    { date: '2026-07-21', value: '.' },       // missing → skipped
    { date: 'bad-date',   value: '4.30' },     // malformed date → skipped
    { date: '2026-07-20', value: '4.31' },
  ] };
  const pts = parseFredObservations(json, { key: 'fed_funds', unit: '%' });
  assert.equal(pts.length, 2, 'missing "." and bad date rows dropped');
  assert.deepEqual(pts[0], { series_key: 'fed_funds', provider: 'fred', observation_date: '2026-07-22', value: 4.33, unit: '%' });
}

// ── GDELT parsing ────────────────────────────────────────────────────────────
{
  const json = { articles: [
    { url: 'https://globest.com/a?utm_medium=x', title: 'Self-storage portfolio trades', seendate: '20260722T131500Z', domain: 'globest.com' },
    { url: '', title: 'no url' },
    { url: 'https://x.com/b', title: '' },
  ] };
  const items = parseGdelt(json, { queryGroup: 'self_storage', category: 'self_storage' });
  assert.equal(items.length, 1, 'blank url/title dropped');
  assert.equal(items[0].canonical_url, 'https://globest.com/a');
  assert.equal(items[0].raw_excerpt, '', 'no body excerpt stored (copyright-safe)');
  assert.ok(items[0].published_at.startsWith('2026-07-22'));
  assert.equal(items[0].category, 'self_storage');
}

// ── Alpha Vantage parsing ────────────────────────────────────────────────────
{
  const json = { 'Global Quote': { '05. price': '250.34', '07. latest trading day': '2026-07-22', '10. change percent': '1.2345%' } };
  const dp = parseAlphaVantageQuote(json, { symbol: 'PSA', label: 'Public Storage' });
  assert.equal(dp.series_key, 'equity_psa');
  assert.equal(dp.value, 250.34);
  assert.equal(dp.observation_date, '2026-07-22');
  assert.equal(dp.metadata.delayed, true);
  assert.ok(Math.abs(dp.metadata.changePct - 1.2345) < 1e-9);
  assert.equal(parseAlphaVantageQuote({}, { symbol: 'X' }), null, 'missing quote → null');
}

// ── providerStatus shape ─────────────────────────────────────────────────────
{
  const s = providerStatus('fred', 'success', { points: 5 });
  assert.equal(s.provider, 'fred');
  assert.equal(s.state, 'success');
  assert.equal(s.points, 5);
  assert.ok(s.at);
}

// ── safeFetch guards (no real network — injected fetchImpl / host allowlist) ──
{
  // Host not on the allowlist is refused before any fetch happens.
  let called = false;
  await assert.rejects(
    () => safeFetch('https://evil.example.com/x', { fetchImpl: async () => { called = true; return {}; } }),
    /not allowlisted/,
  );
  assert.equal(called, false, 'disallowed host never triggers a fetch (SSRF guard)');

  // Allowlisted API host with an injected fetch returns parsed text.
  const okFetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    text: async () => '{"observations":[{"date":"2026-07-22","value":"4.33"}]}',
  });
  const res = await fetchFredSeries({ key: 'fed_funds', seriesId: 'DFF', unit: '%' }, 'FAKEKEY', { fetchImpl: okFetch });
  assert.equal(res.status.state, 'success');
  assert.equal(res.dataPoints.length, 1);

  // Missing API key → missing_config, no fetch.
  const noKey = await fetchFredSeries({ key: 'sofr', seriesId: 'SOFR', unit: '%' }, '', {});
  assert.equal(noKey.status.state, 'missing_config');

  // Timeout (AbortError) is classified as timeout, isolated (empty series).
  const abortFetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  const t = await fetchTreasury('202607', { fetchImpl: abortFetch });
  assert.equal(t.status.state, 'timeout');
  assert.deepEqual(t.series, {});

  // Oversized response rejected.
  const bigFetch = async () => ({ ok: true, headers: { get: () => 'application/json' }, text: async () => 'x'.repeat(10) });
  await assert.rejects(() => safeFetch('https://api.stlouisfed.org/x', { fetchImpl: bigFetch, maxBytes: 5 }), /too large/);
}

console.log('intelligence provider tests passed');
