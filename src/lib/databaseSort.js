function dateValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function contactLastActivityAt(contact) {
  const actionTimes = (Array.isArray(contact?.actionLog) ? contact.actionLog : [])
    .map(entry => dateValue(entry.at || entry.date));
  const callTimes = (Array.isArray(contact?.callHistory) ? contact.callHistory : [])
    .map(entry => dateValue(entry.at || entry.date));
  return Math.max(dateValue(contact?.lastCalled), ...actionTimes, ...callTimes, 0);
}

function compareDated(aValue, bValue, direction, missingFirst = false) {
  if (!aValue && !bValue) return 0;
  if (!aValue) return missingFirst ? -1 : 1;
  if (!bValue) return missingFirst ? 1 : -1;
  return direction === 'asc' ? aValue - bValue : bValue - aValue;
}

function alphabetical(value) {
  return String(value || '').trim();
}

export function sortDatabaseContacts(contacts, sortMode = 'default') {
  const rows = [...contacts];
  if (sortMode === 'default' || sortMode === 'nearest') return rows;

  return rows.sort((a, b) => {
    if (sortMode === 'newest') {
      return compareDated(
        dateValue(a.createdAt || a.importedAt),
        dateValue(b.createdAt || b.importedAt),
        'desc',
      );
    }
    if (sortMode === 'oldest') {
      return compareDated(
        dateValue(a.createdAt || a.importedAt),
        dateValue(b.createdAt || b.importedAt),
        'asc',
      );
    }
    if (sortMode === 'recently_contacted') {
      return compareDated(contactLastActivityAt(a), contactLastActivityAt(b), 'desc');
    }
    if (sortMode === 'least_recently_contacted') {
      return compareDated(contactLastActivityAt(a), contactLastActivityAt(b), 'asc', true);
    }
    if (sortMode === 'owner_az') {
      return alphabetical(a.ownerName).localeCompare(alphabetical(b.ownerName), undefined, { sensitivity: 'base' });
    }
    if (sortMode === 'facility_az') {
      return alphabetical(a.facilityName).localeCompare(alphabetical(b.facilityName), undefined, { sensitivity: 'base' });
    }
    return 0;
  });
}
