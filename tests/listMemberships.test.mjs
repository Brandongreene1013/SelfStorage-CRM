import assert from 'node:assert/strict';
import { contactInList } from '../src/lib/listMemberships.js';

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

console.log('list membership tests passed');
