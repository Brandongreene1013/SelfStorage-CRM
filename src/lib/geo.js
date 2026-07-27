// Location sort support for the Database view (Sprint 22).
//
// Distance sorting works entirely offline against two static lookup files in
// public/geo/ (built by scripts/build-geo-data.mjs from the US Census
// gazetteer): ZIP → [lat, lng] and "city,st" → [lat, lng]. We pull the ZIP
// out of each contact's address string — the imported addresses are too messy
// for city parsing ("Texas" spelled out, city sometimes missing) but almost
// all of them end in a usable ZIP.

let geoDataPromise = null;

// Lazy-load and cache both lookup tables (~500KB gzipped total). Only fetched
// the first time a location sort is actually used.
export function loadGeoData() {
  if (!geoDataPromise) {
    geoDataPromise = Promise.all([
      fetch('/geo/zips.json').then(r => { if (!r.ok) throw new Error('zips.json failed'); return r.json(); }),
      fetch('/geo/places.json').then(r => { if (!r.ok) throw new Error('places.json failed'); return r.json(); }),
    ]).then(([zips, places]) => ({ zips, places }))
      .catch(err => { geoDataPromise = null; throw err; });
  }
  return geoDataPromise;
}

// Last 5-digit run in the address is nearly always the ZIP; ignore ZIP+4
// suffixes and earlier street numbers.
export function extractZip(address) {
  if (!address) return null;
  const matches = String(address).match(/\b\d{5}\b(?!.*\b\d{5}\b)/);
  return matches ? matches[0] : null;
}

export function haversineMiles([lat1, lng1], [lat2, lng2]) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// A geographically balanced set of common U.S. market anchors. DFW uses a
// metroplex midpoint rather than either downtown so Arlington/Mid-Cities
// distances read sensibly.
export const PRESET_ANCHORS = [
  { label: 'New York', coords: [40.7128, -74.006] },
  { label: 'Atlanta', coords: [33.749, -84.388] },
  { label: 'Chicago', coords: [41.8781, -87.6298] },
  { label: 'DFW', coords: [32.8, -97.05] },
  { label: 'Los Angeles', coords: [34.0522, -118.2437] },
  { label: 'Miami', coords: [25.7617, -80.1918] },
  { label: 'Phoenix', coords: [33.4484, -112.074] },
  { label: 'Seattle', coords: [47.6062, -122.3321] },
];

const STATE_ABBR = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok',
  oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi',
  wyoming: 'wy', 'district of columbia': 'dc', 'puerto rico': 'pr',
};

function parseCityAndState(query) {
  const commaParts = query.split(',').map(part => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) return { city: commaParts[0], state: commaParts[1] };

  const stateNames = Object.keys(STATE_ABBR).sort((a, b) => b.length - a.length);
  const fullState = stateNames.find(name => query.endsWith(` ${name}`));
  if (fullState) return {
    city: query.slice(0, -(fullState.length + 1)).trim(),
    state: fullState,
  };

  const abbreviation = query.match(/^(.+?)\s+([a-z]{2})$/);
  if (abbreviation) return { city: abbreviation[1].trim(), state: abbreviation[2] };
  return { city: query, state: null };
}

// Turn what Brandon types into coordinates. Accepts a ZIP ("76033"), a
// "city, ST" / "city ST" / "city, state" value, or an unambiguous bare city
// name anywhere in the country. Returns { label, coords } or null.
export function resolveAnchor(query, geo) {
  if (!query || !geo) return null;
  const q = String(query).trim().toLowerCase();
  if (!q) return null;

  const zipMatch = q.match(/^\d{5}$/);
  if (zipMatch) {
    const coords = geo.zips[q];
    return coords ? { label: `ZIP ${q}`, coords } : null;
  }

  const titleCase = s => s.replace(/\b\w/g, ch => ch.toUpperCase());
  const parsed = parseCityAndState(q);
  const city = parsed.city?.replace(/\s+/g, ' ');
  if (!city) return null;
  let state = parsed.state;
  if (state) state = STATE_ABBR[state] || (state.length === 2 ? state : null);

  if (state) {
    const coords = geo.places[`${city},${state}`];
    return coords ? { label: `${titleCase(city)}, ${state.toUpperCase()}`, coords } : null;
  }

  // A bare city is accepted only when it has one national match. Ambiguous
  // names require a state instead of silently favoring one part of the country.
  const hits = Object.keys(geo.places).filter(k => k.startsWith(`${city},`));
  if (hits.length === 1) {
    const st = hits[0].split(',')[1];
    return { label: `${titleCase(city)}, ${st.toUpperCase()}`, coords: geo.places[hits[0]] };
  }
  return null;
}

// Distance for one contact, or null when the address has no usable ZIP.
export function contactDistanceMiles(contact, anchorCoords, zips) {
  const zip = extractZip(contact.address);
  const coords = zip ? zips[zip] : null;
  return coords ? haversineMiles(coords, anchorCoords) : null;
}
