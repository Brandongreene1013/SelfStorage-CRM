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
  fresh:          'bg-slate-700 text-slate-300',
  no_answer:      'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40',
  voicemail:      'bg-blue-600/20 text-blue-400 border border-blue-600/40',
  conversation:   'bg-green-600/20 text-green-400 border border-green-600/40',
  appointment:    'bg-amber-600/20 text-amber-400 border border-amber-600/40',
  not_interested: 'bg-red-600/20 text-red-400 border border-red-600/40',
  callback:       'bg-purple-600/20 text-purple-400 border border-purple-600/40',
};

const CALL_OUTCOMES = [
  { status: 'no_answer',      label: 'No Answer',     icon: '📵', color: 'bg-yellow-600/20 border-yellow-600/40 text-yellow-400 hover:bg-yellow-600/30' },
  { status: 'voicemail',      label: 'Left VM',       icon: '📩', color: 'bg-blue-600/20 border-blue-600/40 text-blue-400 hover:bg-blue-600/30' },
  { status: 'conversation',   label: 'Conversation',  icon: '💬', color: 'bg-green-600/20 border-green-600/40 text-green-400 hover:bg-green-600/30' },
  { status: 'appointment',    label: 'Appt Set',      icon: '📅', color: 'bg-amber-600/20 border-amber-600/40 text-amber-400 hover:bg-amber-600/30' },
  { status: 'not_interested', label: 'Not Interested',icon: '🚫', color: 'bg-red-600/20 border-red-600/40 text-red-400 hover:bg-red-600/30' },
  { status: 'callback',       label: 'Call Back',     icon: '🔄', color: 'bg-purple-600/20 border-purple-600/40 text-purple-400 hover:bg-purple-600/30' },
];

const SOURCE_COLORS = {
  'Internal DB': 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  'CoStar':      'bg-green-600/20 text-green-400 border-green-600/30',
  'Tractiq':     'bg-purple-600/20 text-purple-400 border-purple-600/30',
  'Other':       'bg-slate-600/40 text-slate-400 border-slate-600/30',
};

