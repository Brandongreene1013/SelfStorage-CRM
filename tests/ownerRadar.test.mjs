import assert from 'node:assert/strict';
import {
  buildRelatedOwnerCandidates,
  normalizePropertyAddress,
  subjectPropertyPayload,
} from '../src/lib/ownerRadar.js';

const masterListId = 'master';
const subject = {
  id: 'subject',
  listId: 'call-list',
  ownerName: 'Teekam Holdings LLC',
  phone: '(555) 111-2222',
  email: 'owner@example.com',
  facilityName: 'Teekam Storage Granbury',
  address: '200 Pearl Street, Granbury, TX 76048',
};

const masterOwner = {
  id: 'master-owner',
  listId: masterListId,
  ownerName: 'Teekam Holdings',
  phone: '555-111-2222',
  email: 'owner@example.com',
  ownershipGroupId: 'group-1',
};

const unrelated = {
  id: 'unrelated',
  listId: masterListId,
  ownerName: 'Someone Else',
  phone: '555-999-0000',
  email: 'else@example.com',
};

const matches = buildRelatedOwnerCandidates(subject, [subject, masterOwner, unrelated], masterListId);
assert.equal(matches.length, 1);
assert.equal(matches[0].contact.id, masterOwner.id);
assert.match(matches[0].reason, /Same email/);
assert.match(matches[0].reason, /Same phone/);
assert.match(matches[0].reason, /Same owner name/);

assert.equal(normalizePropertyAddress('200 Pearl Street, Unit 4'), '200 pearl st 4');

const property = subjectPropertyPayload(subject, 'group-1');
assert.equal(property.ownershipGroupId, 'group-1');
assert.equal(property.facilityName, subject.facilityName);
assert.equal(property.city, 'Granbury');
assert.equal(property.state, 'TX');

console.log('owner radar tests passed');
