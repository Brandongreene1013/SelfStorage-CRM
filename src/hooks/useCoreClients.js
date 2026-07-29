import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';

function dbToCoreClient(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    primaryPropertyId: row.primary_property_id ?? null,
    sellingMotivation: row.selling_motivation ?? '',
    motivationStrength: row.motivation_strength ?? 'unclear',
    sellingTimeline: row.selling_timeline ?? 'unknown',
    priceExpectations: row.price_expectations ?? '',
    saleBarriers: row.sale_barriers ?? '',
    followUpFrequencyDays: row.follow_up_frequency_days ?? null,
    nextAction: row.next_action ?? '',
    nextActionDueDate: row.next_action_due_date ?? '',
    assignedUser: row.assigned_user ?? 'Brandon Greene',
    notes: row.notes ?? '',
    lastMeaningfulContactAt: row.last_meaningful_contact_at ?? null,
    status: row.status ?? 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function coreClientToDb(profile) {
  return {
    contact_id: profile.contactId,
    primary_property_id: profile.primaryPropertyId || null,
    selling_motivation: profile.sellingMotivation?.trim() ?? '',
    motivation_strength: profile.motivationStrength || 'unclear',
    selling_timeline: profile.sellingTimeline || 'unknown',
    price_expectations: profile.priceExpectations?.trim() ?? '',
    sale_barriers: profile.saleBarriers?.trim() ?? '',
    follow_up_frequency_days: profile.followUpFrequencyDays
      ? Number(profile.followUpFrequencyDays)
      : null,
    next_action: profile.nextAction?.trim() ?? '',
    next_action_due_date: profile.nextActionDueDate || null,
    assigned_user: profile.assignedUser?.trim() || 'Brandon Greene',
    notes: profile.notes?.trim() ?? '',
    last_meaningful_contact_at: profile.lastMeaningfulContactAt || null,
    status: profile.status || 'active',
    updated_at: new Date().toISOString(),
  };
}

function missingMigration(error) {
  return error?.code === 'PGRST205' || String(error?.message || '').includes('core_clients');
}

export function useCoreClients() {
  const [coreClients, setCoreClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [error, setError] = useState('');

  const loadCoreClients = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await selectAllRows(() => supabase
      .from('core_clients')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true }));
    if (loadError) {
      setMigrationNeeded(missingMigration(loadError));
      setError(missingMigration(loadError) ? '' : loadError.message);
      setCoreClients([]);
    } else {
      setMigrationNeeded(false);
      setError('');
      setCoreClients((data ?? []).map(dbToCoreClient));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCoreClients();
  }, [loadCoreClients]);

  const saveCoreClient = useCallback(async profile => {
    const payload = coreClientToDb(profile);
    const { data, error: saveError } = await supabase
      .from('core_clients')
      .upsert(payload, { onConflict: 'contact_id' })
      .select()
      .single();
    if (saveError) {
      if (missingMigration(saveError)) setMigrationNeeded(true);
      return { error: missingMigration(saveError)
        ? 'Run sql/core_clients_pipeline_migration.sql in Supabase, then refresh.'
        : saveError.message };
    }
    const saved = dbToCoreClient(data);
    setCoreClients(previous => {
      const exists = previous.some(item => item.id === saved.id);
      return exists
        ? previous.map(item => item.id === saved.id ? saved : item)
        : [saved, ...previous];
    });
    return { ok: true, coreClient: saved };
  }, []);

  const archiveCoreClient = useCallback(async contactId => {
    const { data, error: archiveError } = await supabase
      .from('core_clients')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('contact_id', contactId)
      .select()
      .single();
    if (archiveError) return { error: archiveError.message };
    const saved = dbToCoreClient(data);
    setCoreClients(previous => previous.map(item => item.id === saved.id ? saved : item));
    return { ok: true, coreClient: saved };
  }, []);

  return {
    coreClients,
    activeCoreClients: coreClients.filter(item => item.status === 'active'),
    loading,
    migrationNeeded,
    error,
    reload: loadCoreClients,
    saveCoreClient,
    archiveCoreClient,
  };
}

