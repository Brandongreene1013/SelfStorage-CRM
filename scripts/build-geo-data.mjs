// Builds the static geo lookup files used by the location sort in the
// Database view (src/lib/geo.js). Downloads the US Census Bureau gazetteer
// (public domain) and emits two compact JSON maps into public/geo/:
//
//   zips.json    — { "75001": [32.96, -96.838], ... }  ZCTA centroids
//   places.json  — { "dallas,tx": [32.79, -96.766], ... }  city/town centroids
//
// Run once with `node scripts/build-geo-data.mjs` and commit the outputs.
// Only needs re-running if the Census releases a new gazetteer year and we
// care about new ZIP codes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const YEAR = '2024';
const BASE = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${YEAR}_Gazetteer`;

// Minimal zip extractor: gazetteer archives hold a single text file, stored
// or deflated. Reads the central directory to find it.
function unzipSingleFile(buf) {
  // Find end-of-central-directory record
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('EOCD not found');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // First central directory entry
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('bad central dir');
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  // Local header → data start
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? inflateRawSync(data) : Buffer.from(data);
}

async function fetchGazetteer(file) {
  const url = `${BASE}/${file}`;
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return unzipSingleFile(buf).toString('utf8');
}

function round(n) {
  return Math.round(Number(n) * 1000) / 1000; // ~110m precision, plenty
}

// ── ZCTAs (ZIP code tabulation areas) ────────────────────────────────────────
const zctaText = await fetchGazetteer(`${YEAR}_Gaz_zcta_national.zip`);
const zips = {};
for (const line of zctaText.split('\n').slice(1)) {
  const cols = line.split('\t');
  if (cols.length < 7) continue;
  const zip = cols[0].trim();
  const lat = round(cols[cols.length - 2]);
  const lng = round(cols[cols.length - 1]);
  if (/^\d{5}$/.test(zip) && Number.isFinite(lat) && Number.isFinite(lng)) {
    zips[zip] = [lat, lng];
  }
}
console.log(`ZCTAs: ${Object.keys(zips).length}`);

// ── Places (cities, towns, CDPs) ─────────────────────────────────────────────
const placeText = await fetchGazetteer(`${YEAR}_Gaz_place_national.zip`);
const places = {};
for (const line of placeText.split('\n').slice(1)) {
  const cols = line.split('\t');
  if (cols.length < 10) continue;
  const state = cols[0].trim().toLowerCase();
  let name = cols[3].trim().toLowerCase();
  // Strip legal suffixes: "dallas city" → "dallas", "the woodlands cdp" → "the woodlands"
  name = name.replace(/\s+(city|town|village|borough|cdp|municipality|comunidad|zona urbana|urban county|consolidated government|metro government|metropolitan government|unified government|city and borough)( \(balance\))?$/i, '');
  if (!name || !state) continue;
  const lat = round(cols[cols.length - 2]);
  const lng = round(cols[cols.length - 1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const key = `${name},${state}`;
  // Bigger places win key collisions (population isn't in this file; land area
  // is a decent proxy and incorporated places come before CDPs anyway).
  if (!(key in places)) places[key] = [lat, lng];
}
console.log(`Places: ${Object.keys(places).length}`);

mkdirSync('public/geo', { recursive: true });
writeFileSync('public/geo/zips.json', JSON.stringify(zips));
writeFileSync('public/geo/places.json', JSON.stringify(places));
console.log('Wrote public/geo/zips.json and public/geo/places.json');
