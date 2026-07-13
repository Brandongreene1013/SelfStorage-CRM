import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { buildMergePlan } from '../lib/duplicateReview';
import { buildSameOwnerMergePlan } from '../lib/ownerRadar';
import { normalizeMailingAddresses } from '../lib/mailingAddresses';
import { DEFAULT_RELATIONSHIP_TYPE, RELATIONSHIP_TYPES } from '../data/constants';

const US_STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'Washington DC',
};

export { US_STATES };

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const msg = error.message ?? '';
  return error.code === '42703'
    || error.code === 'PGRST204'
    || new RegExp(`column .*${columnName}.* does not exist|could not find .*${columnName}.* column`, 'i').test(msg);
}

export function extractStateAndMarket(address) {
  if (!address) return { state: '', market: '' };
  const stateAbbrRegex = /\b([A-Z]{2})\b(?:\s*\d{5})?/g;
  let match;
  while ((match = stateAbbrRegex.exec(address)) !== null) {
    if (US_STATES[match[1]]) {
      const state = match[1];
      const parts = address.split(',').map(s => s.trim());
      let city = '';
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes(state)) {
          city = i > 0 ? parts[i - 1] : '';
          break;
        }
      }
      return { state, market: city ? `${city}, ${state}` : state };
    }
  }
  for (const [abbr, name] of Object.entries(US_STATES)) {
    if (address.toLowerCase().includes(name.toLowerCase())) {
      const parts = address.split(',').map(s => s.trim());
      const stateIdx = parts.findIndex(p => p.toLowerCase().includes(name.toLowerCase()));
      const city = stateIdx > 0 ? parts[stateIdx - 1] : '';
      return { state: abbr, market: city ? `${city}, ${abbr}` : abbr };
    }
  }
  return { state: '', market: '' };
}

// RFC-4180-ish tokenizer: handles quoted fields with embedded delimiters and
// newlines (Excel multi-line cells), plus "" escaped quotes. Returns rows of fields.
function tokenizeDelimited(text, delimiter) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\r') {
      // ignore; handled by \n
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export const IMPORT_FIELD_OPTIONS = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'ownerName', label: 'Owner / Contact Name' },
  { value: 'ownerEntity', label: 'Owner Entity / Company' },
  { value: 'facilityName', label: 'Facility / Property Name' },
  { value: 'relationshipType', label: 'Relationship Type' },
  { value: 'leadSource', label: 'Lead / Relationship Source' },
  { value: 'primaryPhone', label: 'Primary Phone' },
  { value: 'additionalPhone', label: 'Additional Phone' },
  { value: 'email', label: 'Email' },
  { value: 'address', label: 'Property Address' },
  { value: 'mailingAddress', label: 'Mailing Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'zip', label: 'Zip' },
  { value: 'source', label: 'Source' },
  { value: 'notes', label: 'Notes' },
  { value: 'nextAction', label: 'Next Action' },
];

const IMPORTANT_IMPORT_FIELDS = [
  { field: 'facilityName', label: 'facility/property name' },
  { field: 'address', label: 'property address' },
];

