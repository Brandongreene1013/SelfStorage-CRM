import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

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
  { value: 'facilityName', label: 'Facility / Property Name' },
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
  { field: 'ownerName', label: 'owner name' },
  { field: 'facilityName', label: 'facility/property name' },
  { field: 'primaryPhone', label: 'phone' },
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
    'entity name', 'llc', 'company', 'taxpayer', 'grantee', 'buyer', 'seller',
    'full name', 'primary contact', 'name',
  ])) return 'ownerName';
  if (headerMatches(header, [
    'facility', 'facility name', 'property', 'property name', 'asset name',
    'location name', 'site name', 'business name', 'storage name', 'self storage',
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
    'facility address', 'location address', 'situs address',
  ])) return 'address';
  if (headerMatches(header, ['mailing address', 'owner address', 'tax mailing address', 'mailing street', 'taxpayer address'])) return 'mailingAddress';
  if (headerMatches(header, ['city', 'property city', 'mailing city', 'town'])) return 'city';
  if (headerMatches(header, ['state', 'property state', 'mailing state', 'st'])) return 'state';
  if (headerMatches(header, ['zip', 'zipcode', 'zip code', 'postal code'])) return 'zip';
  if (headerMatches(header, ['source', 'data source', 'platform'])) return 'source';
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
  if (!duplicateIndex) return [];
  const reasons = new Set();
  collectPhoneKeys(contact).forEach(key => {
    if (duplicateIndex.phone.get(key)?.length) reasons.add('phone match');
  });
  const emailKey = (contact.email ?? '').trim().toLowerCase();
  if (emailKey && duplicateIndex.email.get(emailKey)?.length) reasons.add('email match');
  const ownerKey = normalizeNameKey(contact.ownerName);
  const addressKey = normalizeAddressKey(contact.address);
  if (ownerKey && addressKey && duplicateIndex.ownerAddress.get(`${ownerKey}|${addressKey}`)?.length) {
    reasons.add('owner + address match');
  }
  const facilityKey = normalizeNameKey(contact.facilityName);
  const marketKey = normalizeNameKey(contact.market || contact.state);
  if (facilityKey && marketKey && duplicateIndex.facilityMarket.get(`${facilityKey}|${marketKey}`)?.length) {
    reasons.add('facility + market match');
  }
  return [...reasons];
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
  return flags;
}

function summarizeImportRows(rows) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.flags.includes('Ready to call')) acc.readyToCall += 1;
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
    : parsed.rows;
  return {
    rows,
    contacts: rows.map(row => row.contact),
    skippedDuplicates: parsed.rows.length - rows.length,
    originalSummary: parsed.summary,
    importedAdditionalPhones: rows.reduce((sum, row) => sum + (row.contact.alternatePhones?.length ?? 0), 0),
  };
}

function contactInsertRow(listId, c) {
  return {
    list_id: listId,
    owner_name: c.ownerName,
    facility_name: c.facilityName,
    phone: c.phone,
    alternate_phones: c.alternatePhones ?? [],
    email: c.email,
    address: c.address,
    state: c.state,
    notes: c.notes ?? '',
    status: 'fresh',
    call_history: [],
    next_action_type: c.nextActionType ?? '',
    next_action_date: c.nextActionDate ?? '',
    next_action_note: c.nextActionNote ?? '',
  };
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
  const rawHeaders = rows[0].map(clean);
  const mappings = options.mappings ?? buildDetectedMappings(rawHeaders);
  const fieldMap = mappingsToFieldMap(rawHeaders, mappings);
  const duplicateIndex = options.existingContacts ? buildImportDuplicateIndex(options.existingContacts) : options.duplicateIndex;

  const contacts = [];
  const previewRows = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r].map(clean);
    if (cols.every(c => !c)) continue;

    let address = cols[fieldMap.address] ?? '';
    const city = cols[fieldMap.city] ?? '';
    const stateCol = cols[fieldMap.state] ?? '';
    const zip = cols[fieldMap.zip] ?? '';
    if (city && !address.toLowerCase().includes(city.toLowerCase())) {
      address = address ? `${address}, ${city}` : city;
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
        market = city ? `${city}, ${upper}` : upper;
      }
    }

    let ownerName = fieldMap.ownerName != null ? (cols[fieldMap.ownerName] ?? '') : '';
    if (!ownerName && fieldMap._firstNameIdx != null) {
      const first = cols[fieldMap._firstNameIdx] ?? '';
      const last  = fieldMap._lastNameIdx != null ? (cols[fieldMap._lastNameIdx] ?? '') : '';
      ownerName = [first, last].filter(Boolean).join(' ');
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
      facilityName: cols[fieldMap.facilityName] ?? '',
      ownerName,
      phone: primaryPhone,
      alternatePhones,
      email: cols[fieldMap.email] ?? '',
      address,
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
    const duplicateReasons = findImportDuplicates(contact, duplicateIndex);
    const flags = getImportFlags(contact, duplicateReasons);
    contacts.push(contact);
    previewRows.push({ rowNumber: r + 1, contact, flags, duplicateReasons, raw: cols });
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
    facilityName: row.facility_name ?? '',
    phone: row.phone ?? '',
    alternatePhones: Array.isArray(row.alternate_phones) ? row.alternate_phones : [],
    email: row.email ?? '',
    address: row.address ?? '',
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
  };
}

