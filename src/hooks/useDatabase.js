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

export function parseImportData(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rawHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  const fieldMap = {};
  let firstNameIdx = null;
  let lastNameIdx  = null;

  rawHeaders.forEach((h, i) => {
    const lh = h.toLowerCase().trim();
    if (!fieldMap.facilityName && /facili|property[\s_]name|storage[\s_]name|business[\s_]name|self.?storage/i.test(lh)) {
      fieldMap.facilityName = i;
    } else if (!fieldMap.ownerName && /owner|contact[\s_]name|full[\s_]name|^name$|primary[\s_]contact/i.test(lh)) {
      fieldMap.ownerName = i;
    } else if (firstNameIdx == null && /^first[\s_]?name$|^first$/i.test(lh)) {
      firstNameIdx = i;
    } else if (lastNameIdx == null && /^last[\s_]?name$|^last$/i.test(lh)) {
      lastNameIdx = i;
    } else if (!fieldMap.phone && /phone|tel|mobile|cell/i.test(lh)) {
      fieldMap.phone = i;
    } else if (!fieldMap.email && /email|e.?mail/i.test(lh)) {
      fieldMap.email = i;
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
    } else if (!fieldMap.sqft && /sq.*ft|square|size/i.test(lh)) {
      fieldMap.sqft = i;
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
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
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
      notes: '',
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

export function useDatabase() {
  const [lists, setLists] = useState([]);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [listsRes, contactsRes] = await Promise.all([
      supabase.from('lists').select('*').order('created_at', { ascending: true }),
      supabase.from('contacts').select('*').order('created_at', { ascending: true }),
    ]);
    if (!listsRes.error && listsRes.data) setLists(listsRes.data.map(dbToList));
    if (!contactsRes.error && contactsRes.data) setContacts(contactsRes.data.map(dbToContact));
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
    if (fields.callbackDate !== undefined) dbFields.callback_date = fields.callbackDate;
    if (fields.callHistory  !== undefined) dbFields.call_history  = fields.callHistory;
    dbFields.updated_at = new Date().toISOString();

    const { error } = await supabase.from('contacts').update(dbFields).eq('id', contactId);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...fields } : c));
    }
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

  return {
    lists,
    contacts,
    importList,
    createList,
    addContact,
    updateContactStatus,
    updateContactCallback,
    updateContactNotes,
    updateContact,
    deleteList,
    renameList,
    deleteContact,
  };
}