function normalizedHeader(header) {
  return (header ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function compactHeader(header) {
  return normalizedHeader(header).replace(/\s+/g, '');
}

function headerMatches(header, aliases) {
  const normalized = normalizedHeader(header);
  const compact = compactHeader(header);
  return aliases.some(alias => {
    const a = normalizedHeader(alias);
    const ac = compactHeader(alias);
    return normalized === a || compact === ac;
  });
}

function headerIncludes(header, words) {
  const normalized = normalizedHeader(header);
  return words.some(word => normalized.includes(word));
}

function detectFieldForHeader(header) {
  if (headerMatches(header, [
    'owner', 'owner name', 'contact', 'contact name', 'property owner', 'mailing name',
    'taxpayer', 'grantee', 'buyer', 'seller', 'full name', 'primary contact',
  ])) return 'ownerName';
  if (headerMatches(header, [
    'owner entity', 'ownership entity', 'owning entity', 'legal owner', 'owner llc',
    'business entity', 'holding company', 'ownership group',
  ])) return 'ownerEntity';
  if (headerMatches(header, [
    'facility', 'facility name', 'property', 'property name', 'asset name',
    'location name', 'site name', 'business name', 'storage name', 'self storage',
    'name', 'company', 'company name', 'entity name', 'location', 'place name',
    'asset', 'asset project', 'project', 'project name', 'facility project',
    'asset name project name', 'asset property', 'property project',
  ])) return 'facilityName';
  if (headerMatches(header, [
    'phone 2', 'phone2', 'alternate phone', 'secondary phone', 'mobile phone',
    'office phone', 'manager phone', 'owner phone 2', 'contact phone 2',
    'alt phone', 'alt number', 'alternate number', 'secondary number',
  ])) return 'additionalPhone';
  if (headerMatches(header, [
    'phone', 'phone number', 'primary phone', 'owner phone', 'contact phone',
    'mobile', 'cell', 'telephone', 'tel', 'number',
  ])) return 'primaryPhone';
  if (headerMatches(header, ['email', 'email address', 'owner email', 'contact email', 'e mail'])) return 'email';
  if (headerMatches(header, [
    'address', 'property address', 'site address', 'street address',
    'facility address', 'location address', 'situs address', 'physical address',
    'property location', 'location', 'full address', 'formatted address',
    'premise address', 'premises address', 'parcel address', 'address area',
    'area address', 'address location', 'location area',
  ])) return 'address';
  if (headerMatches(header, ['mailing address', 'owner address', 'tax mailing address', 'mailing street', 'taxpayer address'])) return 'mailingAddress';
  if (headerMatches(header, ['city', 'property city', 'mailing city', 'town'])) return 'city';
  if (headerMatches(header, ['state', 'property state', 'mailing state', 'st'])) return 'state';
  if (headerMatches(header, ['zip', 'zipcode', 'zip code', 'postal code'])) return 'zip';
  if (headerMatches(header, ['source', 'data source', 'platform'])) return 'source';
  if (headerMatches(header, [
    'lead source', 'relationship source', 'found from', 'origin', 'contact source',
    'person source', 'relationship origin',
  ])) return 'leadSource';
  if (headerMatches(header, ['relationship type', 'contact type', 'record type', 'category', 'role'])) return 'relationshipType';
  if (headerMatches(header, ['notes', 'comments', 'remarks', 'description', 'details'])) return 'notes';
  if (headerIncludes(header, ['next action', 'follow up', 'follow-up'])) return 'nextAction';
  if (headerIncludes(header, ['conversation', 'spoke', 'talked'])) return 'notes';
  if (headerIncludes(header, ['message', 'voicemail', 'vm'])) return 'notes';
  return 'ignore';
}

function buildDetectedMappings(headers) {
  const mappings = headers.map((header, index) => ({ index, header, field: detectFieldForHeader(header) }));
  const primaryPhoneIndexes = mappings.filter(m => m.field === 'primaryPhone').map(m => m.index);
  if (primaryPhoneIndexes.length > 1) {
    primaryPhoneIndexes.slice(1).forEach(idx => { mappings[idx].field = 'additionalPhone'; });
  }
  return mappings;
}

function looksLikeAddress(value = '') {
  const text = String(value).trim();
  if (!text) return false;
  return /\d/.test(text) && (
    /\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|blvd|boulevard|hwy|highway|fm|county road|cr)\b/i.test(text)
    || /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/.test(text)
  );
}

function maybeHeaderlessFacilityAddress(rows) {
  const dataRows = rows.filter(row => row.some(cell => String(cell ?? '').trim()));
  if (!dataRows.length) return null;
  const sample = dataRows.slice(0, Math.min(dataRows.length, 8));
  const width = Math.max(...sample.map(row => row.length));
  if (width < 2) return null;

  const addressScores = Array.from({ length: width }, (_, index) =>
    sample.filter(row => looksLikeAddress(row[index])).length
  );
  const addressIndex = addressScores.indexOf(Math.max(...addressScores));
  if (addressScores[addressIndex] === 0) return null;

  const facilityIndex = Array.from({ length: width }, (_, index) => index)
    .filter(index => index !== addressIndex)
    .sort((a, b) => {
      const score = (idx) => sample.filter(row => String(row[idx] ?? '').trim() && !looksLikeAddress(row[idx])).length;
      return score(b) - score(a);
    })[0];
  if (facilityIndex == null) return null;

  const headers = Array.from({ length: width }, (_, index) => {
    if (index === facilityIndex) return 'Facility Name';
    if (index === addressIndex) return 'Property Address';
    return `Column ${index + 1}`;
  });
  return {
    headers,
    mappings: headers.map((header, index) => ({
      index,
      header,
      field: index === facilityIndex ? 'facilityName' : index === addressIndex ? 'address' : 'ignore',
    })),
    dataRows,
  };
}

function mappingsToFieldMap(headers, mappings) {
  const fieldMap = { additionalPhones: [] };
  mappings.forEach((mapping, idx) => {
    const field = mapping?.field ?? 'ignore';
    if (field === 'ignore') return;
    if (field === 'additionalPhone') {
      fieldMap.additionalPhones.push(idx);
    } else if (field === 'primaryPhone') {
      if (fieldMap.phone == null) fieldMap.phone = idx;
      else fieldMap.additionalPhones.push(idx);
    } else if (fieldMap[field] == null) {
      fieldMap[field] = idx;
    }
  });

  if (fieldMap.ownerName == null) {
    const firstNameIdx = headers.findIndex(h => /^first\s*name$|^first$/i.test(normalizedHeader(h)));
    const lastNameIdx = headers.findIndex(h => /^last\s*name$|^last$/i.test(normalizedHeader(h)));
    if (firstNameIdx >= 0) {
      fieldMap._firstNameIdx = firstNameIdx;
      fieldMap._lastNameIdx = lastNameIdx >= 0 ? lastNameIdx : null;
    }
  }
  return fieldMap;
}

function normalizeRelationshipType(value) {
  const raw = (value ?? '').trim();
  if (!raw) return DEFAULT_RELATIONSHIP_TYPE;
  const normalized = raw.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const compact = normalized.replace(/\s+/g, '_');
  const direct = RELATIONSHIP_TYPES.find(t =>
    t.value === raw || t.value === compact || t.label.toLowerCase() === raw.toLowerCase()
  );
  if (direct) return direct.value;
  if (/seller|owner|storage/.test(normalized)) return 'storage_owner_seller';
  if (/buyer|acquisition/.test(normalized)) return 'buyer';
  if (/institution|reit|private equity|fund/.test(normalized)) return 'institution';
  if (/developer|development/.test(normalized)) return 'developer';
  if (/broker|agent/.test(normalized)) return 'broker';
  if (/vendor|contractor|supplier/.test(normalized)) return 'vendor';
  if (/lender|bank|debt|finance/.test(normalized)) return 'lender';
  if (/attorney|lawyer|consultant|advisor|cpa|accountant/.test(normalized)) return 'attorney_consultant';
  return 'other';
}

function normalizePhoneReadable(phone) {
  const raw = (phone ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

function phoneKey(phone) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

function inferPhoneLabel(header) {
  const h = normalizedHeader(header);
  if (/\bmobile\b|\bcell\b/.test(h)) return 'Mobile';
  if (/\boffice\b|\bwork\b|\bbusiness\b/.test(h)) return 'Office';
  if (/\bmanager\b|\bmgmt\b/.test(h)) return 'Manager';
  if (/\bowner\b|\bcontact\b/.test(h)) return 'Owner';
  return 'Unknown';
}

function normalizeNameKey(value) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeAddressKey(value) {
  return normalizeNameKey(value).replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/g, '');
}

function collectPhoneKeys(contact) {
  const keys = [];
  const primary = phoneKey(contact.phone);
  if (primary) keys.push(primary);
  (contact.alternatePhones ?? []).forEach(p => {
    const key = phoneKey(p?.phone);
    if (key) keys.push(key);
  });
  return keys;
}

function sourceLabel(source, filename) {
  if (source?.trim()) return source.trim();
  if (filename?.trim()) return filename.replace(/\.[^.]+$/, '').trim();
  return 'Manual / Unknown';
}

function primaryCityName(city = '') {
  return String(city).split('/')[0].trim();
}

function addressHasCity(address = '', city = '') {
  const cityName = primaryCityName(city);
  if (!cityName) return true;
  return normalizeNameKey(address).includes(normalizeNameKey(cityName));
}

function importMetadata(options = {}) {
  return {
    source: sourceLabel(options.source, options.fileName),
    fileName: options.fileName ?? '',
    importedAt: new Date().toISOString(),
  };
}

export function getImportMappingWarnings(mappings = []) {
  return IMPORTANT_IMPORT_FIELDS
    .filter(({ field }) => !mappings.some(m => m.field === field || (field === 'primaryPhone' && m.field === 'additionalPhone')))
    .map(({ label }) => label);
}

export function buildImportDuplicateIndex(existingContacts = []) {
  const phone = new Map();
  const email = new Map();
  const ownerAddress = new Map();
  const facilityMarket = new Map();

  existingContacts.forEach(contact => {
    collectPhoneKeys(contact).forEach(key => {
      if (!phone.has(key)) phone.set(key, []);
      phone.get(key).push(contact);
    });
    const emailKey = (contact.email ?? '').trim().toLowerCase();
    if (emailKey) {
      if (!email.has(emailKey)) email.set(emailKey, []);
      email.get(emailKey).push(contact);
    }
    const ownerKey = normalizeNameKey(contact.ownerName);
    const addressKey = normalizeAddressKey(contact.address);
    if (ownerKey && addressKey) {
      const key = `${ownerKey}|${addressKey}`;
      if (!ownerAddress.has(key)) ownerAddress.set(key, []);
      ownerAddress.get(key).push(contact);
    }
    const facilityKey = normalizeNameKey(contact.facilityName);
    const marketKey = normalizeNameKey(contact.market || [contact.city, contact.state].filter(Boolean).join(' '));
    if (facilityKey && marketKey) {
      const key = `${facilityKey}|${marketKey}`;
      if (!facilityMarket.has(key)) facilityMarket.set(key, []);
      facilityMarket.get(key).push(contact);
    }
  });

  return { phone, email, ownerAddress, facilityMarket };
}

function findImportDuplicates(contact, duplicateIndex) {
  if (!duplicateIndex) return { reasons: [], matches: [] };
  const reasons = new Set();
  const matches = new Map();

  function addMatches(reason, list = []) {
    if (!list.length) return;
    reasons.add(reason);
    list.forEach(existing => {
      if (!matches.has(existing.id)) {
        matches.set(existing.id, {
          id: existing.id,
          name: existing.ownerName || existing.facilityName || 'Existing contact',
          facilityName: existing.facilityName || '',
          reasons: [],
        });
      }
      const match = matches.get(existing.id);
      if (!match.reasons.includes(reason)) match.reasons.push(reason);
    });
  }

  collectPhoneKeys(contact).forEach(key => {
    addMatches('Phone already exists', duplicateIndex.phone.get(key) ?? []);
  });
  const emailKey = (contact.email ?? '').trim().toLowerCase();
  if (emailKey) addMatches('Email already exists', duplicateIndex.email.get(emailKey) ?? []);
  const ownerKey = normalizeNameKey(contact.ownerName);
  const addressKey = normalizeAddressKey(contact.address);
  if (ownerKey && addressKey) {
    addMatches('Same owner + address', duplicateIndex.ownerAddress.get(`${ownerKey}|${addressKey}`) ?? []);
  }
  const facilityKey = normalizeNameKey(contact.facilityName);
  const marketKey = normalizeNameKey(contact.market || contact.state);
  if (facilityKey && marketKey) {
    addMatches('Same facility + market', duplicateIndex.facilityMarket.get(`${facilityKey}|${marketKey}`) ?? []);
  }
  return { reasons: [...reasons], matches: [...matches.values()] };
}

function getImportFlags(contact, duplicateReasons = []) {
  const flags = [];
  if (!contact.phone && !contact.alternatePhones?.length) flags.push('Missing phone');
  if (!contact.ownerName) flags.push('Missing owner name');
  if (!contact.facilityName) flags.push('Missing property/facility name');
  if (!contact.address) flags.push('Missing property address');
  if (duplicateReasons.length) flags.push('Possible duplicate');
  if (contact.alternatePhones?.length) flags.push('Multiple phones found');
  if (contact.ownerName && (contact.phone || contact.alternatePhones?.length) && (contact.facilityName || contact.address)) {
    flags.push('Ready to call');
  }
  if (!flags.includes('Ready to call') && (contact.facilityName || contact.address)) {
    flags.push('Ready to work');
  }
  return flags;
}

function looksLikeFacilityName(value = '') {
  const text = String(value).toLowerCase();
  return /\b(storage|self storage|rv|boat|mini storage|vehicle storage|covered|canopy|u-haul|locker|warehouse)\b/.test(text);
}

function summarizeImportRows(rows) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.flags.includes('Ready to call') || row.flags.includes('Ready to work')) acc.readyToCall += 1;
    if (row.flags.includes('Missing phone')) acc.missingPhone += 1;
    if (row.flags.includes('Missing owner name')) acc.missingOwner += 1;
    if (row.flags.includes('Missing property/facility name')) acc.missingFacility += 1;
    if (row.flags.includes('Missing property address')) acc.missingAddress += 1;
    if (row.flags.includes('Possible duplicate')) acc.possibleDuplicates += 1;
    if (row.flags.includes('Multiple phones found')) acc.multiplePhoneRecords += 1;
    acc.additionalPhones += row.contact.alternatePhones?.length ?? 0;
    return acc;
  }, {
    total: 0,
    readyToCall: 0,
    missingPhone: 0,
    missingOwner: 0,
    missingFacility: 0,
    missingAddress: 0,
    possibleDuplicates: 0,
    multiplePhoneRecords: 0,
    additionalPhones: 0,
  });
}

