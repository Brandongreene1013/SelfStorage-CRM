export function contactInList(contact, listId) {
  if (!contact || !listId) return false;
  return contact.listId === listId || (contact.listIds ?? []).includes(listId);
}

export function originatingListIds(contact, masterListId, validListIds = null) {
  if (!contact) return [];
  const allowed = validListIds ? new Set(validListIds) : null;
  return [...new Set(contact.listIds ?? [contact.listId])]
    .filter(listId => listId && listId !== masterListId && (!allowed || allowed.has(listId)));
}

// Decide what happens to a list's contacts when that list is deleted.
//
// This is the guard against the original bug where deleting a list silently
// re-homed every one of its contacts into the Master Database, leaving orphaned
// no-facility records piled up in "All Contacts". A deleted list must take its
// list-only contacts WITH it. The only survivors are records whose deletion
// would destroy work unrelated to the list:
//   • a contact also homed-or-membered on another (non-Master) list → re-homed
//     to that list, keeping it reachable there.
//   • a protected contact (backs a Core Client / Pipeline record, whose FKs
//     would cascade or null on a hard delete) → re-homed to Master Database.
// A contact that is BOTH protected and on another list follows the other list,
// because that keeps it out of Master. Everything else is deletable.
//
// Pure and side-effect free so the "never dump into Master" contract can be
// locked in by tests. Returns { deletableIds, rehome: [{ id, target }] }.
export function planListDeletion(contacts, listId, masterListId, protectedIds = null) {
  const result = { deletableIds: [], rehome: [] };
  if (!listId || listId === masterListId) return result;
  const protectedSet = protectedIds instanceof Set ? protectedIds : new Set(protectedIds ?? []);
  for (const contact of contacts ?? []) {
    if (!contact || contact.listId !== listId) continue;
    const otherLists = [...new Set(contact.listIds ?? [contact.listId])]
      .filter(id => id && id !== listId && id !== masterListId);
    if (otherLists.length > 0) {
      result.rehome.push({ id: contact.id, target: otherLists[0] });
    } else if (protectedSet.has(contact.id) && masterListId) {
      result.rehome.push({ id: contact.id, target: masterListId });
    } else {
      result.deletableIds.push(contact.id);
    }
  }
  return result;
}
