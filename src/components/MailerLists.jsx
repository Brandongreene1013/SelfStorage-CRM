import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { EmptyState } from './ui';
import { allMailingAddressOptions } from '../lib/mailingAddresses';

// Mailer Lists view — the "Mailers" nav tab. Left: the lists themselves
// (create / rename / delete). Right: who's on the selected list with their
// live mailing address (pulled from the contact/client record, so edits there
// show up here), plus an Excel export formatted for mail-merge (Name /
// Street Address / City / State / Zip).

function mailingAddresses(value = '') {
  return String(value).split('\n').map(address => address.trim()).filter(Boolean);
}

const US_STATE_ABBREVIATIONS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

// Split "123 Main St, Suite 4, Anytown, NY 12345" into mail-merge parts.
// Tolerates a missing comma before the state, zip-only or state-only tails,
// and addresses with no city (everything left goes in Street Address).
function parseMailingAddress(address = '') {
  let text = String(address).replace(/\s+/g, ' ').trim();
  if (!text) return { street: '', city: '', state: '', zip: '' };

  let state = '', zip = '';
  const zipMatch = text.match(/(\d{5}(?:-\d{4})?)\s*$/);
  if (zipMatch) {
    zip = zipMatch[1];
    text = text.slice(0, zipMatch.index).replace(/[\s,]+$/, '');
  }
  const stateMatch = text.match(/(?:,|\s)([A-Za-z]{2})\.?$/);
  if (stateMatch && US_STATE_ABBREVIATIONS.has(stateMatch[1].toUpperCase())) {
    state = stateMatch[1].toUpperCase();
    text = text.slice(0, stateMatch.index).replace(/[\s,]+$/, '');
  }
  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts.pop() : '';
  return { street: parts.join(', '), city, state, zip };
}

