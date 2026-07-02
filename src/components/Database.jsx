import { useState, useMemo, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import ImportListModal from './ImportListModal';
import { LogActionModal, LastActionLine } from './ActionLog';
import ClientCard from './ClientCard';
import MoveMenu from './MoveMenu';
import { ACTION_TYPES, LEAD_TEMPS } from '../data/constants';
import { ModalLayout, StatusBadge, SearchToolbar, EmptyState } from './ui';
import { RelatedTasks, TaskModal, getNextOpenTask, dueMeta, legacyActionDefaults, buildCallbackTaskQueue, TASK_TYPE_MAP } from './tasks';

// Generic droppable wrapper for sidebar targets (lists + the Clients target)
function DropTarget({ id, className = '', activeClassName = '', children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`${className} ${isOver ? activeClassName : ''}`}>{children}</div>;
}

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

// Same palette, mapped to StatusBadge's variant names
const STATUS_VARIANT = {
  fresh: 'slate', no_answer: 'yellow', voicemail: 'blue', conversation: 'green',
  appointment: 'amber', not_interested: 'red', callback: 'purple',
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
  'TractIQ':     'bg-purple-600/20 text-purple-400 border-purple-600/30',
  'Reonomy':     'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
  'County Records': 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  'Manual Excel': 'bg-slate-600/40 text-slate-300 border-slate-600/30',
  'Other':       'bg-slate-600/40 text-slate-400 border-slate-600/30',
};

function contactSource(contact, lists = []) {
  return contact.source || lists.find(l => l.id === contact.listId)?.source || '';
}

function SourceBadge({ source }) {
  if (!source) return null;
  return (
    <span className={`text-xs border rounded px-1.5 py-0.5 whitespace-nowrap ${SOURCE_COLORS[source] ?? SOURCE_COLORS.Other}`}>
      {source}
    </span>
  );
}

const PHONE_LABELS = ['Mobile', 'Office', 'Owner', 'Manager', 'Unknown'];

function normalizedAlternatePhones(phones = []) {
  return (Array.isArray(phones) ? phones : [])
    .map((p, idx) => ({
      id: p.id ?? `${idx}-${p.phone ?? ''}`,
      label: PHONE_LABELS.includes(p.label) ? p.label : 'Unknown',
      phone: p.phone ?? '',
    }))
    .filter(p => p.phone.trim());
}

function isTypingTarget(target) {
  if (!target) return false;
  if (target.closest?.('[role="dialog"]')) return true;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

// ─── Editable field ───────────────────────────────────────────────────────────
const RESEARCH_LINK_CLASSES = {
  google: 'bg-blue-600/15 border-blue-600/30 text-blue-300 hover:bg-blue-600/25',
  maps: 'bg-green-600/15 border-green-600/30 text-green-300 hover:bg-green-600/25',
  linkedin: 'bg-sky-600/15 border-sky-600/30 text-sky-300 hover:bg-sky-600/25',
  whitepages: 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700',
};

function contactDisplayName(contact) {
  return contact?.ownerName || contact?.facilityName || 'Unknown Owner';
}

function contactSearchQuery(contact) {
  return [contact?.facilityName, contact?.ownerName, 'self storage', contact?.market || contact?.state]
    .filter(Boolean)
    .join(' ');
}

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

function AdditionalPhonesEditor({ phones = [], onSave, compact = false }) {
  const [draft, setDraft] = useState(() => normalizedAlternatePhones(phones));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setDraft(normalizedAlternatePhones(phones)); }, [phones]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(normalizedAlternatePhones(phones));

  function updateRow(idx, fields) {
    setDraft(prev => prev.map((p, i) => i === idx ? { ...p, ...fields } : p));
  }

  function addRow() {
    setDraft(prev => [...prev, { id: `new-${Date.now()}`, label: 'Unknown', phone: '' }]);
  }

  function deleteRow(idx) {
    setDraft(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const clean = normalizedAlternatePhones(draft);
    setSaving(true);
    setError('');
    const result = await onSave(clean);
    setSaving(false);
    if (result?.error === 'alternate_phones_migration_needed') {
      setError('Run sql/contact_alternate_phones_migration.sql in Supabase, then refresh to save additional phones.');
      return;
    }
    if (result?.error) setError(result.error);
  }

  return (
    <div className={`${compact ? 'space-y-2' : 'bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Additional Phones</p>
        <button onClick={addRow} className="text-xs font-semibold text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-1 transition-all">
          + Phone
        </button>
      </div>

      {draft.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No additional numbers saved.</p>
      ) : (
        <div className="space-y-2">
          {draft.map((p, idx) => (
            <div key={p.id ?? idx} className="grid grid-cols-[100px_minmax(0,1fr)_auto_auto] gap-2 items-center">
              <select
                value={p.label}
                onChange={e => updateRow(idx, { label: e.target.value })}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
              >
                {PHONE_LABELS.map(label => <option key={label} value={label}>{label}</option>)}
              </select>
              <input
                type="tel"
                value={p.phone}
                onChange={e => updateRow(idx, { phone: e.target.value })}
                placeholder="(555) 000-0000"
                className="min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              {p.phone?.trim() ? (
                <a href={`tel:${p.phone}`} className="text-xs font-bold bg-green-600/15 border border-green-600/30 text-green-400 hover:bg-green-600/25 rounded-lg px-2 py-1.5 transition-all">
                  Call
                </a>
              ) : (
                <span className="text-xs text-slate-700 px-2">Call</span>
              )}
              <button onClick={() => deleteRow(idx)} className="text-xs text-slate-600 hover:text-red-400 px-1 py-1 transition-all" title="Remove phone">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-xs text-red-400">{error}</p> : <span />}
        {isDirty && (
          <button onClick={save} disabled={saving} className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 px-3 py-1.5 rounded-lg transition-all">
            {saving ? 'Saving...' : 'Save Phones'}
          </button>
        )}
      </div>
    </div>
  );
}

function DeleteContactConfirmModal({ contact, openTaskCount = 0, onConfirm, onClose }) {
  return (
    <ModalLayout onClose={onClose} size="sm" className="p-6 text-center">
      <div className="text-4xl mb-3">Delete</div>
      <h2 className="text-lg font-bold text-white mb-1">Delete Contact?</h2>
      <p className="text-slate-400 text-sm mb-3">
        Delete <span className="text-white font-semibold">{contactDisplayName(contact)}</span> from the database? This cannot be undone.
      </p>
      {openTaskCount > 0 && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
          {openTaskCount} open related task{openTaskCount === 1 ? '' : 's'} will remain in Tasks and may need cleanup.
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-sm font-semibold">
          Cancel
        </button>
        <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all">
          Delete
        </button>
      </div>
    </ModalLayout>
  );
}
function ContactDetailModal({ contact, lists = [], onClose, onStatusChange, onNotesChange, onUpdate, onDelete, taskApi }) {
  const [notes, setNotes]           = useState(contact.notes ?? '');
  const [callbackDate, setCallbackDate] = useState(contact.callbackDate ?? '');
  // Sprint 2: after logging certain outcomes, offer/require a follow-up task.
  // 'callback' strongly prompts (auto-opens, due date emphasized); 'conversation'
  // and 'appointment' just offer a dismissible suggestion bar.
  const [taskPrompt, setTaskPrompt] = useState(null); // 'callback' | 'suggest' | null
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Build Google search query for this facility
  const searchQuery = [contact.facilityName, 'self storage', contact.market || contact.state].filter(Boolean).join(' ');
  const missingInfo = !contact.phone || !contact.email || !contact.address;
  const contactName = contact.ownerName || contact.facilityName || 'Contact';
  const openTasks = taskApi?.getRelatedTasks('contact', contact.id) ?? [];
  const source = contactSource(contact, lists);

  function saveNotes() { onNotesChange(contact.id, notes); }

  function handleOutcome(status) {
    onStatusChange(contact.id, status, notes);
    onNotesChange(contact.id, notes);
    if (status === 'callback') {
      if (callbackDate) onUpdate(contact.id, { callbackDate });
      setTaskPrompt('callback');
    }
    else if (status === 'conversation' || status === 'appointment') setTaskPrompt('suggest');
    else setTaskPrompt(null);
  }

  function field(key) {
    return (val) => onUpdate(contact.id, { [key]: val });
  }

  return (
    <ModalLayout onClose={onClose} size="lg" className="max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusBadge variant={STATUS_VARIANT[contact.status] ?? 'slate'} pill={false} className="font-bold">
                {STATUS_LABELS[contact.status] ?? 'Fresh'}
              </StatusBadge>
              {contact.market && (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                  {contact.market}
                </span>
              )}
              <SourceBadge source={source} />
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
          <AdditionalPhonesEditor
            phones={contact.alternatePhones}
            onSave={(phones) => onUpdate(contact.id, { alternatePhones: phones })}
          />

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

          {/* ── Follow-up task suggestion (after Conversation / Appt Set) ── */}
          {taskPrompt === 'suggest' && (
            <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
              <p className="text-xs text-amber-400 font-semibold">Add a follow-up task for this outcome?</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setTaskPrompt('open')} className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-900 px-3 py-1.5 rounded-lg transition-all">
                  + Add Task
                </button>
                <button onClick={() => setTaskPrompt(null)} className="text-xs text-slate-500 hover:text-white transition-colors">Dismiss</button>
              </div>
            </div>
          )}

          {/* ── Tasks tied to this contact (Sprint 2) ── */}
          <RelatedTasks
            taskApi={taskApi}
            relatedType="contact"
            relatedId={contact.id}
            relatedName={contactName}
            source="database"
          />

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
          <button onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-500 hover:text-red-400 transition-colors font-semibold">
            Delete Contact
          </button>
          <button onClick={() => { saveNotes(); onClose(); }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2 rounded-xl text-sm transition-all">
            Save & Close
          </button>
        </div>

        {/* 'Call Back' strongly prompts for a task with due date emphasized;
            the suggestion bar's "+ Add Task" also opens this, unemphasized. */}
        {(taskPrompt === 'callback' || taskPrompt === 'open') && (
          <TaskModal
            context={{ relatedType: 'contact', relatedId: contact.id, relatedName: contactName, source: 'database' }}
            defaults={{ title: taskPrompt === 'callback' ? 'Call back' : '', taskType: 'call', dueDate: callbackDate || undefined }}
            emphasizeDueDate={taskPrompt === 'callback'}
            onSave={(fields) => taskApi?.createTask(fields)}
            onClose={() => setTaskPrompt(null)}
          />
        )}

        {confirmDelete && (
          <DeleteContactConfirmModal
            contact={contact}
            openTaskCount={openTasks.length}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => onDelete(contact.id)}
          />
        )}
    </ModalLayout>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ contact, onClick, onAddToMasterDB, onSetAction, onLogAction, isMasterDB, lists = [], onMoveToList, onToClients, taskApi }) {
  const [added, setAdded] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contact.id, data: { contact } });

  const openTasks = taskApi?.getRelatedTasks('contact', contact.id) ?? [];
  const nextTask = getNextOpenTask(openTasks);
  const nextTaskType = nextTask ? TASK_TYPE_MAP[nextTask.taskType] : null;
  const nextTaskDue = dueMeta(nextTask?.dueDate);
  const actionType = ACTION_TYPES.find(a => a.value === contact.nextActionType);
  const fallbackDue = dueMeta(contact.nextActionDate);
  const source = contactSource(contact, lists);
  const modalDefaults = nextTask
    ? {}
    : legacyActionDefaults(contact.nextActionType, contact.nextActionDate, contact.nextActionNote);

  const mapsQuery = encodeURIComponent(
    [contact.facilityName, 'self storage', contact.market || contact.state].filter(Boolean).join(' ')
  );

  async function handleAddToMasterDB(e) {
    e.stopPropagation();
    const result = await onAddToMasterDB(contact);
    if (result === 'exists') {
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    } else if (result) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  }

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-black/30 group min-w-0 ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* Status + lead temp + market */}
      <div className="flex flex-wrap items-start justify-between mb-3 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge variant={STATUS_VARIANT[contact.status] ?? 'slate'} pill={false} className="font-bold">
            {STATUS_LABELS[contact.status] ?? 'Fresh'}
          </StatusBadge>
          {(() => {
            const temp = LEAD_TEMPS.find(t => t.value === contact.leadTemp);
            const order = ['', 'hot', 'warm', 'cold'];
            function cycleTemp(e) {
              e.stopPropagation();
              const idx = order.indexOf(contact.leadTemp ?? '');
              const next = order[(idx + 1) % order.length];
              onSetAction(contact.id, { leadTemp: next });
            }
            return temp ? (
              <button onClick={cycleTemp} title="Click to change lead temperature"
                className={`text-xs font-black px-2.5 py-1 rounded-md border transition-all whitespace-nowrap ${temp.bg} ${temp.border} ${temp.text}`}>
                {temp.icon} {temp.label}
              </button>
            ) : (
              <button onClick={cycleTemp} title="Set lead temperature"
                className="text-xs font-semibold px-2.5 py-1 rounded-md border border-dashed border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-500 transition-all whitespace-nowrap">
                + Temp
              </button>
            );
          })()}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            {...listeners}
            {...attributes}
            onClick={e => e.stopPropagation()}
            className="text-xs text-slate-600 hover:text-slate-300 px-1.5 py-1 rounded transition-all cursor-grab active:cursor-grabbing whitespace-nowrap"
            title="Drag contact"
          >
            Drag
          </button>
          {contact.market && (
            <span className="text-xs text-amber-400/70 font-black whitespace-nowrap">{contact.market}</span>
          )}
          <SourceBadge source={source} />
          {(() => {
            const moveOptions = [];
            if (onToClients) moveOptions.push({ label: '→ Pipeline (Clients)', onClick: () => onToClients(contact) });
            lists.filter(l => l.id !== contact.listId).forEach(l =>
              moveOptions.push({ label: `→ ${l.name}`, onClick: () => onMoveToList?.(contact.id, l.id) }));
            return moveOptions.length ? <MoveMenu options={moveOptions} label="Move" /> : null;
          })()}
        </div>
      </div>

      {/* Facility Name — PRIMARY, in your face */}
      {contact.facilityName ? (
        <div className="mb-2">
          <a
            href={`https://www.google.com/maps/search/${mapsQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex w-full min-w-0 items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg px-2.5 py-2 hover:bg-amber-500/25 transition-all"
          >
            <span className="text-sm flex-shrink-0">🏢</span>
            <span className="text-sm font-bold text-amber-400 truncate min-w-0">{contact.facilityName}</span>
            <span className="text-xs text-amber-600 flex-shrink-0">🗺</span>
          </a>
        </div>
      ) : (
        <a
          href={`https://www.google.com/maps/search/${mapsQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 mb-1.5 text-xs text-slate-600 hover:text-blue-400 italic transition-colors"
        >
          🏢 Find facility →
        </a>
      )}

      {/* Owner Name */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onClick(); }}
        className="block w-full text-left mb-3"
      >
        <h3 className="font-black text-white text-base leading-tight group-hover:text-amber-400 transition-colors line-clamp-1">
          {contact.ownerName || <span className="text-slate-500 italic text-sm font-semibold">Unknown Owner</span>}
        </h3>
      </button>

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

      {/* Next action */}
      <div className="mt-2">
        {nextTask ? (
          <button
            onClick={e => { e.stopPropagation(); setShowTaskModal(true); }}
            className={`w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-left transition-all border ${
              nextTaskDue?.tone === 'red'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : nextTaskDue?.tone === 'amber'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <span>{nextTaskType?.icon ?? '>'}</span>
            <span className="font-semibold truncate">{nextTask.title}</span>
            {nextTaskDue && <span className="font-black ml-auto flex-shrink-0">{nextTaskDue.label}</span>}
          </button>
        ) : actionType ? (
          <button
            onClick={e => { e.stopPropagation(); setShowTaskModal(true); }}
            className={`w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-left transition-all border ${
              fallbackDue?.tone === 'red'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : fallbackDue?.tone === 'amber'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <span>{actionType.icon}</span>
            <span className="font-semibold truncate">{actionType.label}</span>
            {fallbackDue && <span className="font-black ml-auto flex-shrink-0">{fallbackDue.label}</span>}
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setShowTaskModal(true); }}
            className="w-full text-xs text-slate-600 hover:text-amber-400 border border-dashed border-slate-700 hover:border-amber-500/40 rounded-lg px-2.5 py-1.5 transition-all"
          >
            + Set Action
          </button>
        )}
      </div>

      {/* Activity log: Last Action + Log button */}
      {onLogAction && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <LastActionLine actionLog={contact.actionLog} />
          <button
            onClick={e => { e.stopPropagation(); setShowLog(true); }}
            className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-1 transition-all"
          >
            + Log
          </button>
        </div>
      )}

      {showLog && (
        <LogActionModal
          name={contact.ownerName || contact.facilityName || 'Contact'}
          subtitle={contact.facilityName}
          actionLog={contact.actionLog}
          onSave={(entry) => onLogAction(contact.id, entry)}
          onClose={() => setShowLog(false)}
        />
      )}
      {showTaskModal && (
        <TaskModal
          context={{ relatedType: 'contact', relatedId: contact.id, relatedName: contact.ownerName || contact.facilityName || 'Contact', source: 'database' }}
          defaults={modalDefaults}
          heading="Set Next Action"
          saveLabel="Save Next Action"
          onSave={taskApi?.createTask}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {/* Add to Master Database */}
      {onAddToMasterDB && !isMasterDB && (
        <button
          onClick={handleAddToMasterDB}
          className={`mt-3 w-full text-xs font-semibold py-1.5 rounded-lg border transition-all ${
            added
              ? 'bg-green-600/20 border-green-600/40 text-green-400'
              : 'bg-transparent border-slate-700 text-slate-500 hover:border-amber-500/40 hover:text-amber-400'
          }`}
        >
          {added ? '✓ Added to Master DB' : '★ Add to Master Database'}
        </button>
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
    <ModalLayout onClose={onClose}>
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
    </ModalLayout>
  );
}

// ─── List Sidebar Item (with inline rename + delete) ─────────────────────────
function ListSidebarItem({ list: l, count, isActive, onSelect, onRename, onDelete }) {
  const [renaming, setRenaming]       = useState(false);
  const [draft, setDraft]             = useState(l.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef(null);
  const { setNodeRef, isOver } = useDroppable({ id: `list:${l.id}` });

  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);

  function commitRename() {
    setRenaming(false);
    if (draft.trim() && draft.trim() !== l.name) onRename(draft.trim());
    else setDraft(l.name);
  }

  return (
    <div
      ref={setNodeRef}
      className={`border-b border-slate-800/50 border-l-2 transition-all ${
        isOver ? 'bg-amber-500/20 border-l-amber-400 ring-1 ring-amber-500/40'
        : isActive ? 'bg-amber-500/10 border-l-amber-500' : 'border-l-transparent hover:bg-slate-800'
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

// Sprint 7 — Call Mode remembers where Brandon left off in each queue, keyed
// by queue key (Active List keyed per list id, since "position 12" in one
// list means nothing in another). Module-level on purpose: it survives
// Database unmounting (e.g. a Dashboard round-trip mid-session) but resets on
// a full page reload — session-level memory only, so no stale "resume at #37"
// carries over to the next morning's fresh queues.
const callQueuePositions = {};

// ─── Call Mode queue builders (Sprint 6) ──────────────────────────────────────
// Each row is a shallow contact copy carrying `queueReason` (why this contact
// is in the queue) and, for task-based queues, `queueTaskId`/`queueTaskTitle`
// so Call Mode can show the reason and optionally complete that exact task
// after an outcome is logged. The callback-task builder lives in
// tasks/taskUtils.js (Sprint 7) so the Dashboard's callback counters share
// the exact same logic.

function buildFollowUpQueue(contacts, taskApi) {
  if (!taskApi) return [];
  return contacts
    .filter(c => (c.status === 'conversation' || c.status === 'appointment') && taskApi.getRelatedTasks('contact', c.id).length === 0)
    .map(c => ({
      ...c,
      queueReason: c.status === 'appointment' ? 'Appt set — no follow-up task' : 'Conversation logged — no follow-up task',
    }));
}

// ─── Call Mode queue picker (Sprint 6) ────────────────────────────────────────
function CallModeQueuePicker({ queues, onSelect, onExit }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white">Choose a Call Mode queue</h2>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xl">
            Pick a queue, call one owner at a time, log the result, and set the next action.
          </p>
        </div>
        <button onClick={onExit} className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition-all">
          Exit
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {queues.map(q => (
          <button
            key={q.key}
            onClick={() => !q.disabled && onSelect(q.key)}
            disabled={q.disabled}
            className={`text-left bg-slate-900 border rounded-2xl p-4 transition-all ${
              q.disabled ? 'border-slate-800 opacity-50 cursor-not-allowed' : 'border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <h3 className="text-sm font-black text-white">{q.label}</h3>
              <span className={`text-lg font-black ${q.queue.length > 0 ? 'text-amber-400' : 'text-slate-700'}`}>{q.queue.length}</span>
            </div>
            <p className="text-xs text-slate-500 leading-snug">{q.reason}</p>
            {q.disabled && <p className="text-xs text-slate-600 italic mt-2">Select a list on the left first.</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Database Component ──────────────────────────────────────────────────
export default function Database({ onCallLogged, db, onContactToClients, clients = [], clientHandlers = {}, taskApi, entryRequest, onEntryConsumed }) {
  const {
    lists, contacts, masterListId,
    importList, importIntoList, removeDuplicates, moveContactToList, createList, addContact,
    updateContactStatus, updateContactCallback,
    updateContactNotes, updateContact, deleteList, renameList, deleteContact,
    addToMasterDB, logContactAction,
  } = db;

  const [activeDrag, setActiveDrag] = useState(null); // contact being dragged
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd({ active, over }) {
    setActiveDrag(null);
    if (!over) return;
    const contact = contacts.find(c => c.id === active.id);
    if (!contact) return;
    const target = String(over.id);
    if (target === 'clients') {
      onContactToClients?.(contact);
    } else if (target.startsWith('list:')) {
      const listId = target.slice(5);
      if (contact.listId !== listId) moveContactToList(contact.id, listId);
    }
  }

  const [subView, setSubView]       = useState('contacts');
  const [showImport, setShowImport]     = useState(false);
  const [showMasterImport, setShowMasterImport] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showNewList, setShowNewList]   = useState(false);
  const [newListName, setNewListName]   = useState('');
  // Default to no list selected — clean empty state on open
  const [activeListId, setActiveListId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [openContact, setOpenContact] = useState(null);

  // Call queue state
  const [callQueueIndex, setCallQueueIndex] = useState(0);
  const [callNote, setCallNote]       = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  // null = show the queue picker; otherwise one of QUEUE_DEFS' keys below
  const [callQueueSource, setCallQueueSource] = useState(null);

  // Filtered contacts
  const filtered = useMemo(() => {
    if (activeListId === null) return [];
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

  // Sprint 6 — task-based Call Mode queues, computed over ALL contacts (not
  // scoped to whichever list happens to be selected in the sidebar), since
  // "who owes a callback today" is a cross-list question.
  const todayCallbackQueue = useMemo(() => buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: false }), [contacts, taskApi]);
  const overdueCallbackQueue = useMemo(() => buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: true }), [contacts, taskApi]);
  const followUpQueue = useMemo(() => buildFollowUpQueue(contacts, taskApi), [contacts, taskApi]);
  const allContactsQueue = useMemo(() =>
    contacts.filter(c => ['fresh','callback','no_answer','voicemail'].includes(c.status)),
    [contacts]
  );
  const importHistory = useMemo(() => {
    return [...lists]
      .filter(l => l.id !== masterListId)
      .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')))
      .slice(0, 5);
  }, [lists, masterListId]);

  const activeListLabel = activeListId === null ? 'Active List'
    : activeListId === masterListId ? 'Master Database'
    : activeListId === 'all' ? 'All Contacts'
    : (lists.find(l => l.id === activeListId)?.name ?? 'Active List');

  const QUEUE_DEFS = useMemo(() => [
    {
      key: 'activeList',
      label: activeListLabel,
      reason: 'Work the list currently selected on the left — its fresh, callback, no-answer, and voicemail owners.',
      queue: callQueue,
      disabled: activeListId === null,
    },
    {
      key: 'today',
      label: "Today's Callbacks",
      reason: 'Owners due for a callback today.',
      queue: todayCallbackQueue,
    },
    {
      key: 'overdue',
      label: 'Overdue Callbacks',
      reason: 'Owners you owe a call to — their callback date has passed.',
      queue: overdueCallbackQueue,
    },
    {
      key: 'followup',
      label: 'Follow-Up Needed',
      reason: 'Conversations or appointments logged with no follow-up task — set the next step.',
      queue: followUpQueue,
    },
    {
      key: 'all',
      label: 'All Contacts',
      reason: 'Broad calling mode — every callable owner across all of your lists.',
      queue: allContactsQueue,
    },
  ], [activeListLabel, activeListId, callQueue, todayCallbackQueue, overdueCallbackQueue, followUpQueue, allContactsQueue]);

  const activeQueueDef = QUEUE_DEFS.find(q => q.key === callQueueSource) ?? null;

  // Position keys for the session-level queue-position memory. The Active
  // List queue is keyed per list so switching lists never resumes into the
  // wrong list's position.
  const positionKey = (key) => key === 'activeList' ? `activeList:${activeListId}` : key;

  function selectQueue(key) {
    setCallQueueSource(key);
    // Resume where Brandon left off in this queue earlier in the session, as
    // long as that position still exists in the (live-recomputed) queue.
    const saved = callQueuePositions[positionKey(key)] ?? 0;
    const len = QUEUE_DEFS.find(q => q.key === key)?.queue.length ?? 0;
    setCallQueueIndex(saved > 0 && saved < len ? saved : 0);
  }

  // All Call Mode index changes flow through here so the per-queue position
  // memory stays current no matter how the index moved (next/back, outcome
  // advance, queue shrink).
  function setQueueIndex(next) {
    setCallQueueIndex(next);
    if (callQueueSource) callQueuePositions[positionKey(callQueueSource)] = next;
  }

  // Deep-link entry from the Dashboard command center ("Start Calling" /
  // Attack List "Call" quick action). Consumed once, then cleared by the
  // parent so re-clicking the same action still fires (App.jsx passes a
  // fresh object each time).
  useEffect(() => {
    if (!entryRequest) return;
    if (entryRequest.openContactId) {
      const c = contacts.find(x => x.id === entryRequest.openContactId);
      if (c) setOpenContact(c);
    } else {
      if (entryRequest.listId) setActiveListId(entryRequest.listId);
      if (entryRequest.subView) {
        setSubView(entryRequest.subView);
        if (entryRequest.subView === 'callQueue') { setCallQueueIndex(0); setCallQueueSource(null); }
      }
    }
    onEntryConsumed?.();
  }, [entryRequest, contacts, onEntryConsumed]);

  // In the Master Database view, clients are merged in (unified view, no duplicates)
  const masterView = activeListId === masterListId;
  const clientsInView = (masterView && statusFilter === 'all')
    ? clients.filter(cl => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (cl.name ?? '').toLowerCase().includes(q)
          || (cl.facilityName ?? '').toLowerCase().includes(q)
          || (cl.address ?? '').toLowerCase().includes(q)
          || (cl.phone ?? '').includes(q)
          || (cl.email ?? '').toLowerCase().includes(q);
      })
    : [];

  async function handleCallOutcome(contact, status, noteOverride) {
    const note = noteOverride ?? callNote;
    if (status === 'callback' && !callbackDate) {
      alert('Pick a callback date before logging Call Back.');
      return;
    }
    await updateContactStatus(contact.id, status, note);
    if (status === 'callback' && callbackDate) updateContactCallback(contact.id, callbackDate);
    if (status === 'callback') {
      taskApi?.createTask({
        title: 'Call back',
        description: note.trim(),
        taskType: 'call',
        priority: 'normal',
        dueDate: callbackDate,
        relatedType: 'contact',
        relatedId: contact.id,
        relatedName: contact.ownerName || contact.facilityName || 'Contact',
        source: 'database',
      });
    }
    if (onCallLogged) onCallLogged(status);
    setCallNote('');
    setCallbackDate('');
  }

  function handleStatusChangeFromModal(id, status, notes) {
    updateContactStatus(id, status, notes);
    if (onCallLogged) onCallLogged(status);
    // refresh open contact
    setOpenContact(prev => prev?.id === id ? { ...prev, status, lastCalled: new Date().toISOString().slice(0,10) } : prev);
  }

  async function handleImport(name, source, rawText, options) {
    const result = await importList(name, source, rawText, options);
    setSubView('contacts');
    if (result?.list?.id) setActiveListId(result.list.id);
    return result;
  }

  function openImportedList(listId) {
    setActiveListId(listId);
    setSubView('contacts');
    setShowImport(false);
  }

  function startImportedCallSession(listId) {
    setActiveListId(listId);
    setSubView('callQueue');
    setCallQueueSource('activeList');
    setCallQueueIndex(0);
    callQueuePositions[`activeList:${listId}`] = 0;
    setShowImport(false);
  }

  // Aggregate stats
  const totalCalled     = contacts.filter(c => c.status !== 'fresh').length;
  const totalConversations = contacts.filter(c => c.status === 'conversation').length;
  const totalAppointments  = contacts.filter(c => c.status === 'appointment').length;

  return (
    <DndContext
      sensors={dndSensors}
      onDragStart={({ active }) => setActiveDrag(contacts.find(c => c.id === active.id) ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
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

          {/* Master Database — pinned at top */}
          {masterListId && (
            <DropTarget id={`list:${masterListId}`} activeClassName="ring-1 ring-amber-500/50 bg-amber-500/10">
              <button
                onClick={() => { setActiveListId(masterListId); setSubView('contacts'); }}
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-all text-sm border-b border-slate-800/50 ${
                  activeListId === masterListId && subView === 'contacts'
                    ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500'
                    : 'text-emerald-400/70 hover:text-emerald-400 hover:bg-slate-800 border-l-2 border-transparent'
                }`}
              >
                <span className="font-bold flex items-center gap-1.5">⭐ Master Database</span>
                <span className="text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 px-1.5 py-0.5 rounded-md">
                  {contacts.filter(c => c.listId === masterListId).length + clients.length}
                </span>
              </button>
            </DropTarget>
          )}

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

          {[...lists].reverse().filter(l => l.id !== masterListId).map(l => (
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

        {importHistory.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2.5 border-b border-slate-800">
              Import History
            </p>
            <div className="divide-y divide-slate-800/70">
              {importHistory.map(l => {
                const count = l.importRowCount || contacts.filter(c => c.listId === l.id).length;
                const ready = l.readyToCallCount || contacts.filter(c => c.listId === l.id && ['fresh', 'callback', 'no_answer', 'voicemail'].includes(c.status)).length;
                return (
                  <div key={`history-${l.id}`} className="px-3 py-2.5 space-y-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">{l.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <SourceBadge source={l.source} />
                        {l.importedAt && <span className="text-[11px] text-slate-600">{l.importedAt}</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {count} imported &middot; {ready} callable
                        {l.duplicateSkippedCount ? ` | ${l.duplicateSkippedCount} skipped` : ''}
                        {l.mergedDuplicateCount ? ` | ${l.mergedDuplicateCount} appended` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setActiveListId(l.id); setSubView('contacts'); }}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-2 py-1.5 rounded-lg text-[11px] transition-all"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => startImportedCallSession(l.id)}
                        disabled={ready === 0}
                        className={`flex-1 border font-semibold px-2 py-1.5 rounded-lg text-[11px] transition-all ${
                          ready > 0
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
                            : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        Call
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Other views */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2.5 border-b border-slate-800">
            Views
          </p>
          {[
            { key: 'callQueue', label: 'Call Mode', badge: todayCallbackQueue.length + overdueCallbackQueue.length },
            { key: 'markets',   label: '🗺 Markets',    badge: null },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setSubView(t.key); if (t.key === 'callQueue') setCallQueueSource(null); }}
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

        {/* Drag-to-Clients drop target */}
        <DropTarget
          id="clients"
          className="border border-dashed border-slate-700 rounded-xl px-3 py-3 text-center transition-all"
          activeClassName="border-blue-500/60 bg-blue-500/10"
        >
          <p className="text-xs font-semibold text-slate-500">→ Drop here to move to <span className="text-blue-400">Clients / Pipeline</span></p>
        </DropTarget>

        {/* Delete list button — not for Master Database */}
        {activeListId !== 'all' && activeListId !== masterListId && (
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
        {activeListId === null && subView !== 'callQueue' && (
          <EmptyState
            icon="📂"
            title="No list selected"
            message="Select a list from the left, or create a new one."
          />
        )}

        {/* ── Call Queue — independent of activeListId, so Dashboard-launched
             queues (Today's Callbacks / Overdue / Follow-Up / All Contacts)
             work even when no list is selected in the sidebar. ── */}
        {subView === 'callQueue' && (
          callQueueSource === null ? (
            <CallModeQueuePicker
              queues={QUEUE_DEFS}
              onSelect={selectQueue}
              onExit={() => setSubView('contacts')}
            />
          ) : (
            <CallQueue
              queue={activeQueueDef?.queue ?? []}
              index={callQueueIndex}
              setIndex={setQueueIndex}
              callbackDate={callbackDate}
              setCallbackDate={setCallbackDate}
              onOutcome={handleCallOutcome}
              onSaveNotes={updateContactNotes}
              onUpdateContact={updateContact}
              onDeleteContact={deleteContact}
              onPromote={onContactToClients}
              taskApi={taskApi}
              queueLabel={activeQueueDef?.label ?? 'Call Mode'}
              queueReasonText={activeQueueDef?.reason ?? ''}
              onExit={() => { setSubView('contacts'); setCallQueueSource(null); }}
              onBackToPicker={() => setCallQueueSource(null)}
            />
          )
        )}

        {activeListId !== null && subView !== 'callQueue' && (<>

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
              <span className="text-xs text-slate-600">{filtered.length + clientsInView.length} contacts</span>
              {activeListId !== null && (
                <button
                  onClick={() => {
                    setSubView('callQueue');
                    selectQueue('activeList');
                  }}
                  disabled={callQueue.length === 0}
                  className={`bg-amber-500/15 border border-amber-500/40 text-amber-400 font-black px-3 py-2 rounded-lg text-xs transition-all ${
                    callQueue.length > 0 ? 'hover:bg-amber-500/25' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {(callQueuePositions[`activeList:${activeListId}`] ?? 0) > 0 ? 'Resume Call Mode' : 'Start Call Mode'}
                </button>
              )}
              {activeListId === masterListId && (
                <>
                  <button
                    onClick={async () => {
                      if (!confirm('Scan Master Database for duplicate contacts and remove them?')) return;
                      const { removed, error } = await removeDuplicates(masterListId);
                      if (error) alert('Could not remove duplicates: ' + error);
                      else alert(removed ? `Removed ${removed} duplicate contact${removed > 1 ? 's' : ''}.` : 'No duplicates found — your Master Database is clean.');
                    }}
                    className="ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                    title="Find contacts that share a phone, email, or owner+facility and keep only the most-worked record"
                  >
                    🧹 Remove Duplicates
                  </button>
                  <button
                    onClick={() => setShowMasterImport(true)}
                    className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 font-bold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                  >
                    ⬆ Bulk Upload
                  </button>
                </>
              )}
              {activeListId !== 'all' && (
                <button
                  onClick={() => setShowAddContact(true)}
                  className={`${activeListId === masterListId ? '' : 'ml-auto'} bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5`}
                >
                  + Add Person
                </button>
              )}
            </div>

            {/* Card grid */}
            {filtered.length === 0 && clientsInView.length === 0 ? (
              <EmptyState
                icon="📋"
                message="No contacts. Import a list to get started."
                action={
                  <button onClick={() => setShowImport(true)} className="mt-3 text-amber-500 hover:text-amber-400 text-sm font-semibold">
                    + Import List
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
                {filtered.map(c => (
                  <PropertyCard
                    key={c.id}
                    contact={c}
                    onClick={() => setOpenContact(c)}
                    onAddToMasterDB={addToMasterDB}
                    onSetAction={(id, fields) => updateContact(id, fields)}
                    onLogAction={logContactAction}
                    isMasterDB={masterView}
                    lists={lists}
                    onMoveToList={moveContactToList}
                    onToClients={onContactToClients}
                    taskApi={taskApi}
                  />
                ))}
                {/* Clients merged into the Master Database view (unified, no duplicates) */}
                {clientsInView.map(cl => (
                  <ClientCard
                    key={`client-${cl.id}`}
                    client={cl}
                    onEdit={clientHandlers.onEdit}
                    onDelete={clientHandlers.onDelete}
                    onStageChange={clientHandlers.onStageChange}
                    onSetAction={clientHandlers.onSetAction}
                    onLogAction={clientHandlers.onLogAction}
                    taskApi={taskApi}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Markets ── */}
        {subView === 'markets' && (
          <MarketsView contacts={contacts} />
        )}
      </>)}
      </div>

      {/* Contact Detail Modal */}
      {openContact && (
        <ContactDetailModal
          contact={contacts.find(c => c.id === openContact.id) ?? openContact}
          lists={lists}
          onClose={() => setOpenContact(null)}
          onStatusChange={handleStatusChangeFromModal}
          onNotesChange={updateContactNotes}
          onUpdate={updateContact}
          onDelete={(id) => { deleteContact(id); setOpenContact(null); }}
          taskApi={taskApi}
        />
      )}

      {showImport && (
        <ImportListModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
          existingContacts={contacts}
          onOpenImportedList={openImportedList}
          onStartImportedCallSession={startImportedCallSession}
        />
      )}

      {showMasterImport && (
        <ImportListModal
          fixedListName="Master Database"
          existingContacts={contacts}
          onImport={(_name, _source, rawText, options) => importIntoList(masterListId, rawText, options)}
          onClose={() => setShowMasterImport(false)}
        />
      )}

      {/* ── New Blank List modal ── */}
      {showNewList && (
        <ModalLayout onClose={() => setShowNewList(false)} size="sm" className="p-6 space-y-4">
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
        </ModalLayout>
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

    <DragOverlay>
      {activeDrag && (
        <div className="bg-slate-800 border border-amber-500 rounded-xl px-3 py-2 shadow-2xl rotate-2 w-56">
          <p className="text-sm font-bold text-white truncate">{activeDrag.ownerName || activeDrag.facilityName || 'Contact'}</p>
          {activeDrag.facilityName && <p className="text-xs text-amber-400 truncate">{activeDrag.facilityName}</p>}
          <p className="text-xs text-slate-500 mt-0.5">Drop on a list or “→ Clients”</p>
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

// ─── Call Queue ────────────────────────────────────────────────────────────────
const OFFER_FOLLOWUP_STATUSES = ['voicemail', 'conversation', 'appointment'];
const DEFAULT_COMPLETE_STATUSES = ['conversation', 'appointment', 'not_interested', 'callback'];

function CallQueue({ queue, index, setIndex, callbackDate, setCallbackDate, onOutcome, onSaveNotes, onUpdateContact, onDeleteContact, onPromote, taskApi, queueLabel, queueReasonText, onExit, onBackToPicker }) {
  const current = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  const [noteDraft, setNoteDraft] = useState({ contactId: null, text: '' });
  const [noteSavedFor, setNoteSavedFor] = useState(null);
  const [postOutcome, setPostOutcome] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contactNote = current?.notes ?? '';
  const noteText = noteDraft.contactId === current?.id ? noteDraft.text : contactNote;
  const hasNoteChanges = noteText !== contactNote;
  const noteSaved = noteSavedFor === current?.id;
  const activePostOutcome = postOutcome?.contactId === current?.id ? postOutcome : null;

  async function saveNotes() {
    if (!current) return;
    await onSaveNotes(current.id, noteText);
    setNoteSavedFor(current.id);
    setTimeout(() => setNoteSavedFor(null), 1800);
  }

  async function go(delta) {
    if (!current) return;
    if (hasNoteChanges) await saveNotes();
    setIndex(Math.min(queue.length - 1, Math.max(0, index + delta)));
  }

  async function deleteCurrentContact() {
    if (!current) return;
    if (hasNoteChanges) await saveNotes();
    const nextIndex = Math.max(0, Math.min(index, queue.length - 2));
    const result = await onDeleteContact?.(current.id);
    if (result?.error) {
      alert('Could not delete contact: ' + result.error);
      return;
    }
    setConfirmDelete(false);
    setPostOutcome(null);
    setNoteDraft({ contactId: null, text: '' });
    setIndex(nextIndex);
  }
  async function handleOutcome(status) {
    if (!current) return;
    if (hasNoteChanges) await saveNotes();
    if (status === 'callback' && !callbackDate) {
      alert('Pick a callback date before logging Call Back.');
      return;
    }
    await onOutcome(current, status, noteText);
    const offerFollowUp = OFFER_FOLLOWUP_STATUSES.includes(status);
    const hasQueueTask = !!current.queueTaskId;
    if (offerFollowUp || hasQueueTask) {
      setPostOutcome({
        contactId: current.id,
        status,
        completeExisting: hasQueueTask && DEFAULT_COMPLETE_STATUSES.includes(status),
      });
      return;
    }
    setPostOutcome(null);
    setIndex(Math.min(queue.length - 1, index + 1));
  }

  useEffect(() => {
    if (queue.length > 0 && index > queue.length - 1) setIndex(queue.length - 1);
  }, [queue.length, index, setIndex]);

  useEffect(() => {
    function onKeyDown(e) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n' || key === 'arrowright') { e.preventDefault(); go(1); }
      if (key === 'b' || key === 'arrowleft') { e.preventDefault(); go(-1); }
      if (key === 'x') handleOutcome('no_answer');
      if (key === 'v') handleOutcome('voicemail');
      if (key === 'c') handleOutcome('callback');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (queue.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
        <div className="text-4xl mb-3 text-slate-500">CALL</div>
        <h3 className="text-lg font-bold text-white mb-1">{queueLabel ?? 'Call Mode'} is empty</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">{queueReasonText} Nobody currently matches, or you've already worked through everyone.</p>
        <div className="flex items-center justify-center gap-4 mt-5">
          {onBackToPicker && (
            <button onClick={onBackToPicker} className="text-sm font-semibold text-amber-400 hover:text-amber-300">
              Choose a different queue
            </button>
          )}
          <button onClick={onExit} className="text-sm font-semibold text-slate-400 hover:text-white">
            Back to contacts
          </button>
        </div>
      </div>
    );
  }

  const progress = ((index + 1) / queue.length) * 100;
  const openTasks = taskApi?.getRelatedTasks('contact', current.id) ?? [];
  const nextTask = getNextOpenTask(openTasks);
  const due = dueMeta(nextTask?.dueDate);
  const latestCall = [...(current.callHistory ?? [])].reverse()[0];
  const recentActivity = [...(current.actionLog ?? [])].reverse().slice(0, 4);
  const searchQuery = contactSearchQuery(current);

  async function finalizePostOutcome(followUpKind) {
    if (activePostOutcome?.completeExisting && current?.queueTaskId) {
      await taskApi?.completeTask(current.queueTaskId);
    }
    if (followUpKind) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (followUpKind === 'appointment' ? 1 : 2));
      await taskApi?.createTask({
        title: followUpKind === 'voicemail' ? 'Follow up after voicemail' : followUpKind === 'appointment' ? 'Follow up after appointment' : 'Follow up after conversation',
        description: noteText.trim(),
        taskType: followUpKind === 'appointment' ? 'meeting' : 'call',
        priority: followUpKind === 'appointment' ? 'high' : 'normal',
        dueDate: dueDate.toISOString().slice(0, 10),
        relatedType: 'contact',
        relatedId: current.id,
        relatedName: contactDisplayName(current),
        source: 'database',
      });
    }
    setPostOutcome(null);
    setIndex(Math.min(queue.length - 1, index + 1));
  }

  const researchLinks = [
    { key: 'google', label: 'Google Search', href: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}` },
    { key: 'maps', label: 'Google Maps', href: `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}` },
    current.ownerName && { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(current.ownerName + ' self storage')}` },
    (current.ownerName || current.phone) && { key: 'whitepages', label: 'Whitepages', href: `https://www.whitepages.com/name/${encodeURIComponent(current.ownerName || current.phone)}` },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="text-lg font-black text-white">{queueLabel ?? 'Call Mode'} — {index + 1} of {queue.length}</h2>
            {queueReasonText && <p className="text-xs text-slate-500 mt-0.5">{queueReasonText}</p>}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-amber-400">{Math.round(progress)}% through queue</p>
            {onBackToPicker && (
              <button onClick={onBackToPicker} className="text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5">
                Change Queue
              </button>
            )}
            <button onClick={onExit} className="text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5">
              Exit
            </button>
          </div>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div className="bg-amber-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <StatusBadge variant={STATUS_VARIANT[current.status] ?? 'slate'} pill={false} className="font-bold">
                  {STATUS_LABELS[current.status] ?? 'Fresh'}
                </StatusBadge>
                {current.market && <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md font-semibold">{current.market}</span>}
                <SourceBadge source={current.source} />
              </div>
              <h3 className="text-3xl font-black text-white leading-tight">{contactDisplayName(current)}</h3>
              <p className="text-base text-slate-400 mt-1">{current.facilityName || 'Facility unknown'}</p>
              {current.queueReason && (
                <p className="text-xs text-amber-400/80 mt-1.5 font-semibold">Why they're up: {current.queueReason}</p>
              )}
            </div>
            <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-4 min-w-[260px]">
              <p className="text-xs text-green-400/70 font-semibold uppercase">Phone</p>
              {current.phone ? (
                <a href={`tel:${current.phone}`} className="block text-2xl font-black text-green-400 font-mono hover:text-green-300">{current.phone}</a>
              ) : (
                <p className="text-2xl font-black text-slate-600">No phone</p>
              )}
            </div>
          </div>

          <AdditionalPhonesEditor
            phones={current.alternatePhones}
            onSave={(phones) => onUpdateContact?.(current.id, { alternatePhones: phones })}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {current.email && <a href={`mailto:${current.email}`} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-blue-300 hover:text-blue-200 truncate">Email: {current.email}</a>}
            {current.address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.address)}`} target="_blank" rel="noopener noreferrer"
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 hover:text-white truncate">
                Address: {current.address}
              </a>
            )}
            {latestCall && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500 uppercase font-semibold">Last Call</p>
                <p className="text-sm text-slate-300">{latestCall.date} · {STATUS_LABELS[latestCall.outcome] ?? latestCall.outcome}</p>
              </div>
            )}
            {nextTask && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-400 uppercase font-semibold">Next Action</p>
                <p className="text-sm font-bold text-white truncate">{nextTask.title}</p>
                {due && <p className="text-xs text-amber-300 mt-0.5">{due.label}</p>}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase">Call Notes</label>
              <span className={`text-xs ${noteSaved ? 'text-green-400' : hasNoteChanges ? 'text-amber-400' : 'text-slate-600'}`}>{noteSaved ? 'Saved' : hasNoteChanges ? 'Unsaved' : 'Saved'}</span>
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteDraft({ contactId: current.id, text: e.target.value })}
              rows={7}
              placeholder="What did they say? Motivation, objections, timing, pricing expectations..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              {CALL_OUTCOMES.map(o => (
                <button key={o.status} onClick={() => handleOutcome(o.status)}
                  className={`border rounded-xl px-3 py-3 text-xs font-bold transition-all text-center ${o.color}`}>
                  <span className="text-base block">{o.icon}</span>
                  <span className="block mt-0.5">{o.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Callback Date</label>
                <input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)}
                  className="bg-slate-800 border border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
              </div>
              <button onClick={saveNotes} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-4 py-2 rounded-xl text-sm transition-all">Save Note</button>
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-500 hover:text-red-400 transition-all font-semibold px-2 py-2">Delete</button>
              <button onClick={() => go(-1)} disabled={index === 0} className="text-sm text-slate-400 hover:text-white disabled:text-slate-700 transition-all font-semibold px-2 py-2">Previous</button>
              <button onClick={() => go(1)} disabled={index >= queue.length - 1} className="text-sm text-amber-400 hover:text-amber-300 disabled:text-slate-700 transition-all font-semibold px-2 py-2">Next Contact</button>
            </div>
            {activePostOutcome && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 space-y-3">
                {OFFER_FOLLOWUP_STATUSES.includes(activePostOutcome.status) && (
                  <p className="text-sm text-amber-300 font-semibold">Add a follow-up task before moving on?</p>
                )}
                {current.queueTaskId && (
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={activePostOutcome.completeExisting}
                      onChange={e => setPostOutcome(p => ({ ...p, completeExisting: e.target.checked }))}
                    />
                    Complete existing callback task ({current.queueTaskTitle || 'Call back'})
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {OFFER_FOLLOWUP_STATUSES.includes(activePostOutcome.status) && (
                    <button onClick={() => finalizePostOutcome(activePostOutcome.status)} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-2 rounded-lg text-xs">Add Task + Next</button>
                  )}
                  <button onClick={() => finalizePostOutcome(null)} className="text-xs text-slate-400 hover:text-white px-3 py-2">
                    {OFFER_FOLLOWUP_STATUSES.includes(activePostOutcome.status) ? 'Skip Task' : 'Continue'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-black text-white mb-3">Research</h3>
            <div className="grid grid-cols-2 gap-2">
              {researchLinks.map(link => (
                <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer"
                  className={`border rounded-xl px-3 py-2 text-xs font-bold transition-all ${RESEARCH_LINK_CLASSES[link.key]}`}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-white">Tasks</h3>
              <span className="text-xs text-slate-600">{openTasks.length} open</span>
            </div>
            <RelatedTasks taskApi={taskApi} relatedType="contact" relatedId={current.id} relatedName={contactDisplayName(current)} source="database" maxVisible={4} />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-black text-white mb-3">Call History</h3>
            {current.callHistory?.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {[...current.callHistory].reverse().slice(0, 8).map((h, i) => (
                  <div key={i} className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-300">{STATUS_LABELS[h.outcome] ?? h.outcome}</span>
                      <span className="text-slate-600">{h.date}</span>
                    </div>
                    {h.notes && <p className="text-slate-500 mt-0.5 line-clamp-2">{h.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No calls logged yet.</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-black text-white mb-3">Activity</h3>
            {recentActivity.length > 0 ? (
              <div className="space-y-1.5">
                {recentActivity.map((entry, i) => (
                  <div key={i} className="text-xs text-slate-400 bg-slate-800 rounded-lg px-3 py-2">
                    {entry.note || entry.type || 'Action'} {entry.date ? `· ${entry.date}` : ''}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No activity logged yet.</p>
            )}
          </div>

          {onPromote && (
            <button onClick={() => onPromote(current)}
              className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-300 font-black px-4 py-3 rounded-2xl text-sm transition-all">
              Promote to Client / Pipeline
            </button>
          )}
          <p className="text-xs text-slate-600 px-1">Shortcuts: &larr; / &rarr; move through queue. N next, B back, X no answer, V voicemail, C callback.</p>
        </aside>
      </div>
      {confirmDelete && (
        <DeleteContactConfirmModal
          contact={current}
          openTaskCount={openTasks.length}
          onClose={() => setConfirmDelete(false)}
          onConfirm={deleteCurrentContact}
        />
      )}
    </div>
  );
}

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
