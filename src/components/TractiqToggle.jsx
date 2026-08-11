// Small toggle badge — click to mark whether a TractIQ report has been sent.
export default function TractiqToggle({ sent, onToggle, compact = false }) {
  return (
    <button
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onToggle(!sent); }}
      title={sent ? 'TractIQ report sent — click to unmark' : 'Mark TractIQ report as sent'}
      className={`inline-flex items-center gap-1 font-black rounded-md border transition-all ${
        compact ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
      } ${
        sent
          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
          : 'bg-transparent border-dashed border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-500'
      }`}
    >
      📊 {sent ? 'TractIQ Sent' : (compact ? 'TractIQ' : 'TractIQ?')}
    </button>
  );
}
