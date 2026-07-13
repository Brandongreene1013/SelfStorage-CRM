// Same-owner radar: while Brandon rolls a list, spot contacts elsewhere in the
// database that look like the SAME OWNER holding a DIFFERENT property, so the
// new row can be folded into the existing owner's card as an additional
// property. Pure functions only (no Supabase, no React) — QA-able from Node.
//
// This deliberately complements the Duplicate Review Center: duplicates are
// "same owner, same property" (clean up); the radar is "same owner, different
// property" (portfolio signal — link, don't delete blindly).

import {
  normalizeAddress,
  normalizeOwnerName,
  normalizeFacilityName,
  nameSimilarity,
  phoneKey,
  buildMergePlan,
} from './duplicateReview.js';

function contactPhoneKeys(contact) {
  const keys = new Set();
  const primary = phoneKey(contact.phone);
  if (primary) keys.add(primary);
  (contact.alternatePhones ?? []).forEach(p => {
    const key = phoneKey(p?.phone);
    if (key) keys.add(key);
  });
  return keys;
}

// A property identity key: address wins, facility name is the fallback.
function propertyKey(facilityName, address) {
  return normalizeAddress(address) || normalizeFacilityName(facilityName);
}

// Every property a contact is known to hold: their primary facility/address
// plus the ownedProperties list.
export function allPropertyKeys(contact) {
  const keys = new Set();
  const primary = propertyKey(contact.facilityName, contact.address);
  if (primary) keys.add(primary);
  (contact.ownedProperties ?? []).forEach(p => {
    const key = propertyKey(p?.facilityName, p?.address);
    if (key) keys.add(key);
  });
  return keys;
}

export const SAME_OWNER_REASONS = {
  SAME_PHONE: 'Same phone',
  SAME_EMAIL: 'Same email',
  SAME_OWNER_NAME: 'Same owner name',
  SIMILAR_OWNER_NAME: 'Similar owner name',
  SAME_ENTITY: 'Same ownership entity',
  SIMILAR_ENTITY: 'Similar ownership entity',
  SIMILAR_FACILITY: 'Similar facility name',
  SAME_MARKET: 'Similar location',
};

const FACILITY_NOISE = new Set([
  'self', 'storage', 'storages', 'mini', 'rv', 'boat', 'vehicle', 'climate',
  'controlled', 'units', 'unit', 'facility', 'facilities', 'llc', 'inc',
  'properties', 'property',
]);

function meaningfulTokens(value, noise = new Set()) {
  return normalizeFacilityName(value)
    .split(' ')
    .filter(t => t.length >= 3 && !noise.has(t));
}

function hasSharedMeaningfulToken(a, b, noise) {
  const aTokens = meaningfulTokens(a, noise);
  const bSet = new Set(meaningfulTokens(b, noise));
  return aTokens.some(t => bSet.has(t));
}

function facilitySimilarity(a, b) {
  const aKey = normalizeFacilityName(a);
  const bKey = normalizeFacilityName(b);
  const direct = nameSimilarity(aKey, bKey);
  if (direct !== 'none') return direct;
  return hasSharedMeaningfulToken(a, b, FACILITY_NOISE) ? 'similar' : 'none';
}

function locationKey(contact) {
  const market = normalizeFacilityName(contact.market || [contact.city, contact.state].filter(Boolean).join(' '));
  if (market) return market;
  const parts = String(contact.address || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[parts.length - 2];
    const state = (parts[parts.length - 1].match(/\b[A-Z]{2}\b/) || [contact.state || ''])[0];
    return normalizeFacilityName([city, state].filter(Boolean).join(' '));
  }
  return '';
}

function hasSimilarLocation(a, b) {
  const aLoc = locationKey(a);
  const bLoc = locationKey(b);
  return !!aLoc && !!bLoc && aLoc === bLoc;
}

