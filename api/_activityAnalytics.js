const TIME_ZONE = 'America/New_York';

export const ACTIVITY_METRIC_KEYS = [
  'calls',
  'voicemails',
  'conversations',
  'emails',
  'tractiqReportsSent',
  'meetingsSet',
  'ownersIdentified',
  'ownersWorked',
  'actions',
];

export const EMPTY_ACTIVITY_METRICS = Object.freeze(
  Object.fromEntries(ACTIVITY_METRIC_KEYS.map(key => [key, 0])),
);

const CALL_TYPES = new Set([
  'no_answer',
  'voicemail',
  'conversation',
  'appointment',
  'not_interested',
  'callback',
  'call',
]);

const ACTION_TYPES = new Set([
  ...CALL_TYPES,
  'email',
  'tractiq_report_sent',
  'meeting',
  'bov',
  'research',
  'request_financials',
  'follow_up',
  'contract',
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function value(record, appKey, dbKey) {
  return record?.[appKey] ?? record?.[dbKey];
}

function normalizedText(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function hasMeaningfulOwnerName(name) {
  const normalized = normalizedText(name);
  return normalized.length >= 2 && !new Set([
    'unknown',
    'unknown owner',
    'owner unknown',
    'n/a',
    'na',
    'tbd',
    'none',
  ]).has(normalized);
}

export function easternDateString(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function easternToday() {
  return easternDateString(new Date());
}

export function createActivityEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function withOwnerIdentificationMilestone(existing, fields, occurredAt = new Date().toISOString()) {
  if (
    fields?.ownerName === undefined
    || !existing
    || hasMeaningfulOwnerName(existing.ownerName)
    || !hasMeaningfulOwnerName(fields.ownerName)
    || existing.ownerIdentifiedAt
  ) return fields;
  return { ...fields, ownerIdentifiedAt: occurredAt };
}

function entryReportingDate(entry) {
  const explicit = String(entry?.date ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  return easternDateString(entry?.at || entry?.createdAt || entry?.created_at);
}

function stableEntryKey(entry, source, relatedId, index) {
  const explicit = entry?.eventId || entry?.event_id || entry?.messageId || entry?.message_id;
  if (explicit) return `event:${explicit}`;
  return [
    source,
    relatedId || 'unrelated',
    normalizedText(entry?.type || entry?.outcome || 'activity'),
    entry?.at || entry?.date || '',
    normalizedText(entry?.note || entry?.notes || ''),
    index,
  ].join(':');
}

function ownerKeyFor(record, relatedType) {
  const ownershipGroupId = value(record, 'ownershipGroupId', 'ownership_group_id');
  if (ownershipGroupId) return `ownership:${ownershipGroupId}`;
  const contactId = value(record, 'contactId', 'contact_id');
  if (contactId) return `contact:${contactId}`;
  return record?.id ? `${relatedType}:${record.id}` : null;
}

function recordLabel(record, relatedType) {
  if (relatedType === 'contact') {
    return value(record, 'ownerName', 'owner_name')
      || value(record, 'facilityName', 'facility_name')
      || 'Unknown owner';
  }
  return record?.name || value(record, 'facilityName', 'facility_name') || 'Unknown client';
}

function eventMetrics(type) {
  const metrics = {};
  if (CALL_TYPES.has(type)) {
    metrics.calls = 1;
    metrics.actions = 1;
  }
  if (type === 'voicemail') metrics.voicemails = 1;
  if (type === 'conversation' || type === 'appointment') metrics.conversations = 1;
  if (type === 'appointment' || type === 'meeting') metrics.meetingsSet = 1;
  if (type === 'email') {
    metrics.emails = 1;
    metrics.actions = 1;
  }
  if (type === 'tractiq_report_sent') {
    metrics.tractiqReportsSent = 1;
    metrics.emails = 1;
    metrics.actions = 1;
  }
  if (ACTION_TYPES.has(type) && metrics.actions === undefined) metrics.actions = 1;
  return metrics;
}

function actionEvent({ entry, record, relatedType, index, source = 'action_log' }) {
  const type = String(entry?.type || 'activity').toLowerCase();
  if (entry?.analytics === false || !ACTION_TYPES.has(type)) return null;
  const reportingDate = entryReportingDate(entry);
  if (!reportingDate) return null;
  return {
    key: stableEntryKey(entry, source, record?.id, index),
    type,
    reportingDate,
    occurredAt: entry?.at || `${reportingDate}T12:00:00`,
    relatedType,
    relatedId: record?.id ?? null,
    ownerKey: ownerKeyFor(record, relatedType),
    label: recordLabel(record, relatedType),
    detail: entry?.note || '',
    source,
    metrics: eventMetrics(type),
  };
}

function legacyCallEvents(contact) {
  const actions = array(value(contact, 'actionLog', 'action_log'));
  const actionSignatures = new Set(actions.map(entry => [
    String(entry?.type || '').toLowerCase(),
    entryReportingDate(entry),
    normalizedText(entry?.note),
  ].join('|')));

  return array(value(contact, 'callHistory', 'call_history')).flatMap((call, index) => {
    const type = String(call?.outcome || 'call').toLowerCase();
    const reportingDate = String(call?.date || '').slice(0, 10);
    const signature = [type, reportingDate, normalizedText(call?.notes)].join('|');
    if (!reportingDate || actionSignatures.has(signature)) return [];
    return [{
      key: stableEntryKey(call, 'legacy_call_history', contact.id, index),
      type,
      reportingDate,
      occurredAt: `${reportingDate}T12:00:00`,
      relatedType: 'contact',
      relatedId: contact.id,
      ownerKey: ownerKeyFor(contact, 'contact'),
      label: recordLabel(contact, 'contact'),
      detail: call?.notes || '',
      source: 'legacy_call_history',
      metrics: eventMetrics(type),
    }];
  });
}

function taskCompletionEvent(task, relatedRecords) {
  if (task?.status !== 'completed' || !task?.completedAt) return null;
  const taskType = String(task.taskType || '').toLowerCase();
  let type = null;
  if (taskType === 'tractiq_report') type = 'tractiq_report_sent';
  else if (taskType === 'email') type = 'email';
  else if (['send_report', 'request_financials', 'bov', 'follow_up', 'contract'].includes(taskType)) type = taskType;
  if (!type) return null;

  const relatedRecord = task.relatedType === 'contact'
    ? relatedRecords.contacts.get(task.relatedId)
    : task.relatedType === 'client'
      ? relatedRecords.clients.get(task.relatedId)
      : null;
  const reportingDate = easternDateString(task.completedAt);
  if (!reportingDate) return null;
  return {
    key: `task-completed:${task.id}`,
    type,
    reportingDate,
    occurredAt: task.completedAt,
    relatedType: task.relatedType || 'general',
    relatedId: task.relatedId || null,
    ownerKey: relatedRecord ? ownerKeyFor(relatedRecord, task.relatedType) : null,
    label: relatedRecord ? recordLabel(relatedRecord, task.relatedType) : (task.relatedName || task.title),
    detail: task.title || '',
    source: 'task_completion',
    sourceRecordId: task.id,
    metrics: eventMetrics(type),
  };
}

function meetingEvent(meeting, clients) {
  const createdAt = meeting?.createdAt || meeting?.created_at;
  if (!createdAt) return null;
  const reportingDate = easternDateString(createdAt);
  if (!reportingDate) return null;
  const clientId = meeting?.clientId || meeting?.client_id;
  const client = clients.get(clientId);
  return {
    key: `meeting:${meeting.id}`,
    type: 'meeting',
    reportingDate,
    occurredAt: createdAt,
    relatedType: client ? 'client' : 'meeting',
    relatedId: client?.id || meeting.id,
    ownerKey: client ? ownerKeyFor(client, 'client') : null,
    label: client ? recordLabel(client, 'client') : (meeting.title || 'Meeting'),
    detail: meeting.title || '',
    source: 'meeting',
    sourceRecordId: meeting.id,
    metrics: eventMetrics('meeting'),
  };
}

function identifiedEvent(contact) {
  const occurredAt = value(contact, 'ownerIdentifiedAt', 'owner_identified_at');
  if (!occurredAt) return null;
  const reportingDate = easternDateString(occurredAt);
  if (!reportingDate || !hasMeaningfulOwnerName(value(contact, 'ownerName', 'owner_name'))) return null;
  return {
    key: `owner-identified:contact:${contact.id}`,
    type: 'owner_identified',
    reportingDate,
    occurredAt,
    relatedType: 'contact',
    relatedId: contact.id,
    ownerKey: ownerKeyFor(contact, 'contact'),
    label: recordLabel(contact, 'contact'),
    detail: 'Owner identified',
    source: 'contact_milestone',
    metrics: { ownersIdentified: 1 },
  };
}

function emailActivityEvent(email, relatedRecords) {
  if (String(email?.direction || '').toLowerCase() !== 'sent') return null;
  const relatedType = email.matched_table === 'contacts'
    ? 'contact'
    : email.matched_table === 'clients'
      ? 'client'
      : 'email';
  const record = relatedType === 'contact'
    ? relatedRecords.contacts.get(email.matched_id)
    : relatedType === 'client'
      ? relatedRecords.clients.get(email.matched_id)
      : null;
  const reportingDate = String(email.activity_date || '').slice(0, 10)
    || easternDateString(email.sent_at || email.created_at);
  if (!reportingDate) return null;
  return {
    key: stableEntryKey(email, 'email_event', email.matched_id, 0),
    type: 'email',
    reportingDate,
    occurredAt: email.sent_at || email.created_at || `${reportingDate}T12:00:00`,
    relatedType,
    relatedId: record?.id || null,
    ownerKey: record ? ownerKeyFor(record, relatedType) : null,
    label: record ? recordLabel(record, relatedType) : (email.counterparty_name || email.counterparty_email || 'Unmatched email'),
    detail: email.summary || email.subject || '',
    source: 'email_event',
    metrics: eventMetrics('email'),
  };
}

export function deriveActivityEvents({
  contacts = [],
  clients = [],
  tasks = [],
  meetings = [],
  emailEvents = [],
} = {}) {
  const relatedRecords = {
    contacts: new Map(contacts.map(record => [record.id, record])),
    clients: new Map(clients.map(record => [record.id, record])),
  };
  const events = [];

  contacts.forEach(contact => {
    array(value(contact, 'actionLog', 'action_log')).forEach((entry, index) => {
      const event = actionEvent({ entry, record: contact, relatedType: 'contact', index });
      if (event) events.push(event);
    });
    events.push(...legacyCallEvents(contact));
    const identified = identifiedEvent(contact);
    if (identified) events.push(identified);
  });

  clients.forEach(client => {
    array(value(client, 'actionLog', 'action_log')).forEach((entry, index) => {
      const event = actionEvent({ entry, record: client, relatedType: 'client', index });
      if (event) events.push(event);
    });
  });

  tasks.forEach(task => {
    const event = taskCompletionEvent(task, relatedRecords);
    if (event) events.push(event);
  });

  meetings.forEach(meeting => {
    const event = meetingEvent(meeting, relatedRecords.clients);
    if (event) events.push(event);
  });

  emailEvents.forEach(email => {
    const event = emailActivityEvent(email, relatedRecords);
    if (event) events.push(event);
  });

  const unique = new Map();
  events.forEach(event => {
    if (!unique.has(event.key)) unique.set(event.key, event);
  });
  return [...unique.values()].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
}

function mondayFor(reportingDate) {
  const noonUtc = new Date(`${reportingDate}T12:00:00Z`);
  const daysSinceMonday = (noonUtc.getUTCDay() + 6) % 7;
  noonUtc.setUTCDate(noonUtc.getUTCDate() - daysSinceMonday);
  return noonUtc.toISOString().slice(0, 10);
}

function dateRange(start, end) {
  const dates = new Set();
  const cursor = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  while (cursor <= endDate) {
    dates.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function shiftDateString(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function aggregateActivityMetrics(events, reportingDates) {
  const metrics = { ...EMPTY_ACTIVITY_METRICS };
  const dates = reportingDates instanceof Set ? reportingDates : new Set(reportingDates);
  const selected = events.filter(event => dates.has(event.reportingDate));
  const appointmentBuckets = new Set(selected
    .filter(event => event.type === 'appointment' && event.ownerKey)
    .map(event => `${event.reportingDate}:${event.ownerKey}`));
  const worked = new Set();

  selected.forEach(event => {
    if (
      event.source === 'meeting'
      && event.ownerKey
      && appointmentBuckets.has(`${event.reportingDate}:${event.ownerKey}`)
    ) return;
    Object.entries(event.metrics || {}).forEach(([key, amount]) => {
      if (key !== 'ownersWorked') metrics[key] = (metrics[key] ?? 0) + amount;
    });
    if (event.ownerKey && event.type !== 'owner_identified') {
      worked.add(`${event.reportingDate}:${event.ownerKey}`);
    }
  });

  metrics.ownersWorked = worked.size;
  return metrics;
}

// Last `weeks` Monday-start weeks (oldest first, current partial week last),
// each aggregated with the same metric rules as the daily/weekly scorecards.
export function weeklyActivityTrend(events, { weeks = 8, reportingDate = easternToday() } = {}) {
  const currentWeekStart = mondayFor(reportingDate);
  const buckets = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const weekStart = shiftDateString(currentWeekStart, -7 * offset);
    const weekEnd = shiftDateString(weekStart, 6);
    buckets.push({
      weekStart,
      weekEnd,
      isCurrentWeek: offset === 0,
      metrics: aggregateActivityMetrics(events, dateRange(weekStart, weekEnd)),
    });
  }
  return buckets;
}

// Conversion funnel over a reporting-date window: prospecting volume down to
// pipeline entries (clients created in the window). Rates are stage-to-stage.
export function buildConversionFunnel(events, clients = [], { since = null, until = null } = {}) {
  const inRange = date => Boolean(date) && (!since || date >= since) && (!until || date <= until);
  const dates = new Set(events.map(event => event.reportingDate).filter(inRange));
  const metrics = aggregateActivityMetrics(events, dates);
  const pipelineEntries = clients.filter(client =>
    inRange(easternDateString(value(client, 'createdAt', 'created_at')))).length;

  const stages = [
    { key: 'calls', label: 'Calls', count: metrics.calls },
    { key: 'conversations', label: 'Conversations', count: metrics.conversations },
    { key: 'meetingsSet', label: 'Meetings Set', count: metrics.meetingsSet },
    { key: 'pipelineEntries', label: 'Pipeline Entries', count: pipelineEntries },
  ];
  return {
    since,
    until,
    stages: stages.map((stage, index) => ({
      ...stage,
      rateFromPrevious: index > 0 && stages[index - 1].count > 0
        ? stage.count / stages[index - 1].count
        : null,
    })),
  };
}

// Week-over-week digest: this week (Monday through reportingDate) vs the full
// prior Monday-Sunday week, plus the funnel and trend for the email/dashboard.
export function buildWeeklyDigest(input = {}, reportingDate = easternToday()) {
  const events = deriveActivityEvents(input);
  const weekStart = mondayFor(reportingDate);
  const previousWeekStart = shiftDateString(weekStart, -7);
  const previousWeekEnd = shiftDateString(weekStart, -1);
  const thisWeek = aggregateActivityMetrics(events, dateRange(weekStart, reportingDate));
  const lastWeek = aggregateActivityMetrics(events, dateRange(previousWeekStart, previousWeekEnd));
  const delta = Object.fromEntries(
    ACTIVITY_METRIC_KEYS.map(key => [key, thisWeek[key] - lastWeek[key]]),
  );
  return {
    reportingDate,
    weekStart,
    previousWeekStart,
    previousWeekEnd,
    thisWeek,
    lastWeek,
    delta,
    funnel: buildConversionFunnel(events, input.clients ?? [], { since: weekStart, until: reportingDate }),
    trend: weeklyActivityTrend(events, { weeks: 8, reportingDate }),
  };
}

export function buildActivityAnalytics(input = {}, reportingDate = easternToday()) {
  const events = deriveActivityEvents(input);
  const weekStart = mondayFor(reportingDate);
  const todayDates = new Set([reportingDate]);
  const weekDates = dateRange(weekStart, reportingDate);
  return {
    reportingDate,
    weekStart,
    events,
    today: aggregateActivityMetrics(events, todayDates),
    week: aggregateActivityMetrics(events, weekDates),
    todayEvents: events.filter(event => event.reportingDate === reportingDate),
    weekEvents: events.filter(event => weekDates.has(event.reportingDate)),
  };
}
