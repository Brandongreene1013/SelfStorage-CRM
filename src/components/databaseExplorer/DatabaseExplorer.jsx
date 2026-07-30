import { useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import ModalLayout from '../ui/ModalLayout';
import {
  DATABASE_ROOT_ID,
  buildExplorerStats,
  buildFolderIndex,
  folderBreadcrumbs,
  folderDescendantIds,
  folderLocationLabel,
  searchExplorerItems,
  sortExplorerItems,
} from '../../lib/databaseExplorer';

function DragItem({ id, data, children, className = '' }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={`${className} ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function DropFolder({ id, children, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/50' : ''}`}>
      {children}
    </div>
  );
}

function FolderTreeNode({ folder, index, stats, expanded, onToggle, selectedId, onSelect, level = 0 }) {
  const children = index.childrenByParent.get(folder.id) ?? [];
  const isExpanded = expanded.has(folder.id);
  const count = stats.get(folder.id)?.totalLists ?? 0;
  return (
    <div>
      <DropFolder id={`db-folder:${folder.id}`}>
        <DragItem id={`db-drag-folder:${folder.id}`} data={{ type: 'database-folder', folderId: folder.id }}>
          <div
            className={`flex items-center rounded-lg pr-2 text-xs transition-colors ${
              selectedId === folder.id ? 'bg-amber-500/15 text-amber-300' : 'text-slate-300 hover:bg-slate-800'
            }`}
            style={{ paddingLeft: `${8 + level * 14}px` }}
          >
            <button
              type="button"
              aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); onToggle(folder.id); }}
              className={`w-5 py-2 text-slate-500 ${children.length ? '' : 'invisible'}`}
            >
              {isExpanded ? '▾' : '›'}
            </button>
            <button
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => onSelect(folder.id)}
              className="min-w-0 flex-1 py-2 text-left flex items-center gap-1.5"
            >
              <span aria-hidden="true">▰</span>
              <span className="truncate">{folder.name}</span>
            </button>
            <span className="text-[10px] text-slate-600">{count}</span>
          </div>
        </DragItem>
      </DropFolder>
      {isExpanded && children.map(child => (
        <FolderTreeNode
          key={child.id}
          folder={child}
          index={index}
          stats={stats}
          expanded={expanded}
          onToggle={onToggle}
          selectedId={selectedId}
          onSelect={onSelect}
          level={level + 1}
        />
      ))}
    </div>
  );
}

