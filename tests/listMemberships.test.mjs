import assert from 'node:assert/strict';
import { contactInList, originatingListIds } from '../src/lib/listMemberships.js';

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

console.log('list membership tests passed');
