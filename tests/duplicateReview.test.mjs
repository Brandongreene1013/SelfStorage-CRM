import assert from 'node:assert/strict';
import {
  findDuplicateGroups,
  confidenceForReasons,
  DUPLICATE_REASONS,
} from '../src/lib/duplicateReview.js';

// A real duplicate — same address + same owner name — still clusters High.
{
  const contacts = [
    { id: 'a', ownerName: 'Teekam Holdings LLC', address: '200 Pearl St, Granbury TX', phone: '555-111-2222' },
    { id: 'b', ownerName: 'Teekam Holdings', address: '200 Pearl Street, Granbury TX', phone: '555-111-2222' },
  ];
  const groups = findDuplicateGroups(contacts);
  assert.equal(groups.length, 1, 'genuine duplicate still clusters');
  assert.equal(groups[0].confidence, 'High');
}

// A shared/junk email across many distinct owners must NOT cluster them as
// duplicates. Without the guard these six would all pair on the same email.
{
  const contacts = Array.from({ length: 6 }, (_, i) => ({
    id: `owner-${i}`,
    ownerName: `Distinct Owner ${i}`,
    address: `${i} Unique Rd, Townsville TX`,
    email: 'info@catchall.com',
  }));
  const groups = findDuplicateGroups(contacts);
  assert.equal(groups.length, 0, 'a shared email does not cluster unrelated owners');
}

// A shared office phone across many owners likewise does not cluster them.
{
  const contacts = Array.from({ length: 4 }, (_, i) => ({
    id: `p-${i}`,
    ownerName: `Phone Owner ${i}`,
    address: `${i} Separate Ave, Elsewhere TX`,
    phone: '555-222-3333',
  }));
  const groups = findDuplicateGroups(contacts);
  assert.equal(groups.length, 0, 'a shared phone does not cluster unrelated owners');
}

// A genuine one-to-one email match (not shared) still counts and clusters.
{
  const contacts = [
    { id: 'x', ownerName: 'Same Person', email: 'real@person.com' },
    { id: 'y', ownerName: 'Same Person', email: 'real@person.com' },
    // noise so the email index has other values but this pair stays 1 owner-pair
    { id: 'z', ownerName: 'Noise Owner', email: 'noise@z.com' },
  ];
  const groups = findDuplicateGroups(contacts);
  assert.equal(groups.length, 1, 'a non-shared email still clusters a real pair');
  assert.equal(groups[0].confidence, 'High');
}

// confidenceForReasons unchanged: a high reason is High, a soft reason Medium.
assert.equal(confidenceForReasons([DUPLICATE_REASONS.SAME_PHONE]), 'High');
assert.equal(confidenceForReasons([DUPLICATE_REASONS.SIMILAR_OWNER_SAME_ADDRESS]), 'Medium');
assert.equal(confidenceForReasons([]), null);

console.log('duplicate review tests passed');
