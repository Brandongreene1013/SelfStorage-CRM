import assert from 'node:assert/strict';
import { isActivePipelineOpportunity } from '../src/lib/pipelineOpportunity.js';

assert.equal(isActivePipelineOpportunity({ archivedAt: null }), true);
assert.equal(isActivePipelineOpportunity({ archivedAt: undefined }), true);
assert.equal(isActivePipelineOpportunity({ archivedAt: '2026-08-07T12:00:00.000Z' }), false);

console.log('pipelineOpportunity tests passed');
