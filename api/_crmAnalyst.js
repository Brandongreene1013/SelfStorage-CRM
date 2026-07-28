const PIPELINE_STAGES = {
  1: 'Research',
  2: 'Cold Call',
  3: '1st Appointment',
  4: '2nd Appointment',
  5: 'Exclusive Listing',
  6: 'Market / Sell',
  7: 'Field Offers',
  8: 'Contract',
  9: 'Close',
  10: 'Post-Close',
};

export const CRM_RECORD_TYPES = ['contact', 'client', 'property', 'task', 'meeting'];

export const CRM_EXPORT_COLUMNS = [
  'recordType',
  'name',
  'ownerEntity',
  'relationshipType',
  'facilityName',
  'facilityAddress',
  'mailingAddress',
  'city',
  'state',
  'market',
  'phone',
  'alternatePhones',
  'email',
  'leadSource',
  'leadSourceNotes',
  'status',
  'pipelineStage',
  'leadTemperature',
  'units',
  'sqft',
  'desiredSalePrice',
  'projectedCommissionPct',
  'notes',
  'lastCalled',
  'nextActionType',
  'nextActionDate',
  'nextActionNote',
  'ownedProperties',
  'listName',
  'createdAt',
  'updatedAt',
];

const EXPORT_LABELS = {
  recordType: 'Record Type',
  name: 'Name',
  ownerEntity: 'Owner Entity',
  relationshipType: 'Relationship Type',
  facilityName: 'Facility Name',
  facilityAddress: 'Facility Address',
  mailingAddress: 'Mailing Address',
  city: 'City',
  state: 'State',
  market: 'Market',
  phone: 'Phone',
  alternatePhones: 'Alternate Phones',
  email: 'Email',
  leadSource: 'Lead Source',
  leadSourceNotes: 'Lead Source Notes',
  status: 'Status',
  pipelineStage: 'Pipeline Stage',
  leadTemperature: 'Lead Temperature',
  units: 'Units',
  sqft: 'Square Feet',
  desiredSalePrice: 'Desired Sale Price',
  projectedCommissionPct: 'Projected Commission %',
  notes: 'Notes',
  lastCalled: 'Last Called',
  nextActionType: 'Next Action Type',
  nextActionDate: 'Next Action Date',
  nextActionNote: 'Next Action Note',
  ownedProperties: 'Owned Properties',
  listName: 'Database List',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
};

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function boundedInt(value, fallback, max) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(number, max)) : fallback;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) =>
    item !== null && item !== undefined && item !== '' && !(Array.isArray(item) && item.length === 0)));
}

function flattenText(value, depth = 0) {
  if (value == null || depth > 4) return '';
  if (Array.isArray(value)) return value.map(item => flattenText(item, depth + 1)).join(' ');
  if (typeof value === 'object') return Object.values(value).map(item => flattenText(item, depth + 1)).join(' ');
  return String(value);
}

function addressMarket(row) {
  if (row.market) return row.market;
  return [row.city, row.state].filter(Boolean).join(', ') || row.state || '';
}

