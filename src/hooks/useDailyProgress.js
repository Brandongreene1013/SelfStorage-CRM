import { useState, useEffect, useCallback } from 'react';

const TODAY_KEY = 'crm_progress_today';
const LOG_KEY = 'crm_progress_log';

export const PROGRESS_FIELDS = [
  { key: 'calls',        label: 'Calls Logged',       accent: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
  { key: 'facilities',   label: 'Facilities Reached',  accent: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30'   },
  { key: 'conversations',label: 'Conversations',        accent: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30'  },
  { key: 'firstAppts',   label: '1st Appts Set',       accent: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30'  },
  { key: 'bovs',         label: 'BOVs Set',             accent: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
];

const DEFAULT_COUNTERS = { calls: 0, facilities: 0, conversations: 0, firstAppts: 0, bovs: 0 };

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

function loadToday() {
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (!raw) return { date: getTodayStr(), ...DEFAULT_COUNTERS };
    return JSON.parse(raw);
  } catch { return { date: getTodayStr(), ...DEFAULT_COUNTERS }; }
}

function archiveAndReset(prev, log) {
  const { date, ...counters } = prev;
  // Only archive if there's any data worth saving
  const hasData = Object.values(counters).some(v => v > 0);
  if (date && hasData) {
    const newLog = { ...log, [date]: counters };
    saveLog(newLog);
    return newLog;
  }
  return log;
}

export function useDailyProgress() {
  const [log, setLog] = useState(() => loadLog());

  const [today, setToday] = useState(() => {
    const data = loadToday();
    const todayStr = getTodayStr();
    if (data.date !== todayStr) {
      const currentLog = loadLog();
      const newLog = archiveAndReset(data, currentLog);
      saveLog(newLog);
      return { date: todayStr, ...DEFAULT_COUNTERS };
    }
    return data;
  });

  // Persist today on every change
  useEffect(() => {
    localStorage.setItem(TODAY_KEY, JSON.stringify(today));
  }, [today]);

  // Check for midnight rollover every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const todayStr = getTodayStr();
      setToday(prev => {
        if (prev.date !== todayStr) {
          setLog(prevLog => {
            const newLog = archiveAndReset(prev, prevLog);
            return newLog;
          });
          return { date: todayStr, ...DEFAULT_COUNTERS };
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
    const todayStr = getTodayStr();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const src = ds === todayStr ? today : log[ds];
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
    getWeek:  () => sumRange(7),
    getMonth: () => sumRange(30),
    getYear:  () => sumRange(365),
  };
}
