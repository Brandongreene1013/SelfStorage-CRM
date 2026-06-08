// Email log ingest — a Cowork task reads Brandon's SENT mail and POSTs each
// message here. We match the recipient to an existing client/contact using a
// tiered matcher (exact email → domain → name → AI tiebreak), log a one-line
// summary to that record's activity log, and backfill the address so it's an
// exact hit next time.
//
// Rules: sent-only, known-records-only (never create), dedup on messageId,
// append-only. Backward compatible with the old {recipient, summary, ...} body.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp',
);

const CONSUMER = new Set([
  'gmail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'comcast.net', 'earthlink.net', 'att.net',
  'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'protonmail.com', 'proton.me',
]);

const NICK = {
  bob: 'robert', bobby: 'robert', rob: 'robert', robbie: 'robert', mike: 'michael', mikey: 'michael',
  jim: 'james', jimmy: 'james', bill: 'william', billy: 'william', will: 'william', kim: 'kimberly',
  tom: 'thomas', tommy: 'thomas', dave: 'david', dan: 'daniel', danny: 'daniel', chris: 'christopher',
  steve: 'steven', rick: 'richard', rich: 'richard', dick: 'richard', ed: 'edward', tony: 'anthony',
  joe: 'joseph', joey: 'joseph', nick: 'nicholas', pat: 'patrick', sam: 'samuel', ben: 'benjamin',
  alex: 'alexander', greg: 'gregory', matt: 'matthew', nate: 'nathan', andy: 'andrew', drew: 'andrew',
  charlie: 'charles', chuck: 'charles', frank: 'francis', jack: 'john', johnny: 'john',
  larry: 'lawrence', ron: 'ronald', ray: 'raymond', josh: 'joshua', zach: 'zachary', tim: 'timothy',
};

const tokens = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const norm = (t) => NICK[t] || t;
const secondLevel = (domain) => { const p = (domain || '').split('.'); return p.length >= 2 ? p[p.length - 2] : (p[0] || ''); };

function nameScore(query, candidate) {
  const q = tokens(query).map(norm);
  const c = tokens(candidate).map(norm);
  if (!q.length || !c.length) return 0;
  const setC = new Set(c);
  const hits = q.filter(t => setC.has(t)).length;
  return hits / Math.max(q.length, c.length);
}

