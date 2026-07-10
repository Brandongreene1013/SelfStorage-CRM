export function normalizeMailingAddresses(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row, idx) => ({
      id: row.id || `addr-${idx}-${Date.now()}`,
      label: row.label || '',
      address: row.address || '',
    }))
    .filter(row => row.address.trim());
}

export function newMailingAddress(label = '', address = '') {
  const id = globalThis.crypto?.randomUUID?.() || `addr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, label, address };
}

export function allMailingAddressOptions(record) {
  const seen = new Set();
  const options = [];
  const add = (address, label = '') => {
    const clean = (address ?? '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ label, address: clean });
  };
  add(record?.mailingAddress, 'Primary');
  normalizeMailingAddresses(record?.mailingAddresses).forEach(row => add(row.address, row.label || 'Affiliated'));
  return options;
}
