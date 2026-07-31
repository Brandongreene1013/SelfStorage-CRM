import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { DATABASE_ROOT_ID, buildFolderIndex } from '../../lib/databaseExplorer';

function PersonDestination({ id, children, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-all ${isOver ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/60' : ''}`}
    >
      {children}
    </div>
  );
}

function FolderNode({ folder, index, listsByFolder, expanded, onToggle, onOpenList, level = 0 }) {
  const childFolders = index.childrenByParent.get(folder.id) ?? [];
  const childLists = listsByFolder.get(folder.id) ?? [];
  const open = expanded.has(folder.id);
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(folder.id)}
        className="flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
        style={{ paddingLeft: `${8 + level * 12}px` }}
      >
        <span className="w-3 text-slate-600">{open ? '▾' : '›'}</span>
        <span aria-hidden="true">□</span>
        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        <span className="text-[10px] text-slate-600">{childFolders.length + childLists.length}</span>
      </button>
      {open && (
        <>
          {childFolders.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              index={index}
              listsByFolder={listsByFolder}
              expanded={expanded}
              onToggle={onToggle}
              onOpenList={onOpenList}
              level={level + 1}
            />
          ))}
          {childLists.map(list => (
            <ListDestination key={list.id} list={list} onOpenList={onOpenList} level={level + 1} />
          ))}
        </>
      )}
    </div>
  );
}

function ListDestination({ list, onOpenList, level = 0 }) {
  return (
    <PersonDestination id={`person-list:${list.id}`}>
      <button
        type="button"
        onClick={() => onOpenList(list.id)}
        className="flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-[11px] text-slate-400 hover:bg-slate-800 hover:text-amber-300"
        style={{ paddingLeft: `${20 + level * 12}px` }}
        title={`Open ${list.name}; drag people here to add them`}
      >
        <span aria-hidden="true">▤</span>
        <span className="min-w-0 flex-1 truncate">{list.name}</span>
      </button>
    </PersonDestination>
  );
}

export default function PeopleDropNavigator({ folders, lists, masterListId, onOpenList }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const index = useMemo(() => buildFolderIndex(folders), [folders]);
  const activeLists = useMemo(
    () => lists.filter(list => !list.isArchived && list.id !== masterListId),
    [lists, masterListId],
  );
  const listsByFolder = useMemo(() => {
    const map = new Map();
    activeLists.forEach(list => {
      const folderId = list.folderId || DATABASE_ROOT_ID;
      map.set(folderId, [...(map.get(folderId) ?? []), list]);
    });
    map.forEach(items => items.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [activeLists]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? activeLists.filter(list => list.name.toLowerCase().includes(needle)) : [];
  }, [activeLists, query]);

  function toggle(folderId) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-3 py-2.5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Move people</p>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">Drag one person—or a selected group—onto a destination.</p>
      </div>
      <div className="grid grid-cols-2 border-b border-slate-800">
        <PersonDestination id="person-core-clients" className="border-r border-slate-800">
          <div className="px-2 py-2 text-center text-[11px] font-bold text-amber-300">◆ Core Clients</div>
        </PersonDestination>
        <PersonDestination id="person-pipeline">
          <div className="px-2 py-2 text-center text-[11px] font-bold text-sky-300">Pipeline →</div>
        </PersonDestination>
      </div>
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Find a destination list…"
        className="m-2 w-[calc(100%-1rem)] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
      />
      <div className="max-h-64 overflow-auto pb-2">
        {query ? (
          matches.length
            ? matches.map(list => <ListDestination key={list.id} list={list} onOpenList={onOpenList} />)
            : <p className="px-3 py-3 text-center text-[11px] text-slate-600">No matching lists</p>
        ) : (
          <>
            {masterListId && (
              <PersonDestination id={`person-list:${masterListId}`}>
                <button type="button" onClick={() => onOpenList(masterListId)} className="w-full px-3 py-2 text-left text-[11px] font-bold text-emerald-400 hover:bg-slate-800">
                  ★ Master Database
                </button>
              </PersonDestination>
            )}
            {(listsByFolder.get(DATABASE_ROOT_ID) ?? []).map(list => (
              <ListDestination key={list.id} list={list} onOpenList={onOpenList} />
            ))}
            {(index.childrenByParent.get(DATABASE_ROOT_ID) ?? []).map(folder => (
              <FolderNode
                key={folder.id}
                folder={folder}
                index={index}
                listsByFolder={listsByFolder}
                expanded={expanded}
                onToggle={toggle}
                onOpenList={onOpenList}
              />
            ))}
          </>
        )}
      </div>
      <p className="border-t border-slate-800 px-3 py-2 text-[10px] leading-relaxed text-slate-600">
        Folders organize lists. Drop people on a list; their Master record and activity history stay intact.
      </p>
    </div>
  );
}
