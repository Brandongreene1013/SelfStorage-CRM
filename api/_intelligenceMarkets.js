// Storage Hunters — active-market inference for the daily intelligence batch.
//
// This reads CRM signals server-side and ranks the geographies Brandon is
// actively working now. It does not mutate CRM records and does not need a new
// table: the resulting market list is embedded in that day's brief snapshot.

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington DC',
};

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function marketFromRecord(record = {}) {
  const state = clean(record.state).toUpperCase();
  const city = clean(record.city);
  if (city && STATE_NAMES[state]) return { label: `${city}, ${state}`, city, state };

  const explicit = clean(record.market);
  const explicitMatch = explicit.match(/^(.+?),?\s+([A-Za-z]{2})$/);
  if (explicitMatch && STATE_NAMES[explicitMatch[2].toUpperCase()]) {
    const marketCity = clean(explicitMatch[1]);
    const marketState = explicitMatch[2].toUpperCase();
    return { label: `${marketCity}, ${marketState}`, city: marketCity, state: marketState };
  }

  const parts = clean(record.address).split(',').map(clean).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = parts[index].match(/\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?/);
    if (!match || !STATE_NAMES[match[1]]) continue;
    const addressState = match[1];
    const addressCity = clean(parts[index - 1]);
    if (addressCity && !/^\d/.test(addressCity)) {
      return { label: `${addressCity}, ${addressState}`, city: addressCity, state: addressState };
    }
    return { label: addressState, city: '', state: addressState };
  }
  return null;
}

function daysFrom(value, nowMs) {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.abs(nowMs - time) / 86400000 : Infinity;
}

function recentEvents(record, nowMs, days = 45) {
  return [...(Array.isArray(record.action_log) ? record.action_log : []),
    ...(Array.isArray(record.call_history) ? record.call_history : [])]
    .filter(event => daysFrom(event?.at || event?.date, nowMs) <= days).length;
}

export function inferActiveMarkets({
  clients = [], contacts = [], properties = [], tasks = [],
} = {}, { now = Date.now(), limit = 4 } = {}) {
  const scores = new Map();
  const byClient = new Map();
  const byContact = new Map();
  const byProperty = new Map();

  const register = (market, points, reason) => {
    if (!market || points <= 0) return;
    const key = market.label.toLowerCase();
    const current = scores.get(key) ?? { ...market, score: 0, reasons: new Set() };
    current.score += points;
    if (reason) current.reasons.add(reason);
    scores.set(key, current);
  };

  for (const contact of contacts) {
    const market = marketFromRecord(contact);
    if (market) byContact.set(String(contact.id), market);
  }
  for (const property of properties) {
    const market = marketFromRecord(property);
    if (market) byProperty.set(String(property.id), market);
    if (market && daysFrom(property.updated_at, now) <= 45) register(market, 8, 'recent property work');
  }

  for (const client of clients) {
    const market = marketFromRecord(client) || byContact.get(String(client.contact_id));
    if (!market) continue;
    byClient.set(String(client.id), market);
    const stage = Number(client.stage_id) || 1;
    if (stage < 10) register(market, 18 + Math.min(stage, 9) * 4, `active pipeline stage ${stage}`);
    if (daysFrom(client.updated_at, now) <= 30) register(market, 12, 'recent pipeline activity');
  }

  for (const contact of contacts) {
    const market = byContact.get(String(contact.id));
    if (!market) continue;
    const events = recentEvents(contact, now);
    if (events) register(market, Math.min(24, events * 6), 'recent calls or actions');
    if (daysFrom(contact.callback_date, now) <= 30 || daysFrom(contact.next_action_date, now) <= 30) {
      register(market, 18, 'current callback or next action');
    }
  }

  for (const task of tasks) {
    if (task.status !== 'open') continue;
    let market = null;
    if (task.related_type === 'client') market = byClient.get(String(task.related_id));
    if (task.related_type === 'contact') market = byContact.get(String(task.related_id));
    if (task.related_type === 'property') market = byProperty.get(String(task.related_id));
    if (!market) continue;
    const urgency = task.priority === 'urgent' ? 18 : task.priority === 'high' ? 10 : 4;
    const dueSoon = daysFrom(task.due_date, now) <= 30 ? 16 : 5;
    register(market, urgency + dueSoon, 'open CRM task');
  }

  const ranked = [...scores.values()]
    .filter(market => market.city)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(market => ({
      label: market.label,
      city: market.city,
      state: market.state,
      score: Math.round(market.score),
      reasons: [...market.reasons].slice(0, 4),
    }));
  return ranked;
}

export async function loadActiveMarkets(client, options = {}) {
  if (!client) return [];
  const [clients, contacts, properties, tasks] = await Promise.all([
    client.from('clients').select('id,contact_id,address,stage_id,updated_at').limit(500),
    client.from('contacts').select('id,city,state,address,callback_date,next_action_date,action_log,call_history,updated_at').limit(2000),
    client.from('properties').select('id,city,state,market,address,updated_at').limit(1000),
    client.from('tasks').select('status,due_date,priority,related_type,related_id,updated_at').eq('status', 'open').limit(1000),
  ]);
  return inferActiveMarkets({
    clients: clients.data ?? [],
    contacts: contacts.data ?? [],
    properties: properties.data ?? [],
    tasks: tasks.data ?? [],
  }, options);
}
