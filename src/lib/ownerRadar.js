const GENERIC_OWNER_NAMES = new Set([
  'owner', 'unknown', 'unknown owner', 'n a', 'na', 'storage', 'self storage',
]);

function normalizeIdentity(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|llc|inc|corp|corporation|company|co|ltd)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

export function normalizePropertyAddress(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(highway)\b/g, 'hwy')
    .replace(/\b(suite|unit)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function usableOwnerIdentity(contact) {
  const name = normalizeIdentity(contact?.ownerName || contact?.ownerEntity);
  return name && !GENERIC_OWNER_NAMES.has(name) ? name : '';
}

// Canonical phone for the shared-info index: last 10 digits (matches the
// duplicate-review engine's phoneKey), so a lookup here and there agree.
function canonicalPhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  const trimmed = digits.length > 10 ? digits.slice(-10) : digits;
  return trimmed.length >= 7 ? trimmed : '';
}

// A "distinct owner" for shared-info counting: the ownership group if linked,
// else the normalized owner name, else the contact's own id. This deliberately
// counts by identity, not raw rows, so one owner's three properties don't make
// their real personal email look shared.
function ownerIdentityKey(contact) {
  if (contact?.ownershipGroupId) return `group:${contact.ownershipGroupId}`;
  const name = normalizeIdentity(contact?.ownerName || contact?.ownerEntity);
  if (name && !GENERIC_OWNER_NAMES.has(name)) return `name:${name}`;
  return `contact:${contact?.id ?? ''}`;
}

// An email or phone attached to at least this many distinct owners is treated
// as low-value contact info (a placeholder like info@, a shared office line, a
// scraped catch-all) — not a reliable identity signal.
export const SHARED_CONTACT_MIN_OWNERS = 3;

// Scan the whole contact set once and return the emails/phones that are shared
// across SHARED_CONTACT_MIN_OWNERS+ distinct owners. Pure; callers memoize it
// and thread it into the matchers so junk contact info stops manufacturing
// confident matches.
export function buildSharedContactInfoIndex(contacts = [], minOwners = SHARED_CONTACT_MIN_OWNERS) {
  const emailOwners = new Map();
  const phoneOwners = new Map();
  const add = (map, key, ownerKey) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(ownerKey);
  };
  (contacts ?? []).forEach(contact => {
    const ownerKey = ownerIdentityKey(contact);
    add(emailOwners, normalizeEmail(contact?.email), ownerKey);
    [contact?.phone, ...((contact?.alternatePhones ?? []).map(p => p?.phone))]
      .forEach(phone => add(phoneOwners, canonicalPhone(phone), ownerKey));
  });
  const collectShared = map => new Set(
    [...map].filter(([, owners]) => owners.size >= minOwners).map(([key]) => key),
  );
  return { sharedEmails: collectShared(emailOwners), sharedPhones: collectShared(phoneOwners), minOwners };
}

export function isSharedEmail(index, email) {
  return Boolean(index?.sharedEmails?.has(normalizeEmail(email)));
}

export function isSharedPhone(index, phone) {
  return Boolean(index?.sharedPhones?.has(canonicalPhone(phone)));
}

function contactDisplayName(contact) {
  return contact?.ownerName || contact?.ownerEntity || contact?.facilityName || contact?.address || 'Unknown owner';
}

// Stable key for a subject↔candidate pair, order-independent. Matches the
// duplicate-group key format in duplicateReview.js (sorted ids joined by '|')
// so a "not the same owner" dismissal here and a duplicate-group dismissal in
// the Duplicate Review center share one row in `duplicate_dismissals`.
export function relatedOwnerPairKey(idA, idB) {
  return [String(idA ?? ''), String(idB ?? '')].sort().join('|');
}

// Each match signal, strongest first. A one-to-one email/phone match is
// near-certain (exact); a name-only match is a softer hint because owner names
// collide ("John Smith", family LLCs). A shared email/phone (same value across
// many owners) is NOT exact — it is downgraded to a soft hint. Confidence: any
// exact (non-shared) contact-info signal => High, otherwise => Medium.
const SIGNAL_META = {
  email: { label: 'Same email', weight: 100 },
  phone: { label: 'Same phone', weight: 90 },
  name: { label: 'Same owner name', weight: 60 },
};

function candidateConfidence(signals) {
  return signals.some(signal => signal.exact) ? 'High' : 'Medium';
}

