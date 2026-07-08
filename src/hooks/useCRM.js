import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  return text.includes(columnName) || error.code === 'PGRST204' || error.code === '42703';
}

export function useCRM() {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) {
      setClients(data.map(dbToClient));
    }
  }

  // Map DB snake_case → app camelCase
  function dbToClient(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      propertyType: row.property_type,
      facilityName: row.facility_name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      units: row.units,
      sqft: row.sqft,
      notes: row.notes,
      stageId: row.stage_id,
      storageClass: row.storage_class,
      documents: row.documents ?? [],
      nextActionType: row.next_action_type ?? '',
      nextActionDate: row.next_action_date ?? '',
      nextActionNote: row.next_action_note ?? '',
      leadTemp: row.lead_temp ?? '',
      actionLog: row.action_log ?? [],
      ownershipGroupId: row.ownership_group_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Map app camelCase → DB snake_case
  function clientToDb(data) {
    const db = {
      name: data.name,
      type: data.type,
      property_type: data.propertyType,
      facility_name: data.facilityName,
      address: data.address,
      phone: data.phone,
      email: data.email,
      units: data.units ?? null,
      sqft: data.sqft ?? null,
      notes: data.notes,
      stage_id: data.stageId ?? 1,
      storage_class: data.storageClass,
      documents: data.documents ?? [],
    };
    if (data.ownershipGroupId !== undefined) db.ownership_group_id = data.ownershipGroupId || null;
    if (data.nextActionType !== undefined) db.next_action_type = data.nextActionType;
    if (data.nextActionDate !== undefined) db.next_action_date = data.nextActionDate;
    if (data.nextActionNote !== undefined) db.next_action_note = data.nextActionNote;
    if (data.leadTemp !== undefined) db.lead_temp = data.leadTemp;
    if (data.actionLog !== undefined) db.action_log = data.actionLog;
    return db;
  }

  const addClient = useCallback(async (data) => {
    let dbRow = clientToDb(data);
    let { data: row, error } = await supabase
      .from('clients')
      .insert([dbRow])
      .select()
      .single();
    if (error && isMissingColumnError(error, 'ownership_group_id')) {
      const { ownership_group_id: _ownershipGroupId, ...withoutOwnership } = dbRow;
      dbRow = withoutOwnership;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (!error && row) {
      setClients(prev => [...prev, dbToClient(row)]);
    }
  }, []);

  const updateClient = useCallback(async (id, data) => {
    const { data: row, error } = await supabase
      .from('clients')
      .update({ ...clientToDb(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (!error && row) {
      setClients(prev => prev.map(c => c.id === id ? dbToClient(row) : c));
    }
  }, []);

  const deleteClient = useCallback(async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (!error) {
      setClients(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  const moveClientToStage = useCallback(async (id, stageId) => {
    const { error } = await supabase
      .from('clients')
      .update({ stage_id: stageId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setClients(prev => prev.map(c => c.id === id ? { ...c, stageId } : c));
    }
  }, []);

  const setClientAction = useCallback(async (id, actionFields) => {
    const db = {};
    if (actionFields.nextActionType !== undefined) db.next_action_type = actionFields.nextActionType;
    if (actionFields.nextActionDate !== undefined) db.next_action_date = actionFields.nextActionDate;
    if (actionFields.nextActionNote !== undefined) db.next_action_note = actionFields.nextActionNote;
    if (actionFields.leadTemp       !== undefined) db.lead_temp        = actionFields.leadTemp;
    if (actionFields.ownershipGroupId !== undefined) db.ownership_group_id = actionFields.ownershipGroupId || null;
    db.updated_at = new Date().toISOString();

    let fieldsToApply = actionFields;
    let { error } = await supabase.from('clients').update(db).eq('id', id);
    if (error && isMissingColumnError(error, 'ownership_group_id')) {
      if (actionFields.ownershipGroupId !== undefined) {
        return { error: 'Run sql/client_ownership_group_link_migration.sql in Supabase, then refresh to save multiple property addresses on clients.' };
      }
      const { ownership_group_id: _ownershipGroupId, ...withoutOwnership } = db;
      ({ error } = await supabase.from('clients').update(withoutOwnership).eq('id', id));
      if (!error) {
        const { ownershipGroupId: _appOwnershipGroupId, ...withoutAppOwnership } = actionFields;
        fieldsToApply = withoutAppOwnership;
      }
    }
    if (!error) {
      setClients(prev => prev.map(c => c.id === id ? { ...c, ...fieldsToApply } : c));
      return { ok: true };
    }
    return { error: error.message };
  }, []);

  // Replace a client's activity log wholesale (review actions), with optional email backfill
  const mutateClientLog = useCallback(async (id, { log, email }) => {
    const db = { action_log: log, updated_at: new Date().toISOString() };
    if (email !== undefined && email !== null) db.email = email;
    const { error } = await supabase.from('clients').update(db).eq('id', id);
    if (!error) setClients(prev => prev.map(c => c.id === id
      ? { ...c, actionLog: log, ...(email !== undefined && email !== null ? { email } : {}) } : c));
  }, []);

  // Append a logged action to a client's activity log
  const logClientAction = useCallback(async (id, entry) => {
    setClients(prev => {
      const client = prev.find(c => c.id === id);
      const nextLog = [...(client?.actionLog ?? []), entry];
      supabase.from('clients').update({ action_log: nextLog, updated_at: new Date().toISOString() }).eq('id', id).then(() => {});
      return prev.map(c => c.id === id ? { ...c, actionLog: nextLog } : c);
    });
  }, []);

  return { clients, addClient, updateClient, deleteClient, moveClientToStage, setClientAction, logClientAction, mutateClientLog };
}
