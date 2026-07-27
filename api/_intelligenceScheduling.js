// ─────────────────────────────────────────────────────────────────────────────
// Storage Hunters — Market Intelligence: scheduling decisions (PURE, Eastern).
//
// An hourly cron hits the endpoint; the endpoint decides — in America/New_York —
// which tasks are actually due. All logic here is pure and time-injectable so
// daylight-saving and weekend behavior is testable without waiting for a clock.
// ─────────────────────────────────────────────────────────────────────────────

export function easternParts(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit',
    minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')), minute: Number(get('minute')) };
}

export function isWeekendET(now = new Date()) {
  const { weekday } = easternParts(now);
  return weekday === 'Sat' || weekday === 'Sun';
}

// Which ingestion tasks are due at this Eastern hour. Returns a de-duplicated
// list drawn from: markets, news, fed, brief. Designed so an hourly sweep does
// each the right number of times; the run_key bucket makes each idempotent.
export function dueTasks(now = new Date()) {
  const { hour, minute } = easternParts(now);
  const weekend = isWeekendET(now);
  const tasks = new Set();

  // The broker's daily talking-point batch: one coordinated rates + news +
  // active-market pull and synthesis at 6:30 AM Eastern. The 20-minute lower
  // bound tolerates normal GitHub scheduler delay without letting a 6:00 sweep
  // generate the brief before the intended window.
  if (hour === 6 && minute >= 20) {
    tasks.add('markets');
    tasks.add('news');
    tasks.add('fed');
    tasks.add('brief');
  }

  // Rates/markets: weekday pre-open (~8) and after close (~17).
  if (!weekend && (hour === 8 || hour === 17)) tasks.add('markets');

  // News discovery: during waking hours; 08:00 included so the 09:00 brief has
  // fresh items. Reduced on weekends.
  const newsHours = weekend ? [10, 16] : [7, 8, 10, 13, 16, 19];
  if (newsHours.includes(hour)) tasks.add('news');

  // Federal Reserve feeds: weekdays, a few times.
  if (!weekend && [8, 12, 16].includes(hour)) tasks.add('fed');

  // A later safety synthesis remains available to an hourly scheduler.
  if (!weekend && hour === 9) tasks.add('brief');

  return [...tasks];
}

// Map a POST mode to the concrete tasks it runs. Explicit modes bypass the
// schedule; the `scheduled` mode defers to dueTasks().
export function tasksForMode(mode, now = new Date()) {
  switch (mode) {
    case 'refresh':         return ['markets', 'news', 'fed'];
    case 'refresh-markets': return ['markets'];
    case 'refresh-news':    return ['news', 'fed'];
    case 'generate-brief':  return ['brief'];
    case 'daily-brief':     return ['markets', 'news', 'fed', 'brief'];
    case 'scheduled':       return dueTasks(now);
    default:                return [];
  }
}

export const REFRESH_MODES = new Set(['refresh', 'refresh-markets', 'refresh-news', 'generate-brief', 'daily-brief', 'scheduled', 'status']);