// ─── Contact Detail Modal ─────────────────────────────────────────────────────
function ContactDetailModal({ contact, onClose, onStatusChange, onNotesChange, onDelete }) {
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [callbackDate, setCallbackDate] = useState(contact.callbackDate ?? '');

  function saveNotes() {
    onNotesChange(contact.id, notes);
  }

  function handleOutcome(status) {
    onStatusChange(contact.id, status, notes);
    onNotesChange(contact.id, notes);
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.fresh}`}>
                {STATUS_LABELS[contact.status] ?? 'Fresh'}
              </span>
              {contact.market && (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                  {contact.market}
                </span>
              )}
            </div>
            <h2 className="text-xl font-black text-white leading-tight">
              {contact.facilityName || 'Unnamed Facility'}
            </h2>
            {contact.ownerName && (
              <p className="text-sm text-slate-400 mt-0.5">👤 {contact.ownerName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none p-1 ml-3 flex-shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* Contact info row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Phone */}
            <div className="bg-green-600/10 border border-green-600/25 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-400/70 uppercase mb-1">Phone</p>
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="text-xl font-black text-green-400 font-mono tracking-wide hover:text-green-300 transition-colors"
                >
                  {contact.phone}
                </a>
              ) : (
                <p className="text-slate-600 text-sm italic">No phone</p>
              )}
            </div>

            {/* Email */}
            <div className="bg-blue-600/10 border border-blue-600/25 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-400/70 uppercase mb-1">Email</p>
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors break-all"
                >
                  {contact.email}
                </a>
              ) : (
                <p className="text-slate-600 text-sm italic">No email</p>
              )}
            </div>
          </div>

          {/* Address */}
          {contact.address && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
              <span className="text-lg mt-0.5">📍</span>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-0.5">Facility Address</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {contact.address}
                </a>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Call Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder="Log your call notes here — interest level, next steps, what they said..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none transition-colors"
            />
          </div>

          {/* Log Outcome */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Log Outcome</p>
            <div className="grid grid-cols-3 gap-2">
              {CALL_OUTCOMES.map(o => (
                <button
                  key={o.status}
                  onClick={() => handleOutcome(o.status)}
                  className={`border rounded-xl px-3 py-2.5 text-xs font-bold transition-all text-center ${o.color} ${
                    contact.status === o.status ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-current' : ''
                  }`}
                >
                  <span className="text-base block">{o.icon}</span>
                  <span className="mt-0.5 block">{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Callback date */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Callback Date</label>
            <input
              type="date"
              value={callbackDate}
              onChange={e => setCallbackDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Call history */}
          {contact.callHistory?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Call History</p>
              <div className="space-y-1.5">
                {[...contact.callHistory].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-500 flex-shrink-0">{h.date}</span>
                    <span className={`font-semibold flex-shrink-0 ${STATUS_COLORS[h.outcome]?.includes('text-') ? STATUS_COLORS[h.outcome].split(' ').find(c => c.startsWith('text-')) : 'text-slate-400'}`}>
                      {STATUS_LABELS[h.outcome] ?? h.outcome}
                    </span>
                    {h.notes && <span className="text-slate-400 italic truncate">{h.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800">
          <button
            onClick={() => { onDelete(contact.id); onClose(); }}
            className="text-xs text-red-500 hover:text-red-400 transition-colors font-semibold"
          >
            Delete Contact
          </button>
          <button
            onClick={() => { saveNotes(); onClose(); }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2 rounded-xl text-sm transition-all"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ contact, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-black/30 group"
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.fresh}`}>
          {STATUS_LABELS[contact.status] ?? 'Fresh'}
        </span>
        {contact.market && (
          <span className="text-xs text-amber-400/70 font-semibold">{contact.market}</span>
        )}
      </div>

      {/* Facility Name */}
      <h3 className="font-black text-white text-sm leading-tight mb-1 group-hover:text-amber-400 transition-colors line-clamp-2">
        {contact.facilityName || <span className="text-slate-600 italic">Unnamed Facility</span>}
      </h3>

      {/* Owner */}
      {contact.ownerName && (
        <p className="text-xs text-slate-400 mb-3">👤 {contact.ownerName}</p>
      )}

      <div className="h-px bg-slate-800 mb-3" />

      {/* Contact details */}
      <div className="space-y-1.5">
        {contact.phone && (
          <p className="text-xs font-mono text-green-400 flex items-center gap-1.5">
            <span className="text-slate-500">📞</span> {contact.phone}
          </p>
        )}
        {contact.email && (
          <p className="text-xs text-blue-400 flex items-center gap-1.5 truncate">
            <span className="text-slate-500">📧</span> <span className="truncate">{contact.email}</span>
          </p>
        )}
        {contact.address && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
            <span>📍</span> <span className="truncate">{contact.address}</span>
          </p>
        )}
      </div>

      {/* Notes preview */}
      {contact.notes && (
        <p className="mt-2 pt-2 border-t border-slate-800 text-xs text-slate-500 italic line-clamp-2">
          {contact.notes}
        </p>
      )}

      {/* Last called */}
      {contact.lastCalled && (
        <p className="mt-2 text-xs text-slate-600">Last called {contact.lastCalled}</p>
      )}
    </div>
  );
}

