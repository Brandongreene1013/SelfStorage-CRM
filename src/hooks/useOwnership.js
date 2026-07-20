import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';
import { DEFAULT_RELATIONSHIP_TYPE } from '../data/constants';

function dbToGroup(row) {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    ownerEntity: row.owner_entity ?? '',
    relationshipType: row.relationship_type ?? DEFAULT_RELATIONSHIP_TYPE,
    notes: row.notes ?? '',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function dbToProperty(row) {
  return {
    id: row.id,
    ownershipGroupId: row.ownership_group_id ?? null,
    facilityName: row.facility_name ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    market: row.market ?? '',
    propertyType: row.property_type ?? 'Self-Storage',
    notes: row.notes ?? '',
    source: row.source ?? '',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function groupPayload(fields) {
  return {
    display_name: fields.displayName ?? '',
    owner_entity: fields.ownerEntity ?? '',
    relationship_type: fields.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE,
    notes: fields.notes ?? '',
    updated_at: new Date().toISOString(),
  };
}

function propertyPayload(fields) {
  return {
    ownership_group_id: fields.ownershipGroupId || null,
    facility_name: fields.facilityName ?? '',
    address: fields.address ?? '',
    city: fields.city ?? '',
    state: fields.state ?? '',
    market: fields.market ?? '',
    property_type: fields.propertyType ?? 'Self-Storage',
    notes: fields.notes ?? '',
    source: fields.source ?? '',
    updated_at: new Date().toISOString(),
  };
}

export function useOwnership() {
  const [groups, setGroups] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    const [groupsRes, propertiesRes] = await Promise.all([
      selectAllRows(() => supabase.from('ownership_groups').select('*').order('display_name', { ascending: true }).order('id', { ascending: true })),
      selectAllRows(() => supabase.from('properties').select('*').order('facility_name', { ascending: true }).order('id', { ascending: true })),
    ]);
    if (groupsRes.error || propertiesRes.error) {
      setLoadError(groupsRes.error?.message ?? propertiesRes.error?.message ?? 'Ownership data unavailable');
      return;
    }
    setLoadError(null);
    setGroups((groupsRes.data ?? []).map(dbToGroup));
    setProperties((propertiesRes.data ?? []).map(dbToProperty));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const createGroup = useCallback(async (fields) => {
    const { data, error } = await supabase.from('ownership_groups').insert([groupPayload(fields)]).select().single();
    if (error) return { error: error.message };
    const group = dbToGroup(data);
    setGroups(prev => [...prev, group].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    return { ok: true, group };
  }, []);

  const updateGroup = useCallback(async (id, fields) => {
    const { data, error } = await supabase.from('ownership_groups').update(groupPayload(fields)).eq('id', id).select().single();
    if (error) return { error: error.message };
    const group = dbToGroup(data);
    setGroups(prev => prev.map(g => g.id === id ? group : g).sort((a, b) => a.displayName.localeCompare(b.displayName)));
    return { ok: true, group };
  }, []);

  const createProperty = useCallback(async (fields) => {
    const { data, error } = await supabase.from('properties').insert([propertyPayload(fields)]).select().single();
    if (error) return { error: error.message };
    const property = dbToProperty(data);
    setProperties(prev => [...prev, property].sort((a, b) => a.facilityName.localeCompare(b.facilityName)));
    return { ok: true, property };
  }, []);

  const updateProperty = useCallback(async (id, fields) => {
    const { data, error } = await supabase.from('properties').update(propertyPayload(fields)).eq('id', id).select().single();
    if (error) return { error: error.message };
    const property = dbToProperty(data);
    setProperties(prev => prev.map(p => p.id === id ? property : p).sort((a, b) => a.facilityName.localeCompare(b.facilityName)));
    return { ok: true, property };
  }, []);

  const deleteProperty = useCallback(async (id) => {
    const { error } = await supabase.from('properties').delete().eq('id', id);
    if (error) return { error: error.message };
    setProperties(prev => prev.filter(p => p.id !== id));
    return { ok: true };
  }, []);

  // Sprint 21b: cleanup for accidentally-created groups. Deletes the group
  // and its properties only if no contact/client links to it anymore; the
  // caller unlinks its own record first.
  const removeGroupIfOrphaned = useCallback(async (id) => {
    const { data: linked, error: linkErr } = await supabase
      .from('contacts').select('id').eq('ownership_group_id', id).limit(1);
    if (linkErr) return { error: linkErr.message };
    if ((linked ?? []).length > 0) return { ok: true, deleted: false };
    const { data: linkedClients, error: clientLinkErr } = await supabase
      .from('clients').select('id').eq('ownership_group_id', id).limit(1);
    if (clientLinkErr && !(clientLinkErr.code === 'PGRST204' || `${clientLinkErr.message ?? ''} ${clientLinkErr.details ?? ''}`.includes('ownership_group_id'))) {
      return { error: clientLinkErr.message };
    }
    if ((linkedClients ?? []).length > 0) return { ok: true, deleted: false };
    const { error: propErr } = await supabase.from('properties').delete().eq('ownership_group_id', id);
    if (propErr) return { error: propErr.message };
    const { error: groupErr } = await supabase.from('ownership_groups').delete().eq('id', id);
    if (groupErr) return { error: groupErr.message };
    setProperties(prev => prev.filter(p => p.ownershipGroupId !== id));
    setGroups(prev => prev.filter(g => g.id !== id));
    return { ok: true, deleted: true };
  }, []);

  const propertiesByGroup = useMemo(() => {
    const map = new Map();
    properties.forEach(property => {
      if (!property.ownershipGroupId) return;
      if (!map.has(property.ownershipGroupId)) map.set(property.ownershipGroupId, []);
      map.get(property.ownershipGroupId).push(property);
    });
    return map;
  }, [properties]);

  return {
    groups,
    properties,
    propertiesByGroup,
    loadError,
    reload: load,
    createGroup,
    updateGroup,
    createProperty,
    updateProperty,
    deleteProperty,
    removeGroupIfOrphaned,
  };
}
