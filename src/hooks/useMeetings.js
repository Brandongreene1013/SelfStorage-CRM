import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeDisplayText, normalizeMeetingText } from '../lib/textNormalize';

export function useMeetings() {
  const [meetings, setMeetings] = useState([]);

  function dbToMeeting(row) {
    return {
      id: row.id,
      title: normalizeMeetingText(row.title) || 'Untitled meeting',
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      clientId: row.client_id,
      location: normalizeMeetingText(row.location),
      notes: normalizeDisplayText(row.notes),
    };
  }

  function meetingToDb(data) {
    return {
      title: normalizeMeetingText(data.title) || 'Untitled meeting',
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      client_id: data.clientId ?? null,
      location: normalizeMeetingText(data.location),
      notes: normalizeDisplayText(data.notes),
    };
  }

  const loadMeetings = useCallback(async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .order('date', { ascending: true });
    if (!error && data) {
      setMeetings(data.map(dbToMeeting));
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const addMeeting = useCallback(async (data) => {
    const { data: row, error } = await supabase
      .from('meetings')
      .insert([meetingToDb(data)])
      .select()
      .single();
    if (!error && row) {
      setMeetings(prev => [...prev, dbToMeeting(row)]);
    }
  }, []);

  const updateMeeting = useCallback(async (id, data) => {
    const { data: row, error } = await supabase
      .from('meetings')
      .update(meetingToDb(data))
      .eq('id', id)
      .select()
      .single();
    if (!error && row) {
      setMeetings(prev => prev.map(m => m.id === id ? dbToMeeting(row) : m));
    }
  }, []);

  const deleteMeeting = useCallback(async (id) => {
    const { error } = await supabase.from('meetings').delete().eq('id', id);
    if (!error) {
      setMeetings(prev => prev.filter(m => m.id !== id));
    }
  }, []);

  return { meetings, addMeeting, updateMeeting, deleteMeeting };
}