// ─── Main Database Component ──────────────────────────────────────────────────
export default function Database({ onCallLogged }) {
  const {
    lists, contacts,
    importList, updateContactStatus, updateContactCallback,
    updateContactNotes, deleteList, deleteContact,
  } = useDatabase();

  const [subView, setSubView]       = useState('contacts');
  const [showImport, setShowImport] = useState(false);
  const [activeListId, setActiveListId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [openContact, setOpenContact] = useState(null);

  // Call queue state
  const [callQueueIndex, setCallQueueIndex] = useState(0);
  const [callNote, setCallNote]       = useState('');
  const [callbackDate, setCallbackDate] = useState('');

  // Filtered contacts
  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (activeListId !== 'all' && c.listId !== activeListId) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (c.facilityName ?? '').toLowerCase().includes(q) ||
          (c.ownerName ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.address ?? '').toLowerCase().includes(q) ||
          (c.market ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [contacts, activeListId, statusFilter, search]);

  const callQueue = useMemo(() =>
    filtered.filter(c => ['fresh','callback','no_answer','voicemail'].includes(c.status)),
    [filtered]
  );

  function handleCallOutcome(contact, status) {
    updateContactStatus(contact.id, status, callNote);
    if (status === 'callback' && callbackDate) updateContactCallback(contact.id, callbackDate);
    if (onCallLogged) onCallLogged(status);
    setCallNote('');
    setCallbackDate('');
    if (callQueueIndex >= callQueue.length - 1) setCallQueueIndex(Math.max(0, callQueue.length - 2));
  }

  function handleStatusChangeFromModal(id, status, notes) {
    updateContactStatus(id, status, notes);
    if (onCallLogged) onCallLogged(status);
    // refresh open contact
    setOpenContact(prev => prev?.id === id ? { ...prev, status, lastCalled: new Date().toISOString().slice(0,10) } : prev);
  }

  function handleImport(name, source, rawText) {
    importList(name, source, rawText);
    setShowImport(false);
    setSubView('contacts');
  }

  // Aggregate stats
  const totalCalled     = contacts.filter(c => c.status !== 'fresh').length;
  const totalConversations = contacts.filter(c => c.status === 'conversation').length;
  const totalAppointments  = contacts.filter(c => c.status === 'appointment').length;

  return (
    <div className="flex gap-5 min-h-0">

      {/* ── LEFT: List Organizer Sidebar ── */}
      <div className="flex-shrink-0 w-56 space-y-2">
        <button
          onClick={() => setShowImport(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-3 py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 shadow"
        >
          <span className="text-lg font-black leading-none">+</span> Import List
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2.5 border-b border-slate-800">
            Lists
          </p>

          {/* All contacts */}
          <button
            onClick={() => { setActiveListId('all'); setSubView('contacts'); }}
            className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-all text-sm ${
              activeListId === 'all' && subView === 'contacts'
                ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800 border-l-2 border-transparent'
            }`}
          >
            <span className="font-semibold">All Contacts</span>
            <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-md">{contacts.length}</span>
          </button>

          {lists.length === 0 && (
            <p className="text-xs text-slate-600 italic px-3 py-3">No lists yet</p>
          )}

          {lists.map(l => {
            const count = contacts.filter(c => c.listId === l.id).length;
            const isActive = activeListId === l.id && subView === 'contacts';
            return (
              <button
                key={l.id}
                onClick={() => { setActiveListId(l.id); setSubView('contacts'); }}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-800/50 transition-all ${
                  isActive
                    ? 'bg-amber-500/10 border-l-2 border-amber-500'
                    : 'hover:bg-slate-800 border-l-2 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold truncate flex-1 mr-1 ${isActive ? 'text-amber-400' : 'text-slate-300'}`}>
                    {l.name}
                  </span>
                  <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-md flex-shrink-0">{count}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className={`text-xs border rounded px-1 ${SOURCE_COLORS[l.source] ?? SOURCE_COLORS.Other}`}>
                    {l.source}
                  </span>
                  <span className="text-xs text-slate-600">{l.importedAt}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Other views */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2.5 border-b border-slate-800">
            Views
          </p>
          {[
            { key: 'callQueue', label: '📞 Call Queue', badge: callQueue.length },
            { key: 'markets',   label: '🗺 Markets',    badge: null },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setSubView(t.key); if (t.key === 'callQueue') setCallQueueIndex(0); }}
              className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-sm border-b border-slate-800/50 transition-all ${
                subView === t.key
                  ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border-l-2 border-transparent'
              }`}
            >
              <span className="font-semibold">{t.label}</span>
              {t.badge != null && t.badge > 0 && (
                <span className="text-xs bg-green-600/20 text-green-400 border border-green-600/30 px-1.5 py-0.5 rounded-md">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Delete list button */}
        {activeListId !== 'all' && (
          <button
            onClick={() => {
              const l = lists.find(x => x.id === activeListId);
              const count = contacts.filter(c => c.listId === activeListId).length;
              if (confirm(`Delete "${l?.name}" and all ${count} contacts?`)) {
                deleteList(activeListId);
                setActiveListId('all');
              }
            }}
            className="w-full text-xs font-semibold text-red-500 hover:text-red-400 bg-red-900/10 hover:bg-red-900/20 border border-red-900/30 rounded-xl px-3 py-2 transition-all"
          >
            Delete This List
          </button>
        )}
      </div>

      {/* ── RIGHT: Main Content ── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-semibold uppercase">Contacts</p>
            <p className="text-2xl font-black text-white">{filtered.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-semibold uppercase">Called</p>
            <p className="text-2xl font-black text-blue-400">{filtered.filter(c => c.status !== 'fresh').length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-semibold uppercase">Conversations</p>
            <p className="text-2xl font-black text-green-400">{filtered.filter(c => c.status === 'conversation').length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-semibold uppercase">Appts Set</p>
            <p className="text-2xl font-black text-amber-400">{filtered.filter(c => c.status === 'appointment').length}</p>
          </div>
        </div>

        {/* ── Contacts: filter bar + card grid ── */}
        {subView === 'contacts' && (
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search facility, owner, phone, email..."
                className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className="text-xs text-slate-600">{filtered.length} contacts</span>
            </div>

            {/* Card grid */}
            {filtered.length === 0 ? (
              <div className="text-center py-20 text-slate-600">
                <div className="text-5xl mb-3">📋</div>
                <p className="text-sm">No contacts. Import a list to get started.</p>
                <button onClick={() => setShowImport(true)} className="mt-3 text-amber-500 hover:text-amber-400 text-sm font-semibold">
                  + Import List
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(c => (
                  <PropertyCard
                    key={c.id}
                    contact={c}
                    onClick={() => setOpenContact(c)}
                  />
                ))}
              </div>
            )}
          </div>
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
          <MarketsView contacts={contacts} />
        )}
      </div>

      {/* Contact Detail Modal */}
      {openContact && (
        <ContactDetailModal
          contact={contacts.find(c => c.id === openContact.id) ?? openContact}
          onClose={() => setOpenContact(null)}
          onStatusChange={handleStatusChangeFromModal}
          onNotesChange={updateContactNotes}
          onDelete={(id) => { deleteContact(id); setOpenContact(null); }}
        />
      )}

      {showImport && (
        <ImportListModal onImport={handleImport} onClose={() => setShowImport(false)} />
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
        <p className="text-sm text-slate-500">No fresh contacts to call. Import a new list.</p>
      </div>
    );
  }

  const current = queue[Math.min(index, queue.length - 1)];
  const list = lists.find(l => l.id === current.listId);
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-400">
            {list?.name ?? 'All Lists'} · Contact {index + 1} of {queue.length}
          </p>
          <p className="text-xs font-semibold text-amber-400">{Math.round(progress)}% through queue</p>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div className="bg-amber-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Contact card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-2xl font-black text-white">{current.facilityName || 'Unknown Facility'}</h3>
              {current.ownerName && <p className="text-sm text-slate-400 mt-0.5">👤 {current.ownerName}</p>}
            </div>
            <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400/70 font-semibold uppercase">Phone</p>
                <p className="text-2xl font-black text-green-400 font-mono">{current.phone || 'No phone'}</p>
              </div>
              {current.phone && (
                <a href={`tel:${current.phone}`} className="bg-green-600 hover:bg-green-500 text-white font-bold px-5 py-3 rounded-xl text-sm transition-all shadow flex items-center gap-2">
                  📞 Call Now
                </a>
              )}
            </div>
            {current.email && (
              <a href={`mailto:${current.email}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                <span>📧</span> {current.email}
              </a>
            )}
            {current.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              >
                <span>📍</span> {current.address}
              </a>
            )}
            {current.market && (
              <span className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-md">
                {current.market}
              </span>
            )}
          </div>

          <div className="lg:w-72 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Call Notes</label>
              <textarea
                value={callNote}
                onChange={e => setCallNote(e.target.value)}
                rows={3}
                placeholder="Quick notes..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Log Outcome</label>
              <div className="grid grid-cols-2 gap-2">
                {CALL_OUTCOMES.map(o => (
                  <button key={o.status} onClick={() => onOutcome(current, o.status)}
                    className={`border rounded-xl px-3 py-2.5 text-xs font-bold transition-all text-center ${o.color}`}>
                    <span className="text-base">{o.icon}</span>
                    <span className="block mt-0.5">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Callback Date</label>
              <input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
            className="text-sm text-slate-400 hover:text-white disabled:text-slate-700 transition-all font-semibold">
            ← Previous
          </button>
          <p className="text-xs text-slate-600">{STATUS_LABELS[current.status] ?? 'Fresh'}</p>
          <button onClick={() => setIndex(Math.min(queue.length - 1, index + 1))} disabled={index >= queue.length - 1}
            className="text-sm text-amber-400 hover:text-amber-300 disabled:text-slate-700 transition-all font-semibold">
            Skip →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Markets View ─────────────────────────────────────────────────────────────
function MarketsView({ contacts }) {
  const stateRollup = {};
  contacts.forEach(c => {
    const st = c.state || 'Unknown';
    if (!stateRollup[st]) stateRollup[st] = { state: st, total: 0, called: 0, conversations: 0, appointments: 0 };
    stateRollup[st].total++;
    if (c.status !== 'fresh') stateRollup[st].called++;
    if (c.status === 'conversation') stateRollup[st].conversations++;
    if (c.status === 'appointment') stateRollup[st].appointments++;
  });
  const entries = Object.values(stateRollup).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {entries.filter(s => s.state !== 'Unknown').map(s => {
          const pct = s.total > 0 ? Math.round((s.called / s.total) * 100) : 0;
          return (
            <div key={s.state} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-lg font-black text-white">{s.state}</span>
                <span className="text-xs text-slate-500">{s.total}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-500">{pct}% called</p>
              {s.conversations > 0 && <p className="text-xs text-green-400">{s.conversations} conv</p>}
              {s.appointments > 0 && <p className="text-xs text-amber-400">{s.appointments} appt{s.appointments > 1 ? 's' : ''}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