function FolderPicker({ folders, value, onChange, excludeIds = new Set() }) {
  const options = folders
    .filter(folder => !excludeIds.has(folder.id))
    .map(folder => ({ folder, label: folderLocationLabel(folders, folder.id).replace(/^Database \/ /, '') }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <select
      value={value || DATABASE_ROOT_ID}
      onChange={event => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
    >
      <option value={DATABASE_ROOT_ID}>Database (root)</option>
      {options.map(({ folder, label }) => <option key={folder.id} value={folder.id}>{label}</option>)}
    </select>
  );
}

export default function DatabaseExplorer({
  folders,
  lists,
  recordCountByList,
  selectedFolderId,
  onSelectFolder,
  onOpenList,
  createFolder,
  renameFolder,
  moveFolder,
  moveLists,
  deleteFolder,
  archiveList,
  renameList,
  deleteList,
  migrationNeeded,
  loading,
  pendingKey,
  error,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedLists, setSelectedLists] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);
  const [dialogValue, setDialogValue] = useState('');
  const [destinationId, setDestinationId] = useState(DATABASE_ROOT_ID);
  const [dialogError, setDialogError] = useState('');

  const activeLists = useMemo(() => lists.filter(list => !list.isArchived && list.name !== 'Master Database'), [lists]);
  const visibleLists = useMemo(
    () => lists.filter(list => list.name !== 'Master Database' && (showArchived || !list.isArchived)),
    [lists, showArchived],
  );
  const index = useMemo(() => buildFolderIndex(folders), [folders]);
  const stats = useMemo(() => buildExplorerStats(folders, activeLists, recordCountByList), [folders, activeLists, recordCountByList]);
  const breadcrumbs = useMemo(() => folderBreadcrumbs(folders, selectedFolderId), [folders, selectedFolderId]);
  const searchResults = useMemo(
    () => searchExplorerItems(folders, visibleLists, query, { includeArchived: showArchived }),
    [folders, query, showArchived, visibleLists],
  );
  const contents = useMemo(() => {
    const key = selectedFolderId || DATABASE_ROOT_ID;
    const childFolders = (index.childrenByParent.get(key) ?? []).map(folder => ({
      ...folder,
      type: 'folder',
      totalRecords: stats.get(folder.id)?.totalRecords ?? 0,
    }));
    const childLists = visibleLists.filter(list => (list.folderId || DATABASE_ROOT_ID) === key).map(list => ({
      ...list,
      type: 'list',
      recordCount: recordCountByList.get(list.id) ?? 0,
    }));
    const searched = searchResults.map(item => item.type === 'folder'
      ? { ...item, totalRecords: stats.get(item.id)?.totalRecords ?? 0 }
      : { ...item, recordCount: recordCountByList.get(item.id) ?? 0 });
    return sortExplorerItems(query ? searched : [...childFolders, ...childLists], sortKey, sortDirection);
  }, [index, query, recordCountByList, searchResults, selectedFolderId, sortDirection, sortKey, stats, visibleLists]);

  function openDialog(type, item = null) {
    setDialog({ type, item });
    setDialogValue(item?.name ?? '');
    setDestinationId(item?.parentId || item?.folderId || selectedFolderId || DATABASE_ROOT_ID);
    setDialogError('');
  }

  async function submitDialog() {
    let result;
    if (dialog.type === 'create') result = await createFolder(dialogValue, selectedFolderId === DATABASE_ROOT_ID ? null : selectedFolderId);
    if (dialog.type === 'rename') result = await renameFolder(dialog.item.id, dialogValue);
    if (dialog.type === 'rename-list') {
      await renameList(dialog.item.id, dialogValue.trim());
      result = { ok: true };
    }
    if (dialog.type === 'move-folder') result = await moveFolder(dialog.item.id, destinationId);
    if (dialog.type === 'move-lists') result = await moveLists([...selectedLists], destinationId);
    if (dialog.type === 'delete') result = await deleteFolder(dialog.item.id, dialog.item.hasContents ? 'move_to_parent' : 'empty_only');
    if (result?.error) {
      setDialogError(result.error);
      return;
    }
    if (dialog.type === 'move-lists') setSelectedLists(new Set());
    if (dialog.type === 'delete' && selectedFolderId === dialog.item.id) onSelectFolder(dialog.item.parentId || DATABASE_ROOT_ID);
    setDialog(null);
  }

  const rootStats = stats.get(DATABASE_ROOT_ID);
  return (
    <div className="space-y-4">
      {migrationNeeded && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Database folders are ready in the app, but the Supabase setup still needs to be installed from
          <span className="font-semibold"> sql/database_explorer_migration.sql</span>. Existing lists remain available below.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900/70 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Database Explorer</p>
              <p className="mt-1 text-[11px] text-slate-600">{rootStats?.totalLists ?? activeLists.length} lists organized</p>
            </div>
            <button
              type="button"
              disabled={migrationNeeded || Boolean(pendingKey)}
              onClick={() => openDialog('create')}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-40"
            >
              + Folder
            </button>
          </div>
          <DropFolder id="db-root">
            <button
              type="button"
              onClick={() => onSelectFolder(DATABASE_ROOT_ID)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                selectedFolderId === DATABASE_ROOT_ID ? 'bg-amber-500/15 text-amber-300' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>▣ Database</span>
              <span className="text-[10px] text-slate-600">{rootStats?.totalLists ?? 0}</span>
            </button>
          </DropFolder>
          <div className="mt-1 max-h-[480px] overflow-auto">
            {index.childrenByParent.get(DATABASE_ROOT_ID)?.map(folder => (
              <FolderTreeNode
                key={folder.id}
                folder={folder}
                index={index}
                stats={stats}
                expanded={expanded}
                onToggle={id => setExpanded(previous => {
                  const next = new Set(previous);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                selectedId={selectedFolderId}
                onSelect={onSelectFolder}
              />
            ))}
          </div>
          <p className="mt-4 border-t border-slate-800 px-2 pt-3 text-[10px] leading-relaxed text-slate-600">
            Drag lists or folders onto a destination, or use Move To for keyboard-friendly organization.
          </p>
        </aside>

        <section className="min-w-0 p-4 md:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <nav aria-label="Database folder" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                <button type="button" onClick={() => onSelectFolder(DATABASE_ROOT_ID)} className="hover:text-amber-300">Database</button>
                {breadcrumbs.map(folder => (
                  <span key={folder.id} className="flex items-center gap-1">
                    <span>/</span>
                    <button type="button" onClick={() => onSelectFolder(folder.id)} className="max-w-40 truncate hover:text-amber-300">{folder.name}</button>
                  </span>
                ))}
              </nav>
              <h2 className="mt-1 truncate text-xl font-bold text-white">{breadcrumbs.at(-1)?.name || 'Database'}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFolderId !== DATABASE_ROOT_ID && (
                <>
                  <button type="button" onClick={() => openDialog('rename', folders.find(folder => folder.id === selectedFolderId))} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Rename</button>
                  <button type="button" onClick={() => openDialog('move-folder', folders.find(folder => folder.id === selectedFolderId))} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Move folder</button>
                  <button
                    type="button"
                    onClick={() => {
                      const item = folders.find(folder => folder.id === selectedFolderId);
                      openDialog('delete', {
                        ...item,
                        hasContents: Boolean((index.childrenByParent.get(item.id) ?? []).length || activeLists.some(list => list.folderId === item.id)),
                      });
                    }}
                    className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </>
              )}
              <button type="button" disabled={migrationNeeded} onClick={() => openDialog('create')} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">+ New folder</button>
            </div>
          </div>

          <div className="my-4 flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search folder and list names..."
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <select value={sortKey} onChange={event => setSortKey(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
              <option value="name">Sort: Name</option>
              <option value="records">Sort: Records</option>
              <option value="updated">Sort: Updated</option>
            </select>
            <button type="button" onClick={() => setSortDirection(value => value === 'asc' ? 'desc' : 'asc')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300" aria-label="Reverse sort">
              {sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
            <label className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">
              <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} className="accent-amber-500" />
              Archived
            </label>
          </div>

          {selectedLists.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <span className="text-xs font-semibold text-amber-200">{selectedLists.size} list{selectedLists.size === 1 ? '' : 's'} selected</span>
              <div className="flex gap-2">
                <button type="button" disabled={migrationNeeded} onClick={() => openDialog('move-lists')} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40">Move To…</button>
                <button type="button" onClick={() => setSelectedLists(new Set())} className="text-xs text-slate-400 hover:text-white">Clear</button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="hidden grid-cols-[36px_minmax(180px,1.5fr)_100px_130px_220px] gap-3 border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 md:grid">
              <span />
              <span>Name</span>
              <span>Records</span>
              <span>Updated</span>
              <span className="text-right">Actions</span>
            </div>
            {loading ? (
              <p className="px-4 py-12 text-center text-sm text-slate-500">Loading organization…</p>
            ) : contents.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <p className="text-sm font-semibold text-slate-300">{query ? 'No matching folders or lists' : 'This folder is empty'}</p>
                <p className="mt-1 text-xs text-slate-600">{query ? 'Try a different organization search.' : 'Create a folder, import a list, or move an existing list here.'}</p>
              </div>
            ) : contents.map(item => {
              const isFolder = item.type === 'folder';
              const row = (
                <div className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-800/70 px-3 py-3 last:border-b-0 md:grid-cols-[36px_minmax(180px,1.5fr)_100px_130px_220px] md:gap-3">
                  <div>
                    {!isFolder && (
                      <input
                        type="checkbox"
                        checked={selectedLists.has(item.id)}
                        onPointerDown={event => event.stopPropagation()}
                        onChange={() => setSelectedLists(previous => {
                          const next = new Set(previous);
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                          return next;
                        })}
                        aria-label={`Select ${item.name}`}
                        className="accent-amber-500"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => isFolder ? onSelectFolder(item.id) : onOpenList(item.id)}
                    className="min-w-0 text-left"
                  >
                    <p className={`truncate text-sm font-semibold hover:text-amber-300 ${item.isArchived ? 'text-slate-500' : 'text-slate-200'}`}>{isFolder ? '▰ ' : '▤ '}{item.name}{item.isArchived ? ' · Archived' : ''}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-600">{query ? item.location : isFolder ? `${item.totalLists ?? 0} lists inside` : item.source || 'List'}</p>
                  </button>
                  <span className="text-right text-xs text-slate-400 md:text-left">{isFolder ? item.totalRecords : item.recordCount}</span>
                  <span className="hidden text-xs text-slate-500 md:block">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}</span>
                  <div className="hidden justify-end gap-1 md:flex">
                    {isFolder ? (
                      <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => openDialog('move-folder', item)} className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white">Move</button>
                    ) : (
                      <>
                        <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => openDialog('rename-list', item)} className="rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white">Rename</button>
                        <button type="button" disabled={migrationNeeded} onPointerDown={event => event.stopPropagation()} onClick={() => { setSelectedLists(new Set([item.id])); setDialog({ type: 'move-lists' }); setDestinationId(item.folderId || DATABASE_ROOT_ID); }} className="rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30">Move</button>
                        <button type="button" disabled={migrationNeeded} onPointerDown={event => event.stopPropagation()} onClick={() => archiveList(item.id, !item.isArchived)} className="rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30">{item.isArchived ? 'Restore' : 'Archive'}</button>
                        <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => deleteList(item.id)} className="rounded px-1.5 py-1 text-[11px] text-red-400 hover:bg-red-500/10">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              );
              return isFolder ? (
                <DropFolder key={item.id} id={`db-folder:${item.id}`}>
                  <DragItem id={`db-drag-folder-row:${item.id}`} data={{ type: 'database-folder', folderId: item.id }}>{row}</DragItem>
                </DropFolder>
              ) : (
                <DragItem key={item.id} id={`db-drag-list:${item.id}`} data={{ type: 'database-list', listId: item.id, selectedListIds: selectedLists.has(item.id) ? [...selectedLists] : [item.id] }}>{row}</DragItem>
              );
            })}
          </div>
        </section>
      </div>

      {dialog && (
        <ModalLayout onClose={() => setDialog(null)} size="sm" className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              {dialog.type === 'create' && 'Create folder'}
              {dialog.type === 'rename' && 'Rename folder'}
              {dialog.type === 'rename-list' && 'Rename list'}
              {dialog.type === 'move-folder' && 'Move folder'}
              {dialog.type === 'move-lists' && `Move ${selectedLists.size} list${selectedLists.size === 1 ? '' : 's'}`}
              {dialog.type === 'delete' && 'Delete folder'}
            </h3>
            {dialog.type === 'delete' && (
              <p className="mt-2 text-sm text-slate-400">
                {dialog.item.hasContents
                  ? 'The folder will be removed and its immediate subfolders and lists will move to the parent. No contacts, calls, notes, tasks, or activity will be deleted.'
                  : 'The empty folder will be removed. No CRM records will be deleted.'}
              </p>
            )}
          </div>
          {['create', 'rename', 'rename-list'].includes(dialog.type) && (
            <input
              autoFocus
              maxLength={120}
              value={dialogValue}
              onChange={event => setDialogValue(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') submitDialog(); }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              placeholder="Folder name"
            />
          )}
          {['move-folder', 'move-lists'].includes(dialog.type) && (
            <FolderPicker
              folders={folders}
              value={destinationId}
              onChange={setDestinationId}
              excludeIds={dialog.type === 'move-folder'
                ? new Set([dialog.item.id, ...folderDescendantIds(folders, dialog.item.id)])
                : new Set()}
            />
          )}
          {dialogError && <p role="alert" className="text-sm text-red-300">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button
              type="button"
              disabled={Boolean(pendingKey)}
              onClick={submitDialog}
              className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                dialog.type === 'delete' ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {pendingKey ? 'Saving…' : dialog.type === 'delete' ? 'Delete folder' : dialog.type.startsWith('move') ? 'Move' : 'Save'}
            </button>
          </div>
        </ModalLayout>
      )}
    </div>
  );
}
