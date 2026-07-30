import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';
import { coreClientToDb, dbToBrokerageContinuumHistory, dbToCoreClient } from '../lib/coreClients';

function missingMigration(error) {
  return error?.code === 'PGRST205' || String(error?.message || '').includes('core_clients');
}

function missingBrokerageContinuum(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST205'
    || error?.code === 'PGRST202'
    || message.includes('brokerage_continuum')
    || message.includes('change_brokerage_continuum_stage');
}

export function useCoreClients() {
  const [coreClients, setCoreClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [continuumMigrationNeeded, setContinuumMigrationNeeded] = useState(false);
  const [continuumHistory, setContinuumHistory] = useState([]);
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
      const { data: historyData, error: historyError } = await selectAllRows(() => supabase
        .from('brokerage_continuum_history')
        .select('*')
        .order('effective_at', { ascending: false })
        .order('changed_at', { ascending: false }));
      if (historyError) {
        setContinuumMigrationNeeded(missingBrokerageContinuum(historyError));
        setContinuumHistory([]);
        if (!missingBrokerageContinuum(historyError)) setError(historyError.message);
      } else {
        setContinuumMigrationNeeded(false);
        setContinuumHistory((historyData ?? []).map(dbToBrokerageContinuumHistory));
      }
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
      return {
        error: missingMigration(saveError)
            ? 'Run sql/core_clients_pipeline_migration.sql in Supabase, then refresh.'
            : saveError.message,
      };
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

  const changeContinuumStage = useCallback(async ({
    coreClientId,
    newStage,
    changedBy,
    reason,
    note,
    effectiveAt,
    source = 'manual',
    relatedPropertyId,
    relatedClientId,
  }) => {
    const { data, error: changeError } = await supabase.rpc('change_brokerage_continuum_stage', {
      p_core_client_id: coreClientId,
      p_new_stage: newStage,
      p_changed_by: changedBy || 'Brandon Greene',
      p_change_reason: reason || null,
      p_change_note: note || '',
      p_effective_at: effectiveAt || new Date().toISOString(),
      p_source: source,
      p_related_property_id: relatedPropertyId || null,
      p_related_client_id: relatedClientId || null,
    });
    if (changeError) {
      if (missingBrokerageContinuum(changeError)) setContinuumMigrationNeeded(true);
      return {
        error: missingBrokerageContinuum(changeError)
          ? 'Run sql/brokerage_continuum_migration.sql in Supabase, then refresh.'
          : changeError.message,
      };
    }
    const saved = dbToCoreClient(data.core_client);
    const history = dbToBrokerageContinuumHistory(data.history);
    setCoreClients(previous => previous.map(item => item.id === saved.id ? saved : item));
    setContinuumHistory(previous => [history, ...previous]);
    return { ok: true, coreClient: saved, history };
  }, []);

  const historyForCoreClient = useCallback(coreClientId => continuumHistory
    .filter(item => item.coreClientId === coreClientId), [continuumHistory]);

  return {
    coreClients,
    activeCoreClients: coreClients.filter(item => item.status === 'active'),
    loading,
    migrationNeeded,
    continuumMigrationNeeded,
    continuumHistory,
    error,
    reload: loadCoreClients,
    saveCoreClient,
    archiveCoreClient,
    changeContinuumStage,
    historyForCoreClient,
  };
}