function normalizeContact(row, context) {
  const group = context.groups.get(row.ownership_group_id);
  const linkedProperties = context.propertiesByGroup.get(row.ownership_group_id) ?? [];
  const embeddedProperties = array(row.owned_properties);
  return {
    recordType: 'contact',
    id: row.id,
    name: row.owner_name || group?.display_name || '',
    ownerEntity: row.owner_entity || group?.owner_entity || '',
    relationshipType: row.relationship_type || group?.relationship_type || '',
    facilityName: row.facility_name || '',
    facilityAddress: row.address || '',
    mailingAddress: row.mailing_address || '',
    mailingAddresses: array(row.mailing_addresses),
    city: row.city || '',
    state: row.state || '',
    market: addressMarket(row),
    phone: row.phone || '',
    alternatePhones: array(row.alternate_phones),
    email: row.email || '',
    leadSource: row.lead_source || '',
    leadSourceNotes: row.lead_source_notes || '',
    status: row.status || 'fresh',
    leadTemperature: row.lead_temp || '',
    notes: row.notes || '',
    lastCalled: array(row.call_history).at(-1)?.date || null,
    callbackDate: row.callback_date || null,
    nextActionType: row.next_action_type || '',
    nextActionDate: row.next_action_date || '',
    nextActionNote: row.next_action_note || '',
    ownedProperties: [...embeddedProperties, ...linkedProperties.map(property => compactObject({
      facilityName: property.facility_name,
      address: property.address,
      city: property.city,
      state: property.state,
      market: property.market,
      propertyType: property.property_type,
    }))],
    listName: context.lists.get(row.list_id)?.name || '',
    ownershipGroupId: row.ownership_group_id || null,
    actionLog: array(row.action_log),
    callHistory: array(row.call_history),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeClient(row, context) {
  const group = context.groups.get(row.ownership_group_id);
  const linkedContact = context.contacts.get(row.contact_id);
  const linkedProperties = context.propertiesByGroup.get(row.ownership_group_id) ?? [];
  const city = linkedContact?.city || '';
  const state = linkedContact?.state || '';
  return {
    recordType: 'client',
    id: row.id,
    contactId: row.contact_id || null,
    name: row.name || group?.display_name || '',
    ownerEntity: group?.owner_entity || '',
    relationshipType: row.type || group?.relationship_type || '',
    facilityName: row.facility_name || linkedContact?.facility_name || '',
    facilityAddress: row.address || linkedContact?.address || '',
    mailingAddress: row.mailing_address || linkedContact?.mailing_address || '',
    mailingAddresses: array(row.mailing_addresses),
    city,
    state,
    market: addressMarket({ city, state }),
    phone: row.phone || linkedContact?.phone || '',
    email: row.email || linkedContact?.email || '',
    leadSource: row.lead_source || linkedContact?.lead_source || '',
    status: PIPELINE_STAGES[row.stage_id] || `Stage ${row.stage_id || 1}`,
    pipelineStage: PIPELINE_STAGES[row.stage_id] || `Stage ${row.stage_id || 1}`,
    pipelineStageId: row.stage_id || 1,
    leadTemperature: row.lead_temp || '',
    propertyType: row.property_type || '',
    storageClass: row.storage_class || '',
    units: row.units ?? null,
    sqft: row.sqft ?? null,
    desiredSalePrice: row.desired_sale_price ?? null,
    projectedCommissionPct: row.projected_commission_pct ?? null,
    notes: row.notes || '',
    nextActionType: row.next_action_type || '',
    nextActionDate: row.next_action_date || '',
    nextActionNote: row.next_action_note || '',
    ownedProperties: linkedProperties.map(property => compactObject({
      facilityName: property.facility_name,
      address: property.address,
      city: property.city,
      state: property.state,
      market: property.market,
      propertyType: property.property_type,
    })),
    ownershipGroupId: row.ownership_group_id || null,
    actionLog: array(row.action_log),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeProperty(row, context) {
  const group = context.groups.get(row.ownership_group_id);
  return {
    recordType: 'property',
    id: row.id,
    name: group?.display_name || row.facility_name || '',
    ownerEntity: group?.owner_entity || '',
    relationshipType: group?.relationship_type || '',
    facilityName: row.facility_name || '',
    facilityAddress: row.address || '',
    city: row.city || '',
    state: row.state || '',
    market: addressMarket(row),
    propertyType: row.property_type || '',
    source: row.source || '',
    notes: row.notes || '',
    ownershipGroupId: row.ownership_group_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeTask(row) {
  return {
    recordType: 'task',
    id: row.id,
    name: row.related_name || '',
    title: row.title || row.text || 'Untitled task',
    description: row.description || '',
    status: row.status || (row.done ? 'completed' : 'open'),
    priority: row.priority || 'normal',
    taskType: row.task_type || 'general',
    dueDate: row.due_date || null,
    completedAt: row.completed_at || null,
    relatedType: row.related_type || 'general',
    relatedId: row.related_id || null,
    source: row.source || 'dashboard',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || row.created_at || null,
  };
}

function normalizeMeeting(row, context) {
  const client = context.clients.get(row.client_id);
  return {
    recordType: 'meeting',
    id: row.id,
    name: client?.name || '',
    title: row.title || 'Untitled meeting',
    date: row.date || null,
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    location: row.location || '',
    notes: row.notes || '',
    relatedType: client ? 'client' : 'general',
    relatedId: client?.id || null,
    facilityName: client?.facility_name || '',
    createdAt: row.created_at || null,
  };
}

async function fetchAll(client, table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await client.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

export async function loadCrmSnapshot(client) {
  if (!client) throw new Error('CRM database connection is not configured.');
  const [contacts, clients, properties, groups, lists, tasks, meetings] = await Promise.all([
    fetchAll(client, 'contacts'),
    fetchAll(client, 'clients'),
    fetchAll(client, 'properties'),
    fetchAll(client, 'ownership_groups'),
    fetchAll(client, 'lists'),
    fetchAll(client, 'tasks'),
    fetchAll(client, 'meetings'),
  ]);
  const context = {
    lists: new Map(lists.map(row => [row.id, row])),
    groups: new Map(groups.map(row => [row.id, row])),
    contacts: new Map(contacts.map(row => [row.id, row])),
    clients: new Map(clients.map(row => [row.id, row])),
    propertiesByGroup: new Map(),
  };
  properties.forEach(property => {
    if (!property.ownership_group_id) return;
    if (!context.propertiesByGroup.has(property.ownership_group_id)) context.propertiesByGroup.set(property.ownership_group_id, []);
    context.propertiesByGroup.get(property.ownership_group_id).push(property);
  });
  return {
    records: [
      ...contacts.map(row => normalizeContact(row, context)),
      ...clients.map(row => normalizeClient(row, context)),
      ...properties.map(row => normalizeProperty(row, context)),
      ...tasks.map(normalizeTask),
      ...meetings.map(row => normalizeMeeting(row, context)),
    ],
    counts: {
      contacts: contacts.length,
      clients: clients.length,
      properties: properties.length,
      ownershipGroups: groups.length,
      lists: lists.length,
      tasks: tasks.length,
      meetings: meetings.length,
    },
  };
}

function recordMatches(record, input) {
  const types = array(input.recordTypes).length ? input.recordTypes : CRM_RECORD_TYPES;
  if (!types.includes(record.recordType)) return false;
  if (input.state && lower(record.state) !== lower(input.state)) return false;
  if (input.market && !lower(record.market).includes(lower(input.market))) return false;
  if (input.status && !lower(record.status).includes(lower(input.status))) return false;
  if (input.relationshipType && !lower(record.relationshipType).includes(lower(input.relationshipType))) return false;
  if (input.leadSource && !lower(record.leadSource).includes(lower(input.leadSource))) return false;
  if (input.pipelineStage && !lower(`${record.pipelineStageId ?? ''} ${record.pipelineStage ?? ''}`).includes(lower(input.pipelineStage))) return false;
  if (input.leadTemperature && lower(record.leadTemperature) !== lower(input.leadTemperature)) return false;
  if (input.hasEmail === true && !text(record.email)) return false;
  if (input.hasEmail === false && text(record.email)) return false;
  if (input.hasPhone === true && !text(record.phone)) return false;
  if (input.hasPhone === false && text(record.phone)) return false;
  const terms = lower(input.query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = lower(flattenText(record));
  return terms.every(term => haystack.includes(term));
}

function matchingSnippets(record, query) {
  const terms = lower(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const candidates = [
    record.notes,
    record.leadSourceNotes,
    ...array(record.actionLog).map(item => item.note || item.notes || item.title || ''),
    ...array(record.callHistory).map(item => item.notes || item.note || ''),
  ].map(text).filter(Boolean);
  return candidates
    .filter(candidate => terms.some(term => lower(candidate).includes(term)))
    .slice(0, 3)
    .map(candidate => candidate.slice(0, 280));
}

function searchProjection(record, query) {
  return compactObject({
    recordType: record.recordType,
    id: record.id,
    name: record.name,
    title: record.title,
    facilityName: record.facilityName,
    facilityAddress: record.facilityAddress,
    market: record.market,
    state: record.state,
    phone: record.phone,
    email: record.email,
    relationshipType: record.relationshipType,
    status: record.status,
    pipelineStage: record.pipelineStage,
    leadTemperature: record.leadTemperature,
    dueDate: record.dueDate,
    date: record.date,
    listName: record.listName,
    matchingSnippets: matchingSnippets(record, query),
  });
}

export function searchCrm(snapshot, input = {}) {
  const limit = boundedInt(input.limit, 25, 100);
  const matches = snapshot.records.filter(record => recordMatches(record, input));
  return {
    totalMatches: matches.length,
    returned: Math.min(matches.length, limit),
    limited: matches.length > limit,
    results: matches.slice(0, limit).map(record => searchProjection(record, input.query)),
  };
}

function activitiesForRecord(record) {
  const activities = [];
  array(record.actionLog).forEach((entry, index) => {
    activities.push({
      key: entry.eventId || `${record.recordType}:${record.id}:action:${index}`,
      recordType: record.recordType,
      recordId: record.id,
      name: record.name,
      facilityName: record.facilityName,
      type: entry.type || 'activity',
      date: entry.date || String(entry.at || '').slice(0, 10),
      at: entry.at || null,
      note: entry.note || entry.notes || '',
      source: 'action_log',
    });
  });
  array(record.callHistory).forEach((entry, index) => {
    const signature = `${entry.outcome || 'call'}|${entry.date || ''}|${lower(entry.notes)}`;
    if (activities.some(item => `${item.type}|${item.date || ''}|${lower(item.note)}` === signature)) return;
    activities.push({
      key: `${record.recordType}:${record.id}:call:${index}`,
      recordType: record.recordType,
      recordId: record.id,
      name: record.name,
      facilityName: record.facilityName,
      type: entry.outcome || 'call',
      date: entry.date || null,
      at: null,
      note: entry.notes || '',
      source: 'call_history',
    });
  });
  return activities;
}

function canonicalActivityType(value) {
  const normalized = lower(value).replace(/[\s-]+/g, '_');
  if (['left_vm', 'left_voicemail', 'vm', 'voicemail'].includes(normalized)) return 'voicemail';
  if (['conversation', 'connected', 'owner_reached', 'reached'].includes(normalized)) return 'conversation';
  if (['call_back', 'callback'].includes(normalized)) return 'callback';
  if (['appt_set', 'appointment', 'meeting_set'].includes(normalized)) return 'appointment';
  if (normalized.includes('email')) return 'email';
  if (normalized.includes('call')) return 'call';
  return normalized;
}

export function searchCrmActivity(snapshot, input = {}) {
  const limit = boundedInt(input.limit, 30, 150);
  const types = array(input.recordTypes).length ? input.recordTypes : ['contact', 'client'];
  const activityTypes = array(input.activityTypes).map(canonicalActivityType);
  const terms = lower(input.query).split(/\s+/).filter(Boolean);
  const activities = snapshot.records
    .filter(record => types.includes(record.recordType))
    .flatMap(activitiesForRecord)
    .filter(activity => {
      if (activityTypes.length && !activityTypes.includes(canonicalActivityType(activity.type))) return false;
      if (input.dateFrom && activity.date && activity.date < input.dateFrom) return false;
      if (input.dateTo && activity.date && activity.date > input.dateTo) return false;
      if (input.name && !lower(`${activity.name} ${activity.facilityName}`).includes(lower(input.name))) return false;
      const haystack = lower(flattenText(activity));
      return terms.every(term => haystack.includes(term));
    })
    .sort((a, b) => `${b.date || ''}${b.at || ''}`.localeCompare(`${a.date || ''}${a.at || ''}`));
  return {
    totalMatches: activities.length,
    returned: Math.min(activities.length, limit),
    limited: activities.length > limit,
    activities: activities.slice(0, limit),
  };
}

export function getCrmRecord(snapshot, input = {}) {
  const record = snapshot.records.find(item =>
    item.recordType === input.recordType && String(item.id) === String(input.id));
  if (!record) return { found: false, error: 'Record not found.' };
  return {
    found: true,
    record: compactObject({
      ...record,
      activities: activitiesForRecord(record)
        .sort((a, b) => `${b.date || ''}${b.at || ''}`.localeCompare(`${a.date || ''}${a.at || ''}`))
        .slice(0, 100),
      actionLog: undefined,
      callHistory: undefined,
    }),
  };
}

function tally(records, key) {
  const counts = {};
  records.forEach(record => {
    const label = text(record[key]) || 'Not specified';
    counts[label] = (counts[label] ?? 0) + 1;
  });
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

export function summarizeCrm(snapshot) {
  const contacts = snapshot.records.filter(record => record.recordType === 'contact');
  const clients = snapshot.records.filter(record => record.recordType === 'client');
  const tasks = snapshot.records.filter(record => record.recordType === 'task');
  const meetings = snapshot.records.filter(record => record.recordType === 'meeting');
  return {
    counts: snapshot.counts,
    contacts: {
      withEmail: contacts.filter(record => record.email).length,
      withPhone: contacts.filter(record => record.phone).length,
      byStatus: tally(contacts, 'status'),
      byRelationshipType: tally(contacts, 'relationshipType'),
      byState: tally(contacts, 'state'),
      byList: tally(contacts, 'listName'),
    },
    clients: {
      byPipelineStage: tally(clients, 'pipelineStage'),
      byType: tally(clients, 'relationshipType'),
      byLeadTemperature: tally(clients, 'leadTemperature'),
    },
    tasks: {
      open: tasks.filter(record => record.status === 'open').length,
      completed: tasks.filter(record => record.status === 'completed').length,
      overdue: tasks.filter(record => record.status === 'open' && record.dueDate && record.dueDate < new Date().toISOString().slice(0, 10)).length,
    },
    meetings: {
      upcoming: meetings.filter(record => record.date && record.date >= new Date().toISOString().slice(0, 10)).length,
    },
  };
}

function spreadsheetValue(value) {
  if (Array.isArray(value)) return value.map(item =>
    typeof item === 'object' ? Object.values(compactObject(item)).join(' | ') : text(item)).join('; ');
  if (value && typeof value === 'object') return flattenText(value);
  const scalar = value ?? '';
  if (typeof scalar === 'string' && /^[=+\-@]/.test(scalar)) return `'${scalar}`;
  return scalar;
}

function safeFilename(value) {
  return (text(value) || 'CRM Export')
    .split('')
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'CRM Export';
}

export function buildCrmExport(snapshot, input = {}) {
  const requestedColumns = array(input.columns).filter(column => CRM_EXPORT_COLUMNS.includes(column));
  const columns = requestedColumns.length
    ? requestedColumns
    : ['name', 'email', 'phone', 'facilityName', 'facilityAddress', 'mailingAddress', 'market', 'status', 'notes'];
  const filterInput = {
    ...input,
    recordTypes: array(input.recordTypes).length ? input.recordTypes : ['contact', 'client'],
  };
  const maxRows = boundedInt(input.maxRows, 750, 1000);
  let records = snapshot.records.filter(record => recordMatches(record, filterInput));
  if (input.deduplicate !== false) {
    const seen = new Set();
    records = records.filter(record => {
      const key = lower(record.email)
        || lower(record.phone).replace(/\D/g, '')
        || `${lower(record.name)}|${lower(record.facilityName)}`;
      if (!key || seen.has(key)) return !key;
      seen.add(key);
      return true;
    });
  }
  const limited = records.length > maxRows;
  records = records.slice(0, maxRows);
  const title = safeFilename(input.title);
  return {
    title,
    filename: `${title}.xlsx`,
    sheetName: safeFilename(input.sheetName || 'CRM Data').slice(0, 31),
    totalMatches: limited ? snapshot.records.filter(record => recordMatches(record, filterInput)).length : records.length,
    rowCount: records.length,
    limited,
    columns: columns.map(key => ({ key, label: EXPORT_LABELS[key] || key })),
    rows: records.map(record => Object.fromEntries(columns.map(column => [
      column,
      spreadsheetValue(record[column]),
    ]))),
  };
}