function exportListExcel(list, rows) {
  const header = ['Name', 'Street Address', 'City', 'State', 'Zip'];
  const data = rows.map(r => {
    const parsed = parseMailingAddress(r.mailingAddress);
    return {
      'Name': r.name,
      'Street Address': parsed.street,
      'City': parsed.city,
      'State': parsed.state,
      'Zip': parsed.zip, // stays a string so leading zeros survive
    };
  });
  const worksheet = XLSX.utils.json_to_sheet(data, { header });
  worksheet['!cols'] = [{ wch: 30 }, { wch: 34 }, { wch: 20 }, { wch: 8 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mailer');
  XLSX.writeFile(workbook, `${list.name.replace(/[^\w\- ]+/g, '').trim() || 'mailer-list'}.xlsx`);
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState('');

  const activeList = mailerApi.mailerLists.find(l => l.id === activeListId) ?? null;

  // Resolve member references against the live contact/client records
  const rows = activeList
    ? mailerApi.members
        .filter(m => m.listId === activeList.id)
        .flatMap(m => {
          const record = m.memberType === 'contact'
            ? contacts.find(c => c.id === m.memberId)
            : clients.find(c => c.id === m.memberId);
          if (!record) return [];
          const base = {
            memberType: m.memberType,
            memberId: m.memberId,
            memberRowId: m.id,
            name: m.memberType === 'contact'
              ? (record.ownerName || record.facilityName || 'Unknown')
              : (record.name || 'Unknown'),
            facility: record.facilityName ?? '',
            facilityAddress: record.address ?? '',
            sentAt: m.sentAt,
          };
          // Member rows added with a specific address carry it themselves;
          // legacy rows fall back to every address on the contact/client record.
          if (m.mailingAddress) {
            return [{
              ...base,
              key: m.id || `${m.memberType}:${m.memberId}:${m.mailingAddress}`,
              mailingAddress: m.mailingAddress,
              addressLabel: m.addressLabel || 'Selected',
            }];
          }
          const addresses = mailingAddresses(record.mailingAddress);
          return (addresses.length > 0 ? addresses : ['']).map((mailingAddress, addressIndex) => ({
            ...base,
            key: `${m.id || `${m.memberType}:${m.memberId}`}:${addressIndex}`,
            mailingAddress,
            addressLabel: mailingAddress ? 'Primary' : '',
          }));
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const missingAddressCount = rows.filter(r => !r.mailingAddress).length;
  const sentCount = rows.filter(r => r.sentAt).length;
  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'sent' ? Boolean(row.sentAt) : !row.sentAt);
      const haystack = [row.name, row.facility, row.mailingAddress, row.facilityAddress]
        .join(' ').toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  })();

  const addCandidates = useMemo(() => {
    if (!activeList) return [];
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return [];
    const records = [
      ...contacts.map(record => ({ record, memberType: 'contact' })),
      ...clients.map(record => ({ record, memberType: 'client' })),
    ];
    return records.flatMap(({ record, memberType }) => {
      const name = memberType === 'contact'
        ? (record.ownerName || record.facilityName || 'Unknown')
        : (record.name || 'Unknown');
      const addressOptions = allMailingAddressOptions(record);
      const haystack = [name, record.facilityName, record.address, ...addressOptions.map(option => option.address)]
        .join(' ').toLowerCase();
      if (!haystack.includes(q)) return [];
      return addressOptions.map(option => ({
        key: `${memberType}:${record.id}:${option.address}`,
        memberType,
        memberId: record.id,
        name,
        facility: record.facilityName ?? '',
        facilityAddress: record.address ?? '',
        mailingAddress: option.address,
        addressLabel: option.label,
        alreadyAdded: mailerApi.membershipFor(memberType, record.id, option.address).has(activeList.id),
      }));
    }).slice(0, 30);
  }, [activeList, clients, contacts, mailerApi, peopleSearch]);

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
                  <span className="text-emerald-400"> · {sentCount} sent</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddPeople(v => !v)}
                  className="text-xs font-bold text-amber-300 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg px-3 py-2 transition-all"
                >
                  {showAddPeople ? 'Close Search' : '+ Find & Add People'}
                </button>
                <button
                  onClick={() => exportListExcel(activeList, rows)}
                  disabled={rows.length === 0}
                  className="text-xs font-bold text-emerald-300 border border-emerald-600/40 bg-emerald-600/15 hover:bg-emerald-600/25 rounded-lg px-3 py-2 transition-all disabled:opacity-50"
                >
                  Export Excel
                </button>
              </div>
            </div>
            {mailerApi.sentTrackingMissing && (
              <div className="mx-5 mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                Run <span className="font-mono">sql/mailer_sent_tracking_migration.sql</span> in Supabase once to save sent/not-sent status.
              </div>
            )}
            {showAddPeople && (
              <div className="border-b border-slate-800 bg-slate-950/40 px-5 py-4">
                <input
                  autoFocus
                  value={peopleSearch}
                  onChange={e => setPeopleSearch(e.target.value)}
                  placeholder="Search all contacts and clients by person, facility, or address..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                />
                {peopleSearch.trim() && (
                  <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                    {addCandidates.length === 0 ? (
                      <p className="px-2 py-3 text-xs italic text-slate-500">No people with a mailing address match that search.</p>
                    ) : addCandidates.map(candidate => (
                      <div key={candidate.key} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{candidate.name}</p>
                          <p className="truncate text-xs text-slate-400">Mailing: {candidate.mailingAddress}</p>
                          {candidate.facilityAddress && <p className="truncate text-xs text-slate-500">Facility: {candidate.facilityAddress}</p>}
                        </div>
                        <button
                          disabled={candidate.alreadyAdded}
                          onClick={() => mailerApi.addMember(activeList.id, candidate.memberType, candidate.memberId, {
                            mailingAddress: candidate.mailingAddress,
                            addressLabel: candidate.addressLabel,
                          })}
                          className="flex-shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                        >
                          {candidate.alreadyAdded ? 'On list' : '+ Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {rows.length > 0 && (
              <div className="flex flex-col gap-2 border-b border-slate-800 px-5 py-3 sm:flex-row sm:items-center">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search this list by person, facility, or address..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
                  {[
                    ['all', `All (${rows.length})`],
                    ['not_sent', `Not sent (${rows.length - sentCount})`],
                    ['sent', `Sent (${sentCount})`],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${statusFilter === value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {rows.length === 0 ? (
              <EmptyState
                icon="📭"
                message="Nobody on this list yet. Use the ✉️ button next to any mailing address to add people."
              />
            ) : (
              <div className="divide-y divide-slate-800">
                {filteredRows.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm italic text-slate-500">No recipients match this search and status filter.</p>
                ) : filteredRows.map(r => (
                  <div key={r.key} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {r.name}
                        {r.facility && <span className="text-slate-500 font-normal"> · {r.facility}</span>}
                      </p>
                      <p className={`text-xs truncate ${r.mailingAddress ? 'text-slate-400' : 'text-amber-400 italic'}`}>
                        Mailing: {r.addressLabel && r.mailingAddress ? `${r.addressLabel} · ` : ''}{r.mailingAddress || 'No mailing address on file'}
                      </p>
                      {r.facilityAddress && (
                        <p className="truncate text-xs text-slate-500">Facility: {r.facilityAddress}</p>
                      )}
                    </div>
                    <button
                      onClick={() => mailerApi.setMemberSent(r.memberRowId, !r.sentAt)}
                      className={`flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all ${
                        r.sentAt
                          ? 'border-emerald-600/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25'
                          : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
                      }`}
                      title={r.sentAt ? `Marked sent ${new Date(r.sentAt).toLocaleDateString()}` : 'Mark this mailer as sent'}
                    >
                      {r.sentAt ? '✓ Sent' : 'Mark sent'}
                    </button>
                    <span className={`text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded-md border ${
                      r.memberType === 'contact'
                        ? 'bg-slate-800 border-slate-700 text-slate-400'
                        : 'bg-blue-600/15 border-blue-600/40 text-blue-300'
                    }`}>
                      {r.memberType === 'contact' ? 'Contact' : 'Client'}
                    </span>
                    <button
                      onClick={() => mailerApi.removeMember(activeList.id, r.memberType, r.memberId, { memberRowId: r.memberRowId })}
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