function pushUnique(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

// Reasons contact `a` and contact `b` look like the same owner. Empty = no match.
export function sameOwnerReasons(a, b) {
  const reasons = [];

  const aPhones = contactPhoneKeys(a);
  for (const key of contactPhoneKeys(b)) {
    if (aPhones.has(key)) { pushUnique(reasons, SAME_OWNER_REASONS.SAME_PHONE); break; }
  }

  const aEmail = (a.email ?? '').trim().toLowerCase();
  const bEmail = (b.email ?? '').trim().toLowerCase();
  if (aEmail && aEmail === bEmail) pushUnique(reasons, SAME_OWNER_REASONS.SAME_EMAIL);

  const ownerPairs = [
    [normalizeOwnerName(a.ownerName), normalizeOwnerName(b.ownerName)],
    [normalizeOwnerName(a.ownerName), normalizeOwnerName(b.ownerEntity)],
    [normalizeOwnerName(a.ownerEntity), normalizeOwnerName(b.ownerName)],
  ];
  for (const [left, right] of ownerPairs) {
    if (left.length < 4 || right.length < 4) continue;
    const sim = nameSimilarity(left, right);
    if (sim === 'same') pushUnique(reasons, SAME_OWNER_REASONS.SAME_OWNER_NAME);
    else if (sim === 'similar') pushUnique(reasons, SAME_OWNER_REASONS.SIMILAR_OWNER_NAME);
  }

  const aEntity = normalizeOwnerName(a.ownerEntity);
  const bEntity = normalizeOwnerName(b.ownerEntity);
  if (aEntity.length >= 4 && bEntity.length >= 4) {
    const sim = nameSimilarity(aEntity, bEntity);
    if (sim === 'same') pushUnique(reasons, SAME_OWNER_REASONS.SAME_ENTITY);
    else if (sim === 'similar') pushUnique(reasons, SAME_OWNER_REASONS.SIMILAR_ENTITY);
  }

  const facilitySim = facilitySimilarity(a.facilityName, b.facilityName);
  const similarLocation = hasSimilarLocation(a, b);
  if (facilitySim !== 'none' && similarLocation) {
    pushUnique(reasons, SAME_OWNER_REASONS.SIMILAR_FACILITY);
    pushUnique(reasons, SAME_OWNER_REASONS.SAME_MARKET);
  } else if (similarLocation && reasons.length > 0) {
    pushUnique(reasons, SAME_OWNER_REASONS.SAME_MARKET);
  }

  return reasons;
}

// Matches for the radar banner: same owner, DIFFERENT property. Contacts whose
// property matches (same address/facility) are duplicates — the Duplicate
// Review Center's job — so they're excluded here.
// Returns [{ contact, reasons }] strongest-first.
export function findSameOwnerMatches(contact, contacts) {
  if (!contact) return [];
  const ownKeys = allPropertyKeys(contact);
  const matches = [];

  for (const other of contacts) {
    if (!other || other.id === contact.id) continue;
    const reasons = sameOwnerReasons(contact, other);
    if (reasons.length === 0) continue;
    const otherKeys = allPropertyKeys(other);
    const sharesProperty = [...otherKeys].some(k => ownKeys.has(k));
    if (sharesProperty) continue; // duplicate, not a portfolio signal
    if (otherKeys.size === 0 && ownKeys.size === 0) continue; // nothing to link
    matches.push({ contact: other, reasons });
  }

  const strength = (reasons) =>
    (reasons.includes(SAME_OWNER_REASONS.SAME_PHONE) ? 4 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SAME_EMAIL) ? 4 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SAME_OWNER_NAME) ? 3 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SAME_ENTITY) ? 2 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SIMILAR_OWNER_NAME) ? 2 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SIMILAR_ENTITY) ? 2 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SIMILAR_FACILITY) ? 2 : 0) +
    (reasons.includes(SAME_OWNER_REASONS.SAME_MARKET) ? 1 : 0);
  return matches.sort((a, b) => strength(b.reasons) - strength(a.reasons));
}

function mergeCallHistories(existing = [], incoming = []) {
  const merged = [...existing];
  const seen = new Set(merged.map(h => `${h.date ?? ''}|${h.outcome ?? ''}|${h.notes ?? ''}`));
  incoming.forEach(h => {
    const key = `${h.date ?? ''}|${h.outcome ?? ''}|${h.notes ?? ''}`;
    if (!seen.has(key)) { seen.add(key); merged.push(h); }
  });
  return merged;
}

// Fold `weaker` into `master` as the same owner: weaker's facility/address
// becomes an ADDITIONAL property on master (never overwrites master's primary
// property), phones/emails/blank fields merge via the duplicate merge plan,
// call histories combine. Caller deletes `weaker` after applying `updates`.
export function buildSameOwnerMergePlan(master, weaker) {
  const { updates, addedPhones } = buildMergePlan(master, weaker);

  // The weaker row's property must never replace master's primary property.
  delete updates.facilityName;
  delete updates.address;

  const entries = Array.isArray(master.ownedProperties) ? [...master.ownedProperties] : [];
  const seen = allPropertyKeys(master);
  let addedProperties = 0;

  function addProperty(facilityName, address, state) {
    const key = propertyKey(facilityName, address);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({
      facilityName: (facilityName ?? '').trim(),
      address: (address ?? '').trim(),
      state: (state ?? '').trim(),
      addedAt: new Date().toISOString(),
    });
    addedProperties += 1;
  }

  addProperty(weaker.facilityName, weaker.address, weaker.state);
  (weaker.ownedProperties ?? []).forEach(p => addProperty(p?.facilityName, p?.address, p?.state));

  if (addedProperties > 0) updates.ownedProperties = entries;

  // Replace the generic "Merged duplicate record" note with a same-owner one.
  const propertyLabel = (weaker.facilityName || weaker.address || 'property').trim();
  const noteLine = `Same owner — added property: ${propertyLabel}`;
  const masterNotes = (master.notes ?? '').trim();
  const weakerNotes = (weaker.notes ?? '').trim();
  const parts = [masterNotes];
  if (weakerNotes && !masterNotes.includes(weakerNotes)) parts.push(weakerNotes);
  parts.push(noteLine);
  updates.notes = parts.filter(Boolean).join('\n');

  if ((weaker.callHistory?.length ?? 0) > 0) {
    updates.callHistory = mergeCallHistories(master.callHistory, weaker.callHistory);
  }

  return { updates, addedPhones, addedProperties };
}
