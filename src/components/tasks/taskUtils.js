import { ACTION_TYPES, TASK_TYPES } from '../../data/constants';

const ACTION_TO_TASK_TYPE = {
  call: 'call',
  email: 'email',
  research: 'follow_up',
  meeting: 'meeting',
  bov: 'bov',
};

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.value, t]));
export const ACTION_TYPE_MAP = Object.fromEntries(ACTION_TYPES.map(a => [a.value, a]));

export function getNextOpenTask(tasks = []) {
  return [...tasks]
    .filter(t => t.status === 'open')
    .sort((a, b) => {
      const dueA = a.dueDate || '9999-12-31';
      const dueB = b.dueDate || '9999-12-31';
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    })[0] ?? null;
}

export function dueMeta(dueDate) {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate < today) return { label: 'OVERDUE', tone: 'red' };
  if (dueDate === today) return { label: 'TODAY', tone: 'amber' };
  return { label: dueDate, tone: 'slate' };
}

// Task-based callback queue (Sprint 6, shared in Sprint 7): open `call` tasks
// on contacts, due today (`overdue: false`), past due (`overdue: true`), or
// future-dated (`upcoming: true`).
// Used by both Call Mode's queue builder (Database) and the Dashboard's
// callback counters so the two never disagree about who's "due". Rows are
// shallow contact copies carrying queueReason/queueTaskId/queueTaskTitle/
// queueDueDate so Call Mode can explain the queue and complete the
// originating task after an outcome.
export function buildCallbackTaskQueue(contacts, tasks = [], { overdue = false, upcoming = false, windowDays = null }) {
  const today = new Date().toISOString().slice(0, 10);
  // Sprint 17 — optional bounded upcoming window (Brandon's pick: 30 days for
  // the Dashboard "Upcoming" card + queue, so a callback parked 6 months out
  // doesn't inflate today's numbers). windowDays only applies to `upcoming`.
  let windowEnd = null;
  if (upcoming && windowDays) {
    const d = new Date();
    d.setDate(d.getDate() + windowDays);
    windowEnd = d.toISOString().slice(0, 10);
  }
  const relevant = tasks.filter(t =>
    t.status === 'open' && t.relatedType === 'contact' && t.taskType === 'call' && t.dueDate &&
    (upcoming
      ? t.dueDate > today && (!windowEnd || t.dueDate <= windowEnd)
      : overdue ? t.dueDate < today : t.dueDate === today)
  );
  // Dedupe: if a contact somehow has more than one open call task due in this
  // window, only surface the earliest-due one.
  const byContact = new Map();
  relevant.forEach(t => {
    const existing = byContact.get(t.relatedId);
    if (!existing || t.dueDate < existing.dueDate) byContact.set(t.relatedId, t);
  });
  const rows = [];
  byContact.forEach((task, contactId) => {
    const c = contacts.find(x => x.id === contactId);
    if (!c) return;
    rows.push({
      ...c,
      queueReason: overdue ? `Callback task overdue — was due ${task.dueDate}` : 'Callback task due today',
      queueTaskId: task.id,
      queueTaskTitle: task.title,
      queueDueDate: task.dueDate,
    });
  });
  if (upcoming) {
    rows.forEach(r => { r.queueReason = `Upcoming callback due ${r.queueDueDate}`; });
  }
  rows.sort((a, b) => a.queueDueDate.localeCompare(b.queueDueDate));
  return rows;
}

export function legacyActionDefaults(actionType, actionDate, actionNote) {
  const legacy = ACTION_TYPE_MAP[actionType];
  return {
    title: actionNote || legacy?.label || '',
    taskType: ACTION_TO_TASK_TYPE[actionType] || 'follow_up',
    dueDate: actionDate || undefined,
    description: actionNote || '',
  };
}
