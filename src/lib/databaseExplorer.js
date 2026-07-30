export const DATABASE_ROOT_ID = 'database-root';
export const DATABASE_EXPLORER_MAX_DEPTH = 10;
export const DATABASE_FOLDER_NAME_MAX = 120;

export function normalizeFolderName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateFolderName(value) {
  const name = normalizeFolderName(value);
  if (!name) return { valid: false, name, error: 'Enter a folder name.' };
  if (name.length > DATABASE_FOLDER_NAME_MAX) {
    return { valid: false, name, error: `Folder names can be up to ${DATABASE_FOLDER_NAME_MAX} characters.` };
  }
  return { valid: true, name, error: '' };
}

export function buildFolderIndex(folders = []) {
  const byId = new Map();
  const childrenByParent = new Map();
  folders.forEach(folder => {
    byId.set(folder.id, folder);
    const parentKey = folder.parentId || DATABASE_ROOT_ID;
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(folder);
    childrenByParent.set(parentKey, children);
  });
  childrenByParent.forEach(children => children.sort((a, b) => (
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )));
  return { byId, childrenByParent };
}

export function folderBreadcrumbs(folders, folderId) {
  if (!folderId || folderId === DATABASE_ROOT_ID) return [];
  const { byId } = buildFolderIndex(folders);
  const result = [];
  const seen = new Set();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return result;
}

export function folderLocationLabel(folders, folderId, leafName = '') {
  const parts = ['Database', ...folderBreadcrumbs(folders, folderId).map(folder => folder.name)];
  if (leafName) parts.push(leafName);
  return parts.join(' / ');
}

export function explorerFolderOptions(folders) {
  return folders
    .map(folder => ({ id: folder.id, label: folderLocationLabel(folders, folder.id).replace(/^Database \/ /, '') }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function folderDescendantIds(folders, folderId) {
  const { childrenByParent } = buildFolderIndex(folders);
  const descendants = new Set();
  const queue = [...(childrenByParent.get(folderId) ?? [])];
  while (queue.length) {
    const folder = queue.shift();
    if (!folder || descendants.has(folder.id)) continue;
    descendants.add(folder.id);
    queue.push(...(childrenByParent.get(folder.id) ?? []));
  }
  return descendants;
}

export function folderDepth(folders, folderId) {
  return folderBreadcrumbs(folders, folderId).length;
}

export function folderSubtreeHeight(folders, folderId) {
  const { childrenByParent } = buildFolderIndex(folders);
  function visit(id, seen = new Set()) {
    if (seen.has(id)) return DATABASE_EXPLORER_MAX_DEPTH + 1;
    const nextSeen = new Set(seen).add(id);
    const children = childrenByParent.get(id) ?? [];
    if (!children.length) return 1;
    return 1 + Math.max(...children.map(child => visit(child.id, nextSeen)));
  }
  return visit(folderId);
}

export function validateFolderMove(folders, folderId, destinationId) {
  if (!folderId) return { valid: false, error: 'Choose a folder to move.' };
  const normalizedDestination = destinationId === DATABASE_ROOT_ID ? null : destinationId;
  if (folderId === normalizedDestination) {
    return { valid: false, error: 'A folder cannot be moved into itself.' };
  }
  const descendants = folderDescendantIds(folders, folderId);
  if (normalizedDestination && descendants.has(normalizedDestination)) {
    return { valid: false, error: 'A folder cannot be moved into one of its descendants.' };
  }
  const parentDepth = normalizedDestination ? folderDepth(folders, normalizedDestination) : 0;
  if (parentDepth + folderSubtreeHeight(folders, folderId) > DATABASE_EXPLORER_MAX_DEPTH) {
    return { valid: false, error: `Database folders support a maximum depth of ${DATABASE_EXPLORER_MAX_DEPTH} levels.` };
  }
  return { valid: true, destinationId: normalizedDestination, error: '' };
}

export function duplicateSiblingName(folders, name, parentId, excludeId = null) {
  const normalized = normalizeFolderName(name).toLocaleLowerCase();
  return folders.some(folder => (
    folder.id !== excludeId
    && (folder.parentId || null) === (parentId || null)
    && normalizeFolderName(folder.name).toLocaleLowerCase() === normalized
    && !folder.isArchived
  ));
}

export function buildExplorerStats(folders, lists, recordCountByList = new Map()) {
  const { childrenByParent } = buildFolderIndex(folders);
  const listsByFolder = new Map();
  lists.filter(list => !list.isArchived).forEach(list => {
    const key = list.folderId || DATABASE_ROOT_ID;
    const rows = listsByFolder.get(key) ?? [];
    rows.push(list);
    listsByFolder.set(key, rows);
  });
  const cache = new Map();
  function stats(folderId) {
    if (cache.has(folderId)) return cache.get(folderId);
    const ownLists = listsByFolder.get(folderId) ?? [];
    const children = childrenByParent.get(folderId) ?? [];
    const childStats = children.map(child => stats(child.id));
    const value = {
      immediateFolders: children.length,
      immediateLists: ownLists.length,
      totalFolders: children.length + childStats.reduce((sum, item) => sum + item.totalFolders, 0),
      totalLists: ownLists.length + childStats.reduce((sum, item) => sum + item.totalLists, 0),
      totalRecords: ownLists.reduce((sum, list) => sum + (recordCountByList.get(list.id) ?? 0), 0)
        + childStats.reduce((sum, item) => sum + item.totalRecords, 0),
    };
    cache.set(folderId, value);
    return value;
  }
  stats(DATABASE_ROOT_ID);
  folders.forEach(folder => stats(folder.id));
  return cache;
}

export function searchExplorerItems(folders, lists, query, { includeArchived = false } = {}) {
  const normalized = normalizeFolderName(query).toLocaleLowerCase();
  if (!normalized) return [];
  const folderResults = folders
    .filter(folder => (includeArchived || !folder.isArchived) && folder.name.toLocaleLowerCase().includes(normalized))
    .map(folder => ({
      type: 'folder',
      id: folder.id,
      name: folder.name,
      folderId: folder.parentId,
      location: folderLocationLabel(folders, folder.parentId),
      updatedAt: folder.updatedAt,
    }));
  const listResults = lists
    .filter(list => (includeArchived || !list.isArchived) && [list.name, list.importFilename, list.source]
      .some(value => String(value || '').toLocaleLowerCase().includes(normalized)))
    .map(list => ({
      type: 'list',
      id: list.id,
      name: list.name,
      folderId: list.folderId,
      location: folderLocationLabel(folders, list.folderId),
      updatedAt: list.updatedAt || list.createdAt,
      source: list.source,
    }));
  return [...folderResults, ...listResults].sort((a, b) => (
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  ));
}

export function sortExplorerItems(items, sortKey = 'name', direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    if (sortKey === 'records') return multiplier * ((a.recordCount ?? a.totalRecords ?? 0) - (b.recordCount ?? b.totalRecords ?? 0));
    if (sortKey === 'updated') {
      return multiplier * ((Date.parse(a.updatedAt || 0) || 0) - (Date.parse(b.updatedAt || 0) || 0));
    }
    return multiplier * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
