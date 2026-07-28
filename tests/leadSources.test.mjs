import assert from 'node:assert/strict';
import {
  LEAD_SOURCE_DEFINITIONS,
  LEAD_SOURCES,
  canonicalLeadSource,
  leadSourceOptions,
  matchesLeadSource,
} from '../src/data/constants.js';

assert.deepEqual(LEAD_SOURCES, [
  'TractIQ',
  'Salesforce',
  'Facebook',
  'CoStar',
  'Reonomy',
  'Crexi',
  'LoopNet',
  'BusinessesForSale',
]);
assert.deepEqual(
  LEAD_SOURCE_DEFINITIONS.map(source => source.label),
  LEAD_SOURCES,
);

assert.equal(canonicalLeadSource('Salesforce Screenshot'), 'Salesforce');
assert.equal(canonicalLeadSource('Facebook Group'), 'Facebook');
assert.equal(canonicalLeadSource('Crexi / LoopNet'), 'Crexi / LoopNet');
assert.equal(canonicalLeadSource('Legacy Referral'), 'Legacy Referral');
assert.equal(leadSourceOptions('Legacy Referral')[0], 'Legacy Referral');

assert.equal(matchesLeadSource('Salesforce Screenshot', 'salesforce'), true);
assert.equal(matchesLeadSource('Facebook Marketplace', 'facebook'), true);
assert.equal(matchesLeadSource('Crexi / LoopNet', 'crexi'), true);
assert.equal(matchesLeadSource('Crexi / LoopNet', 'loopnet'), true);
assert.equal(matchesLeadSource('Cold Call', 'salesforce'), false);

console.log('lead source tests passed');
