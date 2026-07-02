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

export function legacyActionDefaults(actionType, actionDate, actionNote) {
  const legacy = ACTION_TYPE_MAP[actionType];
  return {
    title: actionNote || legacy?.label || '',
    taskType: ACTION_TO_TASK_TYPE[actionType] || 'follow_up',
    dueDate: actionDate || undefined,
    description: actionNote || '',
  };
}
