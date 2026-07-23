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

// Each match signal, strongest first. Exact contact-info matches (email/phone)
// are near-certain; a name-only match is a softer hint because owner names
// collide ("John Smith", family LLCs). Confidence is driven off this: any
// exact contact-info signal => High, name-only => Medium.
const SIGNAL_META = {
  email: { label: 'Same email', weight: 100, exact: true },
  phone: { label: 'Same phone', weight: 90, exact: true },
  name: { label: 'Same owner name', weight: 60, exact: false },
};

function candidateConfidence(signals) {
  return signals.some(signal => SIGNAL_META[signal.type]?.exact) ? 'High' : 'Medium';
}

// Call Mode only: candidates must be existing Master Database contacts. Exact
// email/phone/name signals avoid the location-only false positives from the
// prior fuzzy matcher.
//
// `options.dismissedKeys` is a Set of relatedOwnerPairKey() strings the broker
// has marked "not the same owner"; those candidates are filtered out so a wrong
// suggestion stays gone. Results are ranked so exact contact-info matches (High)
// always sit above name-only hints (Medium), never crowded out.
export function buildRelatedOwnerCandidates(subject, contacts, masterListId, options = {}) {
  if (!subject || !masterListId || subject.listId === masterListId) return [];
  const dismissedKeys = options.dismissedKeys ?? new Set();
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
    const phoneMatch = candidatePhones.some(phone => subjectPhones.has(phone));
    const candidateName = usableOwnerIdentity(candidate);
    const nameMatch = !!subjectName && !!candidateName && subjectName === candidateName;
    if (!emailMatch && !phoneMatch && !nameMatch) return;

    const signals = [];
    if (emailMatch) signals.push({ type: 'email', label: SIGNAL_META.email.label });
    if (phoneMatch) signals.push({ type: 'phone', label: SIGNAL_META.phone.label });
    if (nameMatch) signals.push({ type: 'name', label: SIGNAL_META.name.label });
    ranked.push({
      contact: candidate,
      pairKey: relatedOwnerPairKey(subject.id, candidate.id),
      score: signals.reduce((sum, signal) => sum + (SIGNAL_META[signal.type]?.weight ?? 0), 0),
      confidence: candidateConfidence(signals),
      signals,
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
