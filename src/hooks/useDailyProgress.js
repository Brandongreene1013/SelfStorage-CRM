import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const PROGRESS_FIELDS = [
  { key: 'calls',         label: 'Calls Logged',        accent: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
  { key: 'facilities',    label: 'Facilities Reached',   accent: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30'   },
  { key: 'conversations', label: 'Conversations',         accent: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30'  },
  { key: 'firstAppts',    label: '1st Appts Set',        accent: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30'  },
  { key: 'bovs',          label: 'BOVs Set',              accent: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
];

const DEFAULT_COUNTERS = { calls: 0, facilities: 0, conversations: 0, firstAppts: 0, bovs: 0 };

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dbToProgress(row) {
  return {
    date: row.date,
    calls: row.calls ?? 0,
    facilities: row.facilities ?? 0,
    conversations: row.conversations ?? 0,
    firstAppts: row.first_appts ?? 0,
    bovs: row.bovs ?? 0,
  };
}

export function useDailyProgress() {
  const todayStr = getTodayStr();
  const [today, setToday] = useState({ date: todayStr, ...DEFAULT_COUNTERS });
  const [log, setLog] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const { data, error } = await supabase
      .from('daily_progress')
      .select('*');
    if (!error && data) {
      const logMap = {};
      let todayRow = null;
      data.forEach(row => {
        if (row.date === todayStr) {
          todayRow = dbToProgress(row);
        } else {
          logMap[row.date] = dbToProgress(row);
        }
      });
      setLog(logMap);
      if (todayRow) setToday(todayRow);
    }
    setLoaded(true);
  }

  // Upsert today's row whenever it changes (debounced via useEffect)
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      await supabase.from('daily_progress').upsert({
        date: today.date,
        calls: today.calls,
        facilities: today.facilities,
        conversations: today.conversations,
        first_appts: today.firstAppts,
        bovs: today.bovs,
      }, { onConflict: 'date' });
    }, 500);
    return () => clearTimeout(timer);
  }, [today, loaded]);

  // Midnight rollover check
  useEffect(() => {
    const interval = setInterval(() => {
      const currentDay = getTodayStr();
      setToday(prev => {
        if (prev.date !== currentDay) {
          return { date: currentDay, ...DEFAULT_COUNTERS };
        }
        return prev;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const increment = useCallback((field) => {
    setToday(prev => ({ ...prev, [field]: (prev[field] ?? 0) + 1 }));
  }, []);

  const decrement = useCallback((field) => {
    setToday(prev => ({ ...prev, [field]: Math.max(0, (prev[field] ?? 0) - 1) }));
  }, []);

  function sumRange(days) {
    const result = { ...DEFAULT_COUNTERS };
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const src = ds === today.date ? today : log[ds];
      if (src) {
        Object.keys(DEFAULT_COUNTERS).forEach(k => {
          result[k] += src[k] ?? 0;
        });
      }
    }
    return result;
  }

  // yearMonth = "2025-04"
  function getSpecificMonth(yearMonth) {
    const result = { ...DEFAULT_COUNTERS };
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${yearMonth}-${String(d).padStart(2, '0')}`;
      const src = ds === today.date ? today : log[ds];
      if (src) {
        Object.keys(DEFAULT_COUNTERS).forEach(k => {
          result[k] += src[k] ?? 0;
        });
      }
    }
    return result;
  }

  return {
    today,
    log,
    increment,
    decrement,
    getWeek:        () => sumRange(7),
    getMonth:       () => sumRange(30),
    getYear:        () => sumRange(365),
    getSpecificMonth,
  };
}
