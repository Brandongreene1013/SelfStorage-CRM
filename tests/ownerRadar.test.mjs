import assert from 'node:assert/strict';
import {
  buildRelatedOwnerCandidates,
  buildSharedContactInfoIndex,
  isSharedEmail,
  isSharedPhone,
  normalizePropertyAddress,
  relatedOwnerPairKey,
  SHARED_CONTACT_MIN_OWNERS,
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

// ── Shared / junk contact info ───────────────────────────────────────────────
assert.equal(SHARED_CONTACT_MIN_OWNERS, 3);

{
  // An email on 3+ distinct owners is shared; on 2 it is not.
  const contacts = [
    { id: 'a', ownerName: 'Alpha Owner', email: 'info@shared.com' },
    { id: 'b', ownerName: 'Beta Owner', email: 'info@shared.com' },
    { id: 'c', ownerName: 'Gamma Owner', email: 'info@shared.com' },
    { id: 'd', ownerName: 'Delta Owner', email: 'pair@only.com' },
    { id: 'e', ownerName: 'Epsilon Owner', email: 'pair@only.com' },
    { id: 'f', ownerName: 'Zeta Owner', phone: '555-000-1111' },
    { id: 'g', ownerName: 'Eta Owner', phone: '1-555-000-1111' },
    { id: 'h', ownerName: 'Theta Owner', phone: '(555) 000-1111' },
  ];
  const index = buildSharedContactInfoIndex(contacts);
  assert.equal(isSharedEmail(index, 'info@shared.com'), true, 'email on 3 owners is shared');
  assert.equal(isSharedEmail(index, 'pair@only.com'), false, 'email on 2 owners is not shared');
  assert.equal(isSharedPhone(index, '555-000-1111'), true, 'phone on 3 owners is shared (format-insensitive)');

  // Three properties of ONE owner sharing a personal email must NOT be shared.
  const oneOwner = [
    { id: '1', ownershipGroupId: 'g1', ownerName: 'Solo Owner', email: 'solo@owner.com' },
    { id: '2', ownershipGroupId: 'g1', ownerName: 'Solo Owner', email: 'solo@owner.com' },
    { id: '3', ownershipGroupId: 'g1', ownerName: 'Solo Owner', email: 'solo@owner.com' },
  ];
  assert.equal(isSharedEmail(buildSharedContactInfoIndex(oneOwner), 'solo@owner.com'), false,
    'one owner across three rows is a single distinct owner');
}

{
  // The phantom case: one call record whose junk email hits several master
  // owners. Email-only-on-a-shared-value candidates are dropped, not shown.
  const sub = { id: 'call', listId: 'call-list', ownerName: 'Cleburne Caller', email: 'info@shared.com' };
  const masters = ['Owner One', 'Owner Two', 'Owner Three'].map((name, i) => ({
    id: `m${i}`, listId: masterListId, ownerName: name, email: 'info@shared.com',
  }));
  const all = [sub, ...masters];
  const phantom = buildRelatedOwnerCandidates(sub, all, masterListId);
  assert.equal(phantom.length, 0, 'shared-email-only candidates are dropped');

  // A shared email PLUS a genuine name match survives, but only as Medium with
  // a shared-signal flag (not a Strong/High match).
  const sameName = { id: 'mn', listId: masterListId, ownerName: 'Cleburne Caller', email: 'info@shared.com' };
  const withName = buildRelatedOwnerCandidates(sub, [...all, sameName], masterListId);
  assert.equal(withName.length, 1);
  assert.equal(withName[0].contact.id, 'mn');
  assert.equal(withName[0].confidence, 'Medium', 'shared email cannot make it High');
  assert.equal(withName[0].sharedSignal, true);
  const emailSignal = withName[0].signals.find(s => s.type === 'email');
  assert.equal(emailSignal.exact, false, 'shared email signal is not exact');

  // A genuine one-to-one email match (email on just this pair) still reads High.
  const sub2 = { id: 'call2', listId: 'call-list', ownerName: 'Real Person', email: 'unique@owner.com' };
  const m5 = { id: 'm5', listId: masterListId, ownerName: 'Real Person', email: 'unique@owner.com' };
  const genuine = buildRelatedOwnerCandidates(sub2, [sub2, m5, ...masters], masterListId);
  assert.equal(genuine.length, 1);
  assert.equal(genuine[0].contact.id, 'm5');
  assert.equal(genuine[0].confidence, 'High', 'a non-shared email match is still Strong');
  assert.equal(genuine[0].sharedSignal, false);
}

assert.equal(normalizePropertyAddress('200 Pearl Street, Unit 4'), '200 pearl st 4');

const property = subjectPropertyPayload(subject, 'group-1');
assert.equal(property.ownershipGroupId, 'group-1');
assert.equal(property.facilityName, subject.facilityName);
assert.equal(property.city, 'Granbury');
assert.equal(property.state, 'TX');

console.log('owner radar tests passed');
