import { continuumDaysInStage, isContinuumStalled } from './brokerageContinuum.js';

const MEANINGFUL_ACTIVITY_TYPES = new Set([
  'call',
  'conversation',
  'appointment',
  'meeting',
  'voicemail',
  'email',
  'text',
  'callback',
  'tractiq_report_sent',
  'bov_offered',
  'bov',
  'bov_sent',
  'financials_requested',
  'financials_received',
  'listing_agreement_sent',
  'listing_agreement_executed',
  'marketing_update',
  'offer_received',
  'contract_update',
  'closing_update',
  'follow_up',
]);

function dateValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function activityOccurredAt(entry = {}) {
  return entry.at || entry.date || entry.createdAt || entry.created_at || null;
}

export function isMeaningfulOwnerActivity(entry = {}) {
  if (entry.meaningfulContact === true) return true;
  if (entry.meaningfulContact === false || entry.analytics === false) return false;
  return MEANINGFUL_ACTIVITY_TYPES.has(String(entry.type || '').toLowerCase());
}

export function lastMeaningfulContactAt(contact = {}) {
  const actionDates = (contact.actionLog ?? [])
    .filter(isMeaningfulOwnerActivity)
    .map(activityOccurredAt);
  const callDates = (contact.callHistory ?? [])
    .map(activityOccurredAt);
  const candidates = [
    contact.lastMeaningfulContactAt,
    contact.lastCalled,
    ...actionDates,
    ...callDates,
  ].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => dateValue(b) - dateValue(a))[0];
}

export function daysSince(value, now = new Date()) {
  const timestamp = dateValue(value);
  if (!timestamp) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86400000));
}

export function coreClientAttention(profile, contact, tasks = [], today = new Date().toISOString().slice(0, 10)) {
  const now = new Date(`${today}T12:00:00Z`);
  const lastContactAt = profile?.lastMeaningfulContactAt || lastMeaningfulContactAt(contact);
  const daysSinceContact = daysSince(lastContactAt, now);
  const cadence = Number(profile?.followUpFrequencyDays) || null;
  const openTasks = tasks.filter(task => task.status === 'open'
    && task.relatedType === 'contact'
    && task.relatedId === profile?.contactId);
  const nextTask = [...openTasks]
    .filter(task => task.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  const dueDate = nextTask?.dueDate || profile?.nextActionDueDate || '';
  const overdue = Boolean(dueDate && dueDate < today);
  const dueToday = dueDate === today;
  const cadenceOverdue = Boolean(cadence && daysSinceContact !== null && daysSinceContact > cadence);
  const continuumDays = continuumDaysInStage(profile?.brokerageContinuumStageEnteredAt, now);
  const continuumStalled = isContinuumStalled(profile, tasks, today);
  return {
    lastContactAt,
    daysSinceContact,
    cadence,
    nextTask,
    dueDate,
    overdue,
    dueToday,
    cadenceOverdue,
    continuumDaysInStage: continuumDays,
    continuumStalled,
    noNextAction: !nextTask && !profile?.nextAction,
    neglected: overdue || cadenceOverdue || continuumStalled || (!lastContactAt && !nextTask),
  };
}

export function latestPipelineActivityAt(client = {}) {
  const actionDates = (client.actionLog ?? []).map(activityOccurredAt);
  const candidates = [client.updatedAt, client.createdAt, ...actionDates].filter(Boolean);
  return candidates.sort((a, b) => dateValue(b) - dateValue(a))[0] ?? null;
}

export function pipelineStageEnteredAt(client = {}) {
  const latestStageEvent = [...(client.actionLog ?? [])]
    .filter(entry => entry.type === 'pipeline_stage_changed' && Number(entry.newStageId) === Number(client.stageId))
    .sort((a, b) => dateValue(activityOccurredAt(b)) - dateValue(activityOccurredAt(a)))[0];
  return client.stageEnteredAt || activityOccurredAt(latestStageEvent) || client.updatedAt || client.createdAt || null;
}

export function pipelineAttention(client, tasks = [], today = new Date().toISOString().slice(0, 10)) {
  const now = new Date(`${today}T12:00:00Z`);
  const openTasks = tasks.filter(task => task.status === 'open'
    && task.relatedType === 'client'
    && task.relatedId === client.id);
  const nextTask = [...openTasks]
    .filter(task => task.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  const dueDate = nextTask?.dueDate || client.nextActionDate || '';
  const stageEnteredAt = pipelineStageEnteredAt(client);
  const lastActivityAt = latestPipelineActivityAt(client);
  const daysInStage = daysSince(stageEnteredAt, now);
  const daysInactive = daysSince(lastActivityAt, now);
  return {
    nextTask,
    dueDate,
    overdue: Boolean(dueDate && dueDate < today),
    noNextAction: !nextTask && !client.nextActionType,
    stageEnteredAt,
    lastActivityAt,
    daysInStage,
    daysInactive,
    stale: Number(client.stageId) < 10 && daysInactive !== null && daysInactive >= 30,
  };
}