function selectImportRows(rawText, options) {
  const parsed = options?.rows
    ? { rows: options.rows, contacts: options.rows.map(row => row.contact), summary: summarizeImportRows(options.rows) }
    : parseImportData(rawText, { mappings: options?.mappings, existingContacts: options?.existingContacts });
  const duplicateMode = options?.duplicateMode ?? 'import';
  const rows = duplicateMode === 'skip'
    ? parsed.rows.filter(row => !row.flags.includes('Possible duplicate'))
    : duplicateMode === 'append'
      ? parsed.rows.filter(row => !row.flags.includes('Possible duplicate'))
    : parsed.rows;
  const duplicateRows = parsed.rows.filter(row => row.flags.includes('Possible duplicate'));
  return {
    rows,
    contacts: rows.map(row => row.contact),
    duplicateRows,
    skippedDuplicates: parsed.rows.length - rows.length,
    originalSummary: parsed.summary,
    importedAdditionalPhones: rows.reduce((sum, row) => sum + (row.contact.alternatePhones?.length ?? 0), 0),
  };
}

function contactInsertRow(listId, c, meta = {}) {
  return {
    list_id: listId,
    owner_name: c.ownerName,
    owner_entity: c.ownerEntity ?? '',
    facility_name: c.facilityName,
    relationship_type: c.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE,
    lead_source: c.leadSource ?? '',
    ownership_group_id: c.ownershipGroupId ?? null,
    phone: c.phone,
    alternate_phones: c.alternatePhones ?? [],
    email: c.email,
    address: c.address,
    mailing_address: c.mailingAddress ?? '',
    mailing_addresses: normalizeMailingAddresses(c.mailingAddresses),
    state: c.state,
    notes: c.notes ?? '',
    status: 'fresh',
    call_history: [],
    next_action_type: c.nextActionType ?? '',
    next_action_date: c.nextActionDate ?? '',
    next_action_note: c.nextActionNote ?? '',
    source: meta.source ?? c.importSource ?? '',
    import_filename: meta.fileName ?? '',
    imported_at: meta.importedAt ?? null,
  };
}

function stripContactSourceColumns(row) {
  const { source: _source, import_filename: _importFilename, imported_at: _importedAt, ...rest } = row;
  return rest;
}

function stripContactExpansionColumns(row) {
  const { owner_entity: _ownerEntity, relationship_type: _relationshipType, ...rest } = row;
  return rest;
}

function stripContactSprint18Columns(row) {
  const { lead_source: _leadSource, ownership_group_id: _ownershipGroupId, ...rest } = row;
  return rest;
}

function stripContactMailingAddressColumn(row) {
  const { mailing_address: _mailingAddress, mailing_addresses: _mailingAddresses, ...rest } = row;
  return rest;
}

function stripContactMailingAddressesColumn(row) {
  const { mailing_addresses: _mailingAddresses, ...rest } = row;
  return rest;
}

function stripContactOwnedPropertiesColumn(row) {
  const { owned_properties: _ownedProperties, ...rest } = row;
  return rest;
}

