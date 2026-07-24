// Shared presentation helpers for the activity log — used by both the Dashboard
// Daily Activity Log and the Call Mode "Today" panel so the icon/label/tone for
// each event type is defined in exactly one place.

export const EVENT_META = {
  no_answer:          { icon: '📵', label: 'No answer',           tone: 'text-slate-400' },
  voicemail:          { icon: '📩', label: 'Left voicemail',      tone: 'text-blue-300' },
  conversation:       { icon: '💬', label: 'Conversation',        tone: 'text-green-300' },
  appointment:        { icon: '📅', label: 'Appointment set',     tone: 'text-amber-300' },
  not_interested:     { icon: '🚫', label: 'Not interested',      tone: 'text-red-300' },
  callback:           { icon: '🔄', label: 'Callback scheduled',  tone: 'text-purple-300' },
  call:               { icon: '📞', label: 'Call',                tone: 'text-slate-400' },
  email:              { icon: '📧', label: 'Email',               tone: 'text-blue-300' },
  tractiq_report_sent:{ icon: '📈', label: 'TractIQ report sent', tone: 'text-emerald-300' },
  meeting:            { icon: '📅', label: 'Meeting set',         tone: 'text-amber-300' },
  bov:                { icon: '📊', label: 'BOV',                 tone: 'text-emerald-300' },
  research:           { icon: '🔍', label: 'Research',            tone: 'text-slate-400' },
  request_financials: { icon: '📄', label: 'Requested financials',tone: 'text-slate-300' },
  follow_up:          { icon: '🔁', label: 'Follow-up',           tone: 'text-slate-300' },
  contract:           { icon: '📝', label: 'Contract',            tone: 'text-emerald-300' },
  owner_identified:   { icon: '⭐', label: 'Owner identified',    tone: 'text-amber-300' },
};

export function eventMeta(type) {
  return EVENT_META[type] ?? { icon: '•', label: type, tone: 'text-slate-400' };
}

export function shiftDay(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eventTimeLabel(occurredAt) {
  if (!occurredAt) return '';
  const d = new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  }).format(d);
}
