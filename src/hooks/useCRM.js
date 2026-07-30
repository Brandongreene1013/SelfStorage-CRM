import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';
import { normalizeMailingAddresses } from '../lib/mailingAddresses';
import { formatMoney, formatPercent, numberOrNull, projectedCommissionAmount } from '../lib/dealValue';
import { buildCaptureLogEntries, createActivityEventId } from '../lib/activityAnalytics';
import { canonicalLeadSource } from '../data/constants';
import { dbToPipelineOpportunity } from '../lib/pipelineOpportunity';
import { isMissingColumnError, isMissingTableError, supabaseErrorText } from '../lib/supabaseErrors';

function isMissingExactColumnError(error, columnName) {
  return isMissingColumnError(error, columnName)
    && new RegExp(`(?:['".]|column\\s+)${columnName}(?:['"\\s]|$)`, 'i').test(supabaseErrorText(error));
}

function hasDealValueInput(data) {
  return numberOrNull(data.desiredSalePrice) !== null || numberOrNull(data.projectedCommissionPct) !== null;
}

function hasAgeInput(data) {
  return numberOrNull(data.age) !== null;
}

function missingPipelineHistory(error) {
  return isMissingTableError(error, 'pipeline_stage_history');
}

function hasLeadSourceInput(data) {
  return Boolean(String(data.leadSource || '').trim());
}

function dealValueChanged(previous, next) {
  if (!previous) return hasDealValueInput(next);
  return numberOrNull(previous.desiredSalePrice) !== numberOrNull(next.desiredSalePrice)
    || numberOrNull(previous.projectedCommissionPct) !== numberOrNull(next.projectedCommissionPct);
}

function buildDealValueLogEntry(data) {
  const commission = projectedCommissionAmount(data.desiredSalePrice, data.projectedCommissionPct);
  const priceText = numberOrNull(data.desiredSalePrice) !== null ? formatMoney(data.desiredSalePrice) : 'no sale price';
  const pctText = numberOrNull(data.projectedCommissionPct) !== null ? formatPercent(data.projectedCommissionPct) : 'no commission %';
  const feeText = commission !== null ? formatMoney(commission) : '$0';
  return {
    eventId: createActivityEventId(),
    type: 'deal_value_updated',
    analytics: false,
    date: new Date().toISOString().slice(0, 10),
    note: `Commission registered: ${feeText} projected on ${priceText} at ${pctText}`,
    at: new Date().toISOString(),
  };
}

