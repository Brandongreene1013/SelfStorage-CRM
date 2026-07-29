export function createCallModeSession(queue = []) {
  const seen = new Set();
  return queue.filter(contact => {
    if (!contact?.id || seen.has(contact.id)) return false;
    seen.add(contact.id);
    return true;
  }).map(contact => ({ ...contact }));
}

export function resolveCallModeContact(sessionQueue = [], index = 0, liveContacts = []) {
  if (sessionQueue.length === 0) return null;
  const safeIndex = Math.min(Math.max(index, 0), sessionQueue.length - 1);
  const snapshot = sessionQueue[safeIndex];
  const live = liveContacts.find(contact => contact.id === snapshot.id);
  return live ? { ...snapshot, ...live } : snapshot;
}

export function callModeContactIndex(sessionQueue = [], contactId) {
  return sessionQueue.findIndex(contact => contact.id === contactId);
}

export function callModeTarget(contact) {
  if (!contact?.id) return null;
  return {
    contactId: contact.id,
    ownerName: contact.ownerName ?? '',
    facilityName: contact.facilityName ?? '',
    address: contact.address ?? '',
  };
}
