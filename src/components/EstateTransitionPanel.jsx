import { useEffect, useState } from 'react';

const RELATIONSHIP_SUGGESTIONS = [
  'Spouse', 'Son', 'Daughter', 'Child', 'Sibling', 'Nephew', 'Niece',
  'Trustee', 'Executor', 'Estate representative', 'Other relative',
];

function displayName(contact) {
  return contact?.ownerName || contact?.ownerEntity || contact?.facilityName || 'Unnamed contact';
}

export default function EstateTransitionPanel({
  contact,
  allContacts = [],
  onUpdateContact,
  onLinkInheritor,
  onCreateInheritor,
  compact = false,
}) {
  const [search, setSearch] = useState('');
  const [relationship, setRelationship] = useState(contact.inheritorRelationship ?? '');
  const [newRelativeName, setNewRelativeName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setRelationship(contact.inheritorRelationship ?? '');
    setMessage('');
  }, [contact.id, contact.inheritorRelationship]);

  const linkedInheritor = allContacts.find(c => c.id === contact.inheritedByContactId) ?? null;
  const candidates = (() => {
    const query = search.trim().toLowerCase();
    return allContacts
      .filter(c => c.id !== contact.id && !c.isDeceased)
      .filter(c => !query || [c.ownerName, c.ownerEntity, c.facilityName, c.phone, c.email]
        .some(value => (value ?? '').toLowerCase().includes(query)))
      .sort((a, b) => {
        const aSameGroup = contact.ownershipGroupId && a.ownershipGroupId === contact.ownershipGroupId ? 0 : 1;
        const bSameGroup = contact.ownershipGroupId && b.ownershipGroupId === contact.ownershipGroupId ? 0 : 1;
        return aSameGroup - bSameGroup || displayName(a).localeCompare(displayName(b));
      })
      .slice(0, 6);
  })();

  async function setDeceased(next) {
    setBusy(true);
    setMessage('');
    const result = await onUpdateContact?.(contact.id, {
      isDeceased: next,
      ...(!next ? { deceasedDate: null, inheritedByContactId: null, inheritorRelationship: '' } : {}),
    });
    setBusy(false);
    if (result?.error) setMessage(result.error);
    else setMessage(next ? 'Marked deceased. The record remains available in Call Mode.' : 'Deceased mark removed.');
  }

  async function saveDate(value) {
    setBusy(true);
    setMessage('');
    const result = await onUpdateContact?.(contact.id, { deceasedDate: value || null });
    setBusy(false);
    if (result?.error) setMessage(result.error);
  }

  async function link(contactId) {
    setBusy(true);
    setMessage('');
    const result = await onLinkInheritor?.(contact.id, contactId, relationship.trim());
    setBusy(false);
    setMessage(result?.error || result?.message || 'Inheriting relative linked to this owner and property group.');
    if (!result?.error) setSearch('');
  }

  async function unlink() {
    setBusy(true);
    setMessage('');
    const result = await onUpdateContact?.(contact.id, { inheritedByContactId: null, inheritorRelationship: '' });
    setBusy(false);
    if (result?.error) setMessage(result.error);
    else {
      setRelationship('');
      setMessage('Inheritance link removed. The contact records were kept.');
    }
  }

  async function createAndLink() {
    if (!newRelativeName.trim()) return;
    setBusy(true);
    setMessage('');
    const result = await onCreateInheritor?.(contact.id, {
      ownerName: newRelativeName.trim(),
      relationship: relationship.trim(),
    });
    setBusy(false);
    setMessage(result?.error || result?.message || 'Relative created and linked.');
    if (!result?.error) {
      setNewRelativeName('');
      setSearch('');
    }
  }

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${contact.isDeceased
      ? 'border-red-500/35 bg-red-500/5'
      : 'border-slate-700 bg-slate-800/50'} ${compact ? 'mt-3' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-300">Estate / Inheritance</p>
          <p className="text-xs text-slate-500 mt-0.5">Keep the original owner history and connect who inherited the property.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
          <input type="checkbox" checked={Boolean(contact.isDeceased)} disabled={busy}
            onChange={e => setDeceased(e.target.checked)} className="h-4 w-4 accent-red-500" />
          Deceased
        </label>
      </div>

      {contact.isDeceased && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date of death (optional)</label>
              <input type="date" value={contact.deceasedDate ?? ''} disabled={busy}
                onChange={e => saveDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Relationship to owner</label>
              <input type="text" list={`estate-relationships-${contact.id}`} value={relationship}
                onChange={e => setRelationship(e.target.value)} placeholder="Son, spouse, trustee..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
              <datalist id={`estate-relationships-${contact.id}`}>
                {RELATIONSHIP_SUGGESTIONS.map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
          </div>

          {linkedInheritor ? (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 uppercase font-semibold">Inherited by</p>
                <p className="text-sm font-bold text-white truncate">
                  {displayName(linkedInheritor)}{contact.inheritorRelationship ? ` (${contact.inheritorRelationship})` : ''}
                </p>
                <p className="text-xs text-slate-500 truncate">{linkedInheritor.phone || linkedInheritor.email || 'Contact record linked'}</p>
              </div>
              <button type="button" onClick={unlink} disabled={busy}
                className="text-xs font-semibold text-slate-500 hover:text-red-400 disabled:opacity-50">Remove link</button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase">Find an existing relative/contact</label>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, company, phone, or email"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
              {(search.trim() || contact.ownershipGroupId) && candidates.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {candidates.map(candidate => (
                    <button type="button" key={candidate.id} disabled={busy} onClick={() => link(candidate.id)}
                      className="text-left bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/40 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                      <span className="block text-xs font-bold text-white truncate">{displayName(candidate)}</span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {candidate.ownershipGroupId === contact.ownershipGroupId
                          ? 'Already in this property group'
                          : (candidate.phone || candidate.email || candidate.facilityName || 'Contact record')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input type="text" value={newRelativeName} onChange={e => setNewRelativeName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createAndLink(); }}
                  placeholder="Or type a new relative's name"
                  className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
                <button type="button" onClick={createAndLink} disabled={busy || !newRelativeName.trim()}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  Create + Link
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {message && <p className={`text-xs ${message.toLowerCase().includes('run sql/') || message.toLowerCase().includes('could not') ? 'text-red-400' : 'text-slate-400'}`}>{message}</p>}
    </div>
  );
}
