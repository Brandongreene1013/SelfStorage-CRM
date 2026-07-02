#!/usr/bin/env node
// QA seed / cleanup for Call Mode testing (Sprint 7).
//
// Creates (and safely deletes) an obviously-fake QA list, QA contacts, and QA
// call tasks so Call Mode, callback queues, and task completion can be tested
// end-to-end WITHOUT touching real owner data. See QA_CALL_MODE_TESTING.md
// at the repo root for the full testing workflow.
//
// Usage (from the repo root):
//   node scripts/qa-seed.mjs seed            — create the QA list, contacts, tasks
//   node scripts/qa-seed.mjs seed-duplicates — create the Sprint 11 duplicate pair
//   node scripts/qa-seed.mjs status          — show what QA records currently exist
//   node scripts/qa-seed.mjs cleanup         — delete ONLY QA records (see safety rules)
//
// SAFETY RULES (enforced in code, not just convention):
//   - Contacts are only ever deleted if their owner_name starts with "QA Test".
//     A real contact dragged into the QA list by accident is skipped with a
//     warning, never deleted.
//   - Tasks are only deleted if they are tied to a QA contact's id, or their
//     title starts with "[QA]" AND their related_name starts with "QA Test".
//   - The QA list is only deleted once it contains zero non-QA contacts.
//   - Nothing here can touch the Master Database list or any imported list.

import { createClient } from '@supabase/supabase-js';

// Mirrors src/lib/supabase.js (the app's publishable client key — app tables
// use permissive RLS, so this key can read/write contacts/lists/tasks).
const SUPABASE_URL = 'https://rpoiphoqwgvbiyygfjrm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp';

const QA_LIST_NAME = 'QA Test Call List';
const QA_CONTACT_PREFIX = 'QA Test';
const QA_TASK_PREFIX = '[QA]';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const dateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

function fail(msg) {
  console.error(`\n  ERROR: ${msg}\n`);
  process.exit(1);
}

async function findQaLists() {
  const { data, error } = await supabase.from('lists').select('*').eq('name', QA_LIST_NAME);
  if (error) fail(`Could not read lists: ${error.message}`);
  return data ?? [];
}

// All QA contacts: anything in a QA list, plus any stray "QA Test …" contact
// that ended up elsewhere (e.g. moved to another list during testing).
async function findQaContacts(qaListIds) {
  const byName = await supabase.from('contacts').select('*').like('owner_name', `${QA_CONTACT_PREFIX}%`);
  if (byName.error) fail(`Could not read contacts: ${byName.error.message}`);
  let inList = { data: [] };
  if (qaListIds.length > 0) {
    inList = await supabase.from('contacts').select('*').in('list_id', qaListIds);
    if (inList.error) fail(`Could not read contacts: ${inList.error.message}`);
  }
  const seen = new Map();
  [...(byName.data ?? []), ...(inList.data ?? [])].forEach(c => seen.set(c.id, c));
  return [...seen.values()];
}

async function findQaTasks(qaContactIds) {
  const results = new Map();
  if (qaContactIds.length > 0) {
    const { data, error } = await supabase.from('tasks').select('*')
      .eq('related_type', 'contact').in('related_id', qaContactIds);
    if (error) fail(`Could not read tasks: ${error.message}`);
    (data ?? []).forEach(t => results.set(t.id, t));
  }
  // Belt-and-suspenders: QA-titled tasks whose contact was already deleted.
  // BOTH the title prefix and the QA related_name are required, so a real
  // task Brandon happened to title "[QA] …" against a real owner is safe.
  const { data, error } = await supabase.from('tasks').select('*')
    .like('title', `${QA_TASK_PREFIX}%`).like('related_name', `${QA_CONTACT_PREFIX}%`);
  if (error) fail(`Could not read tasks: ${error.message}`);
  (data ?? []).forEach(t => results.set(t.id, t));
  return [...results.values()];
}

