import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';
import { normalizeMeetingText } from '../lib/textNormalize';
import { calendarRowToMeeting } from '../lib/calendarEvents';

// Normalize a synced Outlook event into the same shape the meetings widgets use.
function toMeetingShape(row) {
  const meeting = calendarRowToMeeting(row);
  return {
    ...meeting,
    title: normalizeMeetingText(row.subject) || '(no subject)',
    location: normalizeMeetingText(row.location),
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
