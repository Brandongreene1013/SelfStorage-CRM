import { createClient } from '@supabase/supabase-js';

export const BRANDON_EMAIL = 'bgreene@ripcofl.com';

export const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp',
);

export function easternDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isWeekdayEastern(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date);
  return day !== 'Sat' && day !== 'Sun';
}

export function easternHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(date));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dateFromEntry(entry) {
  return (entry.date || entry.at || entry.createdAt || '').slice(0, 10);
}

function recordName(record) {
  return record.owner_name || record.name || record.facility_name || record.email || 'Unknown owner';
}

function recordKey(table, id) {
  return `${table}:${id}`;
}

function includesAny(text, patterns) {
  const haystack = String(text || '').toLowerCase();
  return patterns.some(pattern => pattern.test(haystack));
}

const IMPORTANT_PATTERNS = [
  /reply|responded|interested|conversation|spoke|call me|meeting|appointment|tour|bov|valuation|proposal|tractiq|report|bounce|undeliver|failed|wrong email|multiple properties|portfolio|owns/i,
];

function classifyAction(entry = {}) {
  const type = String(entry.type || '').toLowerCase();
  const note = `${entry.note || ''} ${entry.summary || ''}`;
  if (type === 'email') return 'email';
  if (type === 'call') return 'call';
  if (type === 'bov') return 'bov';
  if (includesAny(note, [/voicemail|left vm|left message/i])) return 'voicemail';
  if (includesAny(note, [/conversation|spoke|talked|call with/i])) return 'conversation';
  if (includesAny(note, [/bov|valuation|proposal/i])) return 'bov';
  if (includesAny(note, [/tractiq|report/i])) return 'report';
  return type || 'activity';
}

function countRecordActivity({ table, record, activityDate, evidence, workedOwners, actions }) {
  const key = recordKey(table, record.id);
  let ownerWorked = false;
  const name = recordName(record);

  asArray(record.call_history).forEach(call => {
    if ((call.date || '').slice(0, 10) !== activityDate) return;
    ownerWorked = true;
    actions.push({ key, table, id: record.id, name, type: call.outcome || 'call', source: 'call_history' });
    evidence.push({
      type: call.outcome || 'call',
      source: 'call_history',
      table,
      id: record.id,
      name,
      note: call.notes || '',
    });
  });

  asArray(record.action_log).forEach(entry => {
    if (dateFromEntry(entry) !== activityDate) return;
    const actionType = classifyAction(entry);
    ownerWorked = true;
    actions.push({ key, table, id: record.id, name, type: actionType, source: 'action_log' });
    evidence.push({
      type: actionType,
      source: entry.source || 'action_log',
      table,
      id: record.id,
      name,
      note: entry.note || '',
      email: entry.email || null,
      needsReview: !!entry.needsReview,
    });
  });

  if (ownerWorked) workedOwners.add(key);
}

function importantFromEvidence(evidence, emailEvents) {
  const items = [];
  evidence.forEach(item => {
    if (item.needsReview || includesAny(item.note, IMPORTANT_PATTERNS)) {
      items.push({
        label: item.name,
        type: item.type,
        reason: item.needsReview ? 'Needs CRM review' : 'Important activity signal',
        note: item.note,
      });
    }
  });
  emailEvents.forEach(event => {
    if (event.important || asArray(event.importance_reasons).length > 0) {
      items.push({
        label: event.counterparty_name || event.counterparty_email,
        type: event.direction === 'received' ? 'reply' : 'email',
        reason: asArray(event.importance_reasons).join(', ') || 'Important email',
        note: event.summary || event.subject || '',
      });
    }
  });
  return items.slice(0, 12);
}

function slippedFromEmailEvents(emailEvents) {
  return emailEvents
    .filter(event => !event.matched_id || event.needs_review)
    .map(event => ({
      email: event.counterparty_email,
      name: event.counterparty_name || '',
      subject: event.subject || '',
      summary: event.summary || event.body_preview || '',
      reason: event.matched_id ? 'Low-confidence CRM match' : 'No CRM match found',
      direction: event.direction,
    }))
    .slice(0, 12);
}

