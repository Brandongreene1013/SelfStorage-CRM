import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createDatabaseFolder,
  databaseExplorerError,
  deleteDatabaseFolder,
  fetchDatabaseFolders,
  isDatabaseExplorerMigrationError,
  moveDatabaseFolder,
  moveDatabaseLists,
  renameDatabaseFolder,
  setDatabaseListArchived,
} from '../services/databaseExplorer';
import {
  DATABASE_ROOT_ID,
  duplicateSiblingName,
  normalizeFolderName,
  validateFolderMove,
  validateFolderName,
} from '../lib/databaseExplorer';

export function useDatabaseExplorer({ lists, onListsMoved, onListArchived }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [error, setError] = useState('');
  const [pendingKey, setPendingKey] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchDatabaseFolders();
    if (result.error) {
      setMigrationNeeded(isDatabaseExplorerMigrationError(result.error));
      setError(isDatabaseExplorerMigrationError(result.error) ? '' : databaseExplorerError(result.error, 'Could not load Database folders.'));
      setFolders([]);
    } else {
      setFolders(result.folders);
      setMigrationNeeded(false);
      setError('');
    }
    setLoading(false);
    return result;
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = useCallback(async (key, operation) => {
    if (pendingKey) return { error: 'Another organization change is still saving.' };
    setPendingKey(key);
    setError('');
    try {
      return await operation();
    } finally {
      setPendingKey('');
    }
  }, [pendingKey]);

  const createFolder = useCallback((nameValue, parentId = null) => run('create-folder', async () => {
    const validation = validateFolderName(nameValue);
    if (!validation.valid) return { error: validation.error };
    if (duplicateSiblingName(folders, validation.name, parentId)) {
      return { error: 'A folder with this name already exists in that location.' };
    }
    const result = await createDatabaseFolder({ name: validation.name, parentId });
    if (result.error) {
      const message = databaseExplorerError(result.error, 'We could not create this folder.');
      setError(message);
      if (/refreshed|no longer|another tab/i.test(message)) await refresh();
      return { error: message };
    }
    setFolders(previous => [...previous, result.folder]);
    return { ok: true, folder: result.folder };
  }), [folders, refresh, run]);

  const renameFolder = useCallback((folderId, nameValue) => run(`rename:${folderId}`, async () => {
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return { error: 'This folder no longer exists.' };
    const validation = validateFolderName(nameValue);
    if (!validation.valid) return { error: validation.error };
    if (duplicateSiblingName(folders, validation.name, folder.parentId, folder.id)) {
      return { error: 'A folder with this name already exists in that location.' };
    }
    const result = await renameDatabaseFolder(folder, validation.name);
    if (result.error) {
      const message = databaseExplorerError(result.error, 'We could not rename this folder.');
      setError(message);
      await refresh();
      return { error: message };
    }
    setFolders(previous => previous.map(item => item.id === folderId ? result.folder : item));
    return { ok: true, folder: result.folder };
  }), [folders, refresh, run]);

  const moveFolder = useCallback((folderId, destinationId) => run(`move-folder:${folderId}`, async () => {
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return { error: 'This folder no longer exists.' };
    const validation = validateFolderMove(folders, folderId, destinationId);
    if (!validation.valid) return { error: validation.error };
    if (folder.parentId === validation.destinationId) return { ok: true, folder };
    if (duplicateSiblingName(folders, folder.name, validation.destinationId, folder.id)) {
      return { error: 'A folder with this name already exists in that location.' };
    }
    const result = await moveDatabaseFolder(folder, validation.destinationId);
    if (result.error) {
      const message = databaseExplorerError(result.error, 'We could not move this folder. It remains in its original location.');
      setError(message);
      await refresh();
      return { error: message };
    }
    setFolders(previous => previous.map(item => item.id === folderId ? result.folder : item));
    return { ok: true, folder: result.folder };
  }), [folders, refresh, run]);

  const moveLists = useCallback((listIds, destinationId) => run(`move-lists:${listIds.join(',')}`, async () => {
    const ids = [...new Set(listIds)].filter(id => lists.some(list => list.id === id && list.name !== 'Master Database'));
    if (!ids.length) return { error: 'Select at least one movable list.' };
    const folderId = destinationId === DATABASE_ROOT_ID ? null : destinationId;
    if (folderId && !folders.some(folder => folder.id === folderId && !folder.isArchived)) {
      return { error: 'That destination no longer exists.' };
    }
    const result = await moveDatabaseLists(ids, folderId);
    if (result.error) {
      const message = databaseExplorerError(result.error, 'We could not move the selected list. It remains in its original folder.');
      setError(message);
      await refresh();
      return { error: message };
    }
    onListsMoved?.(ids, folderId);
    return { ok: true, movedCount: ids.length, folderId };
  }), [folders, lists, onListsMoved, refresh, run]);

  const deleteFolder = useCallback((folderId, mode = 'empty_only') => run(`delete-folder:${folderId}`, async () => {
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return { error: 'This folder no longer exists.' };
    const childIds = folders.filter(item => item.parentId === folderId).map(item => item.id);
    const listIds = lists.filter(list => list.folderId === folderId).map(list => list.id);
    const result = await deleteDatabaseFolder(folder, mode);
    if (result.error) {
      const message = databaseExplorerError(result.error, 'We could not delete this folder.');
      setError(message);
      await refresh();
      return { error: message };
    }
    setFolders(previous => previous
      .filter(item => item.id !== folderId)
      .map(item => childIds.includes(item.id) ? { ...item, parentId: folder.parentId } : item));
    if (mode === 'move_to_parent' && listIds.length) onListsMoved?.(listIds, folder.parentId);
    return { ok: true, ...result.result };
  }), [folders, lists, onListsMoved, refresh, run]);

  const archiveList = useCallback((listId, archived = true) => run(`archive-list:${listId}`, async () => {
    const result = await setDatabaseListArchived(listId, archived);
    if (result.error) {
      const message = databaseExplorerError(result.error, 'We could not update this list.');
      setError(message);
      return { error: message };
    }
    onListArchived?.(listId, archived);
    return { ok: true };
  }), [onListArchived, run]);

  const activeFolders = useMemo(() => folders.filter(folder => !folder.isArchived), [folders]);

  return {
    folders,
    activeFolders,
    loading,
    migrationNeeded,
    error,
    pendingKey,
    refresh,
    createFolder,
    renameFolder,
    moveFolder,
    moveLists,
    deleteFolder,
    archiveList,
    normalizeFolderName,
  };
}