function mergeCallHistories(existing = [], incoming = []) {
  const merged = [...existing];
  const seen = new Set(merged.map(h => `${h.date ?? ''}|${h.outcome ?? ''}|${h.notes ?? ''}`));
  incoming.forEach(h => {
    const key = `${h.date ?? ''}|${h.outcome ?? ''}|${h.notes ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(h);
    }
  });
  return merged;
}

function stripListMetaColumns(row) {
  const {
    import_filename: _importFilename,
    import_row_count: _importRowCount,
    ready_to_call_count: _readyToCallCount,
    duplicate_skipped_count: _duplicateSkippedCount,
    merged_duplicate_count: _mergedDuplicateCount,
    additional_phone_count: _additionalPhoneCount,
    ...rest
  } = row;
  return rest;
}

function hasPhone(contact, phone) {
  const key = phoneKey(phone);
  if (!key) return true;
  return collectPhoneKeys(contact).includes(key);
}

function mergeImportedContact(existing, incoming, meta) {
  const updates = {};
  const nextAlt = Array.isArray(existing.alternatePhones) ? [...existing.alternatePhones] : [];
  let addedPhones = 0;

  if (!existing.phone && incoming.phone) {
    updates.phone = incoming.phone;
  } else if (incoming.phone && !hasPhone(existing, incoming.phone)) {
    nextAlt.push({ label: 'Unknown', phone: incoming.phone });
    addedPhones += 1;
  }

  (incoming.alternatePhones ?? []).forEach(phone => {
    if (!hasPhone({ ...existing, alternatePhones: nextAlt }, phone.phone)) {
      nextAlt.push(phone);
      addedPhones += 1;
    }
  });

  if (nextAlt.length !== (existing.alternatePhones?.length ?? 0)) updates.alternatePhones = nextAlt;
  if (!existing.ownerName && incoming.ownerName) updates.ownerName = incoming.ownerName;
  if (!existing.ownerEntity && incoming.ownerEntity) updates.ownerEntity = incoming.ownerEntity;
  if (!existing.facilityName && incoming.facilityName) updates.facilityName = incoming.facilityName;
  if (
    (!existing.relationshipType || existing.relationshipType === DEFAULT_RELATIONSHIP_TYPE) &&
    incoming.relationshipType &&
    incoming.relationshipType !== DEFAULT_RELATIONSHIP_TYPE
  ) updates.relationshipType = incoming.relationshipType;
  if (!existing.leadSource && incoming.leadSource) updates.leadSource = incoming.leadSource;
  if (!existing.email && incoming.email) updates.email = incoming.email;
  if (!existing.address && incoming.address) updates.address = incoming.address;
  if (!existing.mailingAddress && incoming.mailingAddress) updates.mailingAddress = incoming.mailingAddress;
  if (!existing.mailingAddresses?.length && incoming.mailingAddresses?.length) updates.mailingAddresses = incoming.mailingAddresses;
  if (!existing.state && incoming.state) updates.state = incoming.state;
  if (!existing.source && meta.source) updates.source = meta.source;
  if (!existing.importFilename && meta.fileName) updates.importFilename = meta.fileName;
  if (!existing.importedAt && meta.importedAt) updates.importedAt = meta.importedAt;

  const noteParts = [];
  if (incoming.notes && !((existing.notes ?? '').includes(incoming.notes))) noteParts.push(incoming.notes);
  if (meta.source) noteParts.push(`Import source: ${meta.source}${meta.fileName ? ` (${meta.fileName})` : ''}`);
  if (noteParts.length) updates.notes = [existing.notes, noteParts.join(' | ')].filter(Boolean).join('\n');

  return { updates, addedPhones };
}

function propertyKey(property = {}) {
  return [property.facilityName, property.address, property.state]
    .map(v => (v ?? '').trim().toLowerCase())
    .join('|');
}

function mergeOwnedProperties(existing = [], incoming = []) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(merged.map(propertyKey));
  (Array.isArray(incoming) ? incoming : []).forEach(property => {
    const key = propertyKey(property);
    if (key === '||' || seen.has(key)) return;
    seen.add(key);
    merged.push(property);
  });
  return merged;
}

function updatePayloadFromFields(fields) {
  const dbFields = {};
  if (fields.ownerName !== undefined) dbFields.owner_name = fields.ownerName;
  if (fields.ownerEntity !== undefined) dbFields.owner_entity = fields.ownerEntity;
  if (fields.facilityName !== undefined) dbFields.facility_name = fields.facilityName;
  if (fields.relationshipType !== undefined) dbFields.relationship_type = fields.relationshipType;
  if (fields.leadSource !== undefined) dbFields.lead_source = fields.leadSource;
  if (fields.ownershipGroupId !== undefined) dbFields.ownership_group_id = fields.ownershipGroupId || null;
  if (fields.phone !== undefined) dbFields.phone = fields.phone;
  if (fields.alternatePhones !== undefined) dbFields.alternate_phones = fields.alternatePhones;
  if (fields.email !== undefined) dbFields.email = fields.email;
  if (fields.linkedinUrl !== undefined) dbFields.linkedin_url = fields.linkedinUrl;
  if (fields.ownedProperties !== undefined) dbFields.owned_properties = fields.ownedProperties;
  if (fields.address !== undefined) dbFields.address = fields.address;
  if (fields.mailingAddress !== undefined) dbFields.mailing_address = fields.mailingAddress;
  if (fields.mailingAddresses !== undefined) dbFields.mailing_addresses = normalizeMailingAddresses(fields.mailingAddresses);
  if (fields.state !== undefined) dbFields.state = fields.state;
  if (fields.notes !== undefined) dbFields.notes = fields.notes;
  if (fields.status !== undefined) dbFields.status = fields.status;
  if (fields.callbackDate !== undefined) dbFields.callback_date = fields.callbackDate;
  if (fields.callHistory !== undefined) dbFields.call_history = fields.callHistory;
  if (fields.nextActionType !== undefined) dbFields.next_action_type = fields.nextActionType;
  if (fields.nextActionDate !== undefined) dbFields.next_action_date = fields.nextActionDate;
  if (fields.nextActionNote !== undefined) dbFields.next_action_note = fields.nextActionNote;
  if (fields.leadTemp !== undefined) dbFields.lead_temp = fields.leadTemp;
  if (fields.actionLog !== undefined) dbFields.action_log = fields.actionLog;
  if (fields.source !== undefined) dbFields.source = fields.source;
  if (fields.importFilename !== undefined) dbFields.import_filename = fields.importFilename;
  if (fields.importedAt !== undefined) dbFields.imported_at = fields.importedAt;
  dbFields.updated_at = new Date().toISOString();
  return dbFields;
}

// Map a free-text "Next Action" to one of the platform's action types.
function inferActionType(text) {
  const t = (text || '').toLowerCase();
  if (/\bemail\b|e-?mail/.test(t)) return 'email';
  if (/meet|appointment|\bappt\b|visit|tour|lunch|coffee/.test(t)) return 'meeting';
  if (/\bbov\b|opinion of value|valuation|proposal/.test(t)) return 'bov';
  if (/research|report|tractiq|comps?\b|underwrit|pull (a|the)/.test(t)) return 'research';
  return 'call'; // call blocks default to a follow-up call
}

export function parseImportData(text, options = {}) {
  if (!text || !text.trim()) return { contacts: [], headers: [], fieldMap: {}, mappings: [], rows: [], summary: summarizeImportRows([]) };

  // Detect delimiter from the header line (headers are unquoted)
  const headerLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rows = tokenizeDelimited(text, delimiter);
  if (rows.length < 2) return { contacts: [], headers: [], fieldMap: {}, mappings: [], rows: [], summary: summarizeImportRows([]) };

  const clean = s => (s ?? '').replace(/\s+/g, ' ').trim(); // collapse embedded newlines
  let dataRows = rows.slice(1);
  let dataStartRowNumber = 2;
  let rawHeaders = rows[0].map(clean);
  let mappings = options.mappings ?? buildDetectedMappings(rawHeaders);
  if (!options.mappings && !mappings.some(m => m.field !== 'ignore')) {
    const fallback = maybeHeaderlessFacilityAddress(rows.map(row => row.map(clean)));
    if (fallback) {
      rawHeaders = fallback.headers;
      mappings = fallback.mappings;
      dataRows = fallback.dataRows;
      dataStartRowNumber = 1;
    }
  }
  const fieldMap = mappingsToFieldMap(rawHeaders, mappings);
  const duplicateIndex = options.existingContacts ? buildImportDuplicateIndex(options.existingContacts) : options.duplicateIndex;

  const contacts = [];
  const previewRows = [];
  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r].map(clean);
    if (cols.every(c => !c)) continue;

    let address = cols[fieldMap.address] ?? '';
    const city = cols[fieldMap.city] ?? '';
    const cityForAddress = primaryCityName(city);
    const stateCol = cols[fieldMap.state] ?? '';
    const zip = cols[fieldMap.zip] ?? '';
    if (cityForAddress && !addressHasCity(address, cityForAddress)) {
      address = address ? `${address}, ${cityForAddress}` : cityForAddress;
    }
    if (stateCol && !address.includes(stateCol)) {
      address = address ? `${address}, ${stateCol}` : stateCol;
    }
    if (zip && !address.includes(zip)) {
      address += ` ${zip}`;
    }
    address = address.trim();

    let { state, market } = extractStateAndMarket(address);
    if (!state && stateCol) {
      const upper = stateCol.toUpperCase().trim();
      if (US_STATES[upper]) {
        state = upper;
        market = cityForAddress ? `${cityForAddress}, ${upper}` : upper;
      }
    }

    let ownerName = fieldMap.ownerName != null ? (cols[fieldMap.ownerName] ?? '') : '';
    if (!ownerName && fieldMap._firstNameIdx != null) {
      const first = cols[fieldMap._firstNameIdx] ?? '';
      const last  = fieldMap._lastNameIdx != null ? (cols[fieldMap._lastNameIdx] ?? '') : '';
      ownerName = [first, last].filter(Boolean).join(' ');
    }
    let facilityName = cols[fieldMap.facilityName] ?? '';
    if (!facilityName && address && looksLikeFacilityName(ownerName)) {
      facilityName = ownerName;
      ownerName = '';
    }

    // Notes: base notes column + fold in Conversation?/Message? call content
    let notes = fieldMap.notes != null ? (cols[fieldMap.notes] ?? '') : '';
    const convo = fieldMap.conversation != null ? (cols[fieldMap.conversation] ?? '') : '';
    const msg = fieldMap.message != null ? (cols[fieldMap.message] ?? '') : '';
    const extras = [];
    if (convo) extras.push(`Conversation: ${convo}`);
    if (msg) extras.push(`Message: ${msg}`);
    notes = [notes, ...extras].filter(Boolean).join(' | ');

    // Next Action → integrates into the platform's action system
    const nextActionText = fieldMap.nextAction != null ? (cols[fieldMap.nextAction] ?? '') : '';
    const primaryPhone = normalizePhoneReadable(cols[fieldMap.phone] ?? '');
    const primaryKey = phoneKey(primaryPhone);
    const alternatePhones = [];
    const seenAltKeys = new Set(primaryKey ? [primaryKey] : []);
    (fieldMap.additionalPhones ?? []).forEach(idx => {
      const phone = normalizePhoneReadable(cols[idx] ?? '');
      const key = phoneKey(phone);
      if (!phone || !key || seenAltKeys.has(key)) return;
      seenAltKeys.add(key);
      alternatePhones.push({
        label: inferPhoneLabel(rawHeaders[idx]),
        phone,
      });
    });

    const contact = {
      facilityName,
      ownerName,
      ownerEntity: cols[fieldMap.ownerEntity] ?? '',
      relationshipType: normalizeRelationshipType(cols[fieldMap.relationshipType] ?? ''),
      leadSource: cols[fieldMap.leadSource] ?? '',
      phone: primaryPhone,
      alternatePhones,
      email: cols[fieldMap.email] ?? '',
      address,
      mailingAddress: fieldMap.mailingAddress != null ? (cols[fieldMap.mailingAddress] ?? '') : '',
      state,
      market,
      importSource: cols[fieldMap.source] ?? '',
      status: 'fresh',
      callHistory: [],
      callbackDate: null,
      notes,
      nextActionType: nextActionText ? inferActionType(nextActionText) : '',
      nextActionDate: '',
      nextActionNote: nextActionText,
    };
    const duplicate = findImportDuplicates(contact, duplicateIndex);
    const flags = getImportFlags(contact, duplicate.reasons);
    contacts.push(contact);
    previewRows.push({ rowNumber: dataStartRowNumber + r, contact, flags, duplicateReasons: duplicate.reasons, duplicateMatches: duplicate.matches, raw: cols });
  }
  return {
    contacts,
    headers: rawHeaders,
    fieldMap,
    mappings,
    rows: previewRows,
    delimiter,
    mappingWarnings: getImportMappingWarnings(mappings),
    summary: summarizeImportRows(previewRows),
  };
}

// DB row → app shape
function dbToContact(row) {
  return {
    id: row.id,
    listId: row.list_id,
    ownerName: row.owner_name ?? '',
    ownerEntity: row.owner_entity ?? '',
    facilityName: row.facility_name ?? '',
    relationshipType: normalizeRelationshipType(row.relationship_type ?? ''),
    leadSource: row.lead_source ?? '',
    ownershipGroupId: row.ownership_group_id ?? null,
    phone: row.phone ?? '',
    alternatePhones: Array.isArray(row.alternate_phones) ? row.alternate_phones : [],
    email: row.email ?? '',
    linkedinUrl: row.linkedin_url ?? '',
    ownedProperties: Array.isArray(row.owned_properties) ? row.owned_properties : [],
    address: row.address ?? '',
    mailingAddress: row.mailing_address ?? '',
    mailingAddresses: normalizeMailingAddresses(row.mailing_addresses),
    city: row.city ?? '',
    state: row.state ?? '',
    market: row.city && row.state ? `${row.city}, ${row.state}` : (row.state ?? ''),
    status: row.status ?? 'fresh',
    notes: row.notes ?? '',
    callbackDate: row.callback_date ?? null,
    callHistory: row.call_history ?? [],
    lastCalled: (row.call_history ?? []).slice(-1)[0]?.date ?? null,
    nextActionType: row.next_action_type ?? '',
    nextActionDate: row.next_action_date ?? '',
    nextActionNote: row.next_action_note ?? '',
    leadTemp: row.lead_temp ?? '',
    actionLog: row.action_log ?? [],
    source: row.source ?? '',
    importFilename: row.import_filename ?? '',
    importedAt: row.imported_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

function dbToList(row) {
  return {
    id: row.id,
    name: row.name,
    source: row.source ?? '',
    importedAt: row.created_at?.slice(0, 10) ?? '',
    importFilename: row.import_filename ?? '',
    importRowCount: row.import_row_count ?? 0,
    readyToCallCount: row.ready_to_call_count ?? 0,
    duplicateSkippedCount: row.duplicate_skipped_count ?? 0,
    mergedDuplicateCount: row.merged_duplicate_count ?? 0,
    additionalPhoneCount: row.additional_phone_count ?? 0,
    contactCount: 0, // computed from contacts array
  };
}

const MASTER_DB_NAME = 'Master Database';

// Sprint 12 — persistent "Not a duplicate" dismissals. Supabase-backed
// (sql/duplicate_dismissals_migration.sql); falls back to localStorage if the
// migration hasn't been run so dismissals still survive a reload on this
// machine (just not across devices).
const DISMISSALS_LOCAL_KEY = 'storageHero.duplicateDismissals';

function isMissingTableError(error) {
  if (!error) return false;
  const msg = error.message ?? '';
  return error.code === '42P01' || error.code === 'PGRST205'
    || /relation .*duplicate_dismissals.* does not exist|could not find the table/i.test(msg);
}

function readLocalDismissals() {
  try {
    const raw = localStorage.getItem(DISMISSALS_LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDismissals(rows) {
  try { localStorage.setItem(DISMISSALS_LOCAL_KEY, JSON.stringify(rows)); } catch { /* storage full/blocked — dismissal stays session-only */ }
}

export function useDatabase() {
  const [lists, setLists] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [masterListId, setMasterListId] = useState(null);
  // Sprint 12/13 — duplicate groups marked "Not a duplicate": full records
  // ({ pairKey, note, createdAt }) so the Dismissed view can show when/why,
  // plus where they're persisted ('supabase' | 'local') for honest UI messaging.
  const [duplicateDismissals, setDuplicateDismissals] = useState([]);
  const [dismissalStorage, setDismissalStorage] = useState('supabase');
  const dismissedDuplicateKeys = useMemo(
    () => new Set(duplicateDismissals.map(d => d.pairKey)),
    [duplicateDismissals]
  );

  const loadDismissals = useCallback(async () => {
    const { data, error } = await supabase.from('duplicate_dismissals').select('pair_key,note,created_at');
    if (error) {
      if (!isMissingTableError(error)) console.warn('Could not load duplicate dismissals:', error.message);
      setDismissalStorage('local');
      setDuplicateDismissals(readLocalDismissals());
      return;
    }
    setDismissalStorage('supabase');
    setDuplicateDismissals((data ?? []).map(d => ({ pairKey: d.pair_key, note: d.note ?? '', createdAt: d.created_at ?? null })));
  }, []);

  const dismissDuplicateGroup = useCallback(async (pairKey, contactIds = [], note = '') => {
    const record = { pairKey, note, createdAt: new Date().toISOString() };
    setDuplicateDismissals(prev => [...prev.filter(d => d.pairKey !== pairKey), record]);
    const { error } = await supabase.from('duplicate_dismissals')
      .upsert([{ pair_key: pairKey, contact_ids: contactIds, note }], { onConflict: 'pair_key' });
    if (error) {
      // Table missing (or any write failure): keep it working via localStorage.
      const rows = readLocalDismissals().filter(d => d.pairKey !== pairKey);
      rows.push({ ...record, contactIds });
      writeLocalDismissals(rows);
      if (isMissingTableError(error)) setDismissalStorage('local');
      return { ok: true, storage: 'local' };
    }
    return { ok: true, storage: 'supabase' };
  }, []);

  const restoreDuplicateGroup = useCallback(async (pairKey) => {
    setDuplicateDismissals(prev => prev.filter(d => d.pairKey !== pairKey));
    // Remove from both stores — cheap, and covers a migration run mid-session.
    await supabase.from('duplicate_dismissals').delete().eq('pair_key', pairKey);
    writeLocalDismissals(readLocalDismissals().filter(d => d.pairKey !== pairKey));
    return { ok: true };
  }, []);

  const loadAll = useCallback(async () => {
    // Bulk imports give hundreds of contacts the SAME created_at, and Postgres
    // breaks ties arbitrarily — so without the id tie-breaker every app reload
    // dealt the queue back in a different order.
    const [listsRes, contactsRes] = await Promise.all([
      supabase.from('lists').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }),
      supabase.from('contacts').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }),
    ]);

    let loadedLists = [];
    if (!listsRes.error && listsRes.data) loadedLists = listsRes.data.map(dbToList);
    if (!contactsRes.error && contactsRes.data) setContacts(contactsRes.data.map(dbToContact));

    // Find or create Master Database list
    let master = loadedLists.find(l => l.name === MASTER_DB_NAME);
    if (!master) {
      const { data: row, error } = await supabase
        .from('lists')
        .insert([{ name: MASTER_DB_NAME, source: 'Internal DB' }])
        .select()
        .single();
      if (!error && row) {
        master = dbToList(row);
        loadedLists = [master, ...loadedLists];
      }
    }
    if (master) setMasterListId(master.id);
    setLists(loadedLists);
  }, []);

  useEffect(() => {
    loadAll();
    loadDismissals();
  }, [loadAll, loadDismissals]);

  async function insertListWithFallback(row) {
    let res = await supabase.from('lists').insert([row]).select().single();
    if (res.error && (
      isMissingColumnError(res.error, 'import_filename')
      || isMissingColumnError(res.error, 'import_row_count')
      || isMissingColumnError(res.error, 'ready_to_call_count')
      || isMissingColumnError(res.error, 'duplicate_skipped_count')
      || isMissingColumnError(res.error, 'merged_duplicate_count')
      || isMissingColumnError(res.error, 'additional_phone_count')
    )) {
      res = await supabase.from('lists').insert([stripListMetaColumns(row)]).select().single();
    }
    return res;
  }

  async function insertContactsWithFallback(rows) {
    let insertRows = rows;
    let res = await supabase.from('contacts').insert(insertRows).select();
    if (res.error && (
      isMissingColumnError(res.error, 'owner_entity')
      || isMissingColumnError(res.error, 'relationship_type')
    )) {
      insertRows = insertRows.map(stripContactExpansionColumns);
      res = await supabase.from('contacts').insert(insertRows).select();
    }
    if (res.error && (
      isMissingColumnError(res.error, 'lead_source')
      || isMissingColumnError(res.error, 'ownership_group_id')
    )) {
      insertRows = insertRows.map(stripContactSprint18Columns);
      res = await supabase.from('contacts').insert(insertRows).select();
    }
    if (res.error && (
      isMissingColumnError(res.error, 'source')
      || isMissingColumnError(res.error, 'import_filename')
      || isMissingColumnError(res.error, 'imported_at')
    )) {
      insertRows = insertRows.map(stripContactSourceColumns);
      res = await supabase.from('contacts').insert(insertRows).select();
    }
    if (res.error && isMissingColumnError(res.error, 'mailing_address')) {
      insertRows = insertRows.map(stripContactMailingAddressColumn);
      res = await supabase.from('contacts').insert(insertRows).select();
    }
    return res;
  }

  const updateContactWithFallback = useCallback(async (contactId, fields) => {
    let dbFields = updatePayloadFromFields(fields);
    let res = await supabase.from('contacts').update(dbFields).eq('id', contactId);
    if (res.error && (
      isMissingColumnError(res.error, 'owner_entity')
      || isMissingColumnError(res.error, 'relationship_type')
      || isMissingColumnError(res.error, 'lead_source')
      || isMissingColumnError(res.error, 'ownership_group_id')
      || isMissingColumnError(res.error, 'source')
      || isMissingColumnError(res.error, 'import_filename')
      || isMissingColumnError(res.error, 'imported_at')
    )) {
      const {
        owner_entity: _ownerEntityColumn,
        relationship_type: _relationshipTypeColumn,
        lead_source: _leadSourceColumn,
        ownership_group_id: _ownershipGroupIdColumn,
        mailing_address: _mailingAddressColumn,
        source: _sourceColumn,
        import_filename: _importFilenameColumn,
        imported_at: _importedAtColumn,
        ...withoutNewerColumns
      } = dbFields;
      res = await supabase.from('contacts').update(withoutNewerColumns).eq('id', contactId);
      if (!res.error) {
        const { ownerEntity: _ownerEntity, relationshipType: _relationshipType, leadSource: _leadSource, ownershipGroupId: _ownershipGroupId, mailingAddress: _mailingAddress, source: _source, importFilename: _file, importedAt: _at, ...appFields } = fields;
        fields = appFields;
      }
    }
    if (res.error && (
      isMissingColumnError(res.error, 'source')
      || isMissingColumnError(res.error, 'import_filename')
      || isMissingColumnError(res.error, 'imported_at')
    )) {
      const { source: _sourceColumn, import_filename: _importFilenameColumn, imported_at: _importedAtColumn, ...withoutSource } = dbFields;
      res = await supabase.from('contacts').update(withoutSource).eq('id', contactId);
      if (!res.error) {
        const { source: _source, importFilename: _file, importedAt: _at, ...appFields } = fields;
        fields = appFields;
      }
    }
    if (!res.error) {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...fields } : c));
    }
    return res;
  }, []);

  const appendDuplicateRows = useCallback(async (duplicateRows, meta) => {
    let merged = 0;
    let appendedPhones = 0;
    for (const row of duplicateRows) {
      const matchId = row.duplicateMatches?.[0]?.id;
      if (!matchId) continue;
      const existing = contacts.find(c => c.id === matchId);
      if (!existing) continue;
      const { updates, addedPhones } = mergeImportedContact(existing, row.contact, meta);
      if (Object.keys(updates).length === 0) continue;
      const { error } = await updateContactWithFallback(existing.id, updates);
      if (!error) {
        merged += 1;
        appendedPhones += addedPhones;
      }
    }
    return { merged, appendedPhones };
  }, [contacts, updateContactWithFallback]);

  const importList = useCallback(async (name, source, rawText, options = {}) => {
    const meta = importMetadata({ ...options, source });
    const importRows = selectImportRows(rawText, options);
    const parsed = importRows.contacts;
    const appendResult = options.duplicateMode === 'append'
      ? await appendDuplicateRows(importRows.duplicateRows, meta)
      : { merged: 0, appendedPhones: 0 };
    if (parsed.length === 0 && appendResult.merged === 0) {
      return {
        count: 0,
        skipped: importRows.skippedDuplicates,
        skippedDuplicates: importRows.skippedDuplicates,
        mergedDuplicates: 0,
        appendedPhones: 0,
        sourceApplied: meta.source,
      };
    }

    const listPayload = {
      name,
      source: meta.source,
      import_filename: meta.fileName,
      import_row_count: parsed.length,
      ready_to_call_count: importRows.originalSummary.readyToCall,
      duplicate_skipped_count: options.duplicateMode === 'append' ? 0 : importRows.skippedDuplicates,
      merged_duplicate_count: appendResult.merged,
      additional_phone_count: importRows.importedAdditionalPhones + appendResult.appendedPhones,
    };
    const { data: listRow, error: listErr } = await insertListWithFallback(listPayload);
    if (listErr) return { count: 0 };

    // Insert contacts in batches of 500
    const rows = parsed.map(c => contactInsertRow(listRow.id, c, meta));

    const BATCH = 500;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data } = await insertContactsWithFallback(rows.slice(i, i + BATCH));
      if (data) inserted.push(...data);
    }

    const newList = dbToList(listRow);
    setLists(prev => [...prev, newList]);
    setContacts(prev => [...prev, ...inserted.map(dbToContact)]);
    return {
      list: newList,
      count: inserted.length,
      skipped: importRows.rows.length - inserted.length,
      skippedDuplicates: options.duplicateMode === 'append' ? 0 : importRows.skippedDuplicates,
      mergedDuplicates: appendResult.merged,
      appendedPhones: appendResult.appendedPhones,
      missingPhoneCount: importRows.originalSummary.missingPhone,
      readyToCallCount: importRows.originalSummary.readyToCall,
      additionalPhonesImported: importRows.importedAdditionalPhones + appendResult.appendedPhones,
      sourceApplied: meta.source,
    };
  }, [appendDuplicateRows]);

  // Bulk-import parsed contacts INTO an existing list (e.g. Master Database).
  const importIntoList = useCallback(async (listId, rawText, options = {}) => {
    if (!listId) return { count: 0 };
    const meta = importMetadata(options);
    const importRows = selectImportRows(rawText, options);
    const parsed = importRows.contacts;
    const appendResult = options.duplicateMode === 'append'
      ? await appendDuplicateRows(importRows.duplicateRows, meta)
      : { merged: 0, appendedPhones: 0 };
    if (parsed.length === 0 && appendResult.merged === 0) {
      return {
        count: 0,
        skipped: importRows.skippedDuplicates,
        skippedDuplicates: importRows.skippedDuplicates,
        mergedDuplicates: 0,
        appendedPhones: 0,
        sourceApplied: meta.source,
      };
    }

    const rows = parsed.map(c => contactInsertRow(listId, c, meta));

    const BATCH = 500;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data } = await insertContactsWithFallback(rows.slice(i, i + BATCH));
      if (data) inserted.push(...data);
    }
    setContacts(prev => [...prev, ...inserted.map(dbToContact)]);
    return {
      count: inserted.length,
      skipped: importRows.rows.length - inserted.length,
      skippedDuplicates: options.duplicateMode === 'append' ? 0 : importRows.skippedDuplicates,
      mergedDuplicates: appendResult.merged,
      appendedPhones: appendResult.appendedPhones,
      missingPhoneCount: importRows.originalSummary.missingPhone,
      readyToCallCount: importRows.originalSummary.readyToCall,
      additionalPhonesImported: importRows.importedAdditionalPhones + appendResult.appendedPhones,
      sourceApplied: meta.source,
    };
  }, [appendDuplicateRows]);

  // Sprint 11 — merge a weaker duplicate into the kept master record.
  // Fill-blanks-only: new phones become alternates, populated master fields
  // are never overwritten, and the weaker record is NOT deleted here — the
  // Duplicate Review UI asks for explicit confirmation before deleting.
  const mergeDuplicateContact = useCallback(async (masterId, weakerId) => {
    const master = contacts.find(c => c.id === masterId);
    const weaker = contacts.find(c => c.id === weakerId);
    if (!master || !weaker) return { error: 'Contact not found — refresh and try again.' };
    const { updates, addedPhones, filledFields } = buildMergePlan(master, weaker);
    if (Object.keys(updates).length === 0) return { ok: true, addedPhones: 0, filledFields: [] };
    const res = await updateContactWithFallback(masterId, updates);
    if (res.error && isMissingColumnError(res.error, 'alternate_phones')) {
      return { error: 'Run sql/contact_alternate_phones_migration.sql in Supabase, then retry the merge.' };
    }
    if (res.error) return { error: res.error.message };
    return { ok: true, addedPhones, filledFields };
  }, [contacts, updateContactWithFallback]);

  // Sprint 13 — the legacy removeDuplicates auto-deleter (score-and-bulk-delete)
  // was removed. The Duplicate Review Center is the one duplicate workflow.

  const createList = useCallback(async (name, source) => {
    const { data: row, error } = await supabase
      .from('lists')
      .insert([{ name, source: source ?? '' }])
      .select()
      .single();
    if (!error && row) {
      const list = dbToList(row);
      setLists(prev => [...prev, list]);
      return list;
    }
  }, []);

  const deleteList = useCallback(async (listId) => {
    if (!listId) return { error: 'No list selected.' };
    if (listId === masterListId) return { error: 'The Master Database cannot be deleted.' };

    const deletedContacts = contacts.filter(c => c.listId === listId).length;
    const contactDelete = await supabase.from('contacts').delete().eq('list_id', listId);
    if (contactDelete.error) return { error: contactDelete.error.message };

    const listDelete = await supabase.from('lists').delete().eq('id', listId);
    if (listDelete.error) return { error: listDelete.error.message };

    setLists(prev => prev.filter(l => l.id !== listId));
    setContacts(prev => prev.filter(c => c.listId !== listId));
    return { ok: true, deletedContacts };
  }, [contacts, masterListId]);

  const renameList = useCallback(async (listId, newName) => {
    const { error } = await supabase.from('lists').update({ name: newName }).eq('id', listId);
    if (!error) {
      setLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName } : l));
    }
  }, []);

  const addContact = useCallback(async (listId, fields) => {
    const { state } = extractStateAndMarket(fields.address ?? '');
    let payload = {
      list_id: listId,
      owner_name: fields.ownerName ?? '',
      owner_entity: fields.ownerEntity ?? '',
      facility_name: fields.facilityName ?? '',
      relationship_type: fields.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE,
      lead_source: fields.leadSource || null,
      phone: fields.phone ?? '',
      email: fields.email ?? '',
      address: fields.address ?? '',
      mailing_address: fields.mailingAddress ?? '',
      mailing_addresses: normalizeMailingAddresses(fields.mailingAddresses),
      state: fields.state ?? state,
      status: 'fresh',
      call_history: [],
      notes: fields.notes ?? '',
    };
    let { data: row, error } = await supabase.from('contacts').insert([payload]).select().single();
    if (error && (
      isMissingColumnError(error, 'owner_entity') ||
      isMissingColumnError(error, 'relationship_type')
    )) {
      payload = stripContactExpansionColumns(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && (
      isMissingColumnError(error, 'lead_source') ||
      isMissingColumnError(error, 'ownership_group_id')
    )) {
      payload = stripContactSprint18Columns(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && isMissingColumnError(error, 'mailing_address')) {
      payload = stripContactMailingAddressColumn(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && isMissingColumnError(error, 'mailing_addresses')) {
      payload = stripContactMailingAddressesColumn(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (!error && row) {
      const contact = dbToContact(row);
      setContacts(prev => [...prev, contact]);
      return contact;
    }
  }, []);

  const deleteContact = useCallback(async (contactId) => {
    const { error } = await supabase.from('contacts').delete().eq('id', contactId);
    if (!error) {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      return { ok: true };
    }
    return { error: error.message };
  }, []);

  // Same-owner radar: fold `weakerId` into `masterId` as the same owner —
  // the weaker row's facility/address becomes an additional property on the
  // master, everything else merges, and the weaker row is deleted.
  const mergeAsSameOwner = useCallback(async (masterId, weakerId) => {
    const master = contacts.find(c => c.id === masterId);
    const weaker = contacts.find(c => c.id === weakerId);
    if (!master || !weaker) return { error: 'Contact not found — refresh and try again.' };
    const { updates, addedProperties } = buildSameOwnerMergePlan(master, weaker);
    const res = await updateContactWithFallback(masterId, updates);
    if (res.error && isMissingColumnError(res.error, 'owned_properties')) {
      return { error: 'Run sql/contact_owned_properties_migration.sql in Supabase, then retry.' };
    }
    if (res.error) return { error: res.error.message };
    const del = await deleteContact(weakerId);
    if (del.error) return { error: `Merged, but the old row could not be deleted: ${del.error}` };
    return { ok: true, addedProperties, masterName: master.ownerName || master.facilityName || 'owner' };
  }, [contacts, updateContactWithFallback, deleteContact]);

  const updateContact = useCallback(async (contactId, fields) => {
    const dbFields = updatePayloadFromFields(fields);
    let { error } = await supabase.from('contacts').update(dbFields).eq('id', contactId);
    if (error && isMissingColumnError(error, 'alternate_phones')) {
      return { error: 'alternate_phones_migration_needed' };
    }
    if (error && (fields.mailingAddress !== undefined || fields.mailingAddresses !== undefined) && /mailing_address/i.test(error.message ?? '')) {
      return { error: 'Run sql/mailing_address_migration.sql in Supabase, then refresh to save mailing addresses.' };
    }
    if (error && fields.linkedinUrl !== undefined && isMissingColumnError(error, 'linkedin_url')) {
      return { error: 'Run sql/contact_linkedin_url_migration.sql in Supabase, then refresh to save LinkedIn links.' };
    }
    if (error && fields.ownedProperties !== undefined && isMissingColumnError(error, 'owned_properties')) {
      return { error: 'Run sql/contact_owned_properties_migration.sql in Supabase, then refresh to save properties.' };
    }
    if (error && (
      isMissingColumnError(error, 'owner_entity')
      || isMissingColumnError(error, 'relationship_type')
      || isMissingColumnError(error, 'lead_source')
      || isMissingColumnError(error, 'ownership_group_id')
      || isMissingColumnError(error, 'source')
      || isMissingColumnError(error, 'import_filename')
      || isMissingColumnError(error, 'imported_at')
    )) {
      const {
        owner_entity: _ownerEntityColumn,
        relationship_type: _relationshipTypeColumn,
        lead_source: _leadSourceColumn,
        ownership_group_id: _ownershipGroupIdColumn,
        mailing_address: _mailingAddressColumn,
        mailing_addresses: _mailingAddressesColumn,
        source: _sourceColumn,
        import_filename: _importFilenameColumn,
        imported_at: _importedAtColumn,
        ...withoutNewerColumns
      } = dbFields;
      const retry = await supabase.from('contacts').update(withoutNewerColumns).eq('id', contactId);
      error = retry.error;
      if (!error) {
        const { ownerEntity: _ownerEntity, relationshipType: _relationshipType, leadSource: _leadSource, ownershipGroupId: _ownershipGroupId, mailingAddress: _mailingAddress, mailingAddresses: _mailingAddresses, source: _source, importFilename: _file, importedAt: _at, ...appFields } = fields;
        fields = appFields;
      }
    }
    if (error && (
      isMissingColumnError(error, 'source')
      || isMissingColumnError(error, 'import_filename')
      || isMissingColumnError(error, 'imported_at')
    )) {
      const { source: _sourceColumn, import_filename: _importFilenameColumn, imported_at: _importedAtColumn, ...withoutSource } = dbFields;
      const retry = await supabase.from('contacts').update(withoutSource).eq('id', contactId);
      error = retry.error;
      if (!error) {
        const { source: _source, importFilename: _file, importedAt: _at, ...appFields } = fields;
        fields = appFields;
      }
    }
    if (!error) {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...fields } : c));
      return { ok: true };
    }
    return { error: error.message };
  }, []);

  // Replace a contact's activity log wholesale (review actions), with optional email backfill
  const mutateContactLog = useCallback(async (contactId, { log, email }) => {
    const db = { action_log: log, updated_at: new Date().toISOString() };
    if (email !== undefined && email !== null) db.email = email;
    const { error } = await supabase.from('contacts').update(db).eq('id', contactId);
    if (!error) setContacts(prev => prev.map(c => c.id === contactId
      ? { ...c, actionLog: log, ...(email !== undefined && email !== null ? { email } : {}) } : c));
  }, []);

  // Append a logged action to a contact's activity log
  const logContactAction = useCallback((contactId, entry) => {
    setContacts(prev => {
      const c = prev.find(x => x.id === contactId);
      const nextLog = [...(c?.actionLog ?? []), entry];
      supabase.from('contacts').update({ action_log: nextLog, updated_at: new Date().toISOString() }).eq('id', contactId).then(() => {});
      return prev.map(x => x.id === contactId ? { ...x, actionLog: nextLog } : x);
    });
  }, []);

  const deleteContactAction = useCallback((contactId, actionIndex) => {
    setContacts(prev => {
      const c = prev.find(x => x.id === contactId);
      if (!c) return prev;
      const nextLog = (c.actionLog ?? []).filter((_, idx) => idx !== actionIndex);
      supabase.from('contacts').update({ action_log: nextLog, updated_at: new Date().toISOString() }).eq('id', contactId).then(() => {});
      return prev.map(x => x.id === contactId ? { ...x, actionLog: nextLog } : x);
    });
  }, []);

  const deleteContactCallHistory = useCallback((contactId, historyIndex) => {
    setContacts(prev => {
      const c = prev.find(x => x.id === contactId);
      if (!c) return prev;
      const nextHistory = (c.callHistory ?? []).filter((_, idx) => idx !== historyIndex);
      const lastCall = nextHistory[nextHistory.length - 1];
      supabase.from('contacts').update({
        call_history: nextHistory,
        last_called: lastCall?.date ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', contactId).then(() => {});
      return prev.map(x => x.id === contactId ? { ...x, callHistory: nextHistory, lastCalled: lastCall?.date ?? null } : x);
    });
  }, []);

  // Move a contact into a different list (drag-and-drop between Database lists)
  const moveContactToList = useCallback(async (contactId, listId) => {
    const { error } = await supabase
      .from('contacts').update({ list_id: listId, updated_at: new Date().toISOString() }).eq('id', contactId);
    if (!error) setContacts(prev => prev.map(c => c.id === contactId ? { ...c, listId } : c));
  }, []);

  const updateContactStatus = useCallback(async (contactId, status, callNote, activityDate) => {
    const now = activityDate || new Date().toISOString().slice(0, 10);
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    const newHistory = [...(contact.callHistory ?? []), { date: now, outcome: status, notes: callNote ?? '' }];

    await updateContact(contactId, {
      status,
      callHistory: newHistory,
      lastCalled: now,
    });
  }, [contacts, updateContact]);

  const updateContactCallback = useCallback(async (contactId, callbackDate) => {
    await updateContact(contactId, { callbackDate, status: 'callback' });
  }, [updateContact]);

  const updateContactNotes = useCallback(async (contactId, notes) => {
    await updateContact(contactId, { notes });
  }, [updateContact]);

  // Copy a contact into the Master Database list
  const addToMasterDB = useCallback(async (contact, options = {}) => {
    if (!masterListId) return null;
    // Check if already in Master DB (by owner name + facility name)
    const existingMaster = contacts.find(c =>
      c.listId === masterListId &&
      c.ownerName === contact.ownerName &&
      c.facilityName === contact.facilityName
    );
    if (existingMaster) {
      if (!options.mergeIfExists) return 'exists';
      const ownedProperties = mergeOwnedProperties(existingMaster.ownedProperties, contact.ownedProperties);
      const updates = {
        ownerEntity: existingMaster.ownerEntity || contact.ownerEntity || '',
        relationshipType: contact.relationshipType ?? existingMaster.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE,
        leadSource: existingMaster.leadSource || contact.leadSource || '',
        ownershipGroupId: existingMaster.ownershipGroupId || contact.ownershipGroupId || null,
        phone: existingMaster.phone || contact.phone || '',
        alternatePhones: existingMaster.alternatePhones?.length ? existingMaster.alternatePhones : (contact.alternatePhones ?? []),
        email: existingMaster.email || contact.email || '',
        address: existingMaster.address || contact.address || '',
        mailingAddress: existingMaster.mailingAddress || contact.mailingAddress || '',
        mailingAddresses: existingMaster.mailingAddresses?.length ? existingMaster.mailingAddresses : (contact.mailingAddresses ?? []),
        state: existingMaster.state || contact.state || '',
        notes: [existingMaster.notes, contact.notes].filter(Boolean).join('\n'),
        status: contact.status === 'fresh' ? (existingMaster.status || 'conversation') : (contact.status ?? existingMaster.status ?? 'conversation'),
        callHistory: mergeCallHistories(existingMaster.callHistory, contact.callHistory),
        callbackDate: contact.callbackDate ?? existingMaster.callbackDate ?? null,
        nextActionType: contact.nextActionType ?? existingMaster.nextActionType ?? '',
        nextActionDate: contact.nextActionDate ?? existingMaster.nextActionDate ?? '',
        nextActionNote: contact.nextActionNote ?? existingMaster.nextActionNote ?? '',
        leadTemp: contact.leadTemp ?? existingMaster.leadTemp ?? '',
      };
      if (ownedProperties.length > 0) updates.ownedProperties = ownedProperties;
      const result = await updateContact(existingMaster.id, updates);
      if (result?.error) return { error: result.error };
      return 'merged';
    }

    let payload = {
      list_id: masterListId,
      owner_name: contact.ownerName ?? '',
      owner_entity: contact.ownerEntity ?? '',
      facility_name: contact.facilityName ?? '',
      relationship_type: contact.relationshipType ?? DEFAULT_RELATIONSHIP_TYPE,
      lead_source: contact.leadSource || null,
      ownership_group_id: contact.ownershipGroupId ?? null,
      phone: contact.phone ?? '',
      alternate_phones: contact.alternatePhones ?? [],
      email: contact.email ?? '',
      address: contact.address ?? '',
      owned_properties: contact.ownedProperties ?? [],
      mailing_address: contact.mailingAddress ?? '',
      mailing_addresses: normalizeMailingAddresses(contact.mailingAddresses),
      state: contact.state ?? '',
      notes: contact.notes ?? '',
      status: contact.status === 'fresh' ? 'conversation' : (contact.status ?? 'conversation'),
      call_history: contact.callHistory ?? [],
      next_action_type: contact.nextActionType ?? '',
      next_action_date: contact.nextActionDate ?? '',
      next_action_note: contact.nextActionNote ?? '',
      lead_temp: contact.leadTemp ?? '',
    };
    let { data: row, error } = await supabase.from('contacts').insert([payload]).select().single();
    if (error && (
      isMissingColumnError(error, 'owner_entity') ||
      isMissingColumnError(error, 'relationship_type')
    )) {
      payload = stripContactExpansionColumns(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && (
      isMissingColumnError(error, 'lead_source') ||
      isMissingColumnError(error, 'ownership_group_id')
    )) {
      payload = stripContactSprint18Columns(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && isMissingColumnError(error, 'mailing_address')) {
      payload = stripContactMailingAddressColumn(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && isMissingColumnError(error, 'mailing_addresses')) {
      payload = stripContactMailingAddressesColumn(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (error && isMissingColumnError(error, 'owned_properties')) {
      payload = stripContactOwnedPropertiesColumn(payload);
      const retry = await supabase.from('contacts').insert([payload]).select().single();
      row = retry.data;
      error = retry.error;
    }
    if (!error && row) {
      const newContact = dbToContact(row);
      setContacts(prev => [...prev, newContact]);
      return newContact;
    }
    return null;
  }, [masterListId, contacts, updateContact]);

  return {
    lists,
    contacts,
    masterListId,
    importList,
    importIntoList,
    mergeDuplicateContact,
    mergeAsSameOwner,
    duplicateDismissals,
    dismissedDuplicateKeys,
    dismissalStorage,
    dismissDuplicateGroup,
    restoreDuplicateGroup,
    moveContactToList,
    createList,
    addContact,
    updateContactStatus,
    updateContactCallback,
    updateContactNotes,
    updateContact,
    deleteList,
    renameList,
    deleteContact,
    addToMasterDB,
    logContactAction,
    deleteContactAction,
    deleteContactCallHistory,
    mutateContactLog,
  };
}
