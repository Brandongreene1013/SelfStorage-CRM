import { useState } from 'react';

// Flagged email matches awaiting Brandon's confirm/reassign/dismiss.
// items: [{ host: {table,id,name,facility}, entry }]
// records: all clients+contacts normalized [{table,id,name,facility}]
export default function NeedsReview({ items = [], records = [], onConfirm, onReassign, onDismiss }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-amber-400 uppercase tracking-widest">⚠ Email Matches — Needs Review</h2>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      <div className="space-y-2.5 max-h-96 overflow-auto pr-1">
        {items.map((it, i) => (
          <ReviewRow key={(it.entry.messageId || '') + i} item={it} records={records}
            onConfirm={onConfirm} onReassign={onReassign} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ item, records, onConfirm, onReassign, onDismiss }) {
  const { host, entry } = item;
  const [reassigning, setReassigning] = useState(false);
  const [q, setQ] = useState('');

  const matches = q.trim()
    ? records.filter(r => `${host.table}:${host.id}` !== `${r.table}:${r.id}` &&
        ((r.name || '').toLowerCase().includes(q.toLowerCase()) || (r.facility || '').toLowerCase().includes(q.toLowerCase())))
        .slice(0, 6)
    : [];

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
      <p className="text-sm text-slate-200 truncate">{entry.note}</p>
      <p className="text-xs text-slate-500 mt-0.5 truncate">
        {entry.email && <span className="text-slate-400">{entry.email}</span>}
        {' matched to '}<span className="text-amber-400">{host.name || 'Unknown'}</span>
        {host.facility ? <span className="text-slate-600"> · {host.facility}</span> : null}
        {entry.confidence != null && <span className="text-slate-600"> · {Math.round(entry.confidence * 100)}%</span>}
      </p>

      {!reassigning ? (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onConfirm(item)}
            className="text-xs font-bold text-emerald-400 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-600/30 rounded-lg px-3 py-1 transition-all">
            ✓ Confirm
          </button>
          <button onClick={() => setReassigning(true)}
            className="text-xs font-bold text-slate-300 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 transition-all">
            ⤳ Reassign
          </button>
          <button onClick={() => onDismiss(item)}
            className="text-xs font-semibold text-slate-500 hover:text-red-400 ml-auto transition-all">
            Dismiss
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search the right contact / client…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          />
          <div className="mt-1 space-y-1 max-h-40 overflow-auto">
            {matches.map(r => (
              <button key={`${r.table}:${r.id}`} onClick={() => { onReassign(item, r); setReassigning(false); setQ(''); }}
                className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/50 transition-all">
                <span className="text-slate-200 font-semibold">{r.name || 'Unknown'}</span>
                {r.facility ? <span className="text-slate-500"> · {r.facility}</span> : null}
                <span className="text-slate-600"> · {r.table === 'clients' ? 'Client' : 'Contact'}</span>
              </button>
            ))}
            {q.trim() && matches.length === 0 && <p className="text-xs text-slate-600 px-1">No matches.</p>}
          </div>
          <button onClick={() => { setReassigning(false); setQ(''); }} className="text-xs text-slate-500 hover:text-white mt-1">Cancel</button>
        </div>
      )}
    </div>
  );
}
