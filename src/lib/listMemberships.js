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
