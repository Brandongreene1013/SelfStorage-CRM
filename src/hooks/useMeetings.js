import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'crm_meetings';

export function useMeetings() {
  const [meetings, setMeetings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  }, [meetings]);

  function addMeeting(data) {
    setMeetings(prev => [...prev, { ...data, id: uuidv4() }]);
  }

  function updateMeeting(id, data) {
    setMeetings(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
  }

  function deleteMeeting(id) {
    setMeetings(prev => prev.filter(m => m.id !== id));
  }

  return { meetings, addMeeting, updateMeeting, deleteMeeting };
}