async function seed() {
  const existing = await findQaLists();
  if (existing.length > 0) {
    fail(`A "${QA_LIST_NAME}" list already exists. Run cleanup first:\n         node scripts/qa-seed.mjs cleanup`);
  }

  console.log(`\nSeeding QA data...`);
  const { data: list, error: listErr } = await supabase.from('lists')
    .insert([{ name: QA_LIST_NAME, source: 'Other' }]).select().single();
  if (listErr) fail(`Could not create QA list: ${listErr.message}`);
  console.log(`  + List "${QA_LIST_NAME}"`);

  const contactRows = [
    {
      owner_name: 'QA Test Owner 1', facility_name: 'QA Storage Facility 1',
      phone: '(555) 010-0001', email: 'qa1@example.com',
      address: '1 QA Test Rd, Testville, NY 10001', state: 'NY',
      status: 'fresh', call_history: [], notes: 'QA seed contact — safe to log outcomes against.',
    },
    {
      owner_name: 'QA Test Owner 2', facility_name: 'QA Storage Facility 2',
      phone: '(555) 010-0002', email: 'qa2@example.com',
      address: '2 QA Test Rd, Testville, NY 10001', state: 'NY',
      status: 'fresh', call_history: [], notes: 'QA seed contact — safe to log outcomes against.',
    },
    {
      owner_name: 'QA Test Callback Today', facility_name: 'QA Storage Callback Today',
      phone: '(555) 010-0003', email: 'qa3@example.com',
      address: '3 QA Test Rd, Testville, NY 10001', state: 'NY',
      status: 'callback', callback_date: dateStr(0),
      call_history: [{ date: dateStr(-3), outcome: 'callback', notes: 'QA seed — asked for a callback.' }],
      notes: 'QA seed contact — should appear in Today\'s Callbacks.',
    },
    {
      owner_name: 'QA Test Overdue Callback', facility_name: 'QA Storage Overdue',
      phone: '(555) 010-0004', email: 'qa4@example.com',
      address: '4 QA Test Rd, Testville, NY 10001', state: 'NY',
      status: 'callback', callback_date: dateStr(-2),
      call_history: [{ date: dateStr(-5), outcome: 'callback', notes: 'QA seed — asked for a callback.' }],
      notes: 'QA seed contact — should appear in Overdue Callbacks.',
    },
    {
      owner_name: 'QA Test Follow-Up Needed', facility_name: 'QA Storage Follow-Up',
      phone: '(555) 010-0005', email: 'qa5@example.com',
      address: '5 QA Test Rd, Testville, NY 10001', state: 'NY',
      status: 'conversation',
      call_history: [{ date: dateStr(-4), outcome: 'conversation', notes: 'QA seed — good conversation, no task set.' }],
      notes: 'QA seed contact — should appear in Follow-Up Needed (conversation, no open task).',
    },
  ].map(c => ({ ...c, list_id: list.id }));

  const { data: contacts, error: cErr } = await supabase.from('contacts').insert(contactRows).select();
  if (cErr) fail(`Could not create QA contacts: ${cErr.message}`);
  contacts.forEach(c => console.log(`  + Contact "${c.owner_name}" (${c.status})`));

  const byName = Object.fromEntries(contacts.map(c => [c.owner_name, c]));
  const taskRows = [
    {
      title: `${QA_TASK_PREFIX} Call back — due today`,
      description: 'QA seed task. Complete it via Call Mode\'s outcome checkbox.',
      status: 'open', priority: 'normal', task_type: 'call', due_date: dateStr(0),
      related_type: 'contact', related_id: byName['QA Test Callback Today'].id,
      related_name: 'QA Test Callback Today', source: 'database',
    },
    {
      title: `${QA_TASK_PREFIX} Call back — overdue`,
      description: 'QA seed task. Should rank first (most overdue) in Overdue Callbacks.',
      status: 'open', priority: 'high', task_type: 'call', due_date: dateStr(-2),
      related_type: 'contact', related_id: byName['QA Test Overdue Callback'].id,
      related_name: 'QA Test Overdue Callback', source: 'database',
    },
  ];
  const { data: tasks, error: tErr } = await supabase.from('tasks').insert(taskRows).select();
  if (tErr) fail(`Could not create QA tasks: ${tErr.message}`);
  tasks.forEach(t => console.log(`  + Task "${t.title}" (due ${t.due_date})`));

  console.log(`\nDone. What you should now see in the app (after a refresh):`);
  console.log(`  - Dashboard: +1 callback due today, +1 overdue callback`);
  console.log(`  - Call Mode picker: Today's Callbacks +1, Overdue Callbacks +1, Follow-Up Needed +1`);
  console.log(`  - Database: list "${QA_LIST_NAME}" with 5 contacts (Active List queue: 4 callable)`);
  console.log(`\nWhen finished testing: node scripts/qa-seed.mjs cleanup\n`);
}

// Sprint 11 — seed the exact real-world duplicate pattern Brandon hit
// (Dr. Teekam): same owner name, same property address, DIFFERENT phone
// numbers, one worked/conversation record vs one fresh mass-list import.
// Fake name + fake address on purpose so detection can never cross-match
// against the real Dr. Teekam records.
async function seedDuplicates() {
  let [list] = await findQaLists();
  if (!list) {
    const { data, error } = await supabase.from('lists')
      .insert([{ name: QA_LIST_NAME, source: 'Other' }]).select().single();
    if (error) fail(`Could not create QA list: ${error.message}`);
    list = data;
    console.log(`\n  + List "${QA_LIST_NAME}"`);
  }

  const address = '2126 QA Josey Lane, Carrollton, TX 75006';
  const contactRows = [
    {
      owner_name: 'QA Test Dr Duplicate', facility_name: 'QA Duplicate Storage',
      phone: '(555) 020-0001', email: '',
      address, state: 'TX',
      status: 'conversation',
      call_history: [{ date: dateStr(-7), outcome: 'conversation', notes: 'QA seed — spoke with owner, interested in a valuation.' }],
      notes: 'QA seed — the WORKED record. Duplicate Review should recommend keeping this one.',
    },
    {
      owner_name: 'QA Test Dr Duplicate', facility_name: 'QA Duplicate Storage',
      phone: '(555) 020-0002', email: 'qadup@example.com',
      address: '2126 QA Josey Ln Carrollton TX 75006', // same address, messier formatting
      state: 'TX',
      status: 'fresh', call_history: [],
      source: 'TractIQ', imported_at: new Date().toISOString(),
      notes: '',
    },
  ].map(c => ({ ...c, list_id: list.id }));

  const { data: contacts, error } = await supabase.from('contacts').insert(contactRows).select();
  if (error) fail(`Could not create QA duplicate contacts: ${error.message}`);
  contacts.forEach(c => console.log(`  + Contact "${c.owner_name}" (${c.status}, ${c.phone})`));

  console.log(`\nDone. In Database → Duplicate Review you should see:`);
  console.log(`  - 1 group: High confidence, "Same address + owner" (+ facility/market reasons)`);
  console.log(`  - Recommended keep = the conversation record (555) 020-0001`);
  console.log(`  - Merge should add (555) 020-0002 as an alternate phone + fill blank email`);
  console.log(`  - Then "Delete weaker duplicate?" removes the fresh TractIQ record`);
  console.log(`\nWhen finished testing: node scripts/qa-seed.mjs cleanup\n`);
}

