import { useState, useRef } from 'react';
import FacilityCard from './FacilityCard';

const AI_EXAMPLES = [
  'Draft outreach email for self-storage owner in Tampa FL',
  'Quick underwrite: 300-unit facility, $8M ask, Charlotte NC',
  'What are cap rates for self-storage in Atlanta GA right now?',
];

export default function IntelligenceBar({ onAddToPipeline }) {
  const [tab, setTab] = useState('lookup'); // 'lookup' | 'ai'

  // Owner Lookup state
  const [address, setAddress] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [facilityCard, setFacilityCard] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const addressRef = useRef(null);

  // AI Assistant state
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  // ── Owner Lookup ────────────────────────────────────────────────────────────
  async function runLookup() {
    const addr = address.trim();
    if (!addr) return;
    setLookupLoading(true);
    setFacilityCard(null);
    setLookupError(null);
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Lookup failed');
      setFacilityCard(data);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupLoading(false);
    }
  }

  // ── AI Assistant ─────────────────────────────────────────────────────────────
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
      {/* Header + Tabs */}
      <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-4">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex-shrink-0">AI Intelligence</span>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5 ml-2">
          <button onClick={() => setTab('lookup')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${tab === 'lookup' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
            Owner Lookup
          </button>
          <button onClick={() => setTab('ai')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${tab === 'ai' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
            AI Assistant
          </button>
        </div>
      </div>

      {/* ── OWNER LOOKUP TAB ── */}
      {tab === 'lookup' && (
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              ref={addressRef}
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runLookup(); }}
              placeholder="Enter property address — e.g. 400 Commerce Dr, Tampa FL 33601"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <button
              onClick={runLookup}
              disabled={!address.trim() || lookupLoading}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                address.trim() && !lookupLoading
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              {lookupLoading ? '...' : 'Look Up'}
            </button>
          </div>

          {lookupLoading && (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-2">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>Identifying county → checking assessor → cross-referencing SOS...</span>
            </div>
          )}

          {lookupError && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {lookupError}
            </div>
          )}

          {facilityCard && (
            <FacilityCard
              card={facilityCard}
              onAddToPipeline={(data) => { onAddToPipeline?.(data); setFacilityCard(null); setAddress(''); }}
              onDismiss={() => { setFacilityCard(null); setAddress(''); }}
            />
          )}

          {!facilityCard && !lookupLoading && !lookupError && (
            <p className="text-xs text-slate-600 pb-1">
              Searches county property appraiser → if LLC owner found, cross-references Sunbiz (FL), Georgia SOS, or Texas SOS for registered agent.
            </p>
          )}
        </div>
      )}

      {/* ── AI ASSISTANT TAB ── */}
      {tab === 'ai' && (
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') run(); }}
              placeholder="Draft outreach email, quick underwrite, market intel..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <button onClick={() => run()} disabled={!query.trim() || loading}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                query.trim() && !loading ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}>
              {loading ? '...' : 'Run'}
            </button>
          </div>

          {!result && !loading && (
            <div className="flex flex-wrap gap-1.5">
              {AI_EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => { setQuery(ex); run(ex); }}
                  className="text-xs text-slate-500 hover:text-amber-400 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-full transition-all">
                  {ex}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-3 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          {result && !result.raw && (
            <div className="space-y-3">
              <div className="h-px bg-slate-800" />
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
              {result.contactPath && (
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase mb-1">How to Reach Them</p>
                  <p className="text-sm text-slate-200">{result.contactPath}</p>
                </div>
              )}
              {result.emailDraft && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 font-semibold uppercase">Outreach Email Draft</p>
                    <button onClick={() => { navigator.clipboard.writeText(result.emailDraft); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold">
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{result.emailDraft}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => { setResult(null); setQuery(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg transition-all">
                  Clear
                </button>
                {result.confidence && (
                  <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${
                    result.confidence === 'high' ? 'bg-green-900/40 text-green-400' :
                    result.confidence === 'medium' ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-700 text-slate-400'
                  }`}>{result.confidence} confidence</span>
                )}
              </div>
              {result.disclaimer && <p className="text-xs text-slate-600 italic">{result.disclaimer}</p>}
            </div>
          )}
          {result?.raw && <p className="text-sm text-slate-300 whitespace-pre-wrap">{result.raw}</p>}
        </div>
      )}
    </div>
  );
}
