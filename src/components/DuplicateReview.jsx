import { useState, useMemo } from 'react';
import { findDuplicateGroups, isProtectedRecord } from '../lib/duplicateReview';
import { ModalLayout, StatusBadge, EmptyState } from './ui';

// Sprint 11 — Duplicate Review Center. Lightweight panel inside Database that
// clusters likely duplicate owner records, shows why they matched, recommends
// which record to keep, merges useful info into the keeper, and only deletes
// the weaker duplicate after an explicit confirmation.

const STATUS_LABELS = {
  fresh: 'Fresh', no_answer: 'No Answer', voicemail: 'Left VM',
  conversation: 'Conversation', appointment: 'Appt Set',
  not_interested: 'Not Interested', callback: 'Call Back',
};

const STATUS_VARIANT = {
  fresh: 'slate', no_answer: 'yellow', voicemail: 'blue', conversation: 'green',
  appointment: 'amber', not_interested: 'red', callback: 'purple',
};

const CONFIDENCE_STYLES = {
  High: 'bg-red-500/15 border-red-500/40 text-red-400',
  Medium: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  Low: 'bg-slate-700/60 border-slate-600 text-slate-400',
};

function DeleteWeakerConfirmModal({ contact, isProtected, openTaskCount, onConfirm, onClose }) {
  const name = contact.ownerName || contact.facilityName || 'this contact';
  return (
    <ModalLayout onClose={onClose} size="sm" className="p-6 text-center">
      <h2 className="text-lg font-bold text-white mb-1">Delete weaker duplicate?</h2>
      <p className="text-slate-400 text-sm mb-3">
        Delete <span className="text-white font-semibold">{name}</span>? This cannot be undone.
      </p>
      <div className="text-left text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3 space-y-1">
        <p>• Call history on the deleted record will be lost.</p>
        <p>• Related tasks are not deleted and may need cleanup.{openTaskCount > 0 ? ` (${openTaskCount} open now)` : ''}</p>
      </div>
      {isProtected && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4 text-left">
          This record has call history or open tasks. Make sure you merged everything you need before deleting.
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-sm font-semibold">
          Keep It
        </button>
        <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all">
          Delete
        </button>
      </div>
    </ModalLayout>
  );
}

function RecordCard({ contact, listName, isKeeper, isRecommended, isMerged, openTaskCount, onSelectKeeper, onOpen }) {
  const alt = Array.isArray(contact.alternatePhones) ? contact.alternatePhones.filter(p => p?.phone) : [];
  const calls = contact.callHistory?.length ?? 0;
  return (
    <div className={`flex-1 min-w-0 rounded-xl border p-3.5 transition-all ${
      isKeeper ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-700 bg-slate-900'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <label className="flex items-center gap-2 cursor-pointer min-w-0">
          <input type="radio" checked={isKeeper} onChange={onSelectKeeper} className="accent-emerald-500 flex-shrink-0" />
          <span className={`text-xs font-bold ${isKeeper ? 'text-emerald-400' : 'text-slate-500'}`}>
            {isKeeper ? 'KEEP THIS ONE' : 'Keep this one'}
          </span>
        </label>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isRecommended && (
            <span className="text-[10px] font-black bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 rounded px-1.5 py-0.5">★ RECOMMENDED</span>
          )}
          {isMerged && (
            <span className="text-[10px] font-black bg-blue-600/20 text-blue-400 border border-blue-600/40 rounded px-1.5 py-0.5">MERGED</span>
          )}
        </div>
      </div>

      <button onClick={onOpen} className="block w-full text-left mb-1 group">
        <p className="text-sm font-black text-white truncate group-hover:text-amber-400 transition-colors">
          {contact.ownerName || <span className="text-slate-500 italic">No owner name</span>}
        </p>
        {contact.facilityName && <p className="text-xs text-amber-400/80 truncate">{contact.facilityName}</p>}
      </button>

      <div className="space-y-1 text-xs mt-2">
        <p className="font-mono text-green-400 truncate">{contact.phone || <span className="text-slate-600 italic font-sans">No phone</span>}</p>
        {alt.map((p, i) => (
          <p key={i} className="font-mono text-green-400/70 truncate">+ {p.phone} <span className="text-slate-600 font-sans">({p.label})</span></p>
        ))}
        {contact.email && <p className="text-blue-400 truncate">{contact.email}</p>}
        {contact.address && <p className="text-slate-400 truncate">{contact.address}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <StatusBadge variant={STATUS_VARIANT[contact.status] ?? 'slate'} pill={false}>
          {STATUS_LABELS[contact.status] ?? 'Fresh'}
        </StatusBadge>
        {contact.source && (
          <span className="text-[10px] border border-slate-600 text-slate-400 rounded px-1.5 py-0.5">{contact.source}</span>
        )}
        {listName && <span className="text-[10px] text-slate-500">in {listName}</span>}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-slate-500">
        <span className={calls > 0 ? 'text-slate-300 font-semibold' : ''}>{calls} call{calls === 1 ? '' : 's'}</span>
        <span className={openTaskCount > 0 ? 'text-slate-300 font-semibold' : ''}>{openTaskCount} open task{openTaskCount === 1 ? '' : 's'}</span>
        <span className={(contact.notes ?? '').trim() ? 'text-slate-300 font-semibold' : ''}>{(contact.notes ?? '').trim() ? 'Has notes' : 'No notes'}</span>
        {contact.createdAt && <span>added {String(contact.createdAt).slice(0, 10)}</span>}
      </div>
    </div>
  );
}

function DuplicateGroupCard({ group, contactById, listNameById, getOpenTaskCount, onMerge, onDelete, onDismiss, onOpenContact }) {
  const [keeperId, setKeeperId] = useState(group.recommendedKeepId);
  const [mergedIds, setMergedIds] = useState(() => new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const members = group.memberIds.map(id => contactById.get(id)).filter(Boolean);
  const keeper = contactById.get(keeperId) ?? members[0];
  const others = members.filter(m => m.id !== keeper?.id);
  if (!keeper || others.length === 0) return null;

  async function handleMerge(weakerId) {
    setBusy(true);
    setError('');
    const result = await onMerge(keeper.id, weakerId);
    setBusy(false);
    if (result?.error) { setError(result.error); return; }
    setMergedIds(prev => new Set(prev).add(weakerId));
    setMessage(result.addedPhones > 0
      ? `Merged — ${result.addedPhones} phone${result.addedPhones === 1 ? '' : 's'} added as alternate${result.addedPhones === 1 ? '' : 's'}.`
      : 'Merged — no new info to add.');
    setConfirmDeleteId(weakerId);
  }

  async function handleDelete(weakerId) {
    setBusy(true);
    setError('');
    const result = await onDelete(weakerId);
    setBusy(false);
    setConfirmDeleteId(null);
    if (result?.error) setError('Could not delete: ' + result.error);
  }

  const confirmContact = confirmDeleteId ? contactById.get(confirmDeleteId) : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-black border rounded-md px-2 py-0.5 ${CONFIDENCE_STYLES[group.confidence] ?? CONFIDENCE_STYLES.Low}`}>
          {group.confidence} confidence
        </span>
        {group.reasons.map(r => (
          <span key={r} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-0.5">{r}</span>
        ))}
        <button onClick={onDismiss} className="ml-auto text-xs text-slate-500 hover:text-white transition-colors" title="Hide this group for the rest of the session">
          Not a duplicate
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        {[keeper, ...others].map(m => (
          <RecordCard
            key={m.id}
            contact={m}
            listName={listNameById.get(m.listId)}
            isKeeper={m.id === keeper.id}
            isRecommended={m.id === group.recommendedKeepId}
            isMerged={mergedIds.has(m.id)}
            openTaskCount={getOpenTaskCount(m.id)}
            onSelectKeeper={() => { setKeeperId(m.id); setMessage(''); setError(''); }}
            onOpen={() => onOpenContact?.(m)}
          />
        ))}
      </div>

      {(message || error) && (
        <p className={`text-xs font-semibold ${error ? 'text-red-400' : 'text-emerald-400'}`}>{error || message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {others.map(m => {
          const merged = mergedIds.has(m.id);
          const name = m.ownerName || m.facilityName || 'duplicate';
          return (
            <div key={m.id} className="flex gap-2">
              <button
                onClick={() => handleMerge(m.id)}
                disabled={busy || merged}
                className={`text-xs font-bold px-3 py-2 rounded-lg border transition-all ${
                  merged
                    ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
                }`}
              >
                {merged ? `Merged "${name}"` : others.length > 1 ? `Merge "${name}" into kept` : 'Merge into kept record'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(m.id)}
                disabled={busy}
                className="text-xs font-semibold px-3 py-2 rounded-lg border border-red-900/50 text-red-500 hover:text-red-400 hover:bg-red-900/20 transition-all"
              >
                Delete{others.length > 1 ? ` "${name}"` : ' weaker duplicate'}
              </button>
            </div>
          );
        })}
      </div>

      {confirmContact && (
        <DeleteWeakerConfirmModal
          contact={confirmContact}
          isProtected={isProtectedRecord(confirmContact, { openTaskCount: getOpenTaskCount(confirmContact.id) })}
          openTaskCount={getOpenTaskCount(confirmContact.id)}
          onConfirm={() => handleDelete(confirmContact.id)}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export default function DuplicateReview({ contacts, lists = [], taskApi, onMerge, onDelete, onOpenContact, onExit }) {
  // Session-only dismissals — "Not a duplicate" hides a group until reload.
  const [dismissed, setDismissed] = useState(() => new Set());

  const getOpenTaskCount = (id) => taskApi?.getRelatedTasks?.('contact', id)?.length ?? 0;

  const groups = useMemo(
    () => findDuplicateGroups(contacts, { getOpenTaskCount: (id) => taskApi?.getRelatedTasks?.('contact', id)?.length ?? 0 }),
    [contacts, taskApi]
  );
  const visible = groups.filter(g => !dismissed.has(g.key));
  const contactById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const listNameById = useMemo(() => new Map(lists.map(l => [l.id, l.name])), [lists]);
  const highCount = visible.filter(g => g.confidence === 'High').length;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white">Duplicate Review</h2>
          <p className="text-xs text-slate-500 mt-1.5 max-w-2xl">
            Likely duplicate owner records across all lists. Pick which record to keep, merge the useful
            info (extra phones, email, address) into it, then delete the weaker copy — nothing is deleted
            without your confirmation.
          </p>
          <p className="text-xs font-semibold text-amber-400 mt-1.5">
            {visible.length} group{visible.length === 1 ? '' : 's'} found{highCount ? ` · ${highCount} high confidence` : ''}
          </p>
        </div>
        <button onClick={onExit} className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition-all">
          Exit
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No duplicates found"
          message="Every owner record looks unique. New duplicates will show up here after imports."
        />
      ) : (
        <div className="space-y-4">
          {visible.map(g => (
            <DuplicateGroupCard
              key={g.key}
              group={g}
              contactById={contactById}
              listNameById={listNameById}
              getOpenTaskCount={getOpenTaskCount}
              onMerge={onMerge}
              onDelete={onDelete}
              onDismiss={() => setDismissed(prev => new Set(prev).add(g.key))}
              onOpenContact={onOpenContact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