async function status() {
  const lists = await findQaLists();
  const contacts = await findQaContacts(lists.map(l => l.id));
  const tasks = await findQaTasks(contacts.map(c => c.id));
  console.log(`\nQA records currently in Supabase:`);
  console.log(`  Lists:    ${lists.length}`);
  console.log(`  Contacts: ${contacts.length}${contacts.length ? ' — ' + contacts.map(c => c.owner_name).join(', ') : ''}`);
  console.log(`  Tasks:    ${tasks.length}${tasks.length ? ' — ' + tasks.map(t => `"${t.title}" (${t.status})`).join(', ') : ''}`);
  console.log('');
}

async function cleanup() {
  const lists = await findQaLists();
  const candidates = await findQaContacts(lists.map(l => l.id));

  // SAFETY: only contacts actually named "QA Test…" may be deleted.
  const qaContacts = candidates.filter(c => (c.owner_name ?? '').startsWith(QA_CONTACT_PREFIX));
  const skipped = candidates.filter(c => !(c.owner_name ?? '').startsWith(QA_CONTACT_PREFIX));
  skipped.forEach(c => console.warn(
    `  ! SKIPPING "${c.owner_name || c.facility_name || c.id}" — it sits in the QA list but is not a QA-named contact. Move it out manually.`
  ));

  const qaTasks = await findQaTasks(qaContacts.map(c => c.id));

  console.log(`\nCleaning up: ${qaTasks.length} tasks, ${qaContacts.length} contacts, ${lists.length} list(s)...`);

  if (qaTasks.length > 0) {
    const { error } = await supabase.from('tasks').delete().in('id', qaTasks.map(t => t.id));
    if (error) fail(`Could not delete QA tasks: ${error.message}`);
    qaTasks.forEach(t => console.log(`  - Task "${t.title}"`));
  }
  if (qaContacts.length > 0) {
    const { error } = await supabase.from('contacts').delete().in('id', qaContacts.map(c => c.id));
    if (error) fail(`Could not delete QA contacts: ${error.message}`);
    qaContacts.forEach(c => console.log(`  - Contact "${c.owner_name}"`));
  }
  for (const l of lists) {
    // SAFETY: never delete a QA list that still holds a non-QA contact.
    const { data: remaining, error } = await supabase.from('contacts').select('id').eq('list_id', l.id);
    if (error) fail(`Could not verify list ${l.id} is empty: ${error.message}`);
    if ((remaining ?? []).length > 0) {
      console.warn(`  ! NOT deleting list "${l.name}" — ${remaining.length} non-QA contact(s) still inside.`);
      continue;
    }
    const { error: dErr } = await supabase.from('lists').delete().eq('id', l.id);
    if (dErr) fail(`Could not delete QA list: ${dErr.message}`);
    console.log(`  - List "${l.name}"`);
  }

  // Verify nothing QA-flavored is left behind.
  const leftLists = await findQaLists();
  const leftContacts = await findQaContacts(leftLists.map(l => l.id));
  const leftTasks = await findQaTasks(leftContacts.map(c => c.id));
  const leftover = leftLists.length + leftContacts.length + leftTasks.length;
  if (leftover === 0) {
    console.log(`\nVerified clean — no QA lists, contacts, or tasks remain.\n`);
  } else {
    console.warn(`\nWARNING: ${leftover} QA record(s) still present (see skips above). Re-run status to inspect.\n`);
  }
}

const cmd = process.argv[2];
if (cmd === 'seed') await seed();
else if (cmd === 'seed-duplicates') await seedDuplicates();
else if (cmd === 'cleanup') await cleanup();
else if (cmd === 'status') await status();
else {
  console.log(`\nUsage: node scripts/qa-seed.mjs <seed|seed-duplicates|status|cleanup>\n`);
  process.exit(1);
}