export async function analyzeDailyActivity(activityDate = easternDateString()) {
  const [{ data: contacts, error: contactsError }, { data: clients, error: clientsError }, { data: emailEvents, error: emailError }] = await Promise.all([
    supabase.from('contacts').select('id, list_id, owner_name, facility_name, email, created_at, updated_at, call_history, action_log'),
    supabase.from('clients').select('id, name, facility_name, email, created_at, updated_at, action_log'),
    supabase.from('daily_email_events').select('*').eq('activity_date', activityDate),
  ]);

  const firstError = contactsError || clientsError || emailError;
  if (firstError) throw new Error(firstError.message);

  const evidence = [];
  const workedOwners = new Set();
  const identifiedOwners = new Set();
  const actions = [];

  const masterListId = await getMasterListId();
  const contactsById = new Map((contacts ?? []).map(contact => [contact.id, contact]));
  const clientsById = new Map((clients ?? []).map(client => [client.id, client]));

  (contacts ?? []).forEach(contact => {
    const ownerNamed = !!String(contact.owner_name || '').trim();
    const touchedToday = String(contact.created_at || '').slice(0, 10) === activityDate
      || String(contact.updated_at || '').slice(0, 10) === activityDate;
    if (ownerNamed && touchedToday) identifiedOwners.add(recordKey('contacts', contact.id));
    countRecordActivity({ table: 'contacts', record: contact, activityDate, evidence, workedOwners, actions });
  });

  (clients ?? []).forEach(client => {
    if (String(client.created_at || '').slice(0, 10) === activityDate || String(client.updated_at || '').slice(0, 10) === activityDate) {
      identifiedOwners.add(recordKey('clients', client.id));
    }
    countRecordActivity({ table: 'clients', record: client, activityDate, evidence, workedOwners, actions });
  });

  (emailEvents ?? []).forEach(event => {
    const table = event.matched_table;
    const id = event.matched_id;
    const key = table && id ? recordKey(table, id) : `email:${event.counterparty_email}`;
    const matchedRecord = table === 'contacts' ? contactsById.get(id) : table === 'clients' ? clientsById.get(id) : null;
    const name = matchedRecord ? recordName(matchedRecord) : (event.counterparty_name || event.counterparty_email);

    actions.push({ key, table, id, name, type: event.direction === 'received' ? 'reply' : 'email', source: 'email_event' });
    if (table && id) workedOwners.add(key);
    if (event.counterparty_name || matchedRecord) identifiedOwners.add(key);
    evidence.push({
      type: event.direction === 'received' ? 'reply' : 'email',
      source: 'email_event',
      table,
      id,
      name,
      note: event.summary || event.subject || '',
      email: event.counterparty_email,
      needsReview: event.needs_review,
    });
  });

  const masterAdds = (contacts ?? []).filter(contact =>
    masterListId && contact.list_id === masterListId && String(contact.created_at || '').slice(0, 10) === activityDate
  ).length;

  const counts = {
    ownersIdentified: identifiedOwners.size,
    uniqueOwnersWorked: workedOwners.size,
    totalOwnerActions: actions.length,
    conversations: actions.filter(a => a.type === 'conversation' || a.type === 'appointment' || a.type === 'reply').length,
    additionsToDatabase: masterAdds,
    bovProposals: actions.filter(a => a.type === 'bov' || a.type === 'report').length,
    calls: actions.filter(a => a.type === 'call' || a.type === 'no_answer' || a.type === 'callback').length,
    voicemails: actions.filter(a => a.type === 'voicemail').length,
  };

  return {
    activityDate,
    generatedAt: new Date().toISOString(),
    counts,
    importantItems: importantFromEvidence(evidence, emailEvents ?? []),
    slippedItems: slippedFromEmailEvents(emailEvents ?? []),
    evidence: evidence.slice(0, 200),
  };
}

