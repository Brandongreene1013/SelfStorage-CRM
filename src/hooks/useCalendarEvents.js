import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';
import { normalizeMeetingText } from '../lib/textNormalize';

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Normalize a synced Outlook event into the same shape the meetings widgets use.
function toMeetingShape(row) {
  const d = new Date(row.start_at);
  const valid = !isNaN(d);
  return {
    id: `cal-${row.id}`,
    title: normalizeMeetingText(row.subject) || '(no subject)',
    date: valid ? localDate(d) : (row.start_at || '').slice(0, 10),
    startTime: valid ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
    endTime: row.end_at ? new Date(row.end_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
    clientId: row.client_id ?? null,
    location: normalizeMeetingText(row.location),
    source: 'outlook',
    outlookUrl: row.outlook_url ?? row.web_link ?? '',
  };
}

export function useCalendarEvents() {
  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    const { data, error } = await selectAllRows(() => supabase
      .from('calendar_event')
      .select('*')
      .order('start_at', { ascending: true })
      .order('id', { ascending: true }));
    if (!error && data) setEvents(data.map(toMeetingShape));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { calendarEvents: events, reloadCalendar: load };
}
