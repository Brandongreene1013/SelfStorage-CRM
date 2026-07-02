// Sprint 11 — Duplicate Review Center detection engine.
//
// Pure functions only (no Supabase, no React) so the logic can be exercised
// from Node for QA. Scans contacts already IN the database — this is separate
// from the import-time duplicate preview in useDatabase.js, which compares
// incoming rows against existing contacts. Here we compare existing contacts
// against each other and cluster likely duplicates into reviewable groups.

const ADDRESS_TOKEN_MAP = {
  street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln',
  boulevard: 'blvd', highway: 'hwy', parkway: 'pkwy', place: 'pl',
  court: 'ct', circle: 'cir', terrace: 'ter', trail: 'trl',
  suite: 'ste', apartment: 'apt', building: 'bldg',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};

// Entity noise stripped for "light" owner-name normalization: "Teekam Holdings
// LLC" and "Teekam Holdings" should read as the same owner.
const ENTITY_NOISE_TOKENS = new Set([
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'lp', 'llp', 'ltd', 'limited', 'trust', 'trustee', 'revocable', 'living',
  'family', 'partners', 'partnership', 'holdings', 'properties', 'the',
  'et', 'al', 'etal', 'jr', 'sr', 'ii', 'iii', 'dr', 'mr', 'mrs', 'ms',
]);

function baseNormalize(value) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeAddress(value) {
  const tokens = baseNormalize(value).split(' ').filter(Boolean)
    .map(t => ADDRESS_TOKEN_MAP[t] ?? t);
  return tokens.join(' ');
}

export function normalizeOwnerName(value) {
  return baseNormalize(value).split(' ').filter(t => t && !ENTITY_NOISE_TOKENS.has(t)).join(' ');
}

export function normalizeFacilityName(value) {
  return baseNormalize(value);
}

export function phoneKey(phone) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

function contactPhoneKeys(contact) {
  const keys = new Map(); // key -> 'primary' | 'alternate'
  const primary = phoneKey(contact.phone);
  if (primary) keys.set(primary, 'primary');
  (contact.alternatePhones ?? []).forEach(p => {
    const key = phoneKey(p?.phone);
    if (key && !keys.has(key)) keys.set(key, 'alternate');
  });
  return keys;
}

function marketKey(contact) {
  return baseNormalize(contact.market || [contact.city, contact.state].filter(Boolean).join(' ') || contact.state);
}

// "Similar" names: exact normalized match, or the shorter name's tokens are a
// subset of the longer's (so "Teekam" matches "Teekam Holdings"). Requires a
// meaningful token so "a" never matches everything.
function nameSimilarity(aKey, bKey) {
  if (!aKey || !bKey) return 'none';
  if (aKey === bKey) return 'same';
  const aTokens = aKey.split(' ');
  const bTokens = bKey.split(' ');
  const [shorter, longer] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  const longerSet = new Set(longer);
  const meaningful = shorter.some(t => t.length >= 3);
  if (meaningful && shorter.every(t => longerSet.has(t))) return 'similar';
  return 'none';
}

export const DUPLICATE_REASONS = {
  SAME_ADDRESS_OWNER: 'Same address + owner',
  SAME_ADDRESS_FACILITY: 'Same address + facility',
  SAME_PHONE: 'Same phone',
  ALTERNATE_PHONE_MATCH: 'Alternate phone match',
  SAME_EMAIL: 'Same email',
  SAME_OWNER_MARKET: 'Same owner + market',
  SAME_FACILITY_MARKET: 'Same facility + market',
  SIMILAR_OWNER_SAME_ADDRESS: 'Same address + similar owner',
};

const HIGH_CONFIDENCE_REASONS = new Set([
  DUPLICATE_REASONS.SAME_ADDRESS_OWNER,
  DUPLICATE_REASONS.SAME_ADDRESS_FACILITY,
  DUPLICATE_REASONS.SAME_PHONE,
  DUPLICATE_REASONS.ALTERNATE_PHONE_MATCH,
  DUPLICATE_REASONS.SAME_EMAIL,
]);

