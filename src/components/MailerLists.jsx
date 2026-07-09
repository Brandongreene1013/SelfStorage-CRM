import { useState } from 'react';
import { EmptyState } from './ui';

// Mailer Lists view — the "Mailers" nav tab. Left: the lists themselves
// (create / rename / delete). Right: who's on the selected list with their
// live mailing address (pulled from the contact/client record, so edits there
// show up here), plus a CSV export for labels / mail-merge.

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportListCsv(list, rows) {
  const header = ['Name', 'Mailing Address', 'Facility', 'Type'];
  const lines = [header, ...rows.map(r => [r.name, r.mailingAddress, r.facility, r.memberType === 'contact' ? 'Contact' : 'Client'])]
    .map(cols => cols.map(csvEscape).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${list.name.replace(/[^\w\- ]+/g, '').trim() || 'mailer-list'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ListRow({ list, count, isActive, onSelect, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`rounded-xl border transition-all ${isActive ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
      <div className="flex items-center gap-1 px-3 py-2">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { setRenaming(false); if (draft.trim() && draft !== list.name) onRename(list.id, draft); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { setRenaming(false); if (draft.trim() && draft !== list.name) onRename(list.id, draft); }
              if (e.key === 'Escape') { setRenaming(false); setDraft(list.name); }
            }}
            className="flex-1 min-w-0 bg-slate-800 border border-amber-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
          />
        ) : (
          <button onClick={onSelect} className={`flex-1 text-left text-xs font-semibold truncate ${isActive ? 'text-amber-400' : 'text-slate-300'}`}>
            {list.name}
          </button>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setRenaming(true); setDraft(list.name); setConfirmDelete(false); }}
            title="Rename"
            className="text-slate-600 hover:text-slate-300 text-xs p-0.5 transition-all"
          >✏️</button>
          <button
            onClick={e => { e.stopPropagation(); setConfirmDelete(v => !v); setRenaming(false); }}
            title="Delete list"
            className="text-slate-600 hover:text-red-400 text-xs p-0.5 transition-all"
          >🗑</button>
          <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-md ml-0.5">{count}</span>
        </div>
      </div>
      {confirmDelete && (
        <div className="mx-3 mb-2 bg-red-900/30 border border-red-800/50 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-red-400 font-semibold">Delete this mailer list?</span>
          <div className="flex gap-1.5">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 hover:text-white transition-all">Cancel</button>
            <button onClick={() => { onDelete(list.id); setConfirmDelete(false); }} className="text-xs bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-0.5 rounded transition-all">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MailerLists({ mailerApi, contacts = [], clients = [] }) {
  const [activeListId, setActiveListId] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

  const activeList = mailerApi.mailerLists.find(l => l.id === activeListId) ?? null;

  // Resolve member references against the live contact/client records
  const rows = activeList
    ? mailerApi.members
        .filter(m => m.listId === activeList.id)
        .map(m => {
          const record = m.memberType === 'contact'
            ? contacts.find(c => c.id === m.memberId)
            : clients.find(c => c.id === m.memberId);
          if (!record) return null;
          return {
            key: `${m.memberType}:${m.memberId}`,
            memberType: m.memberType,
            memberId: m.memberId,
            name: m.memberType === 'contact'
              ? (record.ownerName || record.facilityName || 'Unknown')
              : (record.name || 'Unknown'),
            facility: record.facilityName ?? '',
            mailingAddress: record.mailingAddress ?? '',
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const missingAddressCount = rows.filter(r => !r.mailingAddress).length;

  async function createList() {
    const list = await mailerApi.createList(newListName);
    if (list) {
      setNewListName('');
      setShowNewList(false);
      setActiveListId(list.id);
    }
  }

  if (mailerApi.tablesMissing) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-5 py-4">
        <p className="text-sm font-bold text-blue-300">💾 One-time setup needed</p>
        <p className="text-xs text-slate-400 mt-1">
          Run <span className="font-mono text-blue-200">sql/mailer_lists_migration.sql</span> in the Supabase
          SQL Editor, then refresh. Everything else in the CRM keeps working in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* ── Left: lists ── */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Mailer Lists</h3>
          <button
            onClick={() => setShowNewList(v => !v)}
            className="text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors"
          >
            {showNewList ? 'Cancel' : '+ New List'}
          </button>
        </div>
        {showNewList && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createList(); if (e.key === 'Escape') setShowNewList(false); }}
              placeholder='e.g. "Texas Owners Q3 Mailer"'
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={createList}
              disabled={!newListName.trim()}
              className="flex-shrink-0 text-xs font-bold text-amber-400 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg px-2.5 py-1.5 transition-all disabled:opacity-50"
            >
              Create
            </button>
          </div>
        )}
        {mailerApi.mailerLists.length === 0 && !showNewList ? (
          <p className="text-xs text-slate-500 italic px-1">
            No mailer lists yet. Hit + New List, or use the ✉️ button next to any mailing address in the CRM.
          </p>
        ) : (
          mailerApi.mailerLists.map(list => (
            <ListRow
              key={list.id}
              list={list}
              count={mailerApi.memberCounts[list.id] ?? 0}
              isActive={list.id === activeListId}
              onSelect={() => setActiveListId(list.id)}
              onRename={mailerApi.renameList}
              onDelete={(id) => { mailerApi.deleteList(id); if (id === activeListId) setActiveListId(null); }}
            />
          ))
        )}
      </div>

      {/* ── Right: members of the selected list ── */}
      <div className="flex-1 min-w-0 w-full">
        {!activeList ? (
          <EmptyState
            icon="✉️"
            title="Pick a mailer list"
            message="Select a list on the left to see who's on it, or add people from anywhere in the CRM with the ✉️ button next to their mailing address."
          />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white truncate">✉️ {activeList.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {rows.length} recipient{rows.length === 1 ? '' : 's'}
                  {missingAddressCount > 0 && (
                    <span className="text-amber-400"> · ⚠ {missingAddressCount} missing a mailing address</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => exportListCsv(activeList, rows)}
                disabled={rows.length === 0}
                className="text-xs font-bold text-emerald-300 border border-emerald-600/40 bg-emerald-600/15 hover:bg-emerald-600/25 rounded-lg px-3 py-2 transition-all disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon="📭"
                message="Nobody on this list yet. Use the ✉️ button next to any mailing address to add people."
              />
            ) : (
              <div className="divide-y divide-slate-800">
                {rows.map(r => (
                  <div key={r.key} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {r.name}
                        {r.facility && <span className="text-slate-500 font-normal"> · {r.facility}</span>}
                      </p>
                      <p className={`text-xs truncate ${r.mailingAddress ? 'text-slate-400' : 'text-amber-400 italic'}`}>
                        {r.mailingAddress || '⚠ No mailing address on file'}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded-md border ${
                      r.memberType === 'contact'
                        ? 'bg-slate-800 border-slate-700 text-slate-400'
                        : 'bg-blue-600/15 border-blue-600/40 text-blue-300'
                    }`}>
                      {r.memberType === 'contact' ? 'Contact' : 'Client'}
                    </span>
                    <button
                      onClick={() => mailerApi.removeMember(activeList.id, r.memberType, r.memberId)}
                      title="Remove from this mailer list"
                      className="flex-shrink-0 text-xs font-semibold text-slate-500 hover:text-red-400 transition-all"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
