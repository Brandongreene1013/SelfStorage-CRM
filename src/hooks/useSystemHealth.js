import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeProbeStatus, SYSTEM_HEALTH_PROBES } from '../lib/systemHealth';

export function useSystemHealth(enabled) {
  const [loading, setLoading] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [probes, setProbes] = useState([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(SYSTEM_HEALTH_PROBES.map(async probe => {
      const { error } = await supabase.from(probe.table).select('*').limit(1);
      return {
        ...probe,
        status: normalizeProbeStatus(probe, error),
        message: error?.message ?? '',
      };
    }));
    setProbes(results);
    setLastCheckedAt(new Date().toISOString());
    setLoading(false);
    return results;
  }, []);

  useEffect(() => {
    if (enabled && probes.length === 0) refresh();
  }, [enabled, probes.length, refresh]);

  return { loading, lastCheckedAt, probes, refresh };
}