// Compare one pair of contacts and return every matching reason.
function pairReasons(a, b) {
  const reasons = [];

  const aPhones = contactPhoneKeys(a);
  const bPhones = contactPhoneKeys(b);
  let phoneReason = null;
  for (const [key, aKind] of aPhones) {
    const bKind = bPhones.get(key);
    if (!bKind) continue;
    if (aKind === 'primary' && bKind === 'primary') { phoneReason = DUPLICATE_REASONS.SAME_PHONE; break; }
    phoneReason = DUPLICATE_REASONS.ALTERNATE_PHONE_MATCH;
  }
  if (phoneReason) reasons.push(phoneReason);

  const aEmail = (a.email ?? '').trim().toLowerCase();
  const bEmail = (b.email ?? '').trim().toLowerCase();
  if (aEmail && aEmail === bEmail) reasons.push(DUPLICATE_REASONS.SAME_EMAIL);

  const aAddr = normalizeAddress(a.address);
  const bAddr = normalizeAddress(b.address);
  const aOwner = normalizeOwnerName(a.ownerName);
  const bOwner = normalizeOwnerName(b.ownerName);
  const aFacility = normalizeFacilityName(a.facilityName);
  const bFacility = normalizeFacilityName(b.facilityName);
  const ownerSim = nameSimilarity(aOwner, bOwner);
  const facilitySim = nameSimilarity(aFacility, bFacility);

  if (aAddr && aAddr === bAddr) {
    if (ownerSim === 'same') reasons.push(DUPLICATE_REASONS.SAME_ADDRESS_OWNER);
    else if (ownerSim === 'similar') reasons.push(DUPLICATE_REASONS.SIMILAR_OWNER_SAME_ADDRESS);
    if (facilitySim !== 'none') reasons.push(DUPLICATE_REASONS.SAME_ADDRESS_FACILITY);
  }

  const aMarket = marketKey(a);
  const bMarket = marketKey(b);
  if (aMarket && aMarket === bMarket) {
    // Require a reasonably specific name so "storage" alone can't cluster a market.
    if (ownerSim === 'same' && aOwner.length >= 4 && !reasons.includes(DUPLICATE_REASONS.SAME_ADDRESS_OWNER)) {
      reasons.push(DUPLICATE_REASONS.SAME_OWNER_MARKET);
    }
    if (facilitySim === 'same' && aFacility.length >= 4 && !reasons.includes(DUPLICATE_REASONS.SAME_ADDRESS_FACILITY)) {
      reasons.push(DUPLICATE_REASONS.SAME_FACILITY_MARKET);
    }
  }

  return reasons;
}

export function confidenceForReasons(reasons) {
  if (reasons.some(r => HIGH_CONFIDENCE_REASONS.has(r))) return 'High';
  // Similar-but-not-identical owner at the same address is a strong signal but
  // not certain; two medium signals together also read as Medium (not Low).
  if (reasons.length > 0) return 'Medium';
  return null;
}

