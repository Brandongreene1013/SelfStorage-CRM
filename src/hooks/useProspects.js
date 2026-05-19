import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function dbToProspect(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    ownerName: row.owner_name ?? '',
    facilityName: row.facility_name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    notes: row.notes ?? '',
    interestLevel: row.interest_level ?? 'warm',
    nextActionType: row.next_action_type ?? '',
    nextActionDate: row.next_action_date ?? '',
    nextActionNote: row.next_action_note ?? '',
    completed: row.completed ?? false,
    dateAdded: row.date_added ?? '',
    createdAt: row.created_at,
  };
}

export function useProspects() {
  const [prospects, setProspects] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .eq('completed', false)
      .order('created_at', { ascending: false });
    if (!error && data) setProspects(data.map(dbToProspect));
  }

  const addProspect = useCallback(async (fields) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('prospects')
      .insert([{
        contact_id:       fields.contactId ?? null,
        owner_name:       fields.ownerName ?? '',
        facility_name:    fields.facilityName ?? '',
        phone:            fields.phone ?? '',
        email:            fields.email ?? '',
        address:          fields.address ?? '',
        notes:            fields.notes ?? '',
        interest_level:   fields.interestLevel ?? 'warm',
        next_action_type: fields.nextActionType ?? '',
        next_action_date: fields.nextActionDate ?? '',
        next_action_note: fields.nextActionNote ?? '',
        completed:        false,
        date_added:       today,
      }])
      .select()
      .single();
    if (error) {
      console.error('Failed to add prospect:', error.message, error);
      return null;
    }
    if (data) {
      const p = dbToProspect(data);
      setProspects(prev => [p, ...prev]);
      return p;
    }
  }, []);

  const updateProspect = useCallback(async (id, fields) => {
    const db = {};
    if (fields.ownerName       !== undefined) db.owner_name       = fields.ownerName;
    if (fields.facilityName    !== undefined) db.facility_name    = fields.facilityName;
    if (fields.phone           !== undefined) db.phone            = fields.phone;
    if (fields.email           !== undefined) db.email            = fields.email;
    if (fields.address         !== undefined) db.address          = fields.address;
    if (fields.notes           !== undefined) db.notes            = fields.notes;
    if (fields.interestLevel   !== undefined) db.interest_level   = fields.interestLevel;
    if (fields.nextActionType  !== undefined) db.next_action_type = fields.nextActionType;
    if (fields.nextActionDate  !== undefined) db.next_action_date = fields.nextActionDate;
    if (fields.nextActionNote  !== undefined) db.next_action_note = fields.nextActionNote;
    if (fields.completed       !== undefined) db.completed        = fields.completed;

    const { error } = await supabase.from('prospects').update(db).eq('id', id);
    if (!error) setProspects(prev => prev.map(p => p.id === id ? { ...p, ...fields } : p));
  }, []);

  const removeProspect = useCallback(async (id) => {
    const { error } = await supabase.from('prospects').delete().eq('id', id);
    if (!error) setProspects(prev => prev.filter(p => p.id !== id));
  }, []);

  const completeProspect = useCallback(async (id) => {
    const { error } = await supabase.from('prospects').update({ completed: true }).eq('id', id);
    if (!error) setProspects(prev => prev.filter(p => p.id !== id));
  }, []);

  return { prospects, addProspect, updateProspect, removeProspect, completeProspect };
}
