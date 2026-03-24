import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const DB_KEY = 'crm_database';

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
  // Match 2-letter state abbreviation (often before zip code)
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
  // Try full state names
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

  // Auto-detect delimiter
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rawHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  // Score each header against our known fields
  const fieldMap = {};
  rawHeaders.forEach((h, i) => {
    const lh = h.toLowerCase();
    if (!fieldMap.facilityName && /facili|property|storage.*name|self.?storage/i.test(lh)) fieldMap.facilityName = i;
    else if (!fieldMap.ownerName && /owner|contact|name/i.test(lh)) fieldMap.ownerName = i;
    else if (!fieldMap.phone && /phone|tel|mobile|cell/i.test(lh)) fieldMap.phone = i;
    else if (!fieldMap.email && /email|e.?mail/i.test(lh)) fieldMap.email = i;
    else if (!fieldMap.address && /address|street|location/i.test(lh)) fieldMap.address = i;
    else if (!fieldMap.city && /city|town/i.test(lh)) fieldMap.city = i;
    else if (!fieldMap.state && /state|st$/i.test(lh)) fieldMap.state = i;
    else if (!fieldMap.zip && /zip|postal/i.test(lh)) fieldMap.zip = i;
    else if (!fieldMap.units && /unit|door|count/i.test(lh)) fieldMap.units = i;
    else if (!fieldMap.sqft && /sq.*ft|square|size/i.test(lh)) fieldMap.sqft = i;
  });

  // If no facilityName found, try the first "name"-ish column
  if (fieldMap.facilityName == null && fieldMap.ownerName == null) {
    rawHeaders.forEach((h, i) => {
      if (/name/i.test(h) && fieldMap.facilityName == null) fieldMap.facilityName = i;
    });
  }

  const contacts = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.every(c => !c)) continue;

    // Build full address
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

    // Parse state/market from the full address
    let { state, market } = extractStateAndMarket(address);
    // Fallback: if state column was explicitly provided, use it
    if (!state && stateCol) {
      const upper = stateCol.toUpperCase().trim();
      if (US_STATES[upper]) {
        state = upper;
        market = city ? `${city}, ${upper}` : upper;
      }
    }

    contacts.push({
      id: uuidv4(),
      facilityName: cols[fieldMap.facilityName] ?? '',
      ownerName: cols[fieldMap.ownerName] ?? '',
      phone: cols[fieldMap.phone] ?? '',
      email: cols[fieldMap.email] ?? '',
      address,
      state,
      market,
      units: fieldMap.units != null ? parseInt(cols[fieldMap.units]) || 0 : 0,
      sqft: fieldMap.sqft != null ? parseInt(cols[fieldMap.sqft]) || 0 : 0,
      status: 'fresh',
      callHistory: [],
      lastCalled: null,
      callbackDate: null,
      notes: '',
    });
  }
  return { contacts, headers: rawHeaders, fieldMap };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : { lists: [], contacts: [] };
  } catch { return { lists: [], contacts: [] }; }
}

export function useDatabase() {
  const [data, setData] = useState(loadDB);

  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }, [data]);

  const importList = useCallback((name, source, rawText) => {
    const { contacts } = parseImportData(rawText);
    if (contacts.length === 0) return { count: 0 };
    const listId = uuidv4();
    const list = {
      id: listId,
      name,
      source,
      importedAt: new Date().toISOString().slice(0, 10),
      contactCount: contacts.length,
    };
    const taggedContacts = contacts.map(c => ({ ...c, listId }));
    setData(prev => ({
      lists: [...prev.lists, list],
      contacts: [...prev.contacts, ...taggedContacts],
    }));
    return { list, count: contacts.length };
  }, []);

  const updateContactStatus = useCallback((contactId, status, callNote) => {
    const now = new Date().toISOString().slice(0, 10);
    setData(prev => ({
      ...prev,
      contacts: prev.contacts.map(c => {
        if (c.id !== contactId) return c;
        return {
          ...c,
          status,
          lastCalled: now,
          callHistory: [...(c.callHistory ?? []), { date: now, outcome: status, notes: callNote ?? '' }],
        };
      }),
    }));
  }, []);

  const updateContactCallback = useCallback((contactId, callbackDate) => {
    setData(prev => ({
      ...prev,
      contacts: prev.contacts.map(c =>
        c.id === contactId ? { ...c, callbackDate, status: 'callback' } : c
      ),
    }));
  }, []);

  const updateContactNotes = useCallback((contactId, notes) => {
    setData(prev => ({
      ...prev,
      contacts: prev.contacts.map(c => c.id === contactId ? { ...c, notes } : c),
    }));
  }, []);

  const deleteList = useCallback((listId) => {
    setData(prev => ({
      lists: prev.lists.filter(l => l.id !== listId),
      contacts: prev.contacts.filter(c => c.listId !== listId),
    }));
  }, []);

  const deleteContact = useCallback((contactId) => {
    setData(prev => ({
      ...prev,
      contacts: prev.contacts.filter(c => c.id !== contactId),
    }));
  }, []);

  return {
    lists: data.lists,
    contacts: data.contacts,
    importList,
    updateContactStatus,
    updateContactCallback,
    updateContactNotes,
    deleteList,
    deleteContact,
  };
}
