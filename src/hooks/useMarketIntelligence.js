import { useState, useEffect, useCallback, useRef } from 'react';

// Reads ONLY the cached dashboard endpoint. Never calls Treasury/FRED/GDELT/
// Anthropic directly, never triggers ingestion. One request on mount, abortable,
// with a manual refresh that re-reads the same cached endpoint (no external work).
export function useMarketIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market-intelligence?mode=dashboard', { signal: controller.signal });
      let json = null;
      try { json = await res.json(); } catch { throw new Error('Intelligence service temporarily unavailable'); }
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Could not load market intelligence.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Toggle a per-item flag (save/read/hide) through the narrow server route,
  // with an optimistic local update.
  const setFlag = useCallback(async (id, flags) => {
    setData(prev => prev ? {
      ...prev,
      topStories: (prev.topStories ?? []).map(s => s.id === id ? { ...s, ...mapFlags(flags) } : s),
      savedStories: recomputeSaved(prev.topStories ?? [], id, flags),
    } : prev);
    try {
      await fetch('/api/market-intelligence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'flag', id, ...flags }),
      });
    } catch { /* optimistic; a reload reconciles */ }
  }, []);

  return {
    data,
    loading,
    error,
    reload: load,
    setFlag,
    configured: data ? data.configured !== false : true,
    migrationNeeded: !!data?.migrationNeeded,
  };
}

function mapFlags(flags) {
  const out = {};
  if (flags.is_saved !== undefined) out.isSaved = flags.is_saved;
  if (flags.is_read !== undefined) out.isRead = flags.is_read;
  return out;
}
function recomputeSaved(stories, id, flags) {
  if (flags.is_saved === undefined) return stories.filter(s => s.isSaved);
  const updated = stories.map(s => s.id === id ? { ...s, isSaved: flags.is_saved } : s);
  return updated.filter(s => s.isSaved);
}
