import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useMeetings() {
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    loadMeetings();
  }, []);

  async function loadMeetings() {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .order('date', { ascending: true });
    if (!error && data) {
      setMeetings(data.map(dbToMeeting));
    }
  }

  function dbToMeeting(row) {
    return {
      id: row.id,
      title: row.title,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      clientId: row.client_id,
      location: row.location,
      notes: row.notes,
    };
  }

  function meetingToDb(data) {
    return {
      title: data.title,
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      client_id: data.clientId ?? null,
      location: data.location,
      notes: data.notes,
    };
  }

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
