import { useState, useMemo } from 'react';
import { useDatabase, US_STATES } from '../hooks/useDatabase';
import ImportListModal from './ImportListModal';

const STATUS_LABELS = {
  fresh: 'Fresh',
  no_answer: 'No Answer',
  voicemail: 'Left VM',
  conversation: 'Conversation',
  appointment: 'Appt Set',
  not_interested: 'Not Interested',
  callback: 'Call Back',
};

const STATUS_COLORS = {
  fresh: 'bg-slate-600 text-slate-200',
  no_answer: 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40',
  voicemail: 'bg-blue-600/20 text-blue-400 border border-blue-600/40',
  conversation: 'bg-green-600/20 text-green-400 border border-green-600/40',
  appointment: 'bg-amber-600/20 text-amber-400 border border-amber-600/40',
  not_interested: 'bg-red-600/20 text-red-400 border border-red-600/40',
  callback: 'bg-purple-600/20 text-purple-400 border border-purple-600/40',
};

const CALL_OUTCOMES = [
  { status: 'no_answer',       label: 'No Answer',       icon: '📵', color: 'bg-yellow-600/20 border-yellow-600/40 text-yellow-400 hover:bg-yellow-600/30' },
  { status: 'voicemail',       label: 'Left VM',         icon: '📩', color: 'bg-blue-600/20 border-blue-600/40 text-blue-400 hover:bg-blue-600/30' },
  { status: 'conversation',    label: 'Conversation',    icon: '💬', color: 'bg-green-600/20 border-green-600/40 text-green-400 hover:bg-green-600/30' },
  { status: 'appointment',     label: 'Appt Set',        icon: '📅', color: 'bg-amber-600/20 border-amber-600/40 text-amber-400 hover:bg-amber-600/30' },
  { status: 'not_interested',  label: 'Not Interested',  icon: '🚫', color: 'bg-red-600/20 border-red-600/40 text-red-400 hover:bg-red-600/30' },
  { status: 'callback',        label: 'Call Back',       icon: '🔄', color: 'bg-purple-600/20 border-purple-600/40 text-purple-400 hover:bg-purple-600/30' },
];

