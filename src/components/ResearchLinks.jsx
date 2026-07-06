import { useState } from 'react';
import { buildResearchLinks, buildResearchStrip, isEntityName } from '../lib/researchLinks';

// Sprint 12 — Owner Research Hub UI. Two densities of the same helper:
// OwnerResearchPanel for the Contact Detail modal (full set + research note
// capture) and ResearchStrip for Call Mode (six tight buttons, no clutter).

const LINK_STYLES = {
  googleOwner:   'bg-blue-600/15 border-blue-600/30 text-blue-300 hover:bg-blue-600/25',
  googleFacility:'bg-blue-600/15 border-blue-600/30 text-blue-300 hover:bg-blue-600/25',
  googleAddress: 'bg-blue-600/15 border-blue-600/30 text-blue-300 hover:bg-blue-600/25',
  maps:          'bg-green-600/15 border-green-600/30 text-green-300 hover:bg-green-600/25',
  whitepages:    'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700',
  linkedin:      'bg-sky-600/15 border-sky-600/30 text-sky-300 hover:bg-sky-600/25',
  county:        'bg-yellow-600/15 border-yellow-600/30 text-yellow-300 hover:bg-yellow-600/25',
  sos:           'bg-purple-600/15 border-purple-600/30 text-purple-300 hover:bg-purple-600/25',
  reonomy:       'bg-cyan-600/15 border-cyan-600/30 text-cyan-300 hover:bg-cyan-600/25',
  costar:        'bg-emerald-600/15 border-emerald-600/30 text-emerald-300 hover:bg-emerald-600/25',
  tractiq:       'bg-purple-600/15 border-purple-600/30 text-purple-300 hover:bg-purple-600/25',
};

function LinkButton({ link, compact = false }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={link.title}
      className={`border rounded-lg font-bold transition-all whitespace-nowrap text-center ${
        compact ? 'text-[11px] px-2 py-1.5' : 'text-xs px-3 py-2'
      } ${LINK_STYLES[link.key] ?? LINK_STYLES.whitepages} ${link.emphasized ? 'ring-1 ring-purple-400/50' : ''}`}
    >
      {link.label}
    </a>
  );
}

// Sprint 13 — one-click copy chips so Brandon can paste owner/facility/phone/
// address into Reonomy, CoStar, TractIQ, or a county site without retyping.
function copyFields(contact) {
  return [
    { key: 'owner', label: 'Owner', value: (contact.ownerName ?? '').trim() },
    { key: 'ownerEntity', label: 'Entity', value: (contact.ownerEntity ?? '').trim() },
    { key: 'facility', label: 'Facility', value: (contact.facilityName ?? '').trim() },
    { key: 'phone', label: 'Phone', value: (contact.phone ?? '').trim() },
    { key: 'address', label: 'Address', value: (contact.address ?? '').trim() },
  ].filter(f => f.value);
}

export function CopyChips({ contact, compact = false }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const fields = copyFields(contact);
  if (fields.length === 0) return null;

  async function copy(field) {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopiedKey(field.key);
      setTimeout(() => setCopiedKey(k => (k === field.key ? null : k)), 1500);
    } catch {
      setCopiedKey(null);
    }
  }

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {fields.map(f => (
        <button
          key={f.key}
          onClick={e => { e.stopPropagation(); copy(f); }}
          title={`Copy: ${f.value}`}
          className={`border rounded-md font-semibold transition-all ${compact ? 'text-[10px] px-1.5 py-1' : 'text-[11px] px-2 py-1'} ${
            copiedKey === f.key
              ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
          }`}
        >
          {copiedKey === f.key ? '✓ Copied' : `⧉ ${f.label}`}
        </button>
      ))}
    </div>
  );
}

// Full panel for Contact Detail. onAddNote(line) appends a research note to
// the contact's notes (handled by the parent so it plays nice with the
// modal's unsaved-notes state).
export function OwnerResearchPanel({ contact, onAddNote }) {
  const [noteDraft, setNoteDraft] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const links = buildResearchLinks(contact);
  if (links.length === 0) return null;
  const entity = isEntityName(contact.ownerEntity || contact.ownerName);

  function addNote() {
    const text = noteDraft.trim();
    if (!text) return;
    const stamp = new Date().toISOString().slice(0, 10);
    onAddNote?.(`[Research ${stamp}] ${text}`);
    setNoteDraft('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">🔎 Owner Research</p>
        {entity && (
          <span className="text-[11px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded px-2 py-0.5">
            Entity owner — check Secretary of State for the real principal
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map(link => <LinkButton key={link.key} link={link} />)}
      </div>
      <div className="mt-2.5">
        <CopyChips contact={contact} />
      </div>
      {onAddNote && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
            placeholder='What did you find? e.g. "LLC manager appears to be John Smith"'
            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={addNote}
            disabled={!noteDraft.trim()}
            className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              noteDraft.trim()
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
                : 'border-slate-700 text-slate-600 cursor-not-allowed'
            }`}
          >
            {savedFlash ? '✓ Added' : '+ Add Research Note'}
          </button>
        </div>
      )}
      <p className="text-xs text-slate-600 mt-2">Links open in a new tab — copy what you find back into the fields or a research note.</p>
    </div>
  );
}

// Compact strip for Call Mode: Maps · Whitepages · Google · LinkedIn · County ·
// SOS, plus a slim copy row underneath.
export function ResearchStrip({ contact }) {
  const links = buildResearchStrip(contact);
  if (links.length === 0) return <CopyChips contact={contact} compact />;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {links.map(link => <LinkButton key={link.key} link={link} compact />)}
      </div>
      <CopyChips contact={contact} compact />
    </div>
  );
}