function dbToList(row) {
  return {
    id: row.id,
    name: row.name,
    source: row.source ?? '',
    importedAt: row.created_at?.slice(0, 10) ?? '',
    contactCount: 0, // computed from contacts array
  };
}

const MASTER_DB_NAME = 'Master Database';

// Keys that identify the "same" contact: normalized phone, email, or owner+facility.
// Two contacts are duplicates if they share ANY key.
function dupKeys(c) {
  const keys = [];
  const phone = (c.phone || '').replace(/\D/g, '');
  const alternatePhones = Array.isArray(c.alternatePhones) ? c.alternatePhones : [];
  const email = (c.email || '').trim().toLowerCase();
  const owner = (c.ownerName || '').trim().toLowerCase();
  const fac = (c.facilityName || '').trim().toLowerCase();
  if (phone.length >= 7) keys.push('p:' + phone.slice(-10)); // last 10 digits
  alternatePhones.forEach(p => {
    const altPhone = (p?.phone || '').replace(/\D/g, '');
    if (altPhone.length >= 7) keys.push('p:' + altPhone.slice(-10));
  });
  if (email) keys.push('e:' + email);
  if (owner && fac) keys.push('of:' + owner + '|' + fac);
  return keys;
}

// Higher score = more "worked" = the record we keep when collapsing duplicates.
function dupScore(c) {
  let s = 0;
  if (c.status && c.status !== 'fresh') s += 3;
  s += (c.callHistory?.length || 0);
  if (c.notes && c.notes.trim()) s += 2;
  if (c.nextActionType) s += 2;
  if (c.phone) s += 1;
  if (c.alternatePhones?.length) s += 1;
  if (c.email) s += 1;
  if (c.address) s += 1;
  return s;
}

