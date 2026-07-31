export const PERSON_DRAG_TYPE = 'database-contact';

export function resolvePersonDragIds(contactId, selectedContactIds = [], isSelected = false) {
  const selected = [...new Set([...selectedContactIds].filter(Boolean))];
  return isSelected && selected.length > 1 ? selected : [contactId].filter(Boolean);
}

export function parsePersonDropTarget(targetId) {
  const target = String(targetId ?? '');
  if (target === 'person-core-clients' || target === 'person-core-clients-sidebar') return { type: 'core-clients' };
  if (target === 'person-pipeline' || target === 'clients') return { type: 'pipeline' };
  if (target.startsWith('person-list:')) return { type: 'list', listId: target.slice('person-list:'.length) };
  if (target.startsWith('list:')) return { type: 'list', listId: target.slice('list:'.length) };
  return null;
}
