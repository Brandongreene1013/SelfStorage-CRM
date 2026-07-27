import assert from 'node:assert/strict';
import { contactLastActivityAt, sortDatabaseContacts } from '../src/lib/databaseSort.js';

const contacts = [
  {
    id: 'older-contacted',
    ownerName: 'Zoe Owner',
    facilityName: 'Alpha Storage',
    createdAt: '2025-01-01T12:00:00Z',
    callHistory: [{ date: '2026-06-01' }],
  },
  {
    id: 'newer-contacted',
    ownerName: 'Adam Owner',
    facilityName: 'Zulu Storage',
    createdAt: '2026-01-01T12:00:00Z',
    actionLog: [{ at: '2026-07-20T14:00:00Z' }],
  },
  {
    id: 'never-contacted',
    ownerName: 'Casey Owner',
    facilityName: 'Center Storage',
    createdAt: '2025-06-01T12:00:00Z',
  },
];

assert.deepEqual(
  sortDatabaseContacts(contacts, 'newest').map(contact => contact.id),
  ['newer-contacted', 'never-contacted', 'older-contacted'],
);
assert.deepEqual(
  sortDatabaseContacts(contacts, 'oldest').map(contact => contact.id),
  ['older-contacted', 'never-contacted', 'newer-contacted'],
);
assert.deepEqual(
  sortDatabaseContacts(contacts, 'least_recently_contacted').map(contact => contact.id),
  ['never-contacted', 'older-contacted', 'newer-contacted'],
);
assert.deepEqual(
  sortDatabaseContacts(contacts, 'recently_contacted').map(contact => contact.id),
  ['newer-contacted', 'older-contacted', 'never-contacted'],
);
assert.deepEqual(
  sortDatabaseContacts(contacts, 'owner_az').map(contact => contact.id),
  ['newer-contacted', 'never-contacted', 'older-contacted'],
);
assert.equal(contactLastActivityAt(contacts[1]), Date.parse('2026-07-20T14:00:00Z'));
assert.notEqual(sortDatabaseContacts(contacts, 'default'), contacts, 'sorting should not mutate the source array');

console.log('database sort tests passed');
