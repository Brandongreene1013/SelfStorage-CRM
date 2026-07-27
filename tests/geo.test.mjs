import assert from 'node:assert/strict';
import { PRESET_ANCHORS, resolveAnchor } from '../src/lib/geo.js';

const geo = {
  zips: {
    '30303': [33.7529, -84.3925],
  },
  places: {
    'atlanta,ga': [33.749, -84.388],
    'springfield,il': [39.7817, -89.6501],
    'springfield,tx': [31.6599, -96.4822],
    'portland,me': [43.6591, -70.2568],
    'portland,or': [45.5152, -122.6784],
  },
};

assert.deepEqual(resolveAnchor('30303', geo), {
  label: 'ZIP 30303',
  coords: [33.7529, -84.3925],
});
assert.deepEqual(resolveAnchor('Atlanta, GA', geo), {
  label: 'Atlanta, GA',
  coords: [33.749, -84.388],
});
assert.deepEqual(resolveAnchor('Atlanta Georgia', geo), {
  label: 'Atlanta, GA',
  coords: [33.749, -84.388],
});
assert.deepEqual(resolveAnchor('Atlanta GA', geo), {
  label: 'Atlanta, GA',
  coords: [33.749, -84.388],
});
assert.equal(resolveAnchor('Springfield', geo), null, 'ambiguous cities must not default to Texas');
assert.equal(resolveAnchor('Portland', geo), null, 'ambiguous cities should require a state');
assert.ok(PRESET_ANCHORS.some(anchor => anchor.label === 'New York'));
assert.ok(PRESET_ANCHORS.some(anchor => anchor.label === 'Los Angeles'));
assert.ok(PRESET_ANCHORS.some(anchor => anchor.label === 'Seattle'));
assert.ok(PRESET_ANCHORS.filter(anchor => ['DFW'].includes(anchor.label)).length <= 1);

console.log('geo tests passed');