async function callClaudeTiebreak(apiKey, ctx) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: 'You match a sent email to the right CRM record for a self-storage broker. Reply ONLY with JSON: {"id": "<record id or null>", "confidence": 0..1}. Pick the single best match or null.',
        messages: [{ role: 'user', content: JSON.stringify(ctx) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { recipient, recipientName, summary, sentAt, messageId } = req.body || {};
  if (!recipient || !summary) return res.status(400).json({ error: 'recipient and summary are required' });

  const email = String(recipient).trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  const localPart = email.split('@')[0] || '';
  const isConsumer = CONSUMER.has(domain);

  // Lightweight record pull from BOTH tables (no action_log yet — fetched later for the winner)
  const [{ data: clients }, { data: contacts }] = await Promise.all([
    supabase.from('clients').select('id, name, email, facility_name, address, stage_id'),
    supabase.from('contacts').select('id, owner_name, facility_name, email, address'),
  ]);
  const recs = [
    ...(clients ?? []).map(c => ({ table: 'clients', id: c.id, name: c.name, email: c.email, facility: c.facility_name, address: c.address, stage: c.stage_id })),
    ...(contacts ?? []).map(c => ({ table: 'contacts', id: c.id, name: c.owner_name, email: c.email, facility: c.facility_name, address: c.address })),
  ];

  let winner = null, matchMethod = 'none', confidence = 0;

  // ── Tier 1: exact email ──
  const exact = recs.filter(r => r.email && r.email.trim().toLowerCase() === email);
  if (exact.length === 1) { winner = exact[0]; matchMethod = 'email'; confidence = 1.0; }

  // ── Tier 2: domain → company ──
  let shortlist = [];
  if (!winner && domain && !isConsumer) {
    const core = secondLevel(domain);
    const byExistingDomain = recs.filter(r => r.email && (r.email.split('@')[1] || '').toLowerCase() === domain);
    const byCompany = recs.filter(r => {
      const fj = tokens(r.facility).map(norm).join('');
      const nj = tokens(r.name).map(norm).join('');
      return core && core.length >= 4 && (fj === core || nj === core || (fj && (fj.includes(core) || core.includes(fj)) && core.length >= 5));
    });
    const cands = [...new Map([...byExistingDomain, ...byCompany].map(r => [`${r.table}:${r.id}`, r])).values()];
    if (cands.length === 1) { winner = cands[0]; matchMethod = 'domain'; confidence = byExistingDomain.length ? 0.9 : 0.85; }
    else if (cands.length > 1) shortlist = cands;
  }

  // ── Tier 3: name fuzzy ──
  if (!winner) {
    const query = recipientName || localPart;
    const scored = recs
      .map(r => ({ r, s: Math.max(nameScore(query, r.name), nameScore(localPart, r.name)) }))
      .filter(x => x.s >= 0.5)
      .sort((a, b) => b.s - a.s);
    const strong = scored.filter(x => x.s >= 0.8);
    if (strong.length === 1) { winner = strong[0].r; matchMethod = 'name'; confidence = Math.min(0.8, 0.6 + strong[0].s * 0.2); }
    else if (scored.length) shortlist = [...new Map([...shortlist, ...scored.slice(0, 5).map(x => x.r)].map(r => [`${r.table}:${r.id}`, r])).values()];
  }

  // ── Tier 4: AI tiebreak (only when ambiguous) ──
  if (!winner && shortlist.length >= 2 && process.env.ANTHROPIC_KEY) {
    const pick = await callClaudeTiebreak(process.env.ANTHROPIC_KEY, {
      email, name: recipientName || localPart, summary,
      candidates: shortlist.map(r => ({ id: `${r.table}:${r.id}`, name: r.name, company: r.facility, location: r.address, stage: r.stage })),
    });
    if (pick && pick.id && pick.id !== 'null') {
      const w = shortlist.find(r => `${r.table}:${r.id}` === pick.id);
      if (w) { winner = w; matchMethod = 'ai'; confidence = Math.max(0.5, Math.min(0.9, Number(pick.confidence) || 0.7)); }
    }
  }

  if (!winner || confidence < 0.5) {
    return res.status(200).json({ ok: true, matched: false, logged: false, matchMethod: 'none', confidence: 0, action: 'skipped', emailBackfilled: false });
  }

  const needsReview = confidence < 0.75;

  // Fetch the winner's current log for dedup + append
  const { data: full } = await supabase.from(winner.table).select('id, email, action_log').eq('id', winner.id).single();
  const log = full?.action_log ?? [];
  if (messageId && log.some(e => e.messageId && e.messageId === messageId)) {
    return res.status(200).json({ ok: true, matched: true, logged: false, clientId: winner.id, matchMethod, confidence, action: 'duplicate', emailBackfilled: false });
  }

  const at = sentAt || new Date().toISOString();
  const entry = { type: 'email', note: summary, at, date: at.slice(0, 10), messageId: messageId || null, email: recipient, source: 'email', matchMethod, confidence, needsReview };

  const update = { action_log: [...log, entry], updated_at: new Date().toISOString() };
  // Backfill address if this record has no email on file and we're confident
  let emailBackfilled = false;
  if (!needsReview && (!full?.email || !full.email.trim())) { update.email = recipient; emailBackfilled = true; }

  const { error } = await supabase.from(winner.table).update(update).eq('id', winner.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    ok: true, matched: true, logged: true, clientId: winner.id,
    matchMethod, confidence: Math.round(confidence * 100) / 100,
    action: needsReview ? 'needs_review' : 'logged', emailBackfilled,
  });
}
