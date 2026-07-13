import { useState, useMemo, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import ImportListModal from './ImportListModal';
import DuplicateReview from './DuplicateReview';
import { findDuplicateGroups } from '../lib/duplicateReview';
import { OwnerResearchPanel, ResearchStrip } from './ResearchLinks';
import { normalizeLinkedinUrl } from '../lib/researchLinks';
import { findSameOwnerMatches } from '../lib/ownerRadar';
import { keepScore } from '../lib/duplicateReview';
import { LastActionLine } from './ActionLog';
import ActionCenterModal from './ActionCenterModal';
import ClientCard from './ClientCard';
import MoveMenu from './MoveMenu';
import { AddToMailerButton } from './MailerListPicker';
import MailingAddressList from './MailingAddressList';
import { ACTION_TYPES, DEFAULT_RELATIONSHIP_TYPE, LEAD_SOURCES, LEAD_TEMPS, PROPERTY_TYPES, RELATIONSHIP_TYPES } from '../data/constants';
import { useOwnership } from '../hooks/useOwnership';
import { ModalLayout, StatusBadge, SearchToolbar, EmptyState } from './ui';
import { RelatedTasks, TaskModal, getNextOpenTask, dueMeta, legacyActionDefaults, buildCallbackTaskQueue, TASK_TYPE_MAP } from './tasks';
import { loadGeoData, resolveAnchor, contactDistanceMiles, PRESET_ANCHORS } from '../lib/geo';

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
  { status: 'no_answer',      label: 'No Answer',      icon: '📵', color: 'bg-yellow-600/20 border-yellow-600/40 text-yellow-400 hover:bg-yellow-600/30' },
  { status: 'voicemail',      label: 'Left VM',        icon: '📩', color: 'bg-blue-600/20 border-blue-600/40 text-blue-400 hover:bg-blue-600/30' },
  { status: 'conversation',   label: 'Conversation',   icon: '💬', color: 'bg-green-600/20 border-green-600/40 text-green-400 hover:bg-green-600/30' },
  { status: 'appointment',    label: 'Appt Set',       icon: '📅', color: 'bg-amber-600/20 border-amber-600/40 text-amber-400 hover:bg-amber-600/30' },
  { status: 'not_interested', label: 'Not Interested', icon: '🚫', color: 'bg-red-600/20 border-red-600/40 text-red-400 hover:bg-red-600/30' },
  { status: 'callback',       label: 'Call Back',      icon: '🔄', color: 'bg-purple-600/20 border-purple-600/40 text-purple-400 hover:bg-purple-600/30' },
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

const RELATIONSHIP_TYPE_MAP = Object.fromEntries(RELATIONSHIP_TYPES.map(t => [t.value, t]));

function relationshipMeta(value) {
  return RELATIONSHIP_TYPE_MAP[value] ?? RELATIONSHIP_TYPE_MAP[DEFAULT_RELATIONSHIP_TYPE];
}

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
function formatDateForLog(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (year && month && day) return `${month}/${day}/${year}`;
  return value;
}

function appendDateToLogNote(note, label, value) {
  if (!value) return note ?? '';
  const line = `${label}: ${formatDateForLog(value)}`;
  const text = (note ?? '').trim();
  if (text.includes(line)) return text;
  return [text, line].filter(Boolean).join('\n');
}

function contactDisplayName(contact) {
  return contact?.facilityName || contact?.ownerName || contact?.address || 'Unknown Property';
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
          <span className="opacity-0 group-hover:opacity-100 text-slate-600 text-xs transition-opacity">Edit</span>
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

function PrimaryPhoneEditor({ phone = '', onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function commit() {
    const next = draft.trim();
    if (next === (phone ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await onSave(next);
    setSaving(false);
    if (result?.error) {
      alert('Could not save phone: ' + result.error);
      return;
    }
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-4 min-w-[min(260px,100%)] max-w-full">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-green-400/70 font-semibold uppercase">Phone</p>
        <button
          onClick={() => setEditing(v => !v)}
          className="text-xs font-bold text-green-300 hover:text-green-200"
        >
          {editing ? 'Cancel' : phone ? 'Edit' : 'Add'}
        </button>
      </div>
      {editing ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            type="tel"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(phone ?? ''); setEditing(false); } }}
            className="min-w-0 flex-1 bg-slate-900 border border-green-500/50 rounded-lg px-3 py-2 text-lg text-green-300 font-mono focus:outline-none focus:border-green-400"
            placeholder="(555) 000-0000"
          />
          <button
            onClick={commit}
            disabled={saving}
            className="bg-green-500 hover:bg-green-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black px-3 py-2 rounded-lg text-xs"
          >
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      ) : phone ? (
        <a href={`tel:${phone}`} className="block text-2xl font-black text-green-400 font-mono hover:text-green-300">{phone}</a>
      ) : (
        <p className="text-2xl font-black text-slate-600">No phone</p>
      )}
      {saved && <p className="text-xs text-green-300 mt-1">Saved</p>}
    </div>
  );
}

function EditableAddressRow({ label, address, placeholder, onChange, extraActions = null }) {
  const [copied, setCopied] = useState(false);
  const cleanAddress = (address ?? '').trim();

  async function copyAddress() {
    if (!cleanAddress) return;
    try {
      await navigator.clipboard.writeText(cleanAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // If clipboard permissions are blocked, the visible text is still
      // selectable for manual copy.
      setCopied(false);
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-end gap-2">
      <div className="flex-1 min-w-0 select-text">
        <EditableField
          label={label}
          value={address}
          placeholder={placeholder}
          onChange={onChange}
        />
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {cleanAddress && (
          <button
            type="button"
            onClick={copyAddress}
            className="text-xs font-bold bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg px-2 py-1.5 transition-all"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        {cleanAddress && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold bg-blue-600/15 hover:bg-blue-600/25 border border-blue-600/30 text-blue-300 rounded-lg px-2 py-1.5 transition-all"
          >
            Maps
          </a>
        )}
        {extraActions}
      </div>
    </div>
  );
}

function EditableEmailTile({ email, onChange }) {
  const cleanEmail = (email ?? '').trim();

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <EditableField
          label="Email"
          value={email}
          placeholder="Click to add email"
          onChange={onChange}
          type="email"
        />
      </div>
      {cleanEmail && (
        <a
          href={`mailto:${cleanEmail}`}
          className="text-xs font-bold bg-blue-600/15 hover:bg-blue-600/25 border border-blue-600/30 text-blue-300 rounded-lg px-2 py-1.5 transition-all"
        >
          Email
        </a>
      )}
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
const BLANK_PROPERTY_DRAFT = { facilityName: '', address: '' };

// Sprint 21b — simplified to "a list of addresses this owner has". The
// ownership group is managed automatically behind the scenes (created on
// first address, offered for removal when unlinked), and everything added
// by accident can be deleted right here with a two-step confirm.
function OwnershipLinksPanel({ contact, ownershipApi, onUpdate }) {
  const [message, setMessage] = useState('');
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState(BLANK_PROPERTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmRemoveGroup, setConfirmRemoveGroup] = useState(false);
  const groups = useMemo(() => ownershipApi?.groups ?? [], [ownershipApi?.groups]);
  const linkedGroup = groups.find(g => g.id === contact.ownershipGroupId) ?? null;
  const linkedProperties = linkedGroup ? (ownershipApi?.propertiesByGroup?.get(linkedGroup.id) ?? []) : [];
  const hasOwnershipData = !ownershipApi?.loadError;

  const groupSeed = {
    displayName: contact.ownerEntity || contact.ownerName || contact.facilityName || 'New Ownership Group',
    ownerEntity: contact.ownerEntity || '',
    relationshipType: contact.relationshipType || DEFAULT_RELATIONSHIP_TYPE,
    notes: '',
  };

  async function linkGroup(groupId) {
    setMessage('');
    const result = await onUpdate(contact.id, { ownershipGroupId: groupId || null });
    if (result?.error) setMessage(result.error);
  }

  async function ensureGroup() {
    if (linkedGroup) return linkedGroup;
    const result = await ownershipApi?.createGroup(groupSeed);
    if (result?.error || !result?.group) {
      setMessage(result?.error || 'Could not save.');
      return null;
    }
    await linkGroup(result.group.id);
    return result.group;
  }

  async function saveNewProperty() {
    if (!propertyDraft.facilityName.trim() && !propertyDraft.address.trim()) {
      setMessage('Type a facility name or an address first.');
      return;
    }
    setMessage('');
    const group = await ensureGroup();
    if (!group) return;
    const result = await ownershipApi?.createProperty({
      ownershipGroupId: group.id,
      facilityName: propertyDraft.facilityName.trim(),
      address: propertyDraft.address.trim(),
      state: contact.state || '',
      market: contact.market || '',
      propertyType: 'Self-Storage',
      source: contact.source || '',
      notes: '',
    });
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    // Form stays open with cleared fields so multiple addresses go in fast.
    setPropertyDraft(BLANK_PROPERTY_DRAFT);
    setMessage('Added — type the next one or hit Done.');
  }

  async function savePropertyField(property, fields) {
    setMessage('');
    const result = await ownershipApi?.updateProperty(property.id, { ...property, ...fields });
    if (result?.error) setMessage(result.error);
  }

  async function deleteProperty(propertyId) {
    setMessage('');
    const result = await ownershipApi?.deleteProperty(propertyId);
    setConfirmDeleteId(null);
    if (result?.error) setMessage(result.error);
  }

  // Unlinks this contact; if nobody else uses the group, the group and any
  // leftover addresses are deleted too — the undo for an accidental add.
  async function removeGroup() {
    if (!linkedGroup) return;
    setMessage('');
    const groupId = linkedGroup.id;
    const unlink = await onUpdate(contact.id, { ownershipGroupId: null });
    setConfirmRemoveGroup(false);
    if (unlink?.error) {
      setMessage(unlink.error);
      return;
    }
    const result = await ownershipApi?.removeGroupIfOrphaned(groupId);
    if (result?.error) setMessage(result.error);
    else setMessage(result?.deleted ? 'Removed.' : 'Unlinked — group kept because other contacts still use it.');
  }

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
          Properties They Own{linkedProperties.length > 0 ? ` (${linkedProperties.length})` : ''}
        </p>
        <button
          type="button"
          onClick={() => { setShowAddProperty(v => !v); setMessage(''); setPropertyDraft(BLANK_PROPERTY_DRAFT); }}
          disabled={!hasOwnershipData}
          className={`text-xs font-bold rounded-lg px-3 py-1.5 transition-all disabled:opacity-40 ${showAddProperty
            ? 'text-slate-300 border border-slate-600 hover:text-white'
            : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400'}`}
        >
          {showAddProperty ? 'Done' : '+ Add Address'}
        </button>
      </div>

      {ownershipApi?.loadError && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          Run sql/ownership_property_foundation_migration.sql in Supabase, then refresh to use ownership links.
        </p>
      )}

      {showAddProperty && (
        <div className="bg-slate-800/60 border border-amber-500/30 rounded-lg p-3 space-y-2">
          <input
            type="text"
            autoFocus
            value={propertyDraft.facilityName}
            onChange={e => setPropertyDraft(d => ({ ...d, facilityName: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') saveNewProperty(); }}
            placeholder="Facility name (optional)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          />
          <input
            type="text"
            value={propertyDraft.address}
            onChange={e => setPropertyDraft(d => ({ ...d, address: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') saveNewProperty(); }}
            placeholder="Address (e.g. 123 Main St, Cleburne TX)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={saveNewProperty}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-1.5 rounded-lg text-xs transition-all"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {linkedProperties.length === 0 && !showAddProperty ? (
        <p className="text-xs text-slate-500 italic">Nothing logged yet — hit + Add Address to list everything they own.</p>
      ) : (
        <div className="space-y-2">
          {linkedProperties.map(property => (
            <div key={property.id} className="bg-slate-800/60 border border-slate-700/70 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <HeaderInlineField
                    value={property.facilityName}
                    placeholder="Add facility name"
                    onSave={(v) => savePropertyField(property, { facilityName: v })}
                    textClassName="text-sm font-semibold text-white"
                    inputClassName="text-sm font-semibold text-white"
                  />
                  <HeaderInlineField
                    value={property.address}
                    placeholder="Add address"
                    onSave={(v) => savePropertyField(property, { address: v })}
                    textClassName="text-xs text-slate-500"
                    inputClassName="text-xs text-slate-300"
                  />
                </div>
                {confirmDeleteId === property.id ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => deleteProperty(property.id)}
                      className="text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1 transition-all"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-slate-400 hover:text-white px-1 py-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(property.id)}
                    title="Delete this property"
                    className="text-xs text-slate-600 hover:text-red-400 px-1.5 py-1 transition-all flex-shrink-0"
                  >
                    x
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {linkedGroup && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <p className="text-[11px] text-slate-500 truncate">
            Owner group: <span className="text-slate-400 font-semibold">{linkedGroup.displayName || 'Untitled'}</span>
          </p>
          {confirmRemoveGroup ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] text-red-400 font-semibold">
                Remove{linkedProperties.length > 0 ? ` + ${linkedProperties.length} address${linkedProperties.length === 1 ? '' : 'es'}` : ''}?
              </span>
              <button
                type="button"
                onClick={removeGroup}
                className="text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1 transition-all"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemoveGroup(false)}
                className="text-[11px] text-slate-400 hover:text-white px-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemoveGroup(true)}
              className="text-[11px] text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
            >
              Remove group
            </button>
          )}
        </div>
      )}

      {!linkedGroup && groups.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <label className="text-[11px] text-slate-600 flex-shrink-0">Same owner as an existing group?</label>
          <select
            value=""
            onChange={e => { if (e.target.value) linkGroup(e.target.value); }}
            disabled={!hasOwnershipData}
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          >
            <option value="">Link to existing…</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>{group.displayName || group.ownerEntity || 'Untitled ownership group'}</option>
            ))}
          </select>
        </div>
      )}

      {message && <p className="text-xs text-slate-400">{message}</p>}
    </div>
  );
}

function OwnershipManager({ ownershipApi, contacts, onOpenContact }) {
  const [selectedId, setSelectedId] = useState(null);
  const [groupDrafts, setGroupDrafts] = useState({});
  const [propertyDrafts, setPropertyDrafts] = useState({});
  const [newPropertyDrafts, setNewPropertyDrafts] = useState({});
  const [message, setMessage] = useState('');

  const groups = ownershipApi?.groups ?? [];
  const propertiesByGroup = ownershipApi?.propertiesByGroup ?? new Map();
  const selectedGroup = groups.find(g => g.id === selectedId) ?? groups[0] ?? null;
  const selectedProperties = selectedGroup ? (propertiesByGroup.get(selectedGroup.id) ?? []) : [];
  const linkedContacts = selectedGroup ? contacts.filter(c => c.ownershipGroupId === selectedGroup.id) : [];

  function groupDraft(group) {
    return groupDrafts[group.id] ?? {
      displayName: group.displayName,
      ownerEntity: group.ownerEntity,
      relationshipType: group.relationshipType,
      notes: group.notes,
    };
  }

  function setGroupDraft(groupId, fields) {
    setGroupDrafts(prev => ({ ...prev, [groupId]: { ...(prev[groupId] ?? groupDraft(groups.find(g => g.id === groupId))), ...fields } }));
  }

  function propertyDraft(property) {
    return propertyDrafts[property.id] ?? {
      facilityName: property.facilityName,
      address: property.address,
      city: property.city,
      state: property.state,
      market: property.market,
      propertyType: property.propertyType,
      source: property.source,
      notes: property.notes,
    };
  }

  function setPropertyDraft(propertyId, fields) {
    const property = ownershipApi.properties.find(p => p.id === propertyId);
    setPropertyDrafts(prev => ({ ...prev, [propertyId]: { ...(prev[propertyId] ?? propertyDraft(property)), ...fields } }));
  }

  function newPropertyDraft(groupId) {
    return newPropertyDrafts[groupId] ?? {
      facilityName: '',
      address: '',
      city: '',
      state: '',
      market: '',
      propertyType: 'Self-Storage',
      source: '',
      notes: '',
    };
  }

  function setNewPropertyDraft(groupId, fields) {
    setNewPropertyDrafts(prev => ({ ...prev, [groupId]: { ...newPropertyDraft(groupId), ...fields } }));
  }

  async function saveGroup(group) {
    setMessage('');
    const draft = groupDraft(group);
    const result = await ownershipApi.updateGroup(group.id, draft);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setGroupDrafts(prev => {
      const next = { ...prev };
      delete next[group.id];
      return next;
    });
    setMessage('Ownership group saved.');
  }

  async function saveProperty(property) {
    setMessage('');
    const draft = propertyDraft(property);
    const result = await ownershipApi.updateProperty(property.id, { ...property, ...draft });
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setPropertyDrafts(prev => {
      const next = { ...prev };
      delete next[property.id];
      return next;
    });
    setMessage('Property saved.');
  }

  async function addProperty(groupId) {
    const draft = newPropertyDraft(groupId);
    if (!draft.facilityName.trim() && !draft.address.trim()) return;
    setMessage('');
    const result = await ownershipApi.createProperty({ ...draft, ownershipGroupId: groupId });
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setNewPropertyDrafts(prev => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    setMessage('Property added.');
  }

  if (ownershipApi?.loadError) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <h2 className="text-lg font-black text-white">Owners / Properties unavailable</h2>
        <p className="text-sm text-amber-400 mt-2">{ownershipApi.loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">Owners / Properties</h2>
          <p className="text-xs text-slate-500 mt-1">Manage ownership groups, linked contacts, and facilities without leaving Database.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300">{groups.length} groups</span>
          <span className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300">{ownershipApi.properties.length} properties</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon="OWN" title="No ownership groups yet" message="Open a contact and create an ownership group from the Owner / Property Links panel." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 border-b border-slate-800">Ownership Groups</p>
            <div className="divide-y divide-slate-800/70 max-h-[42rem] overflow-y-auto">
              {groups.map(group => {
                const properties = propertiesByGroup.get(group.id) ?? [];
                const contactCount = contacts.filter(c => c.ownershipGroupId === group.id).length;
                const rel = relationshipMeta(group.relationshipType);
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedId(group.id)}
                    className={`w-full text-left px-4 py-3 transition-all ${selectedGroup?.id === group.id ? 'bg-amber-500/10' : 'hover:bg-slate-800/70'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{group.displayName || 'Untitled ownership group'}</p>
                        {group.ownerEntity && <p className="text-xs text-slate-500 truncate mt-0.5">{group.ownerEntity}</p>}
                      </div>
                      <StatusBadge variant={rel.variant} pill={false} className="font-bold flex-shrink-0">
                        {rel.short}
                      </StatusBadge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">{properties.length} propert{properties.length === 1 ? 'y' : 'ies'} | {contactCount} contact{contactCount === 1 ? '' : 's'}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedGroup && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ownership Group Details</p>
                  <button onClick={() => saveGroup(selectedGroup)} className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 font-bold px-3 py-2 rounded-lg text-xs transition-all">
                    Save Group
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">Display Name</span>
                    <input value={groupDraft(selectedGroup).displayName} onChange={e => setGroupDraft(selectedGroup.id, { displayName: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">Owner Entity</span>
                    <input value={groupDraft(selectedGroup).ownerEntity} onChange={e => setGroupDraft(selectedGroup.id, { ownerEntity: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">Relationship</span>
                    <select value={groupDraft(selectedGroup).relationshipType} onChange={e => setGroupDraft(selectedGroup.id, { relationshipType: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
                      {RELATIONSHIP_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">Notes</span>
                    <input value={groupDraft(selectedGroup).notes} onChange={e => setGroupDraft(selectedGroup.id, { notes: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
                  </label>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Linked Contacts</p>
                {linkedContacts.length === 0 ? (
                  <p className="text-xs text-slate-600 italic">No contacts linked to this group yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {linkedContacts.map(contact => (
                      <button key={contact.id} onClick={() => onOpenContact(contact)}
                        className="text-left bg-slate-800/70 hover:bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 transition-all">
                        <p className="text-sm font-semibold text-white truncate">{contact.ownerName || contact.facilityName || 'Unknown contact'}</p>
                        <p className="text-xs text-slate-500 truncate">{contact.facilityName || contact.phone || 'No facility saved'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Linked Properties</p>
                {selectedProperties.length === 0 ? (
                  <p className="text-xs text-slate-600 italic">No properties linked yet.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedProperties.map(property => {
                      const draft = propertyDraft(property);
                      return (
                        <div key={property.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input value={draft.facilityName} onChange={e => setPropertyDraft(property.id, { facilityName: e.target.value })} placeholder="Facility name"
                              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                            <select value={draft.propertyType} onChange={e => setPropertyDraft(property.id, { propertyType: e.target.value })}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
                              {PROPERTY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                            <input value={draft.address} onChange={e => setPropertyDraft(property.id, { address: e.target.value })} placeholder="Address"
                              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                            <input value={draft.market} onChange={e => setPropertyDraft(property.id, { market: e.target.value })} placeholder="Market"
                              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                          </div>
                          <div className="flex justify-end">
                            <button onClick={() => saveProperty(property)} className="text-xs font-bold bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-3 py-1.5 rounded-lg transition-all">
                              Save Property
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <p className="text-[11px] uppercase font-semibold text-slate-500">Add Property</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={newPropertyDraft(selectedGroup.id).facilityName} onChange={e => setNewPropertyDraft(selectedGroup.id, { facilityName: e.target.value })} placeholder="Facility name"
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                    <select value={newPropertyDraft(selectedGroup.id).propertyType} onChange={e => setNewPropertyDraft(selectedGroup.id, { propertyType: e.target.value })}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
                      {PROPERTY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <input value={newPropertyDraft(selectedGroup.id).address} onChange={e => setNewPropertyDraft(selectedGroup.id, { address: e.target.value })} placeholder="Address"
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                    <input value={newPropertyDraft(selectedGroup.id).market} onChange={e => setNewPropertyDraft(selectedGroup.id, { market: e.target.value })} placeholder="Market"
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                  </div>
                  <button onClick={() => addProperty(selectedGroup.id)}
                    className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 font-bold px-3 py-2 rounded-lg text-xs transition-all">
                    + Add Property
                  </button>
                </div>
              </div>

              {message && <p className="text-xs text-slate-400">{message}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Multi-property owners ─────────────────────────────────────────────────────
// Additional properties an owner holds beyond the card's primary
// facility/address. Stored as jsonb on the contact (owned_properties).
function OwnedPropertiesEditor({ contact, onUpdate }) {
  const [draft, setDraft] = useState({ facilityName: '', address: '' });
  const entries = contact.ownedProperties ?? [];
  const inputCls = 'bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500';

  function commit(rows) { onUpdate?.(contact.id, { ownedProperties: rows }); }
  function addDraft() {
    if (!draft.facilityName.trim() && !draft.address.trim()) return;
    commit([...entries, {
      facilityName: draft.facilityName.trim(),
      address: draft.address.trim(),
      state: '',
      addedAt: new Date().toISOString(),
    }]);
    setDraft({ facilityName: '', address: '' });
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
        🏢 Additional Properties{entries.length > 0 ? ` (${entries.length})` : ''}
      </label>
      {entries.length > 0 && (
        <div className="space-y-1 mb-2">
          {entries.map((p, i) => (
            <div key={`${p.addedAt ?? ''}-${i}`} className="flex items-center gap-2 bg-slate-900/70 border border-slate-700/70 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{p.facilityName || 'Unnamed facility'}</p>
                {p.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`}
                    target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-slate-500 hover:text-amber-400 truncate block"
                  >
                    {p.address}
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => commit(entries.filter((_, j) => j !== i))}
                className="text-slate-600 hover:text-red-400 text-xs flex-shrink-0"
                title="Remove property"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={draft.facilityName}
          onChange={e => setDraft(d => ({ ...d, facilityName: e.target.value }))}
          placeholder="Facility name"
          className={`${inputCls} flex-1 min-w-0`}
        />
        <input
          value={draft.address}
          onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
          placeholder="Address"
          className={`${inputCls} flex-1 min-w-0`}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.facilityName.trim() && !draft.address.trim()}
          className="text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 transition-all disabled:opacity-40 flex-shrink-0"
        >
          + Add Property
        </button>
      </div>
    </div>
  );
}

// Same-owner radar banner: this contact matches someone else in the database
// by phone/email/owner name but sits on a DIFFERENT property — likely one
// owner with multiple facilities. One click folds the weaker row into the
// stronger card as an additional property.
function SameOwnerRadar({ contact, allContacts = [], lists = [], onMerge, onMerged }) {
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const matches = useMemo(
    () => (onMerge ? findSameOwnerMatches(contact, allContacts).slice(0, 3) : []),
    [contact, allContacts, onMerge]
  );
  if (matches.length === 0) return null;

  const listName = (c) => lists.find(l => l.id === c.listId)?.name ?? '';

  async function fold(match) {
    // Keep whichever record has more work on it; the other becomes a property.
    const currentIsMaster = keepScore(contact) >= keepScore(match.contact);
    const masterId = currentIsMaster ? contact.id : match.contact.id;
    const weakerId = currentIsMaster ? match.contact.id : contact.id;
    setBusy(true); setError(null);
    const res = await onMerge(masterId, weakerId);
    setBusy(false);
    setConfirmId(null);
    if (res?.error) { setError(res.error); return; }
    onMerged?.(masterId);
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
      <p className="text-xs font-black text-amber-400 uppercase tracking-wide">🏢 Same owner already in your database?</p>
      {matches.map(m => {
        const c = m.contact;
        const name = c.ownerName || c.facilityName || 'Unknown';
        const currentIsMaster = keepScore(contact) >= keepScore(c);
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-white font-semibold truncate">
                {name}
                <span className="text-slate-400 font-normal"> — {c.facilityName || c.address || 'no property'}</span>
              </p>
              <p className="text-xs text-slate-500">
                {m.reasons.join(' · ')}{listName(c) ? ` · in ${listName(c)}` : ''}
              </p>
            </div>
            {confirmId === c.id ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">
                  {currentIsMaster ? 'Pull their property into this card?' : `Fold this row into ${name}'s card?`}
                </span>
                <button
                  onClick={() => fold(m)}
                  disabled={busy}
                  className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                >
                  {busy ? 'Merging…' : 'Yes, merge'}
                </button>
                <button onClick={() => setConfirmId(null)} className="text-xs text-slate-500 hover:text-white px-1.5 py-1.5">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(c.id)}
                className="text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg px-2.5 py-1.5 transition-all"
              >
                {currentIsMaster ? '+ Pull property in' : '+ Add to their card'}
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function ContactDetailModal({ contact, lists = [], allContacts = [], onClose, onStatusChange, onNotesChange, onUpdate, onDelete, onDeleteAction, onDeleteCallHistory, onMergeSameOwner, taskApi, ownershipApi, mailerApi }) {
  const [notes, setNotes]           = useState(contact.notes ?? '');
  const [callbackDate, setCallbackDate] = useState(contact.callbackDate ?? '');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Sprint 2: after logging certain outcomes, offer/require a follow-up task.
  // 'callback' strongly prompts (auto-opens, due date emphasized); 'conversation'
  // and 'appointment' just offer a dismissible suggestion bar.
  const [taskPrompt, setTaskPrompt] = useState(null); // 'callback' | 'suggest' | null
  const [confirmDelete, setConfirmDelete] = useState(false);

  const contactName = contact.ownerName || contact.facilityName || 'Contact';
  const openTasks = taskApi?.getRelatedTasks('contact', contact.id) ?? [];
  const source = contactSource(contact, lists);
  const rel = relationshipMeta(contact.relationshipType);

  function saveNotes() { onNotesChange(contact.id, notes); }

  // Sprint 12 — research notes append through the modal's own notes state so
  // an unsaved draft in the textarea is never clobbered.
  function addResearchNote(line) {
    const next = [notes, line].filter(Boolean).join('\n');
    setNotes(next);
    onNotesChange(contact.id, next);
  }

  function handleOutcome(status) {
    const loggedNotes = status === 'callback'
      ? appendDateToLogNote(notes, 'Callback date', callbackDate)
      : notes;
    onStatusChange(contact.id, status, loggedNotes, activityDate);
    onNotesChange(contact.id, loggedNotes);
    if (loggedNotes !== notes) setNotes(loggedNotes);
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
              <StatusBadge variant={rel.variant} pill={false} className="font-bold">
                {rel.short}
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

          {/* ── Owner Research Hub (Sprint 12) ── */}
          <OwnerResearchPanel contact={contact} onAddNote={addResearchNote} />

          {/* ── Same-owner radar: link multi-property owners ── */}
          <SameOwnerRadar
            contact={contact}
            allContacts={allContacts}
            lists={lists}
            onMerge={onMergeSameOwner}
            onMerged={(masterId) => { if (masterId !== contact.id) onClose(); }}
          />

          {/* ── Editable contact fields ── */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <EditableField label="Owner Name" value={contact.ownerName} placeholder="Click to add owner name" onChange={field('ownerName')} />
              <EditableField label="Owner Entity" value={contact.ownerEntity} placeholder="ABC Storage LLC / owns personally" onChange={field('ownerEntity')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Relationship Type</label>
              <select
                value={contact.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE}
                onChange={e => field('relationshipType')(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {RELATIONSHIP_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Lead / Relationship Source</label>
              <select
                value={contact.leadSource ?? ''}
                onChange={e => field('leadSource')(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">No source set</option>
                {LEAD_SOURCES.map(sourceOption => (
                  <option key={sourceOption} value={sourceOption}>{sourceOption}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <EditableField label="Phone" value={contact.phone} placeholder="Click to add phone" onChange={field('phone')} mono
                href={contact.phone ? `tel:${contact.phone}` : null} />
              <EditableField label="Email" value={contact.email} placeholder="Click to add email" onChange={field('email')}
                href={contact.email ? `mailto:${contact.email}` : null} />
            </div>
            <EditableField label="LinkedIn" value={contact.linkedinUrl} placeholder="Paste LinkedIn profile URL"
              onChange={(val) => field('linkedinUrl')(normalizeLinkedinUrl(val))}
              href={contact.linkedinUrl ? normalizeLinkedinUrl(contact.linkedinUrl) : null} />
            <EditableField label="Facility Address" value={contact.address} placeholder="Click to add address" onChange={field('address')}
              href={contact.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}` : null} />
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <EditableField label="Mailing Address" value={contact.mailingAddress} placeholder="Click to add mailing address" onChange={field('mailingAddress')}
                  href={contact.mailingAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.mailingAddress)}` : null} />
              </div>
              {contact.mailingAddress && (
                <AddToMailerButton
                  mailerApi={mailerApi}
                  member={{ type: 'contact', id: contact.id, name: contact.ownerName || contact.facilityName || 'Unknown', mailingAddress: contact.mailingAddress, addressLabel: 'Primary' }}
                />
              )}
            </div>
            <MailingAddressList
              addresses={contact.mailingAddresses}
              onChange={(rows) => onUpdate(contact.id, { mailingAddresses: rows })}
              mailerApi={mailerApi}
              member={{ type: 'contact', id: contact.id, name: contact.ownerName || contact.facilityName || 'Unknown' }}
              inputClassName="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              compact
            />
            <OwnedPropertiesEditor contact={contact} onUpdate={onUpdate} />
          </div>

          <OwnershipLinksPanel contact={contact} ownershipApi={ownershipApi} onUpdate={onUpdate} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Activity Date</label>
              <input type="date" value={activityDate} onInput={e => setActivityDate(e.target.value)} onChange={e => setActivityDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Callback Date</label>
              <input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
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
                {contact.callHistory.map((h, index) => ({ h, index })).reverse().map(({ h, index }) => (
                  <div key={index} className="flex items-start gap-3 text-xs bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-500 flex-shrink-0">{h.date}</span>
                    <span className={`font-semibold flex-shrink-0 ${STATUS_COLORS[h.outcome]?.split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-400'}`}>
                      {STATUS_LABELS[h.outcome] ?? h.outcome}
                    </span>
                    {h.notes && <span className="text-slate-400 italic truncate">{h.notes}</span>}
                    {onDeleteCallHistory && (
                      <button
                        onClick={() => {
                          if (confirm('Delete this logged call?')) onDeleteCallHistory(contact.id, index);
                        }}
                        className="ml-auto text-slate-600 hover:text-red-400 font-black px-1 flex-shrink-0"
                        title="Delete logged call"
                      >
                        x
                      </button>
                    )}
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
function PropertyCard({ contact, onClick, onAddToMasterDB, onSetAction, onLogAction, onDeleteAction, isMasterDB, lists = [], onMoveToList, onToClients, taskApi }) {
  const [added, setAdded] = useState(false);
  const [showActionCenter, setShowActionCenter] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contact.id, data: { contact } });

  const openTasks = taskApi?.getRelatedTasks('contact', contact.id) ?? [];
  const nextTask = getNextOpenTask(openTasks);
  const nextTaskType = nextTask ? TASK_TYPE_MAP[nextTask.taskType] : null;
  const nextTaskDue = dueMeta(nextTask?.dueDate);
  const actionType = ACTION_TYPES.find(a => a.value === contact.nextActionType);
  const fallbackDue = dueMeta(contact.nextActionDate);
  const source = contactSource(contact, lists);
  const rel = relationshipMeta(contact.relationshipType);
  const modalDefaults = nextTask
    ? {}
    : legacyActionDefaults(contact.nextActionType, contact.nextActionDate, contact.nextActionNote);

  const mapsQuery = encodeURIComponent(
    [contact.facilityName, 'self storage', contact.market || contact.state].filter(Boolean).join(' ')
  );

  async function handleAddToMasterDB(e) {
    e.stopPropagation();
    const result = await onAddToMasterDB(contact);
    if (result?.error) {
      alert('Could not move to Master Database: ' + result.error);
      return;
    }
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
          <StatusBadge variant={rel.variant} pill={false} className="font-bold">
            {rel.short}
          </StatusBadge>
          {contact._distanceMiles != null && (
            <span className="text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 rounded-md whitespace-nowrap">
              📍 {Math.round(contact._distanceMiles)} mi
            </span>
          )}
          {(contact.ownedProperties?.length ?? 0) > 0 && (
            <span
              className="text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md whitespace-nowrap"
              title={contact.ownedProperties.map(p => p.facilityName || p.address).filter(Boolean).join('\n')}
            >
              🏢 {contact.ownedProperties.length + 1} properties
            </span>
          )}
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
            if (onToClients) moveOptions.push({ label: 'Move to Pipeline', onClick: () => onToClients(contact) });
            lists.filter(l => l.id !== contact.listId).forEach(l =>
              moveOptions.push({ label: `Move to ${l.name}`, onClick: () => onMoveToList?.(contact.id, l.id) }));
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
            <span className="text-sm font-bold text-amber-400 truncate min-w-0">{contact.facilityName}</span>
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
          🏢 Find facility
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

      {contact.ownerEntity && (
        <p className="mb-3 text-xs text-slate-500 truncate">
          Entity: <span className="text-slate-300 font-semibold">{contact.ownerEntity}</span>
        </p>
      )}
      {contact.leadSource && (
        <p className="mb-3 text-xs text-slate-500 truncate">
          Lead Source: <span className="text-slate-300 font-semibold">{contact.leadSource}</span>
        </p>
      )}

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
            onClick={e => { e.stopPropagation(); setShowActionCenter(true); }}
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
            onClick={e => { e.stopPropagation(); setShowActionCenter(true); }}
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
            onClick={e => { e.stopPropagation(); setShowActionCenter(true); }}
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
            onClick={e => { e.stopPropagation(); setShowActionCenter(true); }}
            className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-1 transition-all"
          >
            + Log
          </button>
        </div>
      )}

      {showActionCenter && (
        <ActionCenterModal
          name={contact.ownerName || contact.facilityName || 'Contact'}
          subtitle={contact.facilityName}
          actionLog={contact.actionLog}
          onLogAction={onLogAction ? (entry) => onLogAction(contact.id, entry) : undefined}
          onDeleteAction={onDeleteAction ? (index) => onDeleteAction(contact.id, index) : undefined}
          taskContext={{ relatedType: 'contact', relatedId: contact.id, relatedName: contact.ownerName || contact.facilityName || 'Contact', source: 'database' }}
          taskDefaults={modalDefaults}
          onSaveTask={taskApi?.createTask}
          onClose={() => setShowActionCenter(false)}
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
          {added ? 'Added to Master DB' : 'Add to Master Database'}
        </button>
      )}
    </div>
  );
}

// ─── Add Contact Modal ────────────────────────────────────────────────────────
function AddContactModal({ listName, onSave, onClose }) {
  const [form, setForm] = useState({
    ownerName: '', ownerEntity: '', facilityName: '', relationshipType: DEFAULT_RELATIONSHIP_TYPE, leadSource: '', phone: '', email: '', address: '', mailingAddress: '', state: '', notes: '',
  });

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })); }
  const blankForm = { ownerName: '', ownerEntity: '', facilityName: '', relationshipType: DEFAULT_RELATIONSHIP_TYPE, leadSource: '', phone: '', email: '', address: '', mailingAddress: '', state: '', notes: '' };

  function handleSave() {
    if (!form.ownerName.trim() && !form.facilityName.trim()) return;
    onSave(form);
    setForm(blankForm);
  }

  function handleSaveAndAnother() {
    if (!form.ownerName.trim() && !form.facilityName.trim()) return;
    onSave(form);
    setForm(blankForm);
  }

  const fields = [
    { key: 'ownerName',    label: 'Owner Name *',    placeholder: 'John Smith',             type: 'text' },
    { key: 'ownerEntity',  label: 'Owner Entity',    placeholder: 'ABC Storage LLC',        type: 'text' },
    { key: 'facilityName', label: 'Facility Name',   placeholder: 'ABC Self Storage',        type: 'text' },
    { key: 'phone',        label: 'Phone',           placeholder: '(555) 000-0000',          type: 'tel'  },
    { key: 'email',        label: 'Email',           placeholder: 'john@abcstorage.com',     type: 'email'},
    { key: 'address',      label: 'Address',         placeholder: '123 Main St, City, FL',   type: 'text' },
    { key: 'mailingAddress', label: 'Mailing Address', placeholder: 'PO Box 123, City, FL',  type: 'text' },
  ];

  const canSave = form.ownerName.trim() || form.facilityName.trim();

  return (
    <ModalLayout onClose={onClose} className="flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-black text-white">Add Contact</h2>
            <p className="text-xs text-slate-500 mt-0.5">Adding to: <span className="text-amber-400">{listName}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
        </div>

        <div className="p-5 space-y-3 flex-1 overflow-y-auto min-h-0">
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
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Relationship Type</label>
            <select
              value={form.relationshipType}
              onChange={e => set('relationshipType', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              {RELATIONSHIP_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Lead / Relationship Source</label>
            <select
              value={form.leadSource}
              onChange={e => set('leadSource', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="">No source set</option>
              {LEAD_SOURCES.map(sourceOption => (
                <option key={sourceOption} value={sourceOption}>{sourceOption}</option>
              ))}
            </select>
          </div>

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

        <div className="flex items-center justify-between p-5 border-t border-slate-800 gap-3 flex-shrink-0">
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
          <span className="text-xs text-red-400 font-semibold">Delete list?</span>
          <div className="flex gap-1.5">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 hover:text-white transition-all">Cancel</button>
            <button onClick={() => { onDelete(l.id); setConfirmDelete(false); }} className="text-xs bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-0.5 rounded transition-all">Continue</button>
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
// list means nothing in another).
// Sprint 13 — positions and the last active session now persist to
// localStorage, so a page reload or Vercel redeploy mid-call-block no longer
// loses his place. The picker offers "Resume call session: 37 of 212" and
// validates against the live queue before resuming (never forces it).
const CALL_POSITIONS_KEY = 'storageHero.callQueuePositions';
const CALL_SESSION_KEY = 'storageHero.callSession';
// Sprint 22 — per-list location-sort anchors: { [listId]: { label, coords: [lat, lng] } }
const LOCATION_ANCHORS_KEY = 'storageHero.locationAnchors';

function readStoredJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

const callQueuePositions = readStoredJson(CALL_POSITIONS_KEY, {});

function persistCallPositions() {
  try { localStorage.setItem(CALL_POSITIONS_KEY, JSON.stringify(callQueuePositions)); } catch { /* storage blocked — session memory only */ }
}

// Sprint 23 — positions remember WHO Brandon was on, not just a row number.
// Queues shrink and reorder as outcomes get logged (called contacts drop out),
// so a bare index lands on the wrong contact after leaving and coming back.
// Each saved position carries the contact he was on plus the next few in line;
// resuming jumps to the first of those still in the live queue.
function savedQueuePosition(index, queue) {
  return { index, contactIds: queue.slice(index, index + 6).map(c => c.id) };
}

function resolveQueuePosition(saved, queue) {
  if (saved == null || queue.length === 0) return 0;
  if (typeof saved === 'number') { // legacy index-only entry from before Sprint 23
    return saved > 0 && saved < queue.length ? saved : 0;
  }
  for (const id of saved.contactIds ?? []) {
    const idx = queue.findIndex(c => c.id === id);
    if (idx >= 0) return idx;
  }
  return Math.min(Math.max(saved.index ?? 0, 0), queue.length - 1);
}

function saveCallSession(session) {
  try { localStorage.setItem(CALL_SESSION_KEY, JSON.stringify(session)); } catch { /* storage blocked */ }
}

function clearStoredCallSession() {
  try { localStorage.removeItem(CALL_SESSION_KEY); } catch { /* storage blocked */ }
}

// ─── Location sort control (Sprint 22) ───────────────────────────────────────
// Filter-bar chip that sorts the active list by distance to an anchor point:
// preset metro chips plus a free-typed city or ZIP. The chosen anchor is
// remembered per list (see LOCATION_ANCHORS_KEY).
function LocationSortControl({ anchor, onSet, onClear, geoData, geoError, onOpen }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  // 'left' | 'right' — which edge of the button the popover hangs from. Chosen
  // at open time so it never clips off the window edge (the installed PWA
  // often runs at narrow widths where left-aligned always overflowed).
  const [alignRight, setAlignRight] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggle() {
    const next = !open;
    if (next) {
      // Hang the popover (w-72 = 288px) from whichever button edge keeps it
      // on screen; prefer left-aligned when both fit.
      const rect = boxRef.current?.getBoundingClientRect();
      if (rect) setAlignRight(rect.left + 288 > document.documentElement.clientWidth - 12);
      setNotFound(false);
      onOpen?.();
    }
    setOpen(next);
  }

  function applyQuery() {
    if (!query.trim() || !geoData) return;
    const resolved = resolveAnchor(query, geoData);
    if (resolved) {
      onSet(resolved);
      setQuery('');
      setNotFound(false);
      setOpen(false);
    } else {
      setNotFound(true);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={toggle}
        className={`text-xs font-semibold rounded-lg px-2.5 py-2 border transition-all whitespace-nowrap ${
          anchor
            ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 hover:bg-sky-500/25'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-sky-300 hover:border-sky-500/40'
        }`}
        title="Sort this list by distance to a city or ZIP"
      >
        {anchor ? `📍 Near ${anchor.label}` : '📍 Location'}
      </button>
      {open && (
        <div className={`absolute top-full ${alignRight ? 'right-0' : 'left-0'} mt-1.5 z-30 w-72 max-w-[calc(100vw-24px)] bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl shadow-black/50 space-y-2.5`}>
          <p className="text-xs font-semibold text-slate-400 uppercase">Sort by distance to</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_ANCHORS.map(p => (
              <button
                key={p.label}
                onClick={() => { onSet({ label: p.label, coords: p.coords }); setOpen(false); }}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                  anchor?.label === p.label
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'border-slate-700 text-slate-300 hover:border-sky-500/40 hover:text-sky-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setNotFound(false); }}
              onKeyDown={e => { if (e.key === 'Enter') applyQuery(); }}
              placeholder={geoData ? 'City or ZIP (e.g. Cleburne, 76033)' : 'Loading location data…'}
              disabled={!geoData && !geoError}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={applyQuery}
              disabled={!geoData || !query.trim()}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 transition-all"
            >
              Set
            </button>
          </div>
          {notFound && <p className="text-xs text-red-400">Couldn't find that city — try "City, ST" or a ZIP code.</p>}
          {geoError && <p className="text-xs text-red-400">{geoError}</p>}
          {anchor && (
            <button onClick={() => { onClear(); setOpen(false); }} className="text-xs font-semibold text-slate-500 hover:text-red-400 transition-all">
              Clear location sort
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
function CallModeQueuePicker({ queues, onSelect, onExit, resumeInfo, onResume, onClearSession }) {
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

      {/* Sprint 13 — resume the interrupted call session */}
      {resumeInfo && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-amber-300">
              Resume call session: {resumeInfo.resumeIndex + 1} of {resumeInfo.currentTotal} contacts — {resumeInfo.label}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Saved {new Date(resumeInfo.savedAt).toLocaleDateString()} {new Date(resumeInfo.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {resumeInfo.currentTotal !== resumeInfo.total ? ` · queue was ${resumeInfo.total} contacts when saved` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onResume} className="text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2 rounded-lg transition-all">
              ▶ Resume
            </button>
            <button onClick={onClearSession} className="text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-2 transition-all">
              Start Over
            </button>
          </div>
        </div>
      )}
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
export default function Database({ onCallLogged, db, onContactToClients, clients = [], clientHandlers = {}, taskApi, mailerApi, entryRequest, onEntryConsumed }) {
  const {
    lists, contacts, masterListId,
    importList, importIntoList, mergeDuplicateContact, mergeAsSameOwner, moveContactToList, createList, addContact,
    updateContactStatus, updateContactCallback,
    updateContactNotes, updateContact, deleteList, renameList, deleteContact,
    addToMasterDB, logContactAction, deleteContactAction, deleteContactCallHistory,
    duplicateDismissals, dismissedDuplicateKeys, dismissalStorage, dismissDuplicateGroup, restoreDuplicateGroup,
  } = db;
  const ownershipApi = useOwnership();

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
  const [relationshipFilter, setRelationshipFilter] = useState('all');
  const [leadSourceFilter, setLeadSourceFilter] = useState('all');
  const [search, setSearch]         = useState('');

  async function handleDeleteList(listId) {
    if (!listId || listId === masterListId) return;
    const list = lists.find(l => l.id === listId);
    const count = contacts.filter(c => c.listId === listId).length;
    const ok = confirm(
      `Delete "${list?.name ?? 'this list'}" from the database?\n\n` +
      `This will permanently delete ${count} contact${count === 1 ? '' : 's'} still assigned to this list.\n\n` +
      'Anything already added to the Master Database will stay there.'
    );
    if (!ok) return;

    const result = await deleteList(listId);
    if (result?.error) {
      alert(`Could not delete list: ${result.error}`);
      return;
    }
    if (activeListId === listId) setActiveListId('all');
  }

  // Sprint 22 — location sort. Each list remembers its own anchor ("sort the
  // car wash list around DFW") in localStorage, mirroring how Call Mode
  // remembers queue positions. Distances come from static ZIP-centroid data
  // (src/lib/geo.js) loaded lazily the first time an anchor is set.
  const [locationAnchors, setLocationAnchors] = useState(() => readStoredJson(LOCATION_ANCHORS_KEY, {}));
  const [geoData, setGeoData] = useState(null);
  const [geoError, setGeoError] = useState(null);
  // Also load geo data as soon as the picker opens, so typing "Cleburne"
  // resolves immediately instead of waiting until after an anchor is set.
  const [geoWanted, setGeoWanted] = useState(false);
  const locationAnchor = activeListId != null ? (locationAnchors[activeListId] ?? null) : null;

  function setLocationAnchor(anchor) {
    if (activeListId == null) return;
    setLocationAnchors(prev => {
      const next = { ...prev };
      if (anchor) next[activeListId] = anchor; else delete next[activeListId];
      try { localStorage.setItem(LOCATION_ANCHORS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }

  useEffect(() => {
    if ((!locationAnchor && !geoWanted) || geoData) return;
    let cancelled = false;
    loadGeoData()
      .then(d => { if (!cancelled) { setGeoData(d); setGeoError(null); } })
      .catch(() => { if (!cancelled) setGeoError('Location data failed to load — check your connection.'); });
    return () => { cancelled = true; };
  }, [locationAnchor, geoWanted, geoData]);
  const [openContact, setOpenContact] = useState(null);

  // Call queue state
  const [callQueueIndex, setCallQueueIndex] = useState(0);
  const [callNote, setCallNote]       = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [callActivityDate, setCallActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  // null = show the queue picker; otherwise one of QUEUE_DEFS' keys below
  const [callQueueSource, setCallQueueSource] = useState(null);

  // Exiting Call Mode drops Brandon back on the card he was working. Without
  // this the grid re-renders from the top and long lists mean scrolling all
  // the way back down after every call block.
  const [returnFocusContactId, setReturnFocusContactId] = useState(null);
  useEffect(() => {
    if (subView !== 'contacts' || !returnFocusContactId) return;
    document.querySelector(`[data-contact-id="${returnFocusContactId}"]`)?.scrollIntoView({ block: 'center' });
    const timer = setTimeout(() => setReturnFocusContactId(null), 2500);
    return () => clearTimeout(timer);
  }, [subView, returnFocusContactId]);

  // Filtered contacts
  const filtered = useMemo(() => {
    if (activeListId === null) return [];
    const result = contacts.filter(c => {
      if (activeListId !== 'all' && c.listId !== activeListId) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (relationshipFilter !== 'all' && (c.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE) !== relationshipFilter) return false;
      if (leadSourceFilter !== 'all' && (c.leadSource ?? '') !== leadSourceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (c.facilityName ?? '').toLowerCase().includes(q) ||
          (c.ownerName ?? '').toLowerCase().includes(q) ||
          (c.ownerEntity ?? '').toLowerCase().includes(q) ||
          (c.leadSource ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.address ?? '').toLowerCase().includes(q) ||
          (c.mailingAddress ?? '').toLowerCase().includes(q) ||
          (c.market ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
    // Location sort: nearest first, contacts without a usable ZIP sink to the
    // bottom in their original order. Each row carries _distanceMiles for the
    // card badge and Call Mode.
    if (locationAnchor && geoData) {
      return result
        .map(c => ({ ...c, _distanceMiles: contactDistanceMiles(c, locationAnchor.coords, geoData.zips) }))
        .sort((a, b) => (a._distanceMiles ?? Infinity) - (b._distanceMiles ?? Infinity));
    }
    return result;
  }, [contacts, activeListId, statusFilter, relationshipFilter, leadSourceFilter, search, locationAnchor, geoData]);

  const callQueue = useMemo(() =>
    filtered.filter(c => ['fresh','callback','no_answer','voicemail'].includes(c.status)),
    [filtered]
  );

  // Sprint 6 — task-based Call Mode queues, computed over ALL contacts (not
  // scoped to whichever list happens to be selected in the sidebar), since
  // "who owes a callback today" is a cross-list question.
  const todayCallbackQueue = useMemo(() => buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: false }), [contacts, taskApi]);
  const overdueCallbackQueue = useMemo(() => buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: true }), [contacts, taskApi]);
  const upcomingCallbackQueue = useMemo(() => buildCallbackTaskQueue(contacts, taskApi?.tasks, { upcoming: true, windowDays: 30 }), [contacts, taskApi]);
  const allFutureCallbackQueue = useMemo(() => buildCallbackTaskQueue(contacts, taskApi?.tasks, { upcoming: true }), [contacts, taskApi]);
  const followUpQueue = useMemo(() => buildFollowUpQueue(contacts, taskApi), [contacts, taskApi]);
  const allContactsQueue = useMemo(() =>
    contacts.filter(c => ['fresh','callback','no_answer','voicemail'].includes(c.status)),
    [contacts]
  );
  // Sprint 11 — duplicate group count for the sidebar badge. Recomputed only
  // when contacts/dismissals change; the review panel recomputes with task counts.
  const duplicateGroupCount = useMemo(
    () => findDuplicateGroups(contacts).filter(g => !dismissedDuplicateKeys?.has(g.key)).length,
    [contacts, dismissedDuplicateKeys]
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
      key: 'upcoming',
      label: 'Upcoming Callbacks',
      reason: 'Future callback tasks scheduled in the next 30 days.',
      queue: upcomingCallbackQueue,
    },
    {
      key: 'future',
      label: 'All Future Callbacks',
      reason: 'Every future callback task after today, including callbacks more than 30 days out.',
      queue: allFutureCallbackQueue,
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
  ], [activeListLabel, activeListId, callQueue, todayCallbackQueue, overdueCallbackQueue, upcomingCallbackQueue, allFutureCallbackQueue, followUpQueue, allContactsQueue]);

  const activeQueueDef = QUEUE_DEFS.find(q => q.key === callQueueSource) ?? null;

  // Position keys for the queue-position memory. The Active List queue is
  // keyed per list so switching lists never resumes into the wrong list's
  // position. Positions + the active session persist to localStorage (Sprint 13).
  const positionKey = (key) => key === 'activeList' ? `activeList:${activeListId}` : key;
  const [savedCallSession, setSavedCallSession] = useState(() => readStoredJson(CALL_SESSION_KEY, null));

  function recordCallSession(queueKey, listIdForQueue, index, queue, label) {
    const session = {
      queueKey,
      listId: queueKey === 'activeList' ? listIdForQueue : null,
      label,
      index,
      total: queue.length,
      contactId: queue[index]?.id ?? null,
      savedAt: new Date().toISOString(),
    };
    saveCallSession(session);
    setSavedCallSession(session);
  }

  function selectQueue(key) {
    setCallQueueSource(key);
    // Resume where Brandon left off in this queue — by contact, so the saved
    // spot survives the queue shrinking or reordering while he was away.
    const def = QUEUE_DEFS.find(q => q.key === key);
    const queue = def?.queue ?? [];
    const index = resolveQueuePosition(callQueuePositions[positionKey(key)], queue);
    setCallQueueIndex(index);
    recordCallSession(key, activeListId, index, queue, def?.label ?? 'Call Mode');
  }

  // All Call Mode index changes flow through here so the per-queue position
  // memory stays current no matter how the index moved (next/back, outcome
  // advance, queue shrink).
  function setQueueIndex(next) {
    setCallQueueIndex(next);
    if (callQueueSource) {
      callQueuePositions[positionKey(callQueueSource)] = savedQueuePosition(next, activeQueueDef?.queue ?? []);
      persistCallPositions();
      recordCallSession(callQueueSource, activeListId, next, activeQueueDef?.queue ?? [], activeQueueDef?.label ?? 'Call Mode');
    }
  }

  // Sprint 13 — validate the saved session against the LIVE queue before
  // offering to resume. Returns null (no banner) when the saved list is gone,
  // the queue is now empty, or the position adds nothing (index 0).
  const resumeInfo = useMemo(() => {
    const s = savedCallSession;
    if (!s?.queueKey) return null;
    let queue;
    let label = s.label ?? 'Call Mode';
    if (s.queueKey === 'activeList') {
      if (!s.listId || !lists.some(l => l.id === s.listId)) return null;
      queue = contacts.filter(c => c.listId === s.listId && ['fresh', 'callback', 'no_answer', 'voicemail'].includes(c.status));
      label = lists.find(l => l.id === s.listId)?.name ?? label;
    } else {
      queue = QUEUE_DEFS.find(q => q.key === s.queueKey)?.queue ?? [];
    }
    if (queue.length === 0) return null;
    let resumeIndex = s.contactId ? queue.findIndex(c => c.id === s.contactId) : -1;
    if (resumeIndex < 0) resumeIndex = Math.min(s.index ?? 0, queue.length - 1);
    if (resumeIndex <= 0) return null;
    return { ...s, resumeIndex, currentTotal: queue.length, label };
  }, [savedCallSession, contacts, lists, QUEUE_DEFS]);

  function resumeSavedSession() {
    if (!resumeInfo) return;
    if (resumeInfo.queueKey === 'activeList') setActiveListId(resumeInfo.listId);
    setCallQueueSource(resumeInfo.queueKey);
    setCallQueueIndex(resumeInfo.resumeIndex);
    const key = resumeInfo.queueKey === 'activeList' ? `activeList:${resumeInfo.listId}` : resumeInfo.queueKey;
    callQueuePositions[key] = resumeInfo.resumeIndex;
    persistCallPositions();
  }

  function clearSavedSession() {
    clearStoredCallSession();
    setSavedCallSession(null);
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
      if (entryRequest.listId !== undefined) setActiveListId(entryRequest.listId);
      if (entryRequest.statusFilter) setStatusFilter(entryRequest.statusFilter);
      if (entryRequest.search !== undefined) setSearch(entryRequest.search);
      if (entryRequest.subView) {
        setSubView(entryRequest.subView);
        if (entryRequest.subView === 'callQueue') {
          const requestedQueue = entryRequest.queueSource ?? entryRequest.queueKey;
          if (requestedQueue) {
            selectQueue(requestedQueue);
            const key = entryRequest.queueKey === 'activeList'
              ? `activeList:${entryRequest.listId ?? activeListId}`
              : entryRequest.queueKey;
            if (entryRequest.queueKey) {
              callQueuePositions[key] = 0;
              persistCallPositions();
            }
          } else {
            setCallQueueIndex(0);
            setCallQueueSource(null);
          }
        }
      }
    }
    onEntryConsumed?.();
  }, [entryRequest, contacts, activeListId, onEntryConsumed]);

  // In the Master Database view, clients are merged in (unified view, no duplicates)
  const masterView = activeListId === masterListId;
  const clientsInView = (masterView && statusFilter === 'all' && relationshipFilter === 'all' && leadSourceFilter === 'all')
    ? clients.filter(cl => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (cl.name ?? '').toLowerCase().includes(q)
          || (cl.facilityName ?? '').toLowerCase().includes(q)
          || (cl.address ?? '').toLowerCase().includes(q)
          || (cl.mailingAddress ?? '').toLowerCase().includes(q)
          || (cl.phone ?? '').includes(q)
          || (cl.email ?? '').toLowerCase().includes(q);
      })
    : [];

  async function handleCallOutcome(contact, status, noteOverride, activityDate) {
    const note = noteOverride ?? callNote;
    if (status === 'callback' && !callbackDate) {
      alert('Pick a callback date before logging Call Back.');
      return;
    }
    const callDate = activityDate || new Date().toISOString().slice(0, 10);
    const loggedNote = status === 'callback'
      ? appendDateToLogNote(note, 'Callback date', callbackDate)
      : note;
    const updatedCallHistory = [
      ...(contact.callHistory ?? []),
      { date: callDate, outcome: status, notes: loggedNote ?? '' },
    ];
    await updateContactStatus(contact.id, status, loggedNote, activityDate);
    if (status === 'callback' && callbackDate) await updateContactCallback(contact.id, callbackDate);
    if (masterListId && contact.listId !== masterListId) {
      await addToMasterDB({
        ...contact,
        status,
        callHistory: updatedCallHistory,
        lastCalled: callDate,
        callbackDate: status === 'callback' ? callbackDate : contact.callbackDate,
      }, { mergeIfExists: true });
    }
    if (status === 'callback') {
      taskApi?.createTask({
        title: 'Call back',
        description: loggedNote.trim(),
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

  function handleStatusChangeFromModal(id, status, notes, activityDate) {
    updateContactStatus(id, status, notes, activityDate);
    if (onCallLogged) onCallLogged(status);
    // refresh open contact
    setOpenContact(prev => prev?.id === id ? { ...prev, status, lastCalled: activityDate || new Date().toISOString().slice(0,10) } : prev);
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
    {/* Stacks at narrow widths (installed PWA) — a fixed side-by-side layout
        squeezed the content pane to ~230px and clipped everything inside. */}
    <div className="flex flex-col md:flex-row gap-5 min-h-0">

      {/* ── LEFT: List Organizer Sidebar ── */}
      <div className="md:flex-shrink-0 w-full md:w-56 space-y-2">
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
          New
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
              onDelete={handleDeleteList}
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
                        {count} imported &middot; {ready} workable
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
            { key: 'callQueue',  label: 'Call Mode', badge: todayCallbackQueue.length + overdueCallbackQueue.length + allFutureCallbackQueue.length },
            { key: 'ownership',  label: 'Owners / Properties', badge: ownershipApi.groups.length },
            { key: 'duplicates', label: '🧹 Duplicate Review', badge: duplicateGroupCount, badgeTone: 'amber' },
            { key: 'markets',    label: '🗺 Markets',    badge: null },
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
                <span className={`text-xs px-1.5 py-0.5 rounded-md border ${
                  t.badgeTone === 'amber'
                    ? 'bg-amber-600/20 text-amber-400 border-amber-600/30'
                    : 'bg-green-600/20 text-green-400 border-green-600/30'
                }`}>{t.badge}</span>
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
          <p className="text-xs font-semibold text-slate-500">Drop here to move to <span className="text-blue-400">Clients / Pipeline</span></p>
        </DropTarget>

        {/* Delete list button — not for Master Database */}
        {activeListId !== 'all' && activeListId !== masterListId && (
          <button
            onClick={() => handleDeleteList(activeListId)}
            className="w-full text-xs font-semibold text-red-500 hover:text-red-400 bg-red-900/10 hover:bg-red-900/20 border border-red-900/30 rounded-xl px-3 py-2 transition-all"
          >
            Delete This List
          </button>
        )}
      </div>

      {/* ── RIGHT: Main Content ── */}
      <div className="flex-1 min-w-0 space-y-4">
        {activeListId === null && subView !== 'callQueue' && subView !== 'duplicates' && subView !== 'ownership' && (
          <EmptyState
            icon="📋"
            title="No list selected"
            message="Select a list from the left, or create a new one."
          />
        )}

        {/* ── Duplicate Review (Sprint 11) — cross-list, independent of the
             selected list, like Call Mode. ── */}
        {subView === 'duplicates' && (
          <DuplicateReview
            contacts={contacts}
            lists={lists}
            taskApi={taskApi}
            onMerge={mergeDuplicateContact}
            onDelete={deleteContact}
            onOpenContact={(c) => setOpenContact(c)}
            onExit={() => setSubView('contacts')}
            dismissedKeys={dismissedDuplicateKeys}
            onDismissGroup={dismissDuplicateGroup}
            onRestoreGroup={restoreDuplicateGroup}
            dismissals={duplicateDismissals}
            dismissalStorage={dismissalStorage}
          />
        )}

        {/* ── Call Queue — independent of activeListId, so Dashboard-launched
             queues (Today's Callbacks / Overdue / Follow-Up / All Contacts)
             work even when no list is selected in the sidebar. ── */}
        {subView === 'ownership' && (
          <OwnershipManager
            ownershipApi={ownershipApi}
            contacts={contacts}
            onOpenContact={(contact) => setOpenContact(contact)}
          />
        )}

        {subView === 'callQueue' && (
          callQueueSource === null ? (
            <CallModeQueuePicker
              queues={QUEUE_DEFS}
              onSelect={selectQueue}
              onExit={() => setSubView('contacts')}
              resumeInfo={resumeInfo}
              onResume={resumeSavedSession}
              onClearSession={clearSavedSession}
            />
          ) : (
            <CallQueue
              queue={activeQueueDef?.queue ?? []}
              index={callQueueIndex}
              setIndex={setQueueIndex}
              callbackDate={callbackDate}
              setCallbackDate={setCallbackDate}
              activityDate={callActivityDate}
              setActivityDate={setCallActivityDate}
              onOutcome={handleCallOutcome}
              onSaveNotes={updateContactNotes}
              onUpdateContact={updateContact}
              onDeleteContact={deleteContact}
              onDeleteAction={deleteContactAction}
              onDeleteCallHistory={deleteContactCallHistory}
              onPromote={onContactToClients}
              onMoveToMaster={(contact) => moveContactToList(contact.id, masterListId)}
              masterListId={masterListId}
              taskApi={taskApi}
              ownershipApi={ownershipApi}
              mailerApi={mailerApi}
              queueLabel={activeQueueDef?.label ?? 'Call Mode'}
              queueReasonText={activeQueueDef?.reason ?? ''}
              locationLabel={callQueueSource === 'activeList' ? locationAnchor?.label : null}
              allContacts={contacts}
              lists={lists}
              onMergeSameOwner={mergeAsSameOwner}
              onExit={() => {
                const current = (activeQueueDef?.queue ?? [])[callQueueIndex];
                if (current) setReturnFocusContactId(current.id);
                setSubView('contacts');
                setCallQueueSource(null);
              }}
              onBackToPicker={() => setCallQueueSource(null)}
            />
          )
        )}

        {activeListId !== null && subView !== 'callQueue' && subView !== 'duplicates' && subView !== 'ownership' && (<>

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
              <select
                value={relationshipFilter}
                onChange={e => setRelationshipFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Relationships</option>
                {RELATIONSHIP_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <select
                value={leadSourceFilter}
                onChange={e => setLeadSourceFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Lead Sources</option>
                {LEAD_SOURCES.map(sourceOption => <option key={sourceOption} value={sourceOption}>{sourceOption}</option>)}
              </select>
              <LocationSortControl
                anchor={locationAnchor}
                onSet={setLocationAnchor}
                onClear={() => setLocationAnchor(null)}
                geoData={geoData}
                geoError={geoError}
                onOpen={() => setGeoWanted(true)}
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Due Today', queue: 'today' },
                  { label: 'Overdue', queue: 'overdue' },
                  { label: 'Upcoming', queue: 'upcoming' },
                  { label: 'All Future Callbacks', queue: 'future' },
                  { label: 'Call Back', status: 'callback' },
                  { label: 'Conversation', status: 'conversation' },
                  { label: 'Appt Set', status: 'appointment' },
                  { label: 'Untouched', status: 'fresh' },
                ].map(f => (
                  <button
                    key={f.label}
                    onClick={() => {
                      if (f.queue) { setSubView('callQueue'); selectQueue(f.queue); }
                      else { setStatusFilter(f.status); setActiveListId(activeListId ?? 'all'); }
                    }}
                    className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 text-slate-400 hover:text-amber-400 rounded-lg px-2.5 py-2 transition-all"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
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
                  {/* Sprint 12 — the old auto-deleting "Remove Duplicates" is retired.
                      This routes to the Duplicate Review Center instead; nothing is
                      deleted without per-group confirmation there. */}
                  <button
                    onClick={() => setSubView('duplicates')}
                    className="ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                    title="Open the Duplicate Review Center — review, merge, and confirm each delete"
                  >
                    🧹 Review Duplicates{duplicateGroupCount > 0 ? ` (${duplicateGroupCount})` : ''}
                  </button>
                  <button
                    onClick={() => setShowMasterImport(true)}
                    className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 font-bold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                  >
                    Bulk Upload
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
                  <div
                    key={c.id}
                    data-contact-id={c.id}
                    className={c.id === returnFocusContactId ? 'rounded-xl ring-2 ring-amber-500/70' : undefined}
                  >
                  <PropertyCard
                    contact={c}
                    onClick={() => setOpenContact(c)}
                    onAddToMasterDB={addToMasterDB}
                    onSetAction={(id, fields) => updateContact(id, fields)}
                    onLogAction={logContactAction}
                    onDeleteAction={deleteContactAction}
                    isMasterDB={masterView}
                    lists={lists}
                    onMoveToList={moveContactToList}
                    onToClients={onContactToClients}
                    taskApi={taskApi}
                    ownershipApi={ownershipApi}
                  />
                  </div>
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
                    onDeleteAction={clientHandlers.onDeleteAction}
                    taskApi={taskApi}
                    ownershipApi={ownershipApi}
                    mailerApi={clientHandlers.mailerApi}
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
          allContacts={contacts}
          onMergeSameOwner={mergeAsSameOwner}
          onClose={() => setOpenContact(null)}
          onStatusChange={handleStatusChangeFromModal}
          onNotesChange={updateContactNotes}
          onUpdate={updateContact}
          onDelete={(id) => { deleteContact(id); setOpenContact(null); }}
          onDeleteAction={deleteContactAction}
          onDeleteCallHistory={deleteContactCallHistory}
          taskApi={taskApi}
          ownershipApi={ownershipApi}
          mailerApi={mailerApi}
        />
      )}

      {showImport && (
        <ImportListModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
          existingContacts={contacts}
          onOpenImportedList={openImportedList}
          onStartImportedCallSession={startImportedCallSession}
          onOpenDuplicateReview={() => { setShowImport(false); setSubView('duplicates'); }}
        />
      )}

      {showMasterImport && (
        <ImportListModal
          fixedListName="Master Database"
          existingContacts={contacts}
          onImport={(_name, _source, rawText, options) => importIntoList(masterListId, rawText, options)}
          onClose={() => setShowMasterImport(false)}
          onOpenDuplicateReview={() => { setShowMasterImport(false); setSubView('duplicates'); }}
        />
      )}

      {/* New Blank List modal */}
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
          <p className="text-xs text-slate-500 mt-0.5">Drop on a list or Clients</p>
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

// ─── Call Queue ────────────────────────────────────────────────────────────────
const OFFER_FOLLOWUP_STATUSES = ['voicemail', 'conversation', 'appointment'];
const DEFAULT_COMPLETE_STATUSES = ['conversation', 'appointment', 'not_interested', 'callback'];
const CALLBACK_PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: '2 days', days: 2 },
  { label: 'Next week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '30 days', days: 30 },
];

function datePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Sprint 20 — click-to-edit for the big header fields (owner name / facility)
// in Call Mode. Same commit rules as EditableField but sized for the header.
function HeaderInlineField({ value, placeholder, onSave, textClassName, inputClassName }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? '')) onSave(next);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
        placeholder={placeholder}
        className={`w-full bg-slate-800 border border-amber-500 rounded-lg px-2 py-1 focus:outline-none placeholder:text-slate-600 ${inputClassName}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Click to edit"
      className="group/hf block w-full text-left rounded-lg -mx-1 px-1 hover:bg-slate-800/60 transition-all"
    >
      <span className={textClassName}>
        {value || <span className="text-slate-600 italic font-semibold">{placeholder}</span>}
        <span className="opacity-0 group-hover/hf:opacity-100 text-slate-500 text-sm ml-2 font-normal transition-opacity">Edit</span>
      </span>
    </button>
  );
}

// Sprint 20 — full contact editing without leaving Call Mode. Reuses the same
// editors as ContactDetailModal (EditableField, relationship/lead-source
// selects, OwnershipLinksPanel) so behavior stays identical in both surfaces.
function CallModeDetailsPanel({ contact, onUpdateContact, ownershipApi, mailerApi }) {
  function field(key) {
    return (val) => onUpdateContact?.(contact.id, { [key]: val });
  }
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EditableField label="Owner Name" value={contact.ownerName} placeholder="Click to add owner name" onChange={field('ownerName')} />
        <EditableField label="Owner Entity" value={contact.ownerEntity} placeholder="ABC Storage LLC / owns personally" onChange={field('ownerEntity')} />
        <EditableField label="Facility Name" value={contact.facilityName} placeholder="Click to add facility name" onChange={field('facilityName')} />
        <EditableEmailTile email={contact.email} onChange={field('email')} />
        <EditableField label="LinkedIn" value={contact.linkedinUrl} placeholder="Paste LinkedIn profile URL"
          onChange={(val) => field('linkedinUrl')(normalizeLinkedinUrl(val))}
          href={contact.linkedinUrl ? normalizeLinkedinUrl(contact.linkedinUrl) : null} />
        <EditableField label="Market" value={contact.market} placeholder="Click to add market" onChange={field('market')} />
        <EditableField label="State" value={contact.state} placeholder="Click to add state" onChange={field('state')} />
      </div>
      <EditableAddressRow
        label="Facility Address"
        address={contact.address}
        placeholder="Click to add address"
        onChange={field('address')}
      />
      <EditableAddressRow
        label="Mailing Address"
        address={contact.mailingAddress}
        placeholder="Click to add mailing address"
        onChange={field('mailingAddress')}
        extraActions={contact.mailingAddress ? (
          <AddToMailerButton
            mailerApi={mailerApi}
            member={{ type: 'contact', id: contact.id, name: contact.ownerName || contact.facilityName || 'Unknown', mailingAddress: contact.mailingAddress, addressLabel: 'Primary' }}
          />
        ) : null}
      />
      <MailingAddressList
        addresses={contact.mailingAddresses}
        onChange={(rows) => onUpdateContact?.(contact.id, { mailingAddresses: rows })}
        mailerApi={mailerApi}
        member={{ type: 'contact', id: contact.id, name: contact.ownerName || contact.facilityName || 'Unknown' }}
        inputClassName="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
        compact
      />
      <OwnedPropertiesEditor contact={contact} onUpdate={(id, fields) => onUpdateContact?.(id, fields)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Relationship Type</label>
          <select
            value={contact.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE}
            onChange={e => field('relationshipType')(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            {RELATIONSHIP_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Lead / Relationship Source</label>
          <select
            value={contact.leadSource ?? ''}
            onChange={e => field('leadSource')(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">No source set</option>
            {LEAD_SOURCES.map(sourceOption => (
              <option key={sourceOption} value={sourceOption}>{sourceOption}</option>
            ))}
          </select>
        </div>
      </div>
      <OwnershipLinksPanel contact={contact} ownershipApi={ownershipApi} onUpdate={onUpdateContact} />
    </div>
  );
}

function CallQueue({ queue, index, setIndex, callbackDate, setCallbackDate, activityDate, setActivityDate, onOutcome, onSaveNotes, onUpdateContact, onDeleteContact, onDeleteAction, onDeleteCallHistory, onPromote, onMoveToMaster, masterListId, taskApi, ownershipApi, mailerApi, queueLabel, queueReasonText, locationLabel, onExit, onBackToPicker, allContacts = [], lists = [], onMergeSameOwner }) {
  const current = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  const [noteDraft, setNoteDraft] = useState({ contactId: null, text: '' });
  const [noteSavedFor, setNoteSavedFor] = useState(null);
  const [postOutcome, setPostOutcome] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [sidePanel, setSidePanel] = useState('tasks');
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

  async function moveCurrentToMaster() {
    if (!current || !onMoveToMaster || !masterListId) return;
    if (current.listId === masterListId) return;
    const result = await onMoveToMaster(current);
    if (result?.error) alert('Could not move to Master Database: ' + result.error);
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
    await onOutcome(current, status, noteText, activityDate);
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
      if (key === 'e') { e.preventDefault(); setShowDetails(v => !v); }
      if (key === 'm') { e.preventDefault(); moveCurrentToMaster(); }
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
  const recentActivity = (current.actionLog ?? [])
    .map((entry, index) => ({ entry, index }))
    .reverse()
    .slice(0, 4);

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
            {index > 0 && (
              <button onClick={() => setIndex(0)} title="Jump back to the first contact in this queue"
                className="text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5">
                Restart Queue
              </button>
            )}
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
                {current._distanceMiles != null && (
                  <span className="text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 rounded-md whitespace-nowrap">
                    📍 {Math.round(current._distanceMiles)} mi{locationLabel ? ` from ${locationLabel}` : ''}
                  </span>
                )}
                <SourceBadge source={current.source} />
              </div>
              <HeaderInlineField
                key={`owner-${current.id}`}
                value={current.ownerName}
                placeholder="Click to add owner name"
                onSave={(v) => onUpdateContact?.(current.id, { ownerName: v })}
                textClassName="text-3xl font-black text-white leading-tight"
                inputClassName="text-3xl font-black text-white"
              />
              <HeaderInlineField
                key={`facility-${current.id}`}
                value={current.facilityName}
                placeholder="Click to add facility name"
                onSave={(v) => onUpdateContact?.(current.id, { facilityName: v })}
                textClassName="text-base text-slate-400"
                inputClassName="text-base text-slate-200 mt-1"
              />
              {current.queueReason && (
                <p className="text-xs text-amber-400/80 mt-1.5 font-semibold">Why they're up: {current.queueReason}</p>
              )}
              <button
                type="button"
                onClick={() => setShowDetails(v => !v)}
                className={`mt-2 text-xs font-bold rounded-lg px-3 py-1.5 border transition-all ${showDetails
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/40'}`}
              >
                {showDetails ? 'Hide Details' : 'Edit Details'}
              </button>
            </div>
            <PrimaryPhoneEditor
              key={current.id}
              phone={current.phone}
              onSave={(phone) => onUpdateContact?.(current.id, { phone })}
            />
          </div>

          {/* Same-owner radar — always visible so multi-property owners jump
              out mid-call without opening Edit Details. */}
          <SameOwnerRadar
            contact={current}
            allContacts={allContacts}
            lists={lists}
            onMerge={onMergeSameOwner}
          />
          {(current.ownedProperties?.length ?? 0) > 0 && !showDetails && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5">
              <p className="text-xs text-slate-500 uppercase font-semibold mb-1">🏢 Also owns</p>
              {current.ownedProperties.map((p, i) => (
                <p key={i} className="text-sm text-slate-300 truncate">
                  {p.facilityName || 'Unnamed facility'}{p.address ? ` — ${p.address}` : ''}
                </p>
              ))}
            </div>
          )}

          {showDetails && (
            <CallModeDetailsPanel
              key={current.id}
              contact={current}
              onUpdateContact={onUpdateContact}
              ownershipApi={ownershipApi}
              mailerApi={mailerApi}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowContactDetails(v => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-xs font-semibold text-slate-400 hover:text-white bg-slate-950/60 transition-colors"
            >
              <span>Contact details</span>
              <span className="text-slate-600">{showContactDetails ? 'Hide' : 'Show'}</span>
            </button>
            {showContactDetails && (
              <div className="p-4 space-y-3 bg-slate-900">
                <AdditionalPhonesEditor
                  phones={current.alternatePhones}
                  onSave={(phones) => onUpdateContact?.(current.id, { alternatePhones: phones })}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <EditableEmailTile
                    email={current.email}
                    onChange={(v) => onUpdateContact?.(current.id, { email: v })}
                  />
                  <EditableAddressRow
                    label="Facility Address"
                    address={current.address}
                    placeholder="Click to add address"
                    onChange={(v) => onUpdateContact?.(current.id, { address: v })}
                  />
                </div>
                <EditableAddressRow
                  label="Mailing Address"
                  address={current.mailingAddress}
                  placeholder="Click to add mailing address"
                  onChange={(v) => onUpdateContact?.(current.id, { mailingAddress: v })}
                  extraActions={current.mailingAddress ? (
                    <AddToMailerButton
                      mailerApi={mailerApi}
                      member={{ type: 'contact', id: current.id, name: current.ownerName || current.facilityName || 'Unknown', mailingAddress: current.mailingAddress, addressLabel: 'Primary' }}
                    />
                  ) : null}
                />
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
            <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Activity Date</label>
                <input type="date" value={activityDate} onInput={e => setActivityDate(e.target.value)} onChange={e => setActivityDate(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Callback Date</label>
                <input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)}
                  className="bg-slate-800 border border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
              </div>
              <button onClick={saveNotes} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all">Save Note</button>
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-500 hover:text-red-400 transition-all font-semibold px-2 py-2">Delete</button>
              <button onClick={() => go(-1)} disabled={index === 0} className="text-sm text-slate-400 hover:text-white disabled:text-slate-700 transition-all font-semibold px-2 py-2">Previous</button>
              <button onClick={() => go(1)} disabled={index >= queue.length - 1} className="text-sm text-amber-400 hover:text-amber-300 disabled:text-slate-700 transition-all font-semibold px-2 py-2 whitespace-nowrap">Next Contact</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-600 mr-1">Callback:</span>
              {CALLBACK_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setCallbackDate(datePlusDays(p.days))}
                  className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-purple-500/40 hover:text-purple-300 transition-all"
                >
                  {p.label}
                </button>
              ))}
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2">
            <div className="flex gap-1 bg-slate-950/70 rounded-lg p-1">
              {[
                ['tasks', `Tasks (${openTasks.length})`],
                ['research', 'Research'],
                ['history', 'History'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSidePanel(key)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                    sidePanel === key ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={`${sidePanel === 'research' ? '' : 'hidden'} bg-slate-900 border border-slate-800 rounded-2xl p-4`}>
            <h3 className="text-sm font-black text-white mb-3">Research</h3>
            {/* Sprint 12 — compact strip: Maps · Whitepages · Google · LinkedIn · County · SOS */}
            <ResearchStrip contact={current} />
          </div>

          <div className={`${sidePanel === 'tasks' ? '' : 'hidden'} bg-slate-900 border border-slate-800 rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-white">Tasks</h3>
              <span className="text-xs text-slate-600">{openTasks.length} open</span>
            </div>
            <RelatedTasks taskApi={taskApi} relatedType="contact" relatedId={current.id} relatedName={contactDisplayName(current)} source="database" maxVisible={4} />
          </div>

          <div className={`${sidePanel === 'history' ? '' : 'hidden'} bg-slate-900 border border-slate-800 rounded-2xl p-4`}>
            <h3 className="text-sm font-black text-white mb-3">Call History</h3>
            {current.callHistory?.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {current.callHistory.map((h, index) => ({ h, index })).reverse().slice(0, 8).map(({ h, index }) => (
                  <div key={index} className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-300">{STATUS_LABELS[h.outcome] ?? h.outcome}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">{h.date}</span>
                        {onDeleteCallHistory && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this logged call?')) onDeleteCallHistory(current.id, index);
                            }}
                            className="text-slate-600 hover:text-red-400 font-black px-1"
                            title="Delete logged call"
                          >
                            x
                          </button>
                        )}
                      </div>
                    </div>
                    {h.notes && <p className="text-slate-500 mt-0.5 line-clamp-2">{h.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No calls logged yet.</p>
            )}
          </div>

          <div className={`${sidePanel === 'history' ? '' : 'hidden'} bg-slate-900 border border-slate-800 rounded-2xl p-4`}>
            <h3 className="text-sm font-black text-white mb-3">Activity</h3>
            {recentActivity.length > 0 ? (
              <div className="space-y-1.5">
                {recentActivity.map(({ entry, index }) => (
                  <div key={index} className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 rounded-lg px-3 py-2">
                    <span className="truncate flex-1">{entry.note || entry.type || 'Action'} {entry.date ? `- ${entry.date}` : ''}</span>
                    {onDeleteAction && (
                      <button
                        onClick={() => {
                          if (confirm('Delete this activity?')) onDeleteAction(current.id, index);
                        }}
                        className="text-slate-600 hover:text-red-400 font-black px-1 flex-shrink-0"
                        title="Delete activity"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No activity logged yet.</p>
            )}
          </div>

          {masterListId && (
            current.listId === masterListId ? (
              <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-400/80 font-black px-4 py-3 rounded-2xl text-sm text-center">
                ⭐ In Master Database
              </div>
            ) : (
              <button onClick={moveCurrentToMaster}
                className="w-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 font-black px-4 py-3 rounded-2xl text-sm transition-all">
                ⭐ Move to Master Database
              </button>
            )
          )}
          {onPromote && (
            <button onClick={() => onPromote(current)}
              className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-300 font-black px-4 py-3 rounded-2xl text-sm transition-all">
              Promote to Client / Pipeline
            </button>
          )}
          <p className="text-xs text-slate-600 px-1">Shortcuts: &larr; / &rarr; move through queue. N next, B back, X no answer, V voicemail, C callback, E edit details, M move to Master DB.</p>
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






