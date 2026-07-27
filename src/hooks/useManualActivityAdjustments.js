import { useCallback, useEffect, useMemo, useState } from 'react';
import { easternToday } from '../lib/activityAnalytics';

export const MANUAL_ACTIVITY_KEYS = [
  'calls',
  'ownersIdentified',
  'voicemails',
  'conversations',
  'emails',
];

const EMPTY_ADJUSTMENT = Object.freeze(
  Object.fromEntries(MANUAL_ACTIVITY_KEYS.map(key => [key, 0])),
);

function sanitizeAdjustment(value = {}) {
  return Object.fromEntries(MANUAL_ACTIVITY_KEYS.map(key => [
    key,
    Math.max(0, Math.floor(Number(value[key]) || 0)),
  ]));
}

export function useManualActivityAdjustments() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/daily-activity?mode=manual-adjustments');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load manual activity.');
      setRows(data.adjustments ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = easternToday();
  const todayAdjustment = useMemo(
    () => rows.find(row => row.activityDate === today) ?? { activityDate: today, ...EMPTY_ADJUSTMENT },
    [rows, today],
  );

  const saveToday = useCallback(async values => {
    const adjustment = sanitizeAdjustment(values);
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/daily-activity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'save-manual-adjustments',
          activityDate: today,
          adjustments: adjustment,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save manual activity.');
    } catch (saveError) {
      setSaving(false);
      setError(saveError.message);
      return { error: saveError.message };
    }

    setSaving(false);
    setRows(previous => [
      ...previous.filter(row => row.activityDate !== today),
      { activityDate: today, ...adjustment },
    ].sort((a, b) => a.activityDate.localeCompare(b.activityDate)));
    return { ok: true };
  }, [today]);

  return {
    adjustments: rows,
    today: todayAdjustment,
    loaded,
    saving,
    error,
    saveToday,
  };
}
