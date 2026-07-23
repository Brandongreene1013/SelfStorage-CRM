import { createClient } from '@supabase/supabase-js';
import { buildActivityAnalytics } from './_activityAnalytics.js';

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

function activityEmailRecipients() {
  return String(process.env.ACTIVITY_REVIEW_EMAIL || BRANDON_EMAIL)
    .split(',')
    .map(email => email.trim())
    .filter(Boolean);
}

function includesAny(text, patterns) {
  const haystack = String(text || '').toLowerCase();
  return patterns.some(pattern => pattern.test(haystack));
}

const IMPORTANT_PATTERNS = [
  /reply|responded|interested|conversation|spoke|call me|meeting|appointment|tour|bov|valuation|proposal|tractiq|report|bounce|undeliver|failed|wrong email|multiple properties|portfolio|owns/i,
];

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
  const [
    { data: contacts, error: contactsError },
    { data: clients, error: clientsError },
    { data: tasks, error: tasksError },
    { data: meetings, error: meetingsError },
    { data: emailEvents, error: emailError },
  ] = await Promise.all([
    supabase.from('contacts').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('tasks').select('*'),
    supabase.from('meetings').select('*'),
    supabase.from('daily_email_events').select('*').eq('activity_date', activityDate),
  ]);

  const firstError = contactsError || clientsError || tasksError || meetingsError || emailError;
  if (firstError) throw new Error(firstError.message);

  const normalizedTasks = (tasks ?? []).map(task => ({
    ...task,
    taskType: task.task_type,
    completedAt: task.completed_at,
    relatedType: task.related_type,
    relatedId: task.related_id,
    relatedName: task.related_name,
  }));
  const analytics = buildActivityAnalytics({
    contacts: contacts ?? [],
    clients: clients ?? [],
    tasks: normalizedTasks,
    meetings: meetings ?? [],
    emailEvents: emailEvents ?? [],
  }, activityDate);
  const evidence = analytics.todayEvents.map(event => ({
    type: event.type,
    source: event.source,
    table: event.relatedType,
    id: event.relatedId,
    name: event.label,
    note: event.detail,
  }));

  return {
    activityDate,
    generatedAt: new Date().toISOString(),
    counts: analytics.today,
    importantItems: importantFromEvidence(evidence, emailEvents ?? []),
    slippedItems: slippedFromEmailEvents(emailEvents ?? []),
    evidence: evidence.slice(0, 200),
  };
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
  const { error: reviewError } = await supabase
    .from('daily_activity_reviews')
    .update({
      status,
      finalized_at: new Date().toISOString(),
      approved_counts: counts,
    })
    .eq('activity_date', activityDate);
  if (reviewError) throw new Error(reviewError.message);

  return { activityDate, counts, persistedTo: 'daily_activity_reviews' };
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
    `Owners worked: ${c.ownersWorked}`,
    `Actions: ${c.actions}`,
    `Calls: ${c.calls}`,
    `Voicemails: ${c.voicemails}`,
    `Conversations: ${c.conversations}`,
    `Emails: ${c.emails}`,
    `TractIQ reports sent: ${c.tractiqReportsSent}`,
    `Meetings set: ${c.meetingsSet}`,
  ];

  if (analysis.importantItems.length) {
    lines.push('', 'Important items:');
    analysis.importantItems.slice(0, 6).forEach(item => {
      lines.push(`- ${item.label}: ${item.reason}${item.note ? ` - ${item.note}` : ''}`);
    });
  }

  if (analysis.slippedItems.length) {
    lines.push('', 'Possible slipped-through-the-cracks items:');
    analysis.slippedItems.slice(0, 6).forEach(item => {
      lines.push(`- ${item.email}${item.name ? ` (${item.name})` : ''}: ${item.reason}${item.subject ? ` - ${item.subject}` : ''}`);
    });
  }

  if (mode === 'review') {
    lines.push('', 'Review this in the CRM before 8 PM ET, or the suggested counts will auto-log.');
  }

  return { subject: title, text: lines.join('\n') };
}

export async function sendActivityEmail(analysis, mode = 'review') {
  const email = renderActivityEmail(analysis, mode);
  const to = activityEmailRecipients();
  const resendKey = String(process.env.RESEND_API_KEY || process.env.ACTIVITY_RESEND_API_KEY || '').trim();
  const from = String(process.env.ACTIVITY_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || '').trim();

  if (resendKey) {
    if (!from) {
      return {
        ok: false,
        skipped: true,
        provider: 'resend',
        reason: 'ACTIVITY_EMAIL_FROM or RESEND_FROM_EMAIL not configured',
        to,
        ...email,
      };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: email.subject,
        text: email.text,
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        provider: 'resend',
        status: response.status,
        reason: body || response.statusText,
        to,
        ...email,
      };
    }
    return {
      ok: true,
      skipped: false,
      provider: 'resend',
      status: response.status,
      response: body ? JSON.parse(body) : null,
      to,
      ...email,
    };
  }

  const webhook = process.env.ACTIVITY_EMAIL_WEBHOOK_URL;
  if (!webhook) {
    return {
      ok: false,
      skipped: true,
      reason: 'Email is not configured. Set RESEND_API_KEY + ACTIVITY_EMAIL_FROM, or ACTIVITY_EMAIL_WEBHOOK_URL.',
      to,
      ...email,
    };
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: to.length === 1 ? to[0] : to,
      mode,
      ...email,
      analysis,
    }),
  });
  if (!response.ok) return { ok: false, skipped: false, provider: 'webhook', status: response.status, to, ...email };
  return { ok: true, skipped: false, provider: 'webhook', to, ...email };
}
