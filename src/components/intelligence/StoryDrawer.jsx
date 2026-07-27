import { useEffect } from 'react';

// Story detail drawer. Plain text only; the ONLY link is the original source
// (opened in a new tab). Escape closes; focus-trap-lite via the backdrop.
export default function StoryDrawer({ story, onClose, onToggleSave }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!story) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-md animate-backdrop-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Story detail"
        className="w-full max-w-md h-full bg-slate-900 border-l border-slate-700/80 ring-1 ring-inset ring-white/[0.04] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)] overflow-y-auto overscroll-contain animate-modal-in">
        <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{story.source}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onToggleSave?.(story)} title={story.isSaved ? 'Unsave' : 'Save'}
              className={`text-base leading-none ${story.isSaved ? 'text-amber-400' : 'text-slate-500 hover:text-slate-200'}`}>
              {story.isSaved ? '★' : '☆'}
            </button>
            <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-base font-bold text-white leading-snug">{story.title}</h2>

          {story.summary && <Field label="Summary" text={story.summary} />}
          {story.whyItMatters && <Field label="Why it matters" text={story.whyItMatters} accent />}
          {story.brokerTakeaway && <Field label="Broker takeaway" text={story.brokerTakeaway} accent />}

          {(story.tags?.length > 0 || story.entities?.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {(story.entities ?? []).slice(0, 8).map((e, i) => (
                <span key={`e${i}`} className="text-[10px] font-semibold text-slate-300 bg-slate-800/70 ring-1 ring-inset ring-white/10 rounded px-1.5 py-0.5">{e}</span>
              ))}
              {(story.tags ?? []).slice(0, 8).map((t, i) => (
                <span key={`t${i}`} className="text-[10px] text-slate-500 bg-slate-800/40 rounded px-1.5 py-0.5">#{t}</span>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <Meta label="Impact" value={story.impact} />
            <Meta label="Confidence" value={story.confidence} />
            <Meta label="Relevance" value={story.relevanceScore != null ? `${story.relevanceScore}/100` : '—'} />
            <Meta label="Importance" value={story.importanceScore != null ? `${story.importanceScore}/100` : '—'} />
          </dl>

          {story.url && (
            <a href={story.url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold rounded-lg px-3 py-2 text-xs transition-colors">
              Read original at {story.sourceDomain || 'source'} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, text, accent }) {
  return (
    <div className={accent ? 'rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2' : ''}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${accent ? 'text-amber-300/80' : 'text-slate-500'}`}>{label}</p>
      <p className="text-xs text-slate-200 leading-snug">{text}</p>
    </div>
  );
}
function Meta({ label, value }) {
  return (
    <div className="bg-slate-950/50 rounded px-2 py-1.5">
      <dt className="text-[9px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="text-slate-200 font-semibold capitalize">{value ?? '—'}</dd>
    </div>
  );
}