// ─── Main Database Component ──────────────────────────────────────────────────
export default function Database({ onCallLogged }) {
  const {
    lists, contacts,
    importList, updateContactStatus, updateContactCallback,
    updateContactNotes, deleteList, deleteContact,
  } = useDatabase();

  const [subView, setSubView] = useState('contacts');
  const [showImport, setShowImport] = useState(false);
  const [listFilter, setListFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedContact, setExpandedContact] = useState(null);

  // Call queue state
  const [callQueueIndex, setCallQueueIndex] = useState(0);
  const [callNote, setCallNote] = useState('');
  const [callbackDate, setCallbackDate] = useState('');

  // Filtered contacts
  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (listFilter !== 'all' && c.listId !== listFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (stateFilter !== 'all' && c.state !== stateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (c.facilityName ?? '').toLowerCase().includes(q) ||
          (c.ownerName ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.address ?? '').toLowerCase().includes(q) ||
          (c.market ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [contacts, listFilter, statusFilter, stateFilter, search]);

  // Call queue: fresh + callback contacts from current filter
  const callQueue = useMemo(() => {
    return filtered.filter(c => c.status === 'fresh' || c.status === 'callback' || c.status === 'no_answer' || c.status === 'voicemail');
  }, [filtered]);

  // Stats
  const allStates = useMemo(() => {
    const s = new Set();
    contacts.forEach(c => { if (c.state) s.add(c.state); });
    return [...s].sort();
  }, [contacts]);

  const marketStats = useMemo(() => {
    const map = {};
    contacts.forEach(c => {
      const key = c.market || c.state || 'Unknown';
      if (!map[key]) map[key] = { market: key, state: c.state, total: 0, fresh: 0, called: 0, conversations: 0, appointments: 0 };
      map[key].total++;
      if (c.status === 'fresh') map[key].fresh++;
      if (c.status !== 'fresh') map[key].called++;
      if (c.status === 'conversation') map[key].conversations++;
      if (c.status === 'appointment') map[key].appointments++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [contacts]);

  function handleCallOutcome(contact, status) {
    updateContactStatus(contact.id, status, callNote);
    if (status === 'callback' && callbackDate) {
      updateContactCallback(contact.id, callbackDate);
    }
    // Notify parent to increment dashboard counters
    if (onCallLogged) onCallLogged(status);
    setCallNote('');
    setCallbackDate('');
    // Auto-advance
    if (callQueueIndex >= callQueue.length - 1) {
      setCallQueueIndex(Math.max(0, callQueue.length - 2));
    }
  }

  function handleImport(name, source, rawText) {
    const result = importList(name, source, rawText);
    if (result.count > 0) setSubView('contacts');
  }

  const totalCalled = contacts.filter(c => c.status !== 'fresh').length;
  const totalConversations = contacts.filter(c => c.status === 'conversation').length;
  const totalAppointments = contacts.filter(c => c.status === 'appointment').length;

  return (
    <div className="space-y-4">
      {/* ── Header + Stats ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            Database
            <span className="text-xs font-semibold bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full">
              {contacts.length} contacts · {lists.length} lists · {allStates.length} states
            </span>
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow"
          >
            <span className="text-lg leading-none font-black">+</span> Import List
          </button>
          {callQueue.length > 0 && (
            <button
              onClick={() => { setSubView('callQueue'); setCallQueueIndex(0); }}
              className="bg-green-600 hover:bg-green-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow"
            >
              📞 Start Calling ({callQueue.length})
            </button>
          )}
        </div>
      </div>

      {/* Quick stat pills */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
          <p className="text-xs text-slate-500 font-semibold uppercase">Total Contacts</p>
          <p className="text-2xl font-black text-white">{contacts.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
          <p className="text-xs text-slate-500 font-semibold uppercase">Called</p>
          <p className="text-2xl font-black text-blue-400">{totalCalled}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
          <p className="text-xs text-slate-500 font-semibold uppercase">Conversations</p>
          <p className="text-2xl font-black text-green-400">{totalConversations}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
          <p className="text-xs text-slate-500 font-semibold uppercase">Appts Set</p>
          <p className="text-2xl font-black text-amber-400">{totalAppointments}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
          <p className="text-xs text-slate-500 font-semibold uppercase">Fresh</p>
          <p className="text-2xl font-black text-slate-300">{contacts.filter(c => c.status === 'fresh').length}</p>
        </div>
      </div>

      {/* ── Sub-nav + Filters ── */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {[
            { key: 'contacts', label: 'Contacts' },
            { key: 'callQueue', label: 'Call Queue' },
            { key: 'markets', label: 'Markets' },
            { key: 'lists', label: 'Lists' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setSubView(t.key)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                subView === t.key
                  ? 'bg-amber-500 text-slate-900 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(subView === 'contacts' || subView === 'callQueue') && (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, facility, phone, market..."
              className="flex-1 min-w-[160px] max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            <select
              value={listFilter}
              onChange={e => setListFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Lists</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All States</option>
              {allStates.map(s => <option key={s} value={s}>{s} — {US_STATES[s]}</option>)}
            </select>
          </>
        )}

        {(subView === 'contacts' || subView === 'callQueue') && (
          <span className="ml-auto text-xs text-slate-500">
            {filtered.length} results
          </span>
        )}
      </div>

      {/* ── Contact Table ── */}
      {subView === 'contacts' && (
        <ContactTable
          contacts={filtered}
          lists={lists}
          expandedContact={expandedContact}
          setExpandedContact={setExpandedContact}
          onStatusChange={(c, s) => { updateContactStatus(c.id, s, ''); if (onCallLogged) onCallLogged(s); }}
          onNotesChange={updateContactNotes}
          onDelete={deleteContact}
        />
      )}

      {/* ── Call Queue ── */}
      {subView === 'callQueue' && (
        <CallQueue
          queue={callQueue}
          index={callQueueIndex}
          setIndex={setCallQueueIndex}
          callNote={callNote}
          setCallNote={setCallNote}
          callbackDate={callbackDate}
          setCallbackDate={setCallbackDate}
          onOutcome={handleCallOutcome}
          lists={lists}
        />
      )}

      {/* ── Markets ── */}
      {subView === 'markets' && (
        <MarketsView stats={marketStats} contacts={contacts} />
      )}

      {/* ── Lists ── */}
      {subView === 'lists' && (
        <ListsView lists={lists} contacts={contacts} onDeleteList={deleteList} onSelectList={(id) => { setListFilter(id); setSubView('contacts'); }} />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportListModal onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

// ─── Contact Table ────────────────────────────────────────────────────────────
function ContactTable({ contacts, lists, expandedContact, setExpandedContact, onStatusChange, onNotesChange, onDelete }) {
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const paged = contacts.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(contacts.length / pageSize);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800 uppercase tracking-wide">
              <th className="text-left py-3 px-4">Facility</th>
              <th className="text-left py-3 px-3">Owner</th>
              <th className="text-left py-3 px-3">Phone</th>
              <th className="text-left py-3 px-3">Market</th>
              <th className="text-left py-3 px-3">Status</th>
              <th className="text-left py-3 px-3">Last Called</th>
              <th className="text-center py-3 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-600">
                  <div className="text-4xl mb-2">📋</div>
                  <p className="text-sm">No contacts found. Import a list to get started.</p>
                </td>
              </tr>
            ) : paged.map(c => (
              <tr
                key={c.id}
                onClick={() => setExpandedContact(expandedContact === c.id ? null : c.id)}
                className="border-b border-slate-800/50 hover:bg-slate-800/50 cursor-pointer transition-all"
              >
                <td className="py-3 px-4">
                  <p className="font-semibold text-white truncate max-w-[200px]">{c.facilityName || '—'}</p>
                  {c.address && <p className="text-xs text-slate-500 truncate max-w-[200px]">{c.address}</p>}
                </td>
                <td className="py-3 px-3 text-slate-300">{c.ownerName || '—'}</td>
                <td className="py-3 px-3">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      onClick={e => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                    >
                      {c.phone}
                    </a>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="py-3 px-3">
                  {c.market ? (
                    <span className="text-xs font-semibold text-amber-400">{c.market}</span>
                  ) : c.state ? (
                    <span className="text-xs text-slate-400">{c.state}</span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="py-3 px-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${STATUS_COLORS[c.status] ?? STATUS_COLORS.fresh}`}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-xs text-slate-500">{c.lastCalled ?? '—'}</td>
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                    className="text-slate-600 hover:text-red-400 text-xs transition-all p-1"
                    title="Remove contact"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-xs text-slate-400 hover:text-white disabled:text-slate-700 transition-all"
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="text-xs text-slate-400 hover:text-white disabled:text-slate-700 transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Call Queue ────────────────────────────────────────────────────────────────
function CallQueue({ queue, index, setIndex, callNote, setCallNote, callbackDate, setCallbackDate, onOutcome, lists }) {
  if (queue.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-lg font-bold text-white mb-1">Queue Empty</h3>
        <p className="text-sm text-slate-500">No fresh contacts to call. Import a new list or reset filters.</p>
      </div>
    );
  }

  const current = queue[Math.min(index, queue.length - 1)];
  const list = lists.find(l => l.id === current.listId);
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-400">
            {list ? list.name : 'All Lists'} · Contact {index + 1} of {queue.length}
          </p>
          <p className="text-xs font-semibold text-amber-400">{Math.round(progress)}% through queue</p>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div
            className="bg-amber-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Contact card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Contact info */}
          <div className="flex-1 space-y-4">
            {/* Facility + Owner */}
            <div>
              <h3 className="text-xl font-black text-white">
                {current.facilityName || 'Unknown Facility'}
              </h3>
              {current.ownerName && (
                <p className="text-sm text-slate-400 mt-0.5">👤 {current.ownerName}</p>
              )}
            </div>

            {/* Phone — big and prominent */}
            <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400/70 font-semibold uppercase">Phone</p>
                <p className="text-2xl font-black text-green-400 font-mono tracking-wide">
                  {current.phone || 'No phone'}
                </p>
              </div>
              {current.phone && (
                <a
                  href={`tel:${current.phone}`}
                  className="bg-green-600 hover:bg-green-500 text-white font-bold px-5 py-3 rounded-xl text-sm transition-all shadow flex items-center gap-2"
                >
                  📞 Call Now
                </a>
              )}
            </div>

            {/* Email */}
            {current.email && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">📧</span>
                <a href={`mailto:${current.email}`} className="text-sm text-blue-400 hover:text-blue-300">{current.email}</a>
              </div>
            )}

            {/* Address */}
            {current.address && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">📍</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {current.address}
                </a>
              </div>
            )}

            {/* Market / State badge */}
            {(current.market || current.state) && (
              <div className="flex gap-2">
                {current.market && (
                  <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-md">
                    {current.market}
                  </span>
                )}
              </div>
            )}

            {/* Call history */}
            {current.callHistory?.length > 0 && (
              <div className="mt-2 pt-3 border-t border-slate-800">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Previous Calls</p>
                <div className="space-y-1">
                  {current.callHistory.slice(-3).map((h, i) => (
                    <p key={i} className="text-xs text-slate-500">
                      {h.date} — <span className={STATUS_COLORS[h.outcome]?.includes('text-') ? STATUS_COLORS[h.outcome].split(' ').find(c => c.startsWith('text-')) : 'text-slate-400'}>
                        {STATUS_LABELS[h.outcome]}
                      </span>
                      {h.notes && <span className="italic"> — {h.notes}</span>}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Outcome logging */}
          <div className="lg:w-80 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Call Notes</label>
              <textarea
                value={callNote}
                onChange={e => setCallNote(e.target.value)}
                rows={3}
                placeholder="Quick notes about this call..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Log Outcome</label>
              <div className="grid grid-cols-2 gap-2">
                {CALL_OUTCOMES.map(o => (
                  <button
                    key={o.status}
                    onClick={() => onOutcome(current, o.status)}
                    className={`border rounded-xl px-3 py-2.5 text-xs font-bold transition-all text-center ${o.color}`}
                  >
                    <span className="text-base">{o.icon}</span>
                    <span className="block mt-0.5">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Callback date (shown for all, used when Call Back is clicked) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Callback Date (optional)</label>
              <input
                type="date"
                value={callbackDate}
                onChange={e => setCallbackDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
            className="text-sm text-slate-400 hover:text-white disabled:text-slate-700 transition-all font-semibold"
          >
            ← Previous
          </button>
          <p className="text-xs text-slate-600">{current.status !== 'fresh' ? `Status: ${STATUS_LABELS[current.status]}` : 'Not yet called'}</p>
          <button
            onClick={() => setIndex(Math.min(queue.length - 1, index + 1))}
            disabled={index >= queue.length - 1}
            className="text-sm text-amber-400 hover:text-amber-300 disabled:text-slate-700 transition-all font-semibold"
          >
            Skip →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Markets View ─────────────────────────────────────────────────────────────
function MarketsView({ stats, contacts }) {
  // State-level rollup
  const stateRollup = {};
  contacts.forEach(c => {
    const st = c.state || 'Unknown';
    if (!stateRollup[st]) stateRollup[st] = { state: st, total: 0, called: 0, conversations: 0, appointments: 0 };
    stateRollup[st].total++;
    if (c.status !== 'fresh') stateRollup[st].called++;
    if (c.status === 'conversation') stateRollup[st].conversations++;
    if (c.status === 'appointment') stateRollup[st].appointments++;
  });
  const stateEntries = Object.values(stateRollup).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      {/* State Coverage */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">State Coverage</h3>
        {stateEntries.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-8">No market data yet. Import lists with addresses.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {stateEntries.filter(s => s.state !== 'Unknown').map(s => {
              const pct = s.total > 0 ? Math.round((s.called / s.total) * 100) : 0;
              return (
                <div key={s.state} className="bg-slate-800 border border-slate-700 rounded-xl p-3 hover:border-slate-600 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-lg font-black text-white">{s.state}</span>
                    <span className="text-xs text-slate-500">{s.total}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1.5">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{pct}% called</span>
                    {s.conversations > 0 && <span className="text-green-400">{s.conversations} conv</span>}
                  </div>
                  {s.appointments > 0 && (
                    <p className="text-xs text-amber-400 mt-0.5">{s.appointments} appt{s.appointments > 1 ? 's' : ''}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Market Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Market Breakdown</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800 uppercase tracking-wide">
                <th className="text-left py-2.5 px-4">Market</th>
                <th className="text-center py-2.5 px-3">Total</th>
                <th className="text-center py-2.5 px-3">Fresh</th>
                <th className="text-center py-2.5 px-3">Called</th>
                <th className="text-center py-2.5 px-3">Conversations</th>
                <th className="text-center py-2.5 px-3">Appts</th>
                <th className="text-center py-2.5 px-3">Reach %</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(m => {
                const pct = m.total > 0 ? Math.round((m.called / m.total) * 100) : 0;
                return (
                  <tr key={m.market} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-semibold text-white">{m.market}</td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{m.total}</td>
                    <td className="py-2.5 px-3 text-center text-slate-400">{m.fresh}</td>
                    <td className="py-2.5 px-3 text-center text-blue-400">{m.called}</td>
                    <td className="py-2.5 px-3 text-center text-green-400">{m.conversations}</td>
                    <td className="py-2.5 px-3 text-center text-amber-400">{m.appointments}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs font-bold ${pct >= 75 ? 'text-green-400' : pct >= 25 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Lists View ───────────────────────────────────────────────────────────────
function ListsView({ lists, contacts, onDeleteList, onSelectList }) {
  return (
    <div className="space-y-3">
      {lists.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">📋</div>
          <h3 className="text-lg font-bold text-white mb-1">No Lists Yet</h3>
          <p className="text-sm text-slate-500">Click "Import List" to add your first cold call list.</p>
        </div>
      ) : lists.map(l => {
        const lContacts = contacts.filter(c => c.listId === l.id);
        const called = lContacts.filter(c => c.status !== 'fresh').length;
        const convos = lContacts.filter(c => c.status === 'conversation').length;
        const appts = lContacts.filter(c => c.status === 'appointment').length;
        const pct = lContacts.length > 0 ? Math.round((called / lContacts.length) * 100) : 0;
        const states = [...new Set(lContacts.map(c => c.state).filter(Boolean))];

        return (
          <div key={l.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-white">{l.name}</h3>
                  <span className="text-xs font-semibold bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md">{l.source}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Imported {l.importedAt} · {lContacts.length} contacts
                  {states.length > 0 && ` · ${states.join(', ')}`}
                </p>

                {/* Progress bar */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 bg-slate-800 rounded-full h-2">
                    <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 font-semibold w-10 text-right">{pct}%</span>
                </div>

                {/* Quick stats */}
                <div className="flex gap-4 mt-2">
                  <span className="text-xs text-blue-400">{called} called</span>
                  <span className="text-xs text-green-400">{convos} conversations</span>
                  <span className="text-xs text-amber-400">{appts} appts</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onSelectList(l.id)}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-all px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30"
                >
                  View
                </button>
                <button
                  onClick={() => { if (confirm(`Delete list "${l.name}" and all ${lContacts.length} contacts?`)) onDeleteList(l.id); }}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-all px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