// Call Mode only: candidates must be existing Master Database contacts. Exact
// email/phone/name signals avoid the location-only false positives from the
// prior fuzzy matcher.
//
// `options.dismissedKeys` is a Set of relatedOwnerPairKey() strings the broker
// has marked "not the same owner"; those candidates are filtered out so a wrong
// suggestion stays gone. `options.sharedContactInfo` is a
// buildSharedContactInfoIndex() result (computed here if omitted) — a match on a
// shared email/phone is demoted to a soft hint, and a candidate whose ONLY
// evidence is shared contact info is dropped so junk data stops manufacturing
// phantom Strong matches. Results are ranked so genuine exact matches (High)
// always sit above soft hints (Medium), never crowded out.
export function buildRelatedOwnerCandidates(subject, contacts, masterListId, options = {}) {
  if (!subject || !masterListId || subject.listId === masterListId) return [];
  const dismissedKeys = options.dismissedKeys ?? new Set();
  const sharedInfo = options.sharedContactInfo ?? buildSharedContactInfoIndex(contacts);
  const subjectEmail = normalizeEmail(subject.email);
  const subjectPhones = new Set([subject.phone, ...(subject.alternatePhones ?? []).map(p => p.phone)]
    .map(normalizePhone).filter(phone => phone.length >= 7));
  const subjectName = usableOwnerIdentity(subject);
  const ranked = [];

  contacts.forEach(candidate => {
    if (!candidate || candidate.id === subject.id || candidate.listId !== masterListId) return;
    if (dismissedKeys.has(relatedOwnerPairKey(subject.id, candidate.id))) return;
    const candidateEmail = normalizeEmail(candidate.email);
    const candidatePhones = [candidate.phone, ...(candidate.alternatePhones ?? []).map(p => p.phone)]
      .map(normalizePhone).filter(phone => phone.length >= 7);
    const emailMatch = !!subjectEmail && subjectEmail === candidateEmail;
    const matchedPhone = candidatePhones.find(phone => subjectPhones.has(phone)) || '';
    const phoneMatch = !!matchedPhone;
    const candidateName = usableOwnerIdentity(candidate);
    const nameMatch = !!subjectName && !!candidateName && subjectName === candidateName;
    if (!emailMatch && !phoneMatch && !nameMatch) return;

    const emailShared = emailMatch && isSharedEmail(sharedInfo, candidateEmail);
    const phoneShared = phoneMatch && isSharedPhone(sharedInfo, matchedPhone);
    const signals = [];
    if (emailMatch) signals.push({ type: 'email', label: SIGNAL_META.email.label, exact: !emailShared, shared: emailShared });
    if (phoneMatch) signals.push({ type: 'phone', label: SIGNAL_META.phone.label, exact: !phoneShared, shared: phoneShared });
    if (nameMatch) signals.push({ type: 'name', label: SIGNAL_META.name.label, exact: false, shared: false });
    // Drop candidates whose only evidence is shared/junk contact info.
    if (!signals.some(signal => !signal.shared)) return;

    ranked.push({
      contact: candidate,
      pairKey: relatedOwnerPairKey(subject.id, candidate.id),
      score: signals.reduce((sum, signal) => sum + (signal.shared ? 0 : (SIGNAL_META[signal.type]?.weight ?? 0)), 0),
      confidence: candidateConfidence(signals),
      signals,
      sharedSignal: signals.some(signal => signal.shared),
      reason: signals.map(signal => signal.label).join(' · '),
    });
  });

  const seen = new Set();
  return ranked
    .sort((a, b) => b.score - a.score || contactDisplayName(a.contact).localeCompare(contactDisplayName(b.contact)))
    .filter(item => {
      const key = item.contact.ownershipGroupId || item.contact.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function subjectPropertyPayload(subject, ownershipGroupId) {
  const address = String(subject?.address ?? '').trim();
  const parts = address.split(',').map(part => part.trim()).filter(Boolean);
  const stateZip = parts.at(-1)?.match(/\b([A-Z]{2})\b(?:\s+(\d{5}(?:-\d{4})?))?/i);
  return {
    ownershipGroupId,
    facilityName: String(subject?.facilityName ?? '').trim(),
    address,
    city: parts.length >= 3 ? parts[parts.length - 2] : String(subject?.city ?? '').trim(),
    state: stateZip?.[1]?.toUpperCase() || subject?.state || '',
    market: subject?.market ?? '',
    propertyType: subject?.propertyType || 'Self-Storage',
    source: subject?.source ?? '',
    notes: '',
  };
}
