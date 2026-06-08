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

// Map a free-text "Next Action" to one of the platform's action types.
function inferActionType(text) {
  const t = (text || '').toLowerCase();
  if (/\bemail\b|e-?mail/.test(t)) return 'email';
  if (/meet|appointment|\bappt\b|visit|tour|lunch|coffee/.test(t)) return 'meeting';
  if (/\bbov\b|opinion of value|valuation|proposal/.test(t)) return 'bov';
  if (/research|report|tractiq|comps?\b|underwrit|pull (a|the)/.test(t)) return 'research';
  return 'call'; // call blocks default to a follow-up call
}

export function parseImportData(text) {
  if (!text || !text.trim()) return { contacts: [], headers: [], fieldMap: {} };

  // Detect delimiter from the header line (headers are unquoted)
  const headerLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rows = tokenizeDelimited(text, delimiter);
  if (rows.length < 2) return { contacts: [], headers: [], fieldMap: {} };

  const clean = s => (s ?? '').replace(/\s+/g, ' ').trim(); // collapse embedded newlines
  const rawHeaders = rows[0].map(clean);

  const fieldMap = {};
  let firstNameIdx = null;
  let lastNameIdx  = null;

  rawHeaders.forEach((h, i) => {
    const lh = h.toLowerCase().trim();
    if (!fieldMap.facilityName && /facili|property[\s_]name|storage[\s_]name|business[\s_]name|self.?storage/i.test(lh)) {
      fieldMap.facilityName = i;
    } else if (!fieldMap.ownerName && /owner[\s_]*name|contact[\s_]name|full[\s_]name|^name$|primary[\s_]contact|^owner$/i.test(lh)) {
      fieldMap.ownerName = i;
    } else if (firstNameIdx == null && /^first[\s_]?name$|^first$/i.test(lh)) {
      firstNameIdx = i;
    } else if (lastNameIdx == null && /^last[\s_]?name$|^last$/i.test(lh)) {
      lastNameIdx = i;
    } else if (!fieldMap.phone && /phone|tel|mobile|cell|#|\bnumber\b/i.test(lh)) {
      fieldMap.phone = i;
    } else if (!fieldMap.email && /email|e.?mail/i.test(lh)) {
      fieldMap.email = i;
    } else if (!fieldMap.nextAction && /next[\s_]*action|follow.?up/i.test(lh)) {
      fieldMap.nextAction = i;
    } else if (!fieldMap.address && /address|street|location/i.test(lh)) {
      fieldMap.address = i;
    } else if (!fieldMap.city && /city|town/i.test(lh)) {
      fieldMap.city = i;
    } else if (!fieldMap.state && /\bstate\b|\bst\b$/i.test(lh)) {
      fieldMap.state = i;
    } else if (!fieldMap.zip && /zip|postal/i.test(lh)) {
      fieldMap.zip = i;
    } else if (!fieldMap.units && /unit|door|count/i.test(lh)) {
      fieldMap.units = i;
    } else if (!fieldMap.sqft && /sq.?ft|sq.?footage|footage|square|size/i.test(lh)) {
      fieldMap.sqft = i;
    } else if (!fieldMap.conversation && /conversation|spoke|talked/i.test(lh)) {
      fieldMap.conversation = i;
    } else if (!fieldMap.message && /message|voicemail|\bvm\b|left.?msg/i.test(lh)) {
      fieldMap.message = i;
    } else if (!fieldMap.notes && /note|comment|remark|detail/i.test(lh)) {
      fieldMap.notes = i;
    }
  });

  if (fieldMap.ownerName == null) {
    if (firstNameIdx != null) {
      fieldMap._firstNameIdx = firstNameIdx;
      fieldMap._lastNameIdx  = lastNameIdx;
    } else {
      rawHeaders.forEach((h, i) => {
        if (/name/i.test(h) && fieldMap.ownerName == null && i !== fieldMap.facilityName) {
          fieldMap.ownerName = i;
        }
      });
    }
  }

  const contacts = [];
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

    contacts.push({
      facilityName: cols[fieldMap.facilityName] ?? '',
      ownerName,
      phone: cols[fieldMap.phone] ?? '',
      email: cols[fieldMap.email] ?? '',
      address,
      state,
      market,
      status: 'fresh',
      callHistory: [],
      callbackDate: null,
      notes,
      nextActionType: nextActionText ? inferActionType(nextActionText) : '',
      nextActionDate: '',
      nextActionNote: nextActionText,
    });
  }
  return { contacts, headers: rawHeaders, fieldMap };
}

// DB row → app shape
function dbToContact(row) {
  return {
    id: row.id,
    listId: row.list_id,
    ownerName: row.owner_name ?? '',
    facilityName: row.facility_name ?? '',
    phone: row.phone ?? '',
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
  const email = (c.email || '').trim().toLowerCase();
  const owner = (c.ownerName || '').trim().toLowerCase();
  const fac = (c.facilityName || '').trim().toLowerCase();
  if (phone.length >= 7) keys.push('p:' + phone.slice(-10)); // last 10 digits
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

  const importList = useCallback(async (name, source, rawText) => {
    const { contacts: parsed } = parseImportData(rawText);
    if (parsed.length === 0) return { count: 0 };

    // Create list
    const { data: listRow, error: listErr } = await supabase
      .from('lists')
      .insert([{ name, source }])
      .select()
      .single();
    if (listErr) return { count: 0 };

    // Insert contacts in batches of 500
    const rows = parsed.map(c => ({
      list_id: listRow.id,
      owner_name: c.ownerName,
      facility_name: c.facilityName,
      phone: c.phone,
      email: c.email,
      address: c.address,
      state: c.state,
      status: 'fresh',
      call_history: [],
    }));

    const BATCH = 500;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data } = await supabase.from('contacts').insert(rows.slice(i, i + BATCH)).select();
      if (data) inserted.push(...data);
    }

    const newList = dbToList(listRow);
    setLists(prev => [...prev, newList]);
    setContacts(prev => [...prev, ...inserted.map(dbToContact)]);
    return { list: newList, count: inserted.length };
  }, []);

  // Bulk-import parsed contacts INTO an existing list (e.g. Master Database).
  const importIntoList = useCallback(async (listId, rawText) => {
    if (!listId) return { count: 0 };
    const { contacts: parsed } = parseImportData(rawText);
    if (parsed.length === 0) return { count: 0 };

    const rows = parsed.map(c => ({
      list_id: listId,
      owner_name: c.ownerName,
      facility_name: c.facilityName,
      phone: c.phone,
      email: c.email,
      address: c.address,
      state: c.state,
      notes: c.notes ?? '',
      status: 'fresh',
      call_history: [],
      next_action_type: c.nextActionType ?? '',
      next_action_date: c.nextActionDate ?? '',
      next_action_note: c.nextActionNote ?? '',
    }));

    const BATCH = 500;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data } = await supabase.from('contacts').insert(rows.slice(i, i + BATCH)).select();
      if (data) inserted.push(...data);
    }
    setContacts(prev => [...prev, ...inserted.map(dbToContact)]);
    return { count: inserted.length };
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
    }
  }, []);

  const updateContact = useCallback(async (contactId, fields) => {
    const dbFields = {};
    if (fields.ownerName    !== undefined) dbFields.owner_name    = fields.ownerName;
    if (fields.facilityName !== undefined) dbFields.facility_name = fields.facilityName;
    if (fields.phone        !== undefined) dbFields.phone         = fields.phone;
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
    if (!error) {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...fields } : c));
    }
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
