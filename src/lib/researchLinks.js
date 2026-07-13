// Sprint 12 — Owner Research Hub link builder.
//
// Pure helper: takes a contact and returns ready-to-open research URLs so
// Brandon never re-types owner/address data into Google, Whitepages, Maps,
// LinkedIn, a county appraiser site, or a Secretary of State search.
// Generated links only — no APIs, no scraping. Every link opens in a new tab.

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'Washington DC',
};

const ENTITY_KEYWORDS = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|holdings|properties|investments|capital|group|trust|partners|partnership|lp|llp|ltd|limited|enterprises|ventures|co)\b\.?/i;

export function isEntityName(name) {
  return ENTITY_KEYWORDS.test(name ?? '');
}

function g(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// Accepts whatever gets pasted — "linkedin.com/in/xyz", "www.linkedin.com/…",
// full https URLs — and returns a clean https:// URL, or '' if empty.
export function normalizeLinkedinUrl(value) {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

// "Carrollton, TX" out of market/address/state fields, best-effort.
function cityState(contact) {
  const state = (contact.state ?? '').trim();
  let city = (contact.city ?? '').trim();
  if (!city && contact.market?.includes(',')) city = contact.market.split(',')[0].trim();
  return { city, state };
}

function whitepagesUrl(contact, city, state) {
  const name = (contact.ownerName ?? '').trim();
  const slug = (s) => s.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
  if (name && !isEntityName(name)) {
    let url = `https://www.whitepages.com/name/${slug(name)}`;
    if (city && state) url += `/${slug(city)}-${state.toUpperCase()}`;
    return url;
  }
  // Entity owners / no personal name: fall back to a targeted Google query
  // built from the best available combination of name, location, and phone.
  const bits = [
    'site:whitepages.com',
    name ? `"${name}"` : '',
    city ? `"${city}"` : '',
    state,
    contact.phone ?? '',
  ].filter(Boolean).join(' ');
  return bits === 'site:whitepages.com' ? null : g(bits);
}

// Returns [{ key, label, href, title }] — only links there's enough data for.
export function buildResearchLinks(contact) {
  if (!contact) return [];
  const links = [];
  const owner = (contact.ownerEntity || contact.ownerName || '').trim();
  const facility = (contact.facilityName ?? '').trim();
  const address = (contact.address ?? '').trim();
  const phone = (contact.phone ?? '').trim();
  const { city, state } = cityState(contact);
  const stateName = STATE_NAMES[state.toUpperCase()] ?? state;
  const marketBits = [city, state].filter(Boolean).join(' ');
  const entity = isEntityName(owner);

  if (owner) {
    links.push({
      key: 'googleOwner', label: 'Google Owner',
      href: g([`"${owner}"`, 'self storage', marketBits].filter(Boolean).join(' ')),
      title: 'Google the owner name + self storage + market',
    });
  }
  if (facility) {
    links.push({
      key: 'googleFacility', label: 'Google Facility',
      href: g([`"${facility}"`, 'self storage', marketBits].filter(Boolean).join(' ')),
      title: 'Google the facility name',
    });
  }
  if (address) {
    links.push({
      key: 'maps', label: 'Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      title: 'Property address on Google Maps',
    });
    links.push({
      key: 'googleAddress', label: 'Google Address',
      href: g(`"${address}"`),
      title: 'Google the property address',
    });
  } else if (facility) {
    links.push({
      key: 'maps', label: 'Maps',
      href: `https://www.google.com/maps/search/${encodeURIComponent([facility, 'self storage', marketBits].filter(Boolean).join(' '))}`,
      title: 'Facility on Google Maps',
    });
  }

  const wp = whitepagesUrl(contact, city, state);
  if (wp) links.push({ key: 'whitepages', label: 'Whitepages', href: wp, title: 'Whitepages people search' });
  else if (phone) links.push({ key: 'whitepages', label: 'Whitepages', href: g(`site:whitepages.com ${phone}`), title: 'Whitepages by phone' });

  const savedLinkedin = normalizeLinkedinUrl(contact.linkedinUrl);
  if (savedLinkedin) {
    links.push({
      key: 'linkedin', label: 'LinkedIn ★',
      href: savedLinkedin,
      title: 'Open the saved LinkedIn profile',
      emphasized: true,
    });
  } else if (owner && !entity) {
    links.push({
      key: 'linkedin', label: 'LinkedIn',
      href: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${owner} self storage`)}`,
      title: 'LinkedIn people search',
    });
  } else if (owner) {
    links.push({
      key: 'linkedin', label: 'LinkedIn',
      href: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(owner)}`,
      title: 'LinkedIn company search',
    });
  }

  if (address || (facility && marketBits)) {
    links.push({
      key: 'county', label: 'County Appraiser',
      href: g(['"property appraiser"', address || `${facility} ${marketBits}`].join(' ')),
      title: 'Find the county property appraiser record',
    });
  }

  if (owner && (stateName || entity)) {
    links.push({
      key: 'sos', label: entity ? 'Secretary of State ★' : 'Secretary of State',
      href: g([stateName, 'secretary of state business search', `"${owner}"`].filter(Boolean).join(' ')),
      title: entity
        ? 'Entity-style owner — look up the LLC/corp registration and its managers'
        : 'State business registration search',
      emphasized: entity,
    });
  }

  // Paid platforms Brandon is logged into. Their app content isn't
  // Google-indexable, so open the platform's search directly — the owner
  // data to paste is right on the card.
  links.push({ key: 'reonomy', label: 'Reonomy', href: 'https://app.reonomy.com/search', title: 'Open Reonomy search (paste the address)' });
  links.push({ key: 'costar', label: 'CoStar', href: 'https://product.costar.com/search', title: 'Open CoStar search (paste the address)' });
  links.push({ key: 'tractiq', label: 'TractIQ', href: 'https://app.tractiq.com/', title: 'Open TractIQ (search the facility/market)' });

  return links;
}

// The tight six-button set for Call Mode: Maps, Whitepages, Google, LinkedIn, County, SOS.
const STRIP_KEYS = ['maps', 'whitepages', 'googleOwner', 'linkedin', 'county', 'sos'];
const STRIP_LABELS = { googleOwner: 'Google', county: 'County', sos: 'SOS' };

export function buildResearchStrip(contact) {
  const all = buildResearchLinks(contact);
  const byKey = new Map(all.map(l => [l.key, l]));
  // If there's no owner to google, fall back to facility/address search.
  if (!byKey.has('googleOwner')) {
    const fallback = byKey.get('googleFacility') ?? byKey.get('googleAddress');
    if (fallback) byKey.set('googleOwner', { ...fallback, key: 'googleOwner' });
  }
  return STRIP_KEYS
    .map(key => byKey.get(key))
    .filter(Boolean)
    .map(l => ({ ...l, label: STRIP_LABELS[l.key] ? (l.emphasized ? `${STRIP_LABELS[l.key]} ★` : STRIP_LABELS[l.key]) : l.label }));
}
