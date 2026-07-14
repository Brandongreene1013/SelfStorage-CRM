// Calendar ingest — the Cowork Advisory Board task POSTs tomorrow's/today's
// Outlook events here. Upsert by eventId (Outlook iCalUId), match to a client
// by attendee/organizer email when possible. Never writes back to Outlook,
// never creates a client.
import { createClient } from '@supabase/supabase-js';
import { normalizeDisplayText, normalizeMeetingText } from './_textNormalize.js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp',
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { eventId, subject, start, end, location, attendees, organizer } = req.body || {};
  if (!eventId || !start) {
    return res.status(400).json({ error: 'eventId and start are required' });
  }

  // Match a client by any attendee/organizer email (case-insensitive). First wins.
  let clientId = null;
  const emails = [...(Array.isArray(attendees) ? attendees : []), organizer]
    .filter(Boolean).map(e => String(e).trim().toLowerCase());
  if (emails.length) {
    const { data: clients } = await supabase.from('clients').select('id, email');
    const match = (clients ?? []).find(c => c.email && emails.includes(c.email.trim().toLowerCase()));
    clientId = match?.id ?? null;
  }

  // Determine insert vs update
  const { data: existing } = await supabase
    .from('calendar_event').select('id').eq('event_id', eventId).limit(1);
  const action = existing?.length ? 'updated' : 'inserted';

  const row = {
    event_id: eventId,
    subject: normalizeMeetingText(subject) || '(no subject)',
    start_at: start,
    end_at: end ?? null,
    location: normalizeMeetingText(location) || null,
    attendees: Array.isArray(attendees) ? attendees.map(normalizeDisplayText).filter(Boolean) : [],
    organizer: normalizeDisplayText(organizer) || null,
    client_id: clientId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('calendar_event').upsert(row, { onConflict: 'event_id' });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, eventId, matched: !!clientId, clientId, action });
}