// ── Candidate generation ─────────────────────────────────────────────────────
// Bucket contacts by shared keys so we only run pairReasons on plausible pairs
// instead of all n² combinations.
function candidatePairs(contacts) {
  const buckets = new Map();
  function add(bucketKey, contact) {
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(contact);
  }

  contacts.forEach(c => {
    for (const key of contactPhoneKeys(c).keys()) add(`p:${key}`, c);
    const email = (c.email ?? '').trim().toLowerCase();
    if (email) add(`e:${email}`, c);
    const addr = normalizeAddress(c.address);
    if (addr) add(`a:${addr}`, c);
    const market = marketKey(c);
    const owner = normalizeOwnerName(c.ownerName);
    const facility = normalizeFacilityName(c.facilityName);
    if (market && owner.length >= 4) add(`om:${owner}|${market}`, c);
    if (market && facility.length >= 4) add(`fm:${facility}|${market}`, c);
    // Similar-name matching inside an address bucket needs each token indexed
    // too, so "Teekam" and "Dr Teekam" land in the same bucket.
    if (addr && owner) owner.split(' ').filter(t => t.length >= 3).forEach(t => add(`at:${addr}|${t}`, c));
  });

  const seen = new Set();
  const pairs = [];
  for (const members of buckets.values()) {
    if (members.length < 2 || members.length > 40) continue; // >40 sharing a key is bad data, not duplicates
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        if (a.id === b.id) continue;
        const pairKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

// ── Recommended-keep scoring ─────────────────────────────────────────────────
// Higher score = the record Brandon has actually worked = the one to keep.
// Mirrors the sprint's priority order: call history, open tasks, notes,
// worked status over fresh import, completeness, then age.
const WORKED_STATUSES = new Set(['conversation', 'appointment', 'callback']);

export function keepScore(contact, { openTaskCount = 0 } = {}) {
  let s = 0;
  const calls = contact.callHistory?.length ?? 0;
  s += Math.min(calls, 10) * 30;
  s += Math.min(openTaskCount, 5) * 25;
  if ((contact.notes ?? '').trim()) s += 20;
  if (WORKED_STATUSES.has(contact.status)) s += 60;
  else if (contact.status && contact.status !== 'fresh') s += 15;
  if (contact.leadTemp) s += 10;
  if ((contact.actionLog?.length ?? 0) > 0) s += 10;
  // Manually entered / unknown-source records outrank fresh mass-list imports.
  if (!contact.source && !contact.importedAt) s += 12;
  s += [contact.ownerName, contact.facilityName, contact.phone, contact.email, contact.address]
    .filter(v => (v ?? '').trim()).length * 3;
  s += Math.min(contact.alternatePhones?.length ?? 0, 3) * 2;
  return s;
}

// A record we should never silently lose: it has real work on it.
export function isProtectedRecord(contact, { openTaskCount = 0 } = {}) {
  return (contact.callHistory?.length ?? 0) > 0 || openTaskCount > 0;
}

const STATUS_SIGNAL_LABELS = {
  conversation: 'Conversation status',
  appointment: 'Appointment set',
  callback: 'Callback promised',
};

// Sprint 12 — human-readable reasons why a record is recommended/protected,
// shown on the Duplicate Review cards so the keep recommendation isn't a
// black box. Ordered to match the keep-scoring priority.
export function keepSignals(contact, { openTaskCount = 0 } = {}) {
  const signals = [];
  const calls = contact.callHistory?.length ?? 0;
  if (calls > 0) signals.push({ label: `Has call history (${calls})`, protective: true });
  if (openTaskCount > 0) signals.push({ label: `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}`, protective: true });
  const statusLabel = STATUS_SIGNAL_LABELS[contact.status];
  if (statusLabel) signals.push({ label: statusLabel, protective: false });
  if ((contact.notes ?? '').trim()) signals.push({ label: 'Has notes', protective: false });
  if (!contact.source && !contact.importedAt) signals.push({ label: 'Manual/worked record', protective: false });
  else if (contact.source) signals.push({ label: `Imported: ${contact.source}`, protective: false, imported: true });
  return signals;
}

// ── Group detection ──────────────────────────────────────────────────────────
// Returns duplicate groups sorted High-confidence first:
// { key, confidence, reasons, memberIds, recommendedKeepId }
export function findDuplicateGroups(contacts, { getOpenTaskCount } = {}) {
  const openTaskCount = (id) => getOpenTaskCount ? getOpenTaskCount(id) : 0;
  const pairs = candidatePairs(contacts);

  // Union-find style clustering over confirmed pairs.
  const groupOf = new Map(); // contactId -> group
  const groups = [];
  for (const [a, b] of pairs) {
    const reasons = pairReasons(a, b);
    if (reasons.length === 0) continue;
    let ga = groupOf.get(a.id);
    let gb = groupOf.get(b.id);
    let group;
    if (ga && gb && ga !== gb) {
      // Merge gb into ga
      gb.members.forEach(m => { ga.members.set(m.id, m); groupOf.set(m.id, ga); });
      gb.reasons.forEach(r => ga.reasons.add(r));
      gb.members = new Map();
      gb.dead = true;
      group = ga;
    } else {
      group = ga ?? gb;
      if (!group) {
        group = { members: new Map(), reasons: new Set(), dead: false };
        groups.push(group);
      }
    }
    group.members.set(a.id, a);
    group.members.set(b.id, b);
    groupOf.set(a.id, group);
    groupOf.set(b.id, group);
    reasons.forEach(r => group.reasons.add(r));
  }

  const result = groups
    .filter(g => !g.dead && g.members.size >= 2)
    .map(g => {
      const members = [...g.members.values()];
      const reasons = [...g.reasons];
      const scored = members.map(m => ({
        contact: m,
        score: keepScore(m, { openTaskCount: openTaskCount(m.id) }),
      })).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Tie: keep the older record.
        return String(a.contact.createdAt ?? '').localeCompare(String(b.contact.createdAt ?? ''));
      });
      return {
        key: members.map(m => m.id).sort().join('|'),
        confidence: confidenceForReasons(reasons),
        reasons,
        memberIds: scored.map(s => s.contact.id),
        recommendedKeepId: scored[0].contact.id,
        scores: Object.fromEntries(scored.map(s => [s.contact.id, s.score])),
      };
    });

  const rank = { High: 0, Medium: 1 };
  return result.sort((a, b) => (rank[a.confidence] ?? 2) - (rank[b.confidence] ?? 2));
}

