import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAdvisoryBriefs() {
  const [briefs, setBriefs] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('advisory_briefs')
      .select('*')
      .order('brief_date', { ascending: false });
    if (!error && data) setBriefs(data);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { briefs, loaded, reload: load };
}
