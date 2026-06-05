// Email log ingest — a Cowork task reads Brandon's SENT mail and POSTs each
// message here. We match the recipient to an existing client or contact by
// email and append a one-line summary to that record's activity log.
//
// Rules (per spec): sent-only, known-records-only (never create), no duplicates
// (dedup on messageId), append-only.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp',
);

async function tryLog(table, recipient, entry, messageId) {
  const { data } = await supabase
    .from(table).select('id, action_log').ilike('email', recipient).limit(1);
  const row = data?.[0];
  if (!row) return false;
  const log = row.action_log ?? [];
  if (log.some(e => e.messageId && e.messageId === messageId)) return 'dup';
  const { error } = await supabase
    .from(table)
    .update({ action_log: [...log, entry], updated_at: new Date().toISOString() })
    .eq('id', row.id);
  return error ? false : true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { recipient, summary, sentAt, messageId } = req.body || {};
  if (!recipient || !summary) {
    return res.status(400).json({ error: 'recipient and summary are required' });
  }
  const email = String(recipient).trim().toLowerCase();
  const at = sentAt || new Date().toISOString();
  const entry = {
    type: 'email',
    note: summary,
    at,
    date: at.slice(0, 10),
    messageId: messageId || null,
    source: 'email',
  };

  // Clients first, then contacts
  let result = await tryLog('clients', email, entry, messageId);
  if (result === false) result = await tryLog('contacts', email, entry, messageId);

  if (result === 'dup') return res.status(200).json({ matched: true, logged: false, reason: 'duplicate' });
  if (result === true) return res.status(200).json({ matched: true, logged: true });
  return res.status(200).json({ matched: false, logged: false }); // no record with that email — skipped
}
