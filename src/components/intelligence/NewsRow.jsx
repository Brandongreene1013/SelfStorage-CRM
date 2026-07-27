// One story row — dense, plain text only (never renders untrusted HTML).
const CAT_LABEL = {
  self_storage: 'Storage', cre: 'CRE', rates: 'Rates', private_credit: 'Credit',
  private_equity: 'PE', macro: 'Macro',
};
const CAT_TONE = {
  self_storage: 'text-amber-300 ring-amber-400/25 bg-amber-500/10',
  cre: 'text-blue-300 ring-blue-400/25 bg-blue-500/10',
  rates: 'text-purple-300 ring-purple-400/25 bg-purple-500/10',
  private_credit: 'text-emerald-300 ring-emerald-400/25 bg-emerald-500/10',
  private_equity: 'text-sky-300 ring-sky-400/25 bg-sky-500/10',
  macro: 'text-slate-300 ring-slate-400/20 bg-slate-500/10',
};

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return '';
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function NewsRow({ story, onOpen, onToggleSave }) {
  const tier = (story.importanceScore ?? 0) >= 70 ? 'high' : (story.importanceScore ?? 0) >= 45 ? 'med' : 'low';
  return (
    <div
      className={`group flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer ${story.isRead ? 'opacity-60' : ''}`}
      onClick={() => onOpen?.(story)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(story); } }}
    >
      <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ring-1 ring-inset ${CAT_TONE[story.category] ?? CAT_TONE.macro}`}>
        {CAT_LABEL[story.category] ?? '—'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-slate-100 leading-snug line-clamp-2">{story.title}</span>
        {story.summary && <span className="block text-[11px] text-slate-500 leading-snug line-clamp-1 mt-0.5">{story.summary}</span>}
        <span className="flex items-center gap-2 mt-1 text-[10px] text-slate-600">
          <span className="truncate max-w-[140px]">{story.source}</span>
          <span className="tabular-nums">{timeAgo(story.publishedAt)}</span>
          <span className={`tabular-nums ${tier === 'high' ? 'text-amber-400' : 'text-slate-600'}`}>
            {tier === 'high' ? '● priority' : ''}
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onToggleSave?.(story); }}
        title={story.isSaved ? 'Unsave' : 'Save'}
        className={`flex-shrink-0 mt-0.5 text-sm leading-none transition-colors ${story.isSaved ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100'}`}
      >
        {story.isSaved ? '★' : '☆'}
      </button>
    </div>
  );
}
