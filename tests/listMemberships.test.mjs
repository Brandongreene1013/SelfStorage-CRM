import assert from 'node:assert/strict';
import { contactInList, originatingListIds, planListDeletion } from '../src/lib/listMemberships.js';

const contact = {
  id: 'contact-1',
  listId: 'master',
  listIds: ['master', 'dfw-owners', 'q3-callbacks'],
};

assert.equal(contactInList(contact, 'master'), true);
assert.equal(contactInList(contact, 'dfw-owners'), true);
assert.equal(contactInList(contact, 'q3-callbacks'), true);
assert.equal(contactInList(contact, 'unrelated-list'), false);
assert.equal(contactInList({ listId: 'legacy-list' }, 'legacy-list'), true);
assert.equal(contactInList(null, 'master'), false);

assert.deepEqual(
  originatingListIds(contact, 'master', ['dfw-owners', 'q3-callbacks']),
  ['dfw-owners', 'q3-callbacks'],
  'originating lists should preserve their stored order and exclude Master',
);
assert.deepEqual(
  originatingListIds(contact, 'master', ['q3-callbacks']),
  ['q3-callbacks'],
  'deleted or unavailable lists should not be offered as destinations',
);

// ── planListDeletion: the guard against the "deleted list dumps contacts into
//    Master Database" regression. ───────────────────────────────────────────
const MASTER = 'master';
const DEAD = 'cleburne-car-wash';
const OTHER = 'dfw-owners';

const roster = [
  { id: 'only',       listId: DEAD,  listIds: [DEAD] },                 // list-only → delete
  { id: 'multi',      listId: DEAD,  listIds: [DEAD, OTHER] },          // also elsewhere → re-home to OTHER
  { id: 'protected',  listId: DEAD,  listIds: [DEAD] },                 // backs a deal → re-home to Master
  { id: 'prot-multi', listId: DEAD,  listIds: [DEAD, OTHER] },          // protected AND elsewhere → OTHER (stay out of Master)
  { id: 'membered',   listId: OTHER, listIds: [OTHER, DEAD] },          // home is elsewhere, only membered → untouched
  { id: 'bystander',  listId: OTHER, listIds: [OTHER] },                // unrelated → untouched
];

const plan = planListDeletion(roster, DEAD, MASTER, new Set(['protected', 'prot-multi']));

assert.deepEqual(plan.deletableIds, ['only'],
  'a list-only, unprotected contact must be deleted with the list');

const target = id => plan.rehome.find(r => r.id === id)?.target;
assert.equal(target('multi'), OTHER, 'a multi-list contact re-homes to its other list');
assert.equal(target('protected'), MASTER, 'a deal-linked contact with no other list is preserved in Master');
assert.equal(target('prot-multi'), OTHER, 'a protected contact that is also on another list stays out of Master');
assert.equal(target('membered'), undefined, 'a contact merely membered in the deleted list is left alone');
assert.equal(target('bystander'), undefined, 'an unrelated contact is never touched');

// The core anti-regression contract: no list-only, unprotected contact may ever
// be quietly re-homed into Master Database.
const deletableSet = new Set(plan.deletableIds);
for (const move of plan.rehome) {
  const contact = roster.find(c => c.id === move.id);
  const otherLists = contact.listIds.filter(id => id !== DEAD && id !== MASTER);
  if (move.target === MASTER) {
    assert.ok(otherLists.length === 0, `${move.id} only lands in Master when it has no other list`);
    assert.ok(!deletableSet.has(move.id));
  }
}

// The Master Database itself can never be the delete target.
assert.deepEqual(planListDeletion(roster, MASTER, MASTER), { deletableIds: [], rehome: [] },
  'deleting the Master list is a no-op plan');

console.log('list membership tests passed');
