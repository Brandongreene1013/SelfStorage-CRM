import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const PROGRESS_FIELDS = [
  { key: 'calls',               label: 'Total Calls Made',          shortLabel: 'Calls',        accent: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    },
  { key: 'voicemails',          label: 'Total Voicemails Left',     shortLabel: 'Voicemails',   accent: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30'     },
  { key: 'conversations',       label: 'Total Conversations',       shortLabel: 'Conversations', accent: 'text-green-400',  bg: 'bg-green-500/10',   border: 'border-green-500/30'   },
  { key: 'additionsToDatabase', label: 'Total Additions to Database', shortLabel: 'DB Adds',    accent: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'bovProposals',        label: 'Total BOV Proposals',       shortLabel: 'BOV Proposals', accent: 'text-purple-400', bg: 'bg-purple-500/10',  border: 'border-purple-500/30'  },
  { key: 'ownersIdentified',    label: 'Owners Identified',         shortLabel: 'Identified',    accent: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30'    },
  { key: 'uniqueOwnersWorked',  label: 'Unique Owners Worked',      shortLabel: 'Owners Worked', accent: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   },
  { key: 'totalOwnerActions',   label: 'Total Owner Actions',       shortLabel: 'Actions',       accent: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30'  },
];

const DEFAULT_COUNTERS = {
  calls: 0,
  voicemails: 0,
  conversations: 0,
  additionsToDatabase: 0,
  bovProposals: 0,
  ownersIdentified: 0,
  uniqueOwnersWorked: 0,
  totalOwnerActions: 0,
};

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dbToProgress(row) {
  return {
    date: row.date,
    calls: row.calls ?? 0,
    voicemails: row.voicemails ?? 0,
    conversations: row.conversations ?? 0,
    additionsToDatabase: row.additions_to_database ?? row.facilities ?? 0,
    bovProposals: row.bov_proposals ?? row.bovs ?? 0,
    ownersIdentified: row.owners_identified ?? 0,
    uniqueOwnersWorked: row.unique_owners_worked ?? 0,
    totalOwnerActions: row.total_owner_actions ?? 0,
  };
}

export function useDailyProgress() {
  const todayStr = getTodayStr();
  const [today, setToday] = useState({ date: todayStr, ...DEFAULT_COUNTERS });
  const [log, setLog] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  function isMissingScorecardColumn(error) {
    if (!error) return false;
    const msg = error.message ?? '';
    return error.code === '42703'
      || error.code === 'PGRST204'
      || /voicemails|additions_to_database|bov_proposals|owners_identified|unique_owners_worked|total_owner_actions/i.test(msg);
  }

  const loadAll = useCallback(async () => {
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
  }, [todayStr]);

  useEffect(() => {
    // Initial Supabase sync; state updates happen after the async fetch resolves.
    loadAll();
  }, [loadAll]);

  // Upsert today's row whenever it changes (debounced via useEffect)
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      const payload = {
        date: today.date,
        calls: today.calls,
        voicemails: today.voicemails,
        conversations: today.conversations,
        additions_to_database: today.additionsToDatabase,
        bov_proposals: today.bovProposals,
        owners_identified: today.ownersIdentified,
        unique_owners_worked: today.uniqueOwnersWorked,
        total_owner_actions: today.totalOwnerActions,
        // Keep legacy columns populated for older backup/restore exports and
        // any reports that still read the original daily_progress shape.
        facilities: today.additionsToDatabase,
        bovs: today.bovProposals,
      };
      const { error } = await supabase.from('daily_progress').upsert(payload, { onConflict: 'date' });
      if (isMissingScorecardColumn(error)) {
        setMigrationNeeded(true);
        await supabase.from('daily_progress').upsert({
          date: today.date,
          calls: today.calls,
          conversations: today.conversations,
          facilities: today.additionsToDatabase,
          bovs: today.bovProposals,
        }, { onConflict: 'date' });
        return;
      }
      setMigrationNeeded(false);
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

  // Set a counter directly to a typed value
  const setValue = useCallback((field, value) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setToday(prev => ({ ...prev, [field]: n }));
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

  function sumCurrentWeek() {
    const result = { ...DEFAULT_COUNTERS };
    const now = new Date();
    const day = now.getDay();
    const daysSinceMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysSinceMonday);
    for (let i = 0; i <= daysSinceMonday; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
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
    setValue,
    getWeek:        sumCurrentWeek,
    getMonth:       () => sumRange(30),
    getYear:        () => sumRange(365),
    getSpecificMonth,
    migrationNeeded,
  };
}
