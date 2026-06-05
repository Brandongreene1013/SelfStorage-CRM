// Advisory Board brief ingest — the Cowork daily-brief task POSTs each brief here.
// Upserts by brief_date so re-running the same day replaces that day's brief.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp',
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { date, content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content (markdown string) is required' });
  }
  const brief_date = (date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const { error } = await supabase
    .from('advisory_briefs')
    .upsert({ brief_date, content }, { onConflict: 'brief_date' });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, brief_date });
}
