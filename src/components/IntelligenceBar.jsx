import { useState, useRef } from 'react';

const EXAMPLES = [
  'Find owner of 123 Main St, Charlotte NC',
  'Who owns the Extra Space Storage at 400 Commerce Dr, Atlanta GA?',
  'Draft outreach email for self-storage owner in Phoenix AZ',
  'Quick underwrite: 300-unit facility, $8M ask, Charlotte NC market',
];

export default function IntelligenceBar({ onAddToPipeline }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  async function run(q) {
    const text = (q ?? query).trim();
    if (!text) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyEmail() {
    if (!result?.emailDraft) return;
    navigator.clipboard.writeText(result.emailDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleAddToPipeline() {
    if (!result || !onAddToPipeline) return;
    onAddToPlugin({
      name: result.ownerName ?? 'Unknown Owner',
      facilityName: '',
      type: 'Seller',
      notes: [result.entity, result.marketNotes, result.nextAction].filter(Boolean).join('\n'),
    });
  }

  return (
    <div className="bg-slate-900 border border-amber-500/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">AI Intelligence</span>
        <span className="text-xs text-slate-600 ml-1">Property · Owner · Outreach</span>
      </div>

      {/* Input */}
      <div className="p-4 flex gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run(); }}
          placeholder="Find owner of 123 Main St, Charlotte NC — or ask anything..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
        />
        <button
          onClick={() => run()}
          disabled={!query.trim() || loading}
          className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            query.trim() && !loading
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          {loading ? '...' : 'Run'}
        </button>
      </div>

      {/* Example chips */}
      {!result && !loading && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => { setQuery(ex); run(ex); }}
              className="text-xs text-slate-500 hover:text-amber-400 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-full transition-all"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="px-5 pb-5 flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          Analyzing property intelligence...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mb-4 bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && !result.raw && (
        <div className="px-4 pb-4 space-y-3">
          <div className="h-px bg-slate-800" />

          {/* Owner + Entity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Owner</p>
              <p className="text-sm font-bold text-white">{result.ownerName ?? '—'}</p>
              {result.entity && <p className="text-xs text-slate-400 mt-0.5">{result.entity}</p>}
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Next Action</p>
              <p className="text-sm text-amber-400 font-semibold">{result.nextAction ?? '—'}</p>
            </div>
          </div>

          {/* Contact Path */}
          {result.contactPath && (
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">How to Reach Them</p>
              <p className="text-sm text-slate-200">{result.contactPath}</p>
            </div>
          )}

          {/* Market Notes */}
          {result.marketNotes && (
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Market Notes</p>
              <p className="text-sm text-slate-200">{result.marketNotes}</p>
            </div>
          )}

          {/* Email Draft */}
          {result.emailDraft && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 font-semibold uppercase">Outreach Email Draft</p>
                <button
                  onClick={copyEmail}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{result.emailDraft}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onAddToPlugin && onAddToPlugin({
                name: result.ownerName ?? 'Unknown Owner',
                type: 'Seller',
                notes: [result.entity, result.marketNotes, result.nextAction].filter(Boolean).join('\n'),
              })}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-3 py-1.5 rounded-lg transition-all"
            >
              + Add to Pipeline
            </button>
            <button
              onClick={() => { setResult(null); setQuery(''); inputRef.current?.focus(); }}
              className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg transition-all"
            >
              Clear
            </button>
            {result.confidence && (
              <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${
                result.confidence === 'high' ? 'bg-green-900/40 text-green-400' :
                result.confidence === 'medium' ? 'bg-amber-900/40 text-amber-400' :
                'bg-slate-700 text-slate-400'
              }`}>
                {result.confidence} confidence
              </span>
            )}
          </div>

          {result.disclaimer && (
            <p className="text-xs text-slate-600 italic">{result.disclaimer}</p>
          )}
        </div>
      )}

      {/* Raw fallback */}
      {result?.raw && (
        <div className="px-4 pb-4">
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{result.raw}</p>
        </div>
      )}
    </div>
  );
}
