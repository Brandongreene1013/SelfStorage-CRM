import assert from 'node:assert/strict';
import {
  callModeContactIndex,
  callModeTarget,
  createCallModeSession,
  removeCallModeSessionContact,
  resolveCallModeContact,
} from '../src/lib/callModeSession.js';

const original = [
  { id: 'contact-a', ownerName: 'Alice', status: 'fresh', queueTaskId: 'task-a' },
  { id: 'contact-b', ownerName: 'Bob', status: 'fresh' },
];
const session = createCallModeSession(original);

assert.deepEqual(session.map(contact => contact.id), ['contact-a', 'contact-b']);

// The live queue can shrink after Alice's status changes. Index 0 must remain
// Alice for this call session instead of silently becoming Bob.
const liveContacts = [
  { id: 'contact-a', ownerName: 'Alice Updated', status: 'conversation' },
  { id: 'contact-b', ownerName: 'Bob', status: 'fresh' },
];
const current = resolveCallModeContact(session, 0, liveContacts);
assert.equal(current.id, 'contact-a');
assert.equal(current.ownerName, 'Alice Updated');
assert.equal(current.queueTaskId, 'task-a');

assert.equal(callModeContactIndex(session, 'contact-b'), 1);

const extendedSession = createCallModeSession([...original, { id: 'contact-c', ownerName: 'Carol' }]);
const removedCurrent = removeCallModeSessionContact(extendedSession, 'contact-b', 1);
assert.deepEqual(removedCurrent.queue.map(contact => contact.id), ['contact-a', 'contact-c']);
assert.equal(removedCurrent.index, 1, 'the next contact should move into the removed contact position');

const removedLast = removeCallModeSessionContact(extendedSession, 'contact-c', 2);
assert.deepEqual(removedLast.queue.map(contact => contact.id), ['contact-a', 'contact-b']);
assert.equal(removedLast.index, 1, 'removing the final contact should move back to the new final position');

const removedBeforeCurrent = removeCallModeSessionContact(extendedSession, 'contact-a', 2);
assert.equal(removedBeforeCurrent.index, 1, 'the current position should shift when an earlier contact is removed');

const removedOnly = removeCallModeSessionContact([{ id: 'only' }], 'only', 0);
assert.deepEqual(removedOnly.queue, []);
assert.equal(removedOnly.index, 0);

assert.deepEqual(callModeTarget(current), {
  contactId: 'contact-a',
  ownerName: 'Alice Updated',
  facilityName: '',
  address: '',
});

// Duplicate IDs can never appear twice in one frozen session.
assert.deepEqual(
  createCallModeSession([...original, { id: 'contact-a', ownerName: 'Wrong duplicate' }]).map(contact => contact.id),
  ['contact-a', 'contact-b'],
);

console.log('callModeSession tests passed');
