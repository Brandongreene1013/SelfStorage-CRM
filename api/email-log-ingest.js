// Email log ingest — a Cowork task reads Brandon's SENT mail and POSTs each
// message here. We match the recipient to an existing client/contact using a
// tiered matcher (exact email → domain → name → AI tiebreak), log a one-line
// summary to that record's activity log, and backfill the address so it's an
// exact hit next time.
//
// Rules: sent-only, known-records-only (never create), dedup on messageId,
// append-only. Backward compatible with the old {recipient, summary, ...} body.
import { createClient } from '@supabase/supabase-js';
import { easternDateString } from './_dailyActivity.js';

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
const hasText = (value) => String(value || '').trim();

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

function importanceReasons({ direction, summary, subject, bodyPreview }) {
  const text = `${summary || ''} ${subject || ''} ${bodyPreview || ''}`.toLowerCase();
  const reasons = [];
  if (direction === 'received') reasons.push('Owner reply');
  if (/conversation|spoke|call me|interested|discuss|follow up/.test(text)) reasons.push('Conversation signal');
  if (/appointment|meeting|tour|site visit/.test(text)) reasons.push('Meeting or appointment signal');
  if (/\bbov\b|valuation|proposal|opinion of value/.test(text)) reasons.push('BOV interest');
  if (/tractiq|report|market report|pricing report/.test(text)) reasons.push('Report sent or discussed');
  if (/bounce|undeliver|delivery failed|could not be delivered/.test(text)) reasons.push('Email delivery problem');
  if (/portfolio|multiple propert|also owns|another facility/.test(text)) reasons.push('Possible multi-property owner');
  return [...new Set(reasons)];
}

async function persistEmailEvent({ body, counterpartyEmail, counterpartyName, direction, sentAt, winner, matchMethod, confidence, needsReview }) {
  const reasons = importanceReasons({
    direction,
    summary: body.summary,
    subject: body.subject,
    bodyPreview: body.bodyPreview,
  });
  const row = {
    message_id: body.messageId || null,
    direction,
    counterparty_email: counterpartyEmail,
    counterparty_name: counterpartyName || null,
    subject: body.subject || null,
    summary: body.summary || body.bodyPreview || body.subject || '',
    body_preview: body.bodyPreview || null,
    sent_at: sentAt,
    activity_date: easternDateString(new Date(sentAt)),
    matched_table: winner?.table ?? null,
    matched_id: winner?.id ?? null,
    match_method: matchMethod || 'none',
    confidence: confidence || 0,
    needs_review: !!needsReview,
    important: reasons.length > 0,
    importance_reasons: reasons,
    raw: body,
  };
  const { error } = await supabase.from('daily_email_events').upsert(row, { onConflict: 'message_id' });
  if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204')) {
    return { ok: false, skipped: true, reason: 'daily_email_events migration missing' };
  }
  if (error) return { ok: false, skipped: false, error: error.message };
  return { ok: true, skipped: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  const { summary, sentAt, messageId } = body;
  const direction = String(body.direction || 'sent').toLowerCase() === 'received' ? 'received' : 'sent';
  const counterparty = direction === 'received'
    ? (body.sender || body.from || body.recipient)
    : (body.recipient || body.to || body.sender);
  const counterpartyName = direction === 'received'
    ? (body.senderName || body.fromName || body.recipientName)
    : (body.recipientName || body.toName || body.senderName);
  if (!counterparty || !(hasText(summary) || hasText(body.subject) || hasText(body.bodyPreview))) {
    return res.status(400).json({ error: 'counterparty email and summary/subject/bodyPreview are required' });
  }

  const email = String(counterparty).trim().toLowerCase();
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
    const query = counterpartyName || localPart;
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
      email, name: counterpartyName || localPart, summary,
      candidates: shortlist.map(r => ({ id: `${r.table}:${r.id}`, name: r.name, company: r.facility, location: r.address, stage: r.stage })),
    });
    if (pick && pick.id && pick.id !== 'null') {
      const w = shortlist.find(r => `${r.table}:${r.id}` === pick.id);
      if (w) { winner = w; matchMethod = 'ai'; confidence = Math.max(0.5, Math.min(0.9, Number(pick.confidence) || 0.7)); }
    }
  }

  if (!winner || confidence < 0.5) {
    const evidence = await persistEmailEvent({
      body,
      counterpartyEmail: email,
      counterpartyName,
      direction,
      sentAt: sentAt || new Date().toISOString(),
      winner: null,
      matchMethod: 'none',
      confidence: 0,
      needsReview: true,
    });
    return res.status(200).json({ ok: true, matched: false, logged: false, matchMethod: 'none', confidence: 0, action: 'skipped', emailBackfilled: false, evidence });
  }

  const needsReview = confidence < 0.75;

  // Fetch the winner's current log for dedup + append
  const { data: full } = await supabase.from(winner.table).select('id, email, action_log').eq('id', winner.id).single();
  const log = full?.action_log ?? [];
  if (messageId && log.some(e => e.messageId && e.messageId === messageId)) {
    const evidence = await persistEmailEvent({
      body,
      counterpartyEmail: email,
      counterpartyName,
      direction,
      sentAt: sentAt || new Date().toISOString(),
      winner,
      matchMethod,
      confidence,
      needsReview,
    });
    return res.status(200).json({ ok: true, matched: true, logged: false, clientId: winner.id, matchMethod, confidence, action: 'duplicate', emailBackfilled: false, evidence });
  }

  const at = sentAt || new Date().toISOString();
  const note = summary || body.bodyPreview || body.subject || '';
  const entry = { type: 'email', note, at, date: at.slice(0, 10), messageId: messageId || null, email, source: 'email', direction, matchMethod, confidence, needsReview };

  const update = { action_log: [...log, entry], updated_at: new Date().toISOString() };
  // Backfill address if this record has no email on file and we're confident
  let emailBackfilled = false;
  if (!needsReview && (!full?.email || !full.email.trim())) { update.email = email; emailBackfilled = true; }

  const { error } = await supabase.from(winner.table).update(update).eq('id', winner.id);
  if (error) return res.status(500).json({ error: error.message });
  const evidence = await persistEmailEvent({
    body,
    counterpartyEmail: email,
    counterpartyName,
    direction,
    sentAt: at,
    winner,
    matchMethod,
    confidence,
    needsReview,
  });

  return res.status(200).json({
    ok: true, matched: true, logged: true, clientId: winner.id,
    matchMethod, confidence: Math.round(confidence * 100) / 100,
    action: needsReview ? 'needs_review' : 'logged', emailBackfilled, evidence,
  });
}
