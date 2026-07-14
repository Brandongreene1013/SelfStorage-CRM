import assert from 'node:assert/strict';
import { normalizeDisplayText, normalizeMeetingText, hasKnownMojibake } from '../src/lib/textNormalize.js';

const cases = [
  ['Florida Team Meeting \u00c3\u201a\u00c2\u00b7 Outlook', 'Florida Team Meeting'],
  ['\u00c3\u00b0\u00c5\u00b8\u00e2\u20ac\u0153 Microsoft Teams Meeting', ''],
  ['Microsoft Teams Meeting - Florida Team Meeting', 'Florida Team Meeting'],
  ['Tom &amp; Jerry Storage', 'Tom & Jerry Storage'],
  ['Jos\u00e9 Alvarez', 'José Alvarez'],
  ['M\u00fcnchen Storage', 'München Storage'],
  ['Long title &#8211; Phase 2', 'Long title – Phase 2'],
];

for (const [input, expected] of cases) {
  assert.equal(normalizeMeetingText(input), expected);
}

assert.equal(normalizeDisplayText(null), '');
assert.equal(normalizeDisplayText(undefined), '');
assert.equal(normalizeDisplayText('Valid \u00e2\u20ac\u0153quoted\u00e2\u20ac\u009d text'), 'Valid "quoted" text');
assert.equal(hasKnownMojibake('Florida Team Meeting \u00c3\u201a\u00c2\u00b7 Outlook'), true);
assert.equal(hasKnownMojibake(normalizeMeetingText('Florida Team Meeting \u00c3\u201a\u00c2\u00b7 Outlook')), false);

console.log('text normalization tests passed');