export function useCRM() {
  const [clients, setClients] = useState([]);
  const [dealValueMigrationNeeded, setDealValueMigrationNeeded] = useState(false);

  const loadClients = useCallback(async () => {
    const { data, error } = await selectAllRows(() => supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }));
    if (!error && data) {
      setClients(data.map(dbToPipelineOpportunity));
    }
    const { error: dealValueError } = await supabase
      .from('clients')
      .select('desired_sale_price,projected_commission_pct')
      .limit(1);
    setDealValueMigrationNeeded(isMissingColumnError(dealValueError, 'desired_sale_price') || isMissingColumnError(dealValueError, 'projected_commission_pct'));
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Map DB snake_case → app camelCase
  // Map app camelCase → DB snake_case
  function clientToDb(data) {
    const db = {
      name: data.name,
      contact_id: data.contactId ?? null,
      type: data.type,
      property_type: data.propertyType,
      facility_name: data.facilityName,
      address: data.address,
      mailing_address: data.mailingAddress ?? '',
      mailing_addresses: normalizeMailingAddresses(data.mailingAddresses),
      phone: data.phone,
      email: data.email,
      lead_source: canonicalLeadSource(data.leadSource) || null,
      age: numberOrNull(data.age),
      units: data.units ?? null,
      sqft: data.sqft ?? null,
      desired_sale_price: data.desiredSalePrice ?? null,
      projected_commission_pct: data.projectedCommissionPct ?? null,
      notes: data.notes,
      stage_id: data.stageId ?? 1,
      storage_class: data.storageClass,
    };
    // Attachment feature removed 2026-07 — existing documents metadata is left
    // untouched in the DB rather than wiped on every save.
    if (data.documents !== undefined) db.documents = data.documents;
    if (data.ownershipGroupId !== undefined) db.ownership_group_id = data.ownershipGroupId || null;
    const hasOpportunityFields = data.propertyId !== undefined
      || Boolean(String(data.opportunityName || '').trim())
      || numberOrNull(data.ownerPricingExpectation) !== null
      || Boolean(String(data.importantNotes || '').trim())
      || data.stageEnteredAt !== undefined
      || data.archivedAt !== undefined;
    if (hasOpportunityFields) {
      db.property_id = data.propertyId || null;
      db.opportunity_name = data.opportunityName?.trim() || null;
      db.assigned_user = data.assignedUser?.trim() || 'Brandon Greene';
      db.owner_pricing_expectation = numberOrNull(data.ownerPricingExpectation);
      db.important_notes = data.importantNotes?.trim() ?? '';
      if (data.stageEnteredAt !== undefined) db.stage_entered_at = data.stageEnteredAt || null;
      if (data.archivedAt !== undefined) db.archived_at = data.archivedAt || null;
    }
    if (data.nextActionType !== undefined) db.next_action_type = data.nextActionType;
    if (data.nextActionDate !== undefined) db.next_action_date = data.nextActionDate;
    if (data.nextActionNote !== undefined) db.next_action_note = data.nextActionNote;
    if (data.leadTemp !== undefined) db.lead_temp = data.leadTemp;
    if (data.actionLog !== undefined) db.action_log = data.actionLog;
    return db;
  }

  const addClient = useCallback(async (data) => {
    const captureEntries = buildCaptureLogEntries(null, data, {
      ownerField: 'name',
      includeOwner: !data.contactId,
    });
    const payload = {
      ...data,
      actionLog: [
        ...(data.actionLog ?? []),
        ...captureEntries,
        ...(hasDealValueInput(data) ? [buildDealValueLogEntry(data)] : []),
      ],
    };
    let dbRow = clientToDb(payload);
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
    if (error && isMissingColumnError(error, 'mailing_address')) {
      const { mailing_address: _mailingAddress, mailing_addresses: _mailingAddresses, ...withoutMailing } = dbRow;
      dbRow = withoutMailing;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (error && isMissingColumnError(error, 'mailing_addresses')) {
      const { mailing_addresses: _mailingAddresses, ...withoutMailingAddresses } = dbRow;
      dbRow = withoutMailingAddresses;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (error && isMissingColumnError(error, 'contact_id')) {
      if (data.contactId) {
        return { error: 'Run sql/client_contact_link_migration.sql in Supabase first. Contact/client linking is not active yet.' };
      }
      const { contact_id: _contactId, ...withoutContactId } = dbRow;
      dbRow = withoutContactId;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (error && isMissingColumnError(error, 'action_log')) {
      const { action_log: _actionLog, ...withoutActionLog } = dbRow;
      dbRow = withoutActionLog;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (error && (
      isMissingColumnError(error, 'property_id')
      || isMissingColumnError(error, 'opportunity_name')
      || isMissingColumnError(error, 'assigned_user')
      || isMissingColumnError(error, 'owner_pricing_expectation')
      || isMissingColumnError(error, 'important_notes')
      || isMissingColumnError(error, 'stage_entered_at')
    )) {
      return { error: 'Run sql/core_clients_pipeline_migration.sql in Supabase, then refresh to create property-specific Pipeline opportunities.' };
    }
    if (error && isMissingExactColumnError(error, 'lead_source')) {
      if (hasLeadSourceInput(data)) {
        return { error: 'Run sql/client_lead_source_migration.sql in Supabase first. Client lead source is not being saved yet.' };
      }
      const { lead_source: _leadSource, ...withoutLeadSource } = dbRow;
      dbRow = withoutLeadSource;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (error && isMissingExactColumnError(error, 'age')) {
      if (hasAgeInput(data)) {
        return { error: 'Run sql/client_age_migration.sql in Supabase first. Client age is not being saved yet.' };
      }
      const { age: _age, ...withoutAge } = dbRow;
      dbRow = withoutAge;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (error && (isMissingColumnError(error, 'desired_sale_price') || isMissingColumnError(error, 'projected_commission_pct'))) {
      setDealValueMigrationNeeded(true);
      if (hasDealValueInput(data)) {
        return { error: 'Run sql/client_deal_value_migration.sql in Supabase first. Commission values are not being saved yet.' };
      }
      const { desired_sale_price: _desiredSalePrice, projected_commission_pct: _projectedCommissionPct, ...withoutDealValue } = dbRow;
      dbRow = withoutDealValue;
      ({ data: row, error } = await supabase.from('clients').insert([dbRow]).select().single());
    }
    if (!error && row) {
      const client = dbToPipelineOpportunity(row);
      setClients(prev => [...prev, client]);
      if (data.opportunityName !== undefined || data.propertyId !== undefined) {
        const historyResult = await supabase.from('pipeline_stage_history').insert([{
          client_id: client.id,
          previous_stage_id: null,
          new_stage_id: Number(client.stageId) || 1,
          changed_at: client.stageEnteredAt || client.createdAt || new Date().toISOString(),
          changed_by: client.assignedUser || 'Brandon Greene',
          note: 'Pipeline opportunity created.',
        }]);
        if (historyResult.error && !missingPipelineHistory(historyResult.error)) {
          return { error: `Opportunity created, but initial stage history failed: ${historyResult.error.message}`, client };
        }
      }
      return { ok: true, client };
    }
    return { error: error?.message ?? 'Could not add client.' };
  }, []);

  const updateClient = useCallback(async (id, data) => {
    const existing = clients.find(c => c.id === id);
    const nextClient = { ...existing, ...data };
    const captureEntries = buildCaptureLogEntries(existing, nextClient, {
      ownerField: 'name',
      includeOwner: !nextClient.contactId,
    });
    const payload = {
      ...data,
      actionLog: [
        ...(data.actionLog ?? existing?.actionLog ?? []),
        ...captureEntries,
        ...(dealValueChanged(existing, nextClient) ? [buildDealValueLogEntry(nextClient)] : []),
      ],
    };
    let dbRow = { ...clientToDb(payload), updated_at: new Date().toISOString() };
    let { data: row, error } = await supabase
      .from('clients')
      .update(dbRow)
      .eq('id', id)
      .select()
      .single();
    if (error && isMissingColumnError(error, 'mailing_address')) {
      const { mailing_address: _mailingAddress, mailing_addresses: _mailingAddresses, ...withoutMailing } = dbRow;
      dbRow = withoutMailing;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (error && isMissingColumnError(error, 'mailing_addresses')) {
      const { mailing_addresses: _mailingAddresses, ...withoutMailingAddresses } = dbRow;
      dbRow = withoutMailingAddresses;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (error && isMissingColumnError(error, 'contact_id')) {
      if (data.contactId) {
        return { error: 'Run sql/client_contact_link_migration.sql in Supabase first. Contact/client linking is not active yet.' };
      }
      const { contact_id: _contactId, ...withoutContactId } = dbRow;
      dbRow = withoutContactId;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (error && isMissingColumnError(error, 'action_log')) {
      const { action_log: _actionLog, ...withoutActionLog } = dbRow;
      dbRow = withoutActionLog;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (error && (
      isMissingColumnError(error, 'property_id')
      || isMissingColumnError(error, 'opportunity_name')
      || isMissingColumnError(error, 'assigned_user')
      || isMissingColumnError(error, 'owner_pricing_expectation')
      || isMissingColumnError(error, 'important_notes')
      || isMissingColumnError(error, 'stage_entered_at')
    )) {
      return { error: 'Run sql/core_clients_pipeline_migration.sql in Supabase, then refresh to save opportunity details.' };
    }
    if (error && isMissingExactColumnError(error, 'lead_source')) {
      if (hasLeadSourceInput(data)) {
        return { error: 'Run sql/client_lead_source_migration.sql in Supabase first. Client lead source is not being saved yet.' };
      }
      const { lead_source: _leadSource, ...withoutLeadSource } = dbRow;
      dbRow = withoutLeadSource;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (error && isMissingExactColumnError(error, 'age')) {
      if (hasAgeInput(data)) {
        return { error: 'Run sql/client_age_migration.sql in Supabase first. Client age is not being saved yet.' };
      }
      const { age: _age, ...withoutAge } = dbRow;
      dbRow = withoutAge;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (error && (isMissingColumnError(error, 'desired_sale_price') || isMissingColumnError(error, 'projected_commission_pct'))) {
      setDealValueMigrationNeeded(true);
      if (hasDealValueInput(data)) {
        return { error: 'Run sql/client_deal_value_migration.sql in Supabase first. Commission values are not being saved yet.' };
      }
      const { desired_sale_price: _desiredSalePrice, projected_commission_pct: _projectedCommissionPct, ...withoutDealValue } = dbRow;
      dbRow = withoutDealValue;
      ({ data: row, error } = await supabase.from('clients').update(dbRow).eq('id', id).select().single());
    }
    if (!error && row) {
      const client = dbToPipelineOpportunity(row);
      setClients(prev => prev.map(c => c.id === id ? client : c));
      return { ok: true, client };
    }
    return { error: error?.message ?? 'Could not update client.' };
  }, [clients]);

  const deleteClient = useCallback(async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (!error) {
      setClients(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  const moveClientToStage = useCallback(async (id, stageId) => {
    const client = clients.find(item => item.id === id);
    if (!client) return { error: 'Pipeline opportunity not found. Refresh and try again.' };
    if (Number(client.stageId) === Number(stageId)) return { ok: true, client };
    const changedAt = new Date().toISOString();
    const historyEntry = {
      eventId: createActivityEventId(),
      type: 'pipeline_stage_changed',
      analytics: false,
      previousStageId: Number(client.stageId) || null,
      newStageId: Number(stageId),
      changedBy: 'Brandon Greene',
      date: changedAt.slice(0, 10),
      at: changedAt,
      note: `Pipeline moved from stage ${client.stageId} to stage ${stageId}.`,
    };
    const nextLog = [...(client.actionLog ?? []), historyEntry];
    let { error } = await supabase
      .from('clients')
      .update({
        stage_id: stageId,
        stage_entered_at: changedAt,
        action_log: nextLog,
        updated_at: changedAt,
      })
      .eq('id', id);
    if (error && isMissingColumnError(error, 'stage_entered_at')) {
      ({ error } = await supabase
        .from('clients')
        .update({ stage_id: stageId, action_log: nextLog, updated_at: changedAt })
        .eq('id', id));
    }
    if (!error) {
      setClients(prev => prev.map(c => c.id === id
        ? { ...c, stageId, stageEnteredAt: changedAt, actionLog: nextLog, updatedAt: changedAt }
        : c));
      const historyResult = await supabase.from('pipeline_stage_history').insert([{
        client_id: id,
        previous_stage_id: Number(client.stageId) || null,
        new_stage_id: Number(stageId),
        changed_at: changedAt,
        changed_by: 'Brandon Greene',
      }]);
      if (historyResult.error && !missingPipelineHistory(historyResult.error)) {
        return { error: `Stage moved, but the audit table could not be updated: ${historyResult.error.message}` };
      }
      return {
        ok: true,
        client: { ...client, stageId, stageEnteredAt: changedAt, actionLog: nextLog, updatedAt: changedAt },
        historyPendingMigration: Boolean(historyResult.error),
      };
    }
    return { error: error.message };
  }, [clients]);

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
    const existing = clients.find(client => client.id === id);
    const captureEntries = email !== undefined && email !== null
      ? buildCaptureLogEntries(existing, { ...existing, email }, { ownerField: 'name', includeOwner: false })
      : [];
    const nextLog = [...log, ...captureEntries];
    const db = { action_log: nextLog, updated_at: new Date().toISOString() };
    if (email !== undefined && email !== null) db.email = email;
    const { error } = await supabase.from('clients').update(db).eq('id', id);
    if (!error) setClients(prev => prev.map(c => c.id === id
      ? { ...c, actionLog: nextLog, ...(email !== undefined && email !== null ? { email } : {}) } : c));
  }, [clients]);

  // Append a logged action to a client's activity log
  const logClientAction = useCallback(async (id, entry) => {
    const client = clients.find(c => c.id === id);
    if (!client) return { error: 'Client not found. Refresh and try again.' };
    const nextLog = [...(client.actionLog ?? []), entry];
    const { error } = await supabase.from('clients')
      .update({ action_log: nextLog, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { error: error.message };
    setClients(prev => prev.map(c => c.id === id ? { ...c, actionLog: nextLog } : c));
    return { ok: true };
  }, [clients]);

  const deleteClientAction = useCallback(async (id, actionIndex) => {
    const client = clients.find(c => c.id === id);
    if (!client) return { error: 'Client not found. Refresh and try again.' };
    const nextLog = (client.actionLog ?? []).filter((_, idx) => idx !== actionIndex);
    const { error } = await supabase.from('clients')
      .update({ action_log: nextLog, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { error: error.message };
    setClients(prev => prev.map(c => c.id === id ? { ...c, actionLog: nextLog } : c));
    return { ok: true };
  }, [clients]);

  return { clients, dealValueMigrationNeeded, addClient, updateClient, deleteClient, moveClientToStage, setClientAction, logClientAction, deleteClientAction, mutateClientLog };
}