async function getMasterListId() {
  const { data } = await supabase
    .from('lists')
    .select('id, name')
    .ilike('name', '%master%')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function upsertReview(analysis, status = 'draft', emailStatus = null) {
  const row = {
    activity_date: analysis.activityDate,
    status,
    generated_at: analysis.generatedAt,
    summary: analysis.counts,
    important_items: analysis.importantItems,
    slipped_items: analysis.slippedItems,
    evidence: analysis.evidence,
    email_status: emailStatus,
  };
  if (status === 'review_sent') row.review_sent_at = new Date().toISOString();
  const { error } = await supabase.from('daily_activity_reviews').upsert(row, { onConflict: 'activity_date' });
  if (error) throw new Error(error.message);
  return row;
}

export async function finalizeDailyActivity(activityDate, counts, status = 'auto_logged') {
  const { data: existing, error: existingError } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', activityDate)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const merged = {
    date: activityDate,
    calls: Math.max(existing?.calls ?? 0, counts.calls ?? 0),
    voicemails: Math.max(existing?.voicemails ?? 0, counts.voicemails ?? 0),
    conversations: Math.max(existing?.conversations ?? 0, counts.conversations ?? 0),
    additions_to_database: Math.max(existing?.additions_to_database ?? existing?.facilities ?? 0, counts.additionsToDatabase ?? 0),
    bov_proposals: Math.max(existing?.bov_proposals ?? existing?.bovs ?? 0, counts.bovProposals ?? 0),
    owners_identified: Math.max(existing?.owners_identified ?? 0, counts.ownersIdentified ?? 0),
    unique_owners_worked: Math.max(existing?.unique_owners_worked ?? 0, counts.uniqueOwnersWorked ?? 0),
    total_owner_actions: Math.max(existing?.total_owner_actions ?? 0, counts.totalOwnerActions ?? 0),
  };
  merged.facilities = merged.additions_to_database;
  merged.bovs = merged.bov_proposals;

  const { error } = await supabase.from('daily_progress').upsert(merged, { onConflict: 'date' });
  if (error) throw new Error(error.message);

  const { error: reviewError } = await supabase
    .from('daily_activity_reviews')
    .update({
      status,
      finalized_at: new Date().toISOString(),
      approved_counts: counts,
    })
    .eq('activity_date', activityDate);
  if (reviewError) throw new Error(reviewError.message);

  return merged;
}

export function renderActivityEmail(analysis, mode = 'review') {
  const title = mode === 'final'
    ? `Daily activity auto-logged for ${analysis.activityDate}`
    : `Daily activity review for ${analysis.activityDate}`;
  const c = analysis.counts;
  const lines = [
    title,
    '',
    `Owners identified: ${c.ownersIdentified}`,
    `Unique owners worked: ${c.uniqueOwnersWorked}`,
    `Total owner actions: ${c.totalOwnerActions}`,
    `Calls: ${c.calls}`,
    `Voicemails: ${c.voicemails}`,
    `Conversations: ${c.conversations}`,
    `Database additions: ${c.additionsToDatabase}`,
    `BOV proposals / reports: ${c.bovProposals}`,
  ];

  if (analysis.importantItems.length) {
    lines.push('', 'Important items:');
    analysis.importantItems.slice(0, 6).forEach(item => {
      lines.push(`- ${item.label}: ${item.reason}${item.note ? ` — ${item.note}` : ''}`);
    });
  }

  if (analysis.slippedItems.length) {
    lines.push('', 'Possible slipped-through-the-cracks items:');
    analysis.slippedItems.slice(0, 6).forEach(item => {
      lines.push(`- ${item.email}${item.name ? ` (${item.name})` : ''}: ${item.reason}${item.subject ? ` — ${item.subject}` : ''}`);
    });
  }

  if (mode === 'review') {
    lines.push('', 'Review this in the CRM before 8 PM ET, or the suggested counts will auto-log.');
  }

  return { subject: title, text: lines.join('\n') };
}

export async function sendActivityEmail(analysis, mode = 'review') {
  const email = renderActivityEmail(analysis, mode);
  const webhook = process.env.ACTIVITY_EMAIL_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: true, reason: 'ACTIVITY_EMAIL_WEBHOOK_URL not configured', ...email };

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: process.env.ACTIVITY_REVIEW_EMAIL || BRANDON_EMAIL,
      mode,
      ...email,
      analysis,
    }),
  });
  if (!response.ok) return { ok: false, skipped: false, status: response.status, ...email };
  return { ok: true, skipped: false, ...email };
}
