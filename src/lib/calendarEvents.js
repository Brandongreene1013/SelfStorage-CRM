import { easternDateString } from './activityAnalytics.js';

const TIME_ZONE = 'America/New_York';

function normalized(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function easternTimeString(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function meetingIdentity(meeting) {
  return [
    meeting.clientId || 'unlinked',
    meeting.date || '',
    normalized(meeting.startTime),
    normalized(meeting.title),
  ].join('|');
}

export function mergeDashboardMeetings(crmMeetings = [], calendarEvents = []) {
  const merged = new Map();
  const sourceIds = new Map();
  [...crmMeetings, ...calendarEvents].forEach(meeting => {
    const key = meetingIdentity(meeting);
    const sourceKey = meeting.sourceEventId ? `source:${meeting.sourceEventId}` : null;
    const existingKey = sourceKey && sourceIds.get(sourceKey);
    const resolvedKey = existingKey || key;
    const existing = merged.get(resolvedKey);
    if (!existing || (existing.source === 'outlook' && meeting.source !== 'outlook')) {
      merged.set(resolvedKey, meeting);
    }
    if (sourceKey) sourceIds.set(sourceKey, resolvedKey);
  });
  return [...merged.values()].sort((a, b) =>
    `${a.date || ''}|${a.startTime || ''}|${a.id || ''}`
      .localeCompare(`${b.date || ''}|${b.startTime || ''}|${b.id || ''}`));
}

export function calendarRowToMeeting(row) {
  return {
    id: `cal-${row.id}`,
    sourceEventId: row.event_id || row.id,
    title: row.subject || '(no subject)',
    date: easternDateString(row.start_at) || String(row.start_at || '').slice(0, 10),
    startTime: easternTimeString(row.start_at),
    endTime: easternTimeString(row.end_at),
    clientId: row.client_id ?? null,
    location: row.location || '',
    organizer: row.organizer || '',
    allDay: !!row.is_all_day,
    isOnline: !!row.is_online,
    source: 'outlook',
    outlookUrl: row.outlook_url ?? row.web_link ?? '',
  };
}