export function useDatabase() {
  const [lists, setLists] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [masterListId, setMasterListId] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [listsRes, contactsRes] = await Promise.all([
      supabase.from('lists').select('*').order('created_at', { ascending: true }),
      supabase.from('contacts').select('*').order('created_at', { ascending: true }),
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
  }

  const importList = useCallback(async (name, source, rawText, options = {}) => {
    const importRows = selectImportRows(rawText, options);
    const parsed = importRows.contacts;
    if (parsed.length === 0) return { count: 0, skippedDuplicates: importRows.skippedDuplicates };

    // Create list
    const { data: listRow, error: listErr } = await supabase
      .from('lists')
      .insert([{ name, source }])
      .select()
      .single();
    if (listErr) return { count: 0 };

    // Insert contacts in batches of 500
    const rows = parsed.map(c => contactInsertRow(listRow.id, c));

    const BATCH = 500;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data } = await supabase.from('contacts').insert(rows.slice(i, i + BATCH)).select();
      if (data) inserted.push(...data);
    }

    const newList = dbToList(listRow);
    setLists(prev => [...prev, newList]);
    setContacts(prev => [...prev, ...inserted.map(dbToContact)]);
    return {
      list: newList,
      count: inserted.length,
      skipped: importRows.rows.length - inserted.length,
      skippedDuplicates: importRows.skippedDuplicates,
      missingPhoneCount: importRows.originalSummary.missingPhone,
      readyToCallCount: importRows.originalSummary.readyToCall,
      additionalPhonesImported: importRows.importedAdditionalPhones,
    };
  }, []);

  // Bulk-import parsed contacts INTO an existing list (e.g. Master Database).
  const importIntoList = useCallback(async (listId, rawText, options = {}) => {
    if (!listId) return { count: 0 };
    const importRows = selectImportRows(rawText, options);
    const parsed = importRows.contacts;
    if (parsed.length === 0) return { count: 0, skippedDuplicates: importRows.skippedDuplicates };

    const rows = parsed.map(c => contactInsertRow(listId, c));

    const BATCH = 500;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data } = await supabase.from('contacts').insert(rows.slice(i, i + BATCH)).select();
      if (data) inserted.push(...data);
    }
    setContacts(prev => [...prev, ...inserted.map(dbToContact)]);
    return {
      count: inserted.length,
      skipped: importRows.rows.length - inserted.length,
      skippedDuplicates: importRows.skippedDuplicates,
      missingPhoneCount: importRows.originalSummary.missingPhone,
      readyToCallCount: importRows.originalSummary.readyToCall,
      additionalPhonesImported: importRows.importedAdditionalPhones,
    };
  }, []);

  // Find duplicate contacts within a list and delete all but the most-worked one
  // in each cluster. Returns { removed }.
  const removeDuplicates = useCallback(async (listId) => {
    const inList = contacts.filter(c => c.listId === listId);
    if (inList.length < 2) return { removed: 0 };

    // Cluster contacts that share any dup key (with group merging)
    const keyToGroup = new Map();
    const groups = [];
    for (const c of inList) {
      const keys = dupKeys(c);
      const found = [];
      for (const k of keys) { const g = keyToGroup.get(k); if (g && !found.includes(g)) found.push(g); }
      let group;
      if (found.length === 0) { group = { members: [] }; groups.push(group); }
      else {
        group = found[0];
        for (let i = 1; i < found.length; i++) { // merge other groups into the first
          const o = found[i];
          group.members.push(...o.members);
          o.members = [];
          for (const [k, v] of keyToGroup) if (v === o) keyToGroup.set(k, group);
        }
      }
      group.members.push(c);
      for (const k of keys) keyToGroup.set(k, group);
    }

    // In each cluster of 2+, keep the highest-scoring record, delete the rest
    const toDelete = [];
    for (const g of groups) {
      if (g.members.length < 2) continue;
      const sorted = [...g.members].sort((a, b) => dupScore(b) - dupScore(a));
      for (const m of sorted.slice(1)) toDelete.push(m.id);
    }
    if (toDelete.length === 0) return { removed: 0 };

    const { error } = await supabase.from('contacts').delete().in('id', toDelete);
    if (error) return { removed: 0, error: error.message };
    const del = new Set(toDelete);
    setContacts(prev => prev.filter(c => !del.has(c.id)));
    return { removed: toDelete.length };
  }, [contacts]);

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
    const { error } = await supabase.from('lists').delete().eq('id', listId);
    if (!error) {
      setLists(prev => prev.filter(l => l.id !== listId));
      setContacts(prev => prev.filter(c => c.listId !== listId));
    }
  }, []);

  const renameList = useCallback(async (listId, newName) => {
    const { error } = await supabase.from('lists').update({ name: newName }).eq('id', listId);
    if (!error) {
      setLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName } : l));
    }
  }, []);

  const addContact = useCallback(async (listId, fields) => {
    const { state } = extractStateAndMarket(fields.address ?? '');
    const { data: row, error } = await supabase
      .from('contacts')
      .insert([{
        list_id: listId,
        owner_name: fields.ownerName ?? '',
        facility_name: fields.facilityName ?? '',
        phone: fields.phone ?? '',
        email: fields.email ?? '',
        address: fields.address ?? '',
        state: fields.state ?? state,
        status: 'fresh',
        call_history: [],
        notes: '',
      }])
      .select()
      .single();
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

  const updateContact = useCallback(async (contactId, fields) => {
    const dbFields = {};
    if (fields.ownerName    !== undefined) dbFields.owner_name    = fields.ownerName;
    if (fields.facilityName !== undefined) dbFields.facility_name = fields.facilityName;
    if (fields.phone        !== undefined) dbFields.phone         = fields.phone;
    if (fields.alternatePhones !== undefined) dbFields.alternate_phones = fields.alternatePhones;
    if (fields.email        !== undefined) dbFields.email         = fields.email;
    if (fields.address      !== undefined) dbFields.address       = fields.address;
    if (fields.state        !== undefined) dbFields.state         = fields.state;
    if (fields.notes        !== undefined) dbFields.notes         = fields.notes;
    if (fields.status       !== undefined) dbFields.status        = fields.status;
    if (fields.callbackDate    !== undefined) dbFields.callback_date    = fields.callbackDate;
    if (fields.callHistory     !== undefined) dbFields.call_history     = fields.callHistory;
    if (fields.nextActionType  !== undefined) dbFields.next_action_type = fields.nextActionType;
    if (fields.nextActionDate  !== undefined) dbFields.next_action_date = fields.nextActionDate;
    if (fields.nextActionNote  !== undefined) dbFields.next_action_note = fields.nextActionNote;
    if (fields.leadTemp        !== undefined) dbFields.lead_temp        = fields.leadTemp;
    if (fields.actionLog       !== undefined) dbFields.action_log       = fields.actionLog;
    dbFields.updated_at = new Date().toISOString();

    const { error } = await supabase.from('contacts').update(dbFields).eq('id', contactId);
    if (error && isMissingColumnError(error, 'alternate_phones')) {
      return { error: 'alternate_phones_migration_needed' };
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

  // Move a contact into a different list (drag-and-drop between Database lists)
  const moveContactToList = useCallback(async (contactId, listId) => {
    const { error } = await supabase
      .from('contacts').update({ list_id: listId, updated_at: new Date().toISOString() }).eq('id', contactId);
    if (!error) setContacts(prev => prev.map(c => c.id === contactId ? { ...c, listId } : c));
  }, []);

  const updateContactStatus = useCallback(async (contactId, status, callNote) => {
    const now = new Date().toISOString().slice(0, 10);
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
  const addToMasterDB = useCallback(async (contact) => {
    if (!masterListId) return null;
    // Check if already in Master DB (by owner name + facility name)
    const alreadyExists = contacts.some(c =>
      c.listId === masterListId &&
      c.ownerName === contact.ownerName &&
      c.facilityName === contact.facilityName
    );
    if (alreadyExists) return 'exists';

    const { data: row, error } = await supabase
      .from('contacts')
      .insert([{
        list_id: masterListId,
        owner_name: contact.ownerName ?? '',
        facility_name: contact.facilityName ?? '',
        phone: contact.phone ?? '',
        alternate_phones: contact.alternatePhones ?? [],
        email: contact.email ?? '',
        address: contact.address ?? '',
        state: contact.state ?? '',
        notes: contact.notes ?? '',
        status: contact.status === 'fresh' ? 'conversation' : (contact.status ?? 'conversation'),
        call_history: contact.callHistory ?? [],
        next_action_type: contact.nextActionType ?? '',
        next_action_date: contact.nextActionDate ?? '',
        next_action_note: contact.nextActionNote ?? '',
        lead_temp: contact.leadTemp ?? '',
      }])
      .select()
      .single();
    if (!error && row) {
      const newContact = dbToContact(row);
      setContacts(prev => [...prev, newContact]);
      return newContact;
    }
    return null;
  }, [masterListId, contacts]);

  return {
    lists,
    contacts,
    masterListId,
    importList,
    importIntoList,
    removeDuplicates,
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
    mutateContactLog,
  };
}
