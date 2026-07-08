import { useMemo, useState } from 'react';
import { DEFAULT_RELATIONSHIP_TYPE } from '../data/constants';

const BLANK_PROPERTY_DRAFT = { facilityName: '', address: '' };

function InlineField({ value, placeholder, onSave, textClassName = '', inputClassName = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? '')) onSave(next);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value ?? '');
            setEditing(false);
          }
        }}
        className={`w-full min-w-0 bg-slate-900 border border-amber-500 rounded-lg px-2 py-1 focus:outline-none ${inputClassName}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group block w-full min-w-0 text-left rounded-md px-1 -mx-1 hover:bg-slate-700/60 transition-all"
      title="Click to edit"
    >
      <span className={textClassName}>
        {value || <span className="text-slate-600 italic font-semibold">{placeholder}</span>}
        <span className="opacity-0 group-hover:opacity-100 text-slate-500 text-xs ml-2 font-normal transition-opacity">Edit</span>
      </span>
    </button>
  );
}

function ownerDisplayName(record) {
  return record?.ownerEntity || record?.ownerName || record?.name || record?.facilityName || 'New Ownership Group';
}

export default function OwnershipLinksPanel({ record, ownershipApi, onUpdate, compact = false }) {
  const [message, setMessage] = useState('');
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState(BLANK_PROPERTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmRemoveGroup, setConfirmRemoveGroup] = useState(false);
  const groups = useMemo(() => ownershipApi?.groups ?? [], [ownershipApi?.groups]);
  const linkedGroup = groups.find(g => g.id === record.ownershipGroupId) ?? null;
  const linkedProperties = linkedGroup ? (ownershipApi?.propertiesByGroup?.get(linkedGroup.id) ?? []) : [];
  const hasOwnershipData = !ownershipApi?.loadError;

  const groupSeed = {
    displayName: ownerDisplayName(record),
    ownerEntity: record.ownerEntity || '',
    relationshipType: record.relationshipType || DEFAULT_RELATIONSHIP_TYPE,
    notes: '',
  };

  async function linkGroup(groupId) {
    setMessage('');
    const result = await onUpdate?.(record.id, { ownershipGroupId: groupId || null });
    if (result?.error) setMessage(result.error);
    return result;
  }

  async function ensureGroup() {
    if (linkedGroup) return linkedGroup;
    const result = await ownershipApi?.createGroup(groupSeed);
    if (result?.error || !result?.group) {
      setMessage(result?.error || 'Could not save.');
      return null;
    }
    const link = await linkGroup(result.group.id);
    if (link?.error) {
      await ownershipApi?.removeGroupIfOrphaned(result.group.id);
      return null;
    }
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
      state: record.state || '',
      market: record.market || '',
      propertyType: record.propertyType || 'Self-Storage',
      source: record.source || '',
      notes: '',
    });
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setPropertyDraft(BLANK_PROPERTY_DRAFT);
    setMessage('Added. Type the next one or hit Done.');
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

  async function removeGroup() {
    if (!linkedGroup) return;
    setMessage('');
    const groupId = linkedGroup.id;
    const unlink = await onUpdate?.(record.id, { ownershipGroupId: null });
    setConfirmRemoveGroup(false);
    if (unlink?.error) {
      setMessage(unlink.error);
      return;
    }
    const result = await ownershipApi?.removeGroupIfOrphaned(groupId);
    if (result?.error) setMessage(result.error);
    else setMessage(result?.deleted ? 'Removed.' : 'Unlinked. Group kept because other records still use it.');
  }

  return (
    <div className={`bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3 ${compact ? 'mt-3' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
          Properties They Own{linkedProperties.length > 0 ? ` (${linkedProperties.length})` : ''}
        </p>
        <button
          type="button"
          onClick={() => { setShowAddProperty(v => !v); setMessage(''); setPropertyDraft(BLANK_PROPERTY_DRAFT); }}
          disabled={!hasOwnershipData || !onUpdate}
          className={`text-xs font-bold rounded-lg px-3 py-1.5 transition-all disabled:opacity-40 ${showAddProperty
            ? 'text-slate-300 border border-slate-600 hover:text-white'
            : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400'}`}
        >
          {showAddProperty ? 'Done' : '+ Add Address'}
        </button>
      </div>

      {ownershipApi?.loadError && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          Run the ownership/property SQL migrations in Supabase, then refresh to use property links.
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
        <p className="text-xs text-slate-500 italic">Nothing logged yet. Hit + Add Address to list everything they own.</p>
      ) : (
        <div className="space-y-2">
          {linkedProperties.map(property => (
            <div key={property.id} className="bg-slate-800/60 border border-slate-700/70 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <InlineField
                    value={property.facilityName}
                    placeholder="Add facility name"
                    onSave={(v) => savePropertyField(property, { facilityName: v })}
                    textClassName="text-sm font-semibold text-white"
                    inputClassName="text-sm font-semibold text-white"
                  />
                  <InlineField
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
            disabled={!hasOwnershipData || !onUpdate}
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          >
            <option value="">Link to existing...</option>
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
