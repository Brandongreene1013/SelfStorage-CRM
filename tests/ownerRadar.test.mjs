import assert from 'node:assert/strict';
import {
  buildRelatedOwnerCandidates,
  normalizePropertyAddress,
  relatedOwnerPairKey,
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

// Structured signals + confidence: an exact contact-info match reads as High.
assert.equal(matches[0].confidence, 'High');
assert.deepEqual(matches[0].signals.map(s => s.type), ['email', 'phone', 'name']);
assert.equal(matches[0].pairKey, relatedOwnerPairKey(subject.id, masterOwner.id));

// pairKey is order-independent and matches the duplicate-group key format.
assert.equal(relatedOwnerPairKey('b', 'a'), 'a|b');
assert.equal(relatedOwnerPairKey('a', 'b'), relatedOwnerPairKey('b', 'a'));

// Name-only match reads as Medium (softer hint), and exact matches outrank it.
{
  const nameOnly = {
    id: 'name-only', listId: masterListId,
    ownerName: 'Teekam Holdings', phone: '555-777-8888', email: 'different@example.com',
  };
  const ranked = buildRelatedOwnerCandidates(subject, [subject, nameOnly, masterOwner], masterListId);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].contact.id, masterOwner.id, 'exact contact-info match ranks first');
  assert.equal(ranked[0].confidence, 'High');
  const nameOnlyResult = ranked.find(r => r.contact.id === 'name-only');
  assert.equal(nameOnlyResult.confidence, 'Medium');
  assert.deepEqual(nameOnlyResult.signals.map(s => s.type), ['name']);
}

// Dismissed pairs are filtered out and stay gone.
{
  const dismissedKeys = new Set([relatedOwnerPairKey(subject.id, masterOwner.id)]);
  const afterDismiss = buildRelatedOwnerCandidates(subject, [subject, masterOwner, unrelated], masterListId, { dismissedKeys });
  assert.equal(afterDismiss.length, 0, 'dismissed candidate is removed');
}

assert.equal(normalizePropertyAddress('200 Pearl Street, Unit 4'), '200 pearl st 4');

const property = subjectPropertyPayload(subject, 'group-1');
assert.equal(property.ownershipGroupId, 'group-1');
assert.equal(property.facilityName, subject.facilityName);
assert.equal(property.city, 'Granbury');
assert.equal(property.state, 'TX');

console.log('owner radar tests passed');
