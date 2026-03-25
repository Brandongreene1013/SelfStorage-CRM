import { useState, useMemo, useRef, useEffect } from 'react';
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

// ─── Editable field ───────────────────────────────────────────────────────────
function EditableField({ label, value, placeholder, onChange, mono, href, type = 'text' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      {editing ? (
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
          className={`w-full bg-slate-800 border border-amber-500 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none ${mono ? 'font-mono' : ''}`}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="group flex items-center gap-2 cursor-text rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-800 transition-all"
          title="Click to edit"
        >
          {value ? (
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`text-sm text-blue-400 hover:text-blue-300 transition-colors ${mono ? 'font-mono' : ''}`}>
                {value}
              </a>
            ) : (
              <span className={`text-sm text-white ${mono ? 'font-mono text-green-400' : ''}`}>{value}</span>
            )
          ) : (
            <span className="text-sm text-slate-600 italic">{placeholder}</span>
          )}
          <span className="opacity-0 group-hover:opacity-100 text-slate-600 text-xs transition-opacity">✏️</span>
        </div>
      )}
    </div>
  );
}

// ─── Contact Detail Modal ─────────────────────────────────────────────────────
function ContactDetailModal({ contact, onClose, onStatusChange, onNotesChange, onUpdate, onDelete }) {
  const [notes, setNotes]           = useState(contact.notes ?? '');
  const [callbackDate, setCallbackDate] = useState(contact.callbackDate ?? '');

  // Build Google search query for this facility
  const searchQuery = [contact.facilityName, 'self storage', contact.market || contact.state].filter(Boolean).join(' ');
  const missingInfo = !contact.phone || !contact.email || !contact.address;

  function saveNotes() { onNotesChange(contact.id, notes); }

  function handleOutcome(status) {
    onStatusChange(contact.id, status, notes);
    onNotesChange(contact.id, notes);
  }

  function field(key) {
    return (val) => onUpdate(contact.id, { [key]: val });
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.fresh}`}>
                {STATUS_LABELS[contact.status] ?? 'Fresh'}
              </span>
              {contact.market && (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                  {contact.market}
                </span>
              )}
            </div>
            {/* Facility Name — editable, primary field */}
            <EditableField
              label="Facility Name"
              value={contact.facilityName}
              placeholder="Click to add facility name"
              onChange={field('facilityName')}
            />
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none p-1 flex-shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">

          {/* ── Google Business Finder ── */}
          <div className={`rounded-xl p-4 border ${missingInfo ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                🔍 Find Business Info
              </p>
              {missingInfo && (
                <span className="text-xs text-amber-400 font-semibold">Missing data detected</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-600/40 text-blue-400 hover:bg-blue-600/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              >
                🌐 Google Search
              </a>
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              >
                📍 Google Maps
              </a>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=lcl`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 hover:bg-yellow-600/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              >
                🏢 Business Listing
              </a>
              {contact.ownerName && (
                <a
                  href={`https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(contact.ownerName + ' self storage')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-blue-800/20 border border-blue-800/40 text-blue-300 hover:bg-blue-800/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                >
                  💼 LinkedIn
                </a>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-2">Click to open in new tab — copy info back into the fields below</p>
          </div>

          {/* ── Editable contact fields ── */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <EditableField label="Owner Name" value={contact.ownerName} placeholder="Click to add owner name" onChange={field('ownerName')} />
              <EditableField label="Phone" value={contact.phone} placeholder="Click to add phone" onChange={field('phone')} mono
                href={contact.phone ? `tel:${contact.phone}` : null} />
            </div>
            <EditableField label="Email" value={contact.email} placeholder="Click to add email" onChange={field('email')}
              href={contact.email ? `mailto:${contact.email}` : null} />
            <EditableField label="Facility Address" value={contact.address} placeholder="Click to add address" onChange={field('address')}
              href={contact.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}` : null} />
          </div>

          {/* ── Call Notes ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Call Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder="Log your call notes — interest level, next steps, what they said..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* ── Log Outcome ── */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Log Outcome</p>
            <div className="grid grid-cols-3 gap-2">
              {CALL_OUTCOMES.map(o => (
                <button key={o.status} onClick={() => handleOutcome(o.status)}
                  className={`border rounded-xl px-3 py-2.5 text-xs font-bold transition-all text-center ${o.color} ${
                    contact.status === o.status ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-current' : ''
                  }`}>
                  <span className="text-base block">{o.icon}</span>
                  <span className="mt-0.5 block">{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Callback date ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Callback Date</label>
            <input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>

          {/* ── Call history ── */}
          {contact.callHistory?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Call History</p>
              <div className="space-y-1.5">
                {[...contact.callHistory].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-500 flex-shrink-0">{h.date}</span>
                    <span className={`font-semibold flex-shrink-0 ${STATUS_COLORS[h.outcome]?.split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-400'}`}>
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
          <button onClick={() => { onDelete(contact.id); onClose(); }}
            className="text-xs text-red-500 hover:text-red-400 transition-colors font-semibold">
            Delete Contact
          </button>
          <button onClick={() => { saveNotes(); onClose(); }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2 rounded-xl text-sm transition-all">
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ contact, onClick }) {
  const mapsQuery = encodeURIComponent(
    [contact.facilityName, 'self storage', contact.market || contact.state].filter(Boolean).join(' ')
  );

  return (
    <div
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-black/30 group"
    >
      {/* Status + market */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.fresh}`}>
          {STATUS_LABELS[contact.status] ?? 'Fresh'}
        </span>
        {contact.market && (
          <span className="text-xs text-amber-400/70 font-semibold">{contact.market}</span>
        )}
      </div>

      {/* Owner Name — PRIMARY (who you're calling) */}
      <h3 className="font-black text-white text-base leading-tight group-hover:text-amber-400 transition-colors line-clamp-1">
        {contact.ownerName || <span className="text-slate-500 italic text-sm font-semibold">Unknown Owner</span>}
      </h3>

      {/* Facility Name — secondary, with Google Maps link */}
      <div className="flex items-center gap-1.5 mt-0.5 mb-3 min-h-[1.25rem]">
        {contact.facilityName ? (
          <>
            <span className="text-xs text-slate-400 truncate">{contact.facilityName}</span>
            <a
              href={`https://www.google.com/maps/search/${mapsQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Find on Google Maps"
              className="flex-shrink-0 text-slate-600 hover:text-blue-400 transition-colors text-xs"
            >
              🗺
            </a>
          </>
        ) : (
          <a
            href={`https://www.google.com/maps/search/${mapsQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-slate-600 hover:text-blue-400 italic transition-colors"
          >
            Find facility →
          </a>
        )}
      </div>

      <div className="h-px bg-slate-800 mb-3" />

      {/* Contact details */}
      <div className="space-y-1.5">
        {contact.phone ? (
          <p className="text-xs font-mono text-green-400 flex items-center gap-1.5">
            <span className="text-slate-500">📞</span> {contact.phone}
          </p>
        ) : (
          <p className="text-xs text-slate-700 italic flex items-center gap-1.5">
            <span>📞</span> No phone
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

// ─── Add Contact Modal ────────────────────────────────────────────────────────
function AddContactModal({ listName, onSave, onClose }) {
  const [form, setForm] = useState({
    ownerName: '', facilityName: '', phone: '', email: '', address: '', state: '', notes: '',
  });

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })); }

  function handleSave() {
    if (!form.ownerName.trim() && !form.facilityName.trim()) return;
    onSave(form);
    setForm({ ownerName: '', facilityName: '', phone: '', email: '', address: '', state: '', notes: '' });
  }

  function handleSaveAndAnother() {
    if (!form.ownerName.trim() && !form.facilityName.trim()) return;
    onSave(form);
    setForm({ ownerName: '', facilityName: '', phone: '', email: '', address: '', state: '', notes: '' });
  }

  const fields = [
    { key: 'ownerName',    label: 'Owner Name *',    placeholder: 'John Smith',             type: 'text' },
    { key: 'facilityName', label: 'Facility Name',   placeholder: 'ABC Self Storage',        type: 'text' },
    { key: 'phone',        label: 'Phone',           placeholder: '(555) 000-0000',          type: 'tel'  },
    { key: 'email',        label: 'Email',           placeholder: 'john@abcstorage.com',     type: 'email'},
    { key: 'address',      label: 'Address',         placeholder: '123 Main St, City, FL',   type: 'text' },
  ];

  const canSave = form.ownerName.trim() || form.facilityName.trim();

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">Add Contact</h2>
            <p className="text-xs text-slate-500 mt-0.5">Adding to: <span className="text-amber-400">{listName}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
        </div>

        <div className="p-5 space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{f.label}</label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Any initial notes..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-800 gap-3">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <div className="flex gap-2">
            <button
              onClick={handleSaveAndAnother}
              disabled={!canSave}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                canSave ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              Save + Add Another
            </button>
            <button
              onClick={() => { handleSave(); onClose(); }}
              disabled={!canSave}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                canSave ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List Sidebar Item (with inline rename + delete) ─────────────────────────
function ListSidebarItem({ list: l, count, isActive, onSelect, onRename, onDelete }) {
  const [renaming, setRenaming]       = useState(false);
  const [draft, setDraft]             = useState(l.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);

  function commitRename() {
    setRenaming(false);
    if (draft.trim() && draft.trim() !== l.name) onRename(draft.trim());
    else setDraft(l.name);
  }

  return (
    <div
      className={`border-b border-slate-800/50 border-l-2 transition-all ${
        isActive ? 'bg-amber-500/10 border-l-amber-500' : 'border-l-transparent hover:bg-slate-800'
      }`}
    >
      <div className="flex items-center gap-1 px-3 pt-2.5">
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(l.name); setRenaming(false); } }}
            className="flex-1 bg-slate-700 border border-amber-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
          />
        ) : (
          <button
            onClick={onSelect}
            className={`flex-1 text-left text-xs font-semibold truncate ${isActive ? 'text-amber-400' : 'text-slate-300'}`}
          >
            {l.name}
          </button>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setRenaming(true); setDraft(l.name); setConfirmDelete(false); }}
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

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="mx-3 mb-2 mt-1 bg-red-900/30 border border-red-800/50 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-red-400 font-semibold">Delete {count} contacts?</span>
          <div className="flex gap-1.5">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 hover:text-white transition-all">Cancel</button>
            <button onClick={() => { onDelete(l.id); setConfirmDelete(false); }} className="text-xs bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-0.5 rounded transition-all">Delete</button>
          </div>
        </div>
      )}

      <button onClick={onSelect} className="w-full text-left px-3 pb-2 pt-0.5">
        <div className="flex items-center justify-between">
          <span className={`text-xs border rounded px-1 ${SOURCE_COLORS[l.source] ?? SOURCE_COLORS.Other}`}>
            {l.source}
          </span>
          <span className="text-xs text-slate-600">{l.importedAt}</span>
        </div>
      </button>
    </div>
  );
}

// ─── Main Database Component ──────────────────────────────────────────────────
export default function Database({ onCallLogged }) {
  const {
    lists, contacts,
    importList, createList, addContact,
    updateContactStatus, updateContactCallback,
    updateContactNotes, updateContact, deleteList, renameList, deleteContact,
  } = useDatabase();

  const [subView, setSubView]       = useState('contacts');
  const [showImport, setShowImport]     = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showNewList, setShowNewList]   = useState(false);
  const [newListName, setNewListName]   = useState('');
  // Default to most recent list (last in array), fall back to 'all'
  const [activeListId, setActiveListId] = useState(() => lists.length > 0 ? lists[lists.length - 1].id : 'all');
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
    const result = importList(name, source, rawText);
    setShowImport(false);
    setSubView('contacts');
    if (result?.list?.id) setActiveListId(result.list.id);
  }

  // Aggregate stats
  const totalCalled     = contacts.filter(c => c.status !== 'fresh').length;
  const totalConversations = contacts.filter(c => c.status === 'conversation').length;
  const totalAppointments  = contacts.filter(c => c.status === 'appointment').length;

  return (
    <div className="flex gap-5 min-h-0">

      {/* ── LEFT: List Organizer Sidebar ── */}
      <div className="flex-shrink-0 w-56 space-y-2">
        <div className="flex gap-1.5">
        <button
          onClick={() => setShowImport(true)}
          className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-3 py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 shadow"
        >
          <span className="text-lg font-black leading-none">+</span> Import
        </button>
        <button
          onClick={() => setShowNewList(true)}
          className="bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 font-bold px-3 py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
          title="Create blank list"
        >
          ✎ New
        </button>
        </div>

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

          {[...lists].reverse().map(l => (
            <ListSidebarItem
              key={l.id}
              list={l}
              count={contacts.filter(c => c.listId === l.id).length}
              isActive={activeListId === l.id && subView === 'contacts'}
              onSelect={() => { setActiveListId(l.id); setSubView('contacts'); }}
              onRename={(name) => renameList(l.id, name)}
              onDelete={(id) => { deleteList(id); if (activeListId === id) setActiveListId('all'); }}
            />
          ))}
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
              {activeListId !== 'all' && (
                <button
                  onClick={() => setShowAddContact(true)}
                  className="ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                >
                  + Add Person
                </button>
              )}
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
          onUpdate={updateContact}
          onDelete={(id) => { deleteContact(id); setOpenContact(null); }}
        />
      )}

      {showImport && (
        <ImportListModal onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {/* ── New Blank List modal ── */}
      {showNewList && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setShowNewList(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-black text-white">Create Blank List</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">List Name *</label>
              <input
                autoFocus
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newListName.trim()) {
                    const list = createList(newListName.trim(), 'Internal DB');
                    setActiveListId(list.id);
                    setSubView('contacts');
                    setNewListName('');
                    setShowNewList(false);
                  }
                }}
                placeholder="e.g. Personal Referrals, Drive-by Prospects..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewList(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-all">Cancel</button>
              <button
                disabled={!newListName.trim()}
                onClick={() => {
                  const list = createList(newListName.trim(), 'Internal DB');
                  setActiveListId(list.id);
                  setSubView('contacts');
                  setNewListName('');
                  setShowNewList(false);
                }}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                  newListName.trim() ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Contact modal ── */}
      {showAddContact && activeListId !== 'all' && (
        <AddContactModal
          listName={lists.find(l => l.id === activeListId)?.name ?? ''}
          onSave={(fields) => addContact(activeListId, fields)}
          onClose={() => setShowAddContact(false)}
        />
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
              <h3 className="text-2xl font-black text-white">{current.ownerName || 'Unknown Owner'}</h3>
              {current.facilityName ? (
                <a
                  href={`https://www.google.com/maps/search/${encodeURIComponent([current.facilityName, 'self storage', current.market || current.state].filter(Boolean).join(' '))}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-blue-400 mt-0.5 inline-flex items-center gap-1 transition-colors"
                >
                  {current.facilityName} 🗺
                </a>
              ) : (
                <a
                  href={`https://www.google.com/maps/search/${encodeURIComponent([(current.ownerName ?? ''), 'self storage', current.market || current.state].filter(Boolean).join(' '))}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-sm text-slate-500 hover:text-blue-400 mt-0.5 italic inline-flex items-center gap-1 transition-colors"
                >
                  Find facility on Maps 🗺
                </a>
              )}
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