// ── Merge plan ───────────────────────────────────────────────────────────────
// What merging `weaker` into `master` would change. Fill blanks only, never
// overwrite populated master fields; new phone numbers become alternates.
export function buildMergePlan(master, weaker) {
  const updates = {};
  const masterKeys = new Set(contactPhoneKeys(master).keys());
  const nextAlt = Array.isArray(master.alternatePhones) ? [...master.alternatePhones] : [];
  let addedPhones = 0;

  function addPhone(phone, label) {
    const key = phoneKey(phone);
    if (!phone || !key || masterKeys.has(key)) return;
    masterKeys.add(key);
    nextAlt.push({ label: label || 'Unknown', phone });
    addedPhones += 1;
  }

  if (!(master.phone ?? '').trim() && (weaker.phone ?? '').trim()) {
    updates.phone = weaker.phone;
    const key = phoneKey(weaker.phone);
    if (key) masterKeys.add(key);
  } else {
    addPhone(weaker.phone, 'Unknown');
  }
  (weaker.alternatePhones ?? []).forEach(p => addPhone(p?.phone, p?.label));
  if (addedPhones > 0) updates.alternatePhones = nextAlt;

  const fillIfBlank = (field) => {
    if (!(master[field] ?? '').trim() && (weaker[field] ?? '').trim()) updates[field] = weaker[field];
  };
  ['ownerName', 'facilityName', 'email', 'address', 'state'].forEach(fillIfBlank);

  const noteParts = [];
  const weakerNotes = (weaker.notes ?? '').trim();
  if (weakerNotes && !((master.notes ?? '').includes(weakerNotes))) noteParts.push(weakerNotes);
  const sourceBits = [weaker.source, weaker.importFilename].filter(Boolean).join(', ');
  if (sourceBits) noteParts.push(`Merged duplicate record (source: ${sourceBits})`);
  else noteParts.push('Merged duplicate record');
  updates.notes = [(master.notes ?? '').trim(), noteParts.join(' | ')].filter(Boolean).join('\n');

  return { updates, addedPhones, filledFields: Object.keys(updates).filter(k => !['alternatePhones', 'notes'].includes(k)) };
}
