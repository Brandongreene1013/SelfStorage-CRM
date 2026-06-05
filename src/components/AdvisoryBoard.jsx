import { useState } from 'react';
import { useAdvisoryBriefs } from '../hooks/useAdvisoryBriefs';

// ── Inline bold parsing ──
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={j} className="text-white font-bold">{p.slice(2, -2)}</strong>
      : <span key={j}>{p}</span>
  );
}

// ── Lightweight markdown renderer tuned to the brief format ──
function Markdown({ text }) {
  const lines = (text || '').split('\n');
  const out = [];
  let list = [];
  const flush = (k) => {
    if (list.length) { out.push(<ul key={`ul${k}`} className="list-disc pl-5 space-y-1 my-2">{list}</ul>); list = []; }
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (/^\s*---\s*$/.test(line)) { flush(i); out.push(<hr key={i} className="border-slate-800 my-3" />); return; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush(i);
      const lvl = h[1].length;
      const cls = lvl === 1
        ? 'text-lg font-black text-white mt-1 mb-1'
        : lvl === 2
          ? 'text-xs font-bold text-amber-400 uppercase tracking-widest mt-4 mb-1'
          : 'text-sm font-bold text-slate-200 mt-2';
      out.push(<p key={i} className={cls}>{inline(h[2])}</p>);
      return;
    }
    const b = line.match(/^\s*[-*]\s+(.*)$/);
    if (b) { list.push(<li key={i} className="text-sm text-slate-300 leading-snug">{inline(b[1])}</li>); return; }
    if (line.trim() === '') { flush(i); return; }
    flush(i);
    out.push(<p key={i} className="text-sm text-slate-300 my-1 leading-snug">{inline(line)}</p>);
  });
  flush('end');
  return <div>{out}</div>;
}

function fmtDate(d) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function PastBrief({ brief }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/60 transition-all text-left"
      >
        <span className="text-sm font-semibold text-slate-300">{fmtDate(brief.brief_date)}</span>
        <span className="text-slate-500 text-xs">{open ? '▲ hide' : '▼ read'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-800">
          <Markdown text={brief.content} />
        </div>
      )}
    </div>
  );
}

export default function AdvisoryBoard() {
  const { briefs, loaded } = useAdvisoryBriefs();
  const today = briefs[0];
  const past = briefs.slice(1);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-600 flex items-center justify-center text-lg shadow">
          🧠
        </div>
        <div>
          <h2 className="text-lg font-black text-white leading-tight">Advisory Board</h2>
          <p className="text-xs text-slate-500">Your C-suite's end-of-day debrief — pipeline, blind spots, and the honest pushback</p>
        </div>
      </div>

      {!loaded && <p className="text-sm text-slate-500">Loading briefs…</p>}

      {loaded && briefs.length === 0 && (
        <div className="text-center py-20 text-slate-600">
          <div className="text-5xl mb-4">🧠</div>
          <p className="text-base font-semibold text-slate-500 mb-2">No briefs yet</p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Your scheduled Advisory Board task will post each end-of-day brief here automatically.
            Once it runs, today's debrief shows up on top with your history below.
          </p>
        </div>
      )}

      {/* Today's brief — expanded */}
      {today && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-black text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full">LATEST</span>
            <span className="text-xs text-slate-500">{fmtDate(today.brief_date)}</span>
          </div>
          <Markdown text={today.content} />
        </div>
      )}

      {/* Past briefs */}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Past briefs</p>
          {past.map(b => <PastBrief key={b.id} brief={b} />)}
        </div>
      )}
    </div>
  );
}
