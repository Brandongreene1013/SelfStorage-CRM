export function contactInList(contact, listId) {
  if (!contact || !listId) return false;
  return contact.listId === listId || (contact.listIds ?? []).includes(listId);
}
