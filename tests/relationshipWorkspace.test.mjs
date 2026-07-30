import assert from 'node:assert/strict';
import {
  coreClientAttention,
  isMeaningfulOwnerActivity,
  lastMeaningfulContactAt,
  pipelineAttention,
  pipelineStageEnteredAt,
} from '../src/lib/relationshipWorkspace.js';

assert.equal(isMeaningfulOwnerActivity({ type: 'conversation' }), true);
assert.equal(isMeaningfulOwnerActivity({ type: 'email' }), true);
assert.equal(isMeaningfulOwnerActivity({ type: 'note' }), false);
assert.equal(isMeaningfulOwnerActivity({ type: 'research' }), false);
assert.equal(isMeaningfulOwnerActivity({ type: 'conversation', meaningfulContact: false }), false);

const contact = {
  id: 'contact-1',
  actionLog: [
    { type: 'note', at: '2026-07-25T12:00:00Z' },
    { type: 'conversation', at: '2026-07-20T12:00:00Z' },
    { type: 'email', at: '2026-07-24T12:00:00Z' },
  ],
};
assert.equal(lastMeaningfulContactAt(contact), '2026-07-24T12:00:00Z');

const profile = {
  contactId: 'contact-1',
  followUpFrequencyDays: 3,
  nextAction: '',
  nextActionDueDate: '',
  brokerageContinuumStage: 'cold_call',
  brokerageContinuumStageEnteredAt: '2026-07-01T12:00:00Z',
};
const coreAttention = coreClientAttention(profile, contact, [], '2026-07-29');
assert.equal(coreAttention.daysSinceContact, 5);
assert.equal(coreAttention.cadenceOverdue, true);
assert.equal(coreAttention.noNextAction, true);
assert.equal(coreAttention.continuumDaysInStage, 28);
assert.equal(coreAttention.continuumStalled, true);
assert.equal(coreAttention.neglected, true);

const client = {
  id: 'client-1',
  stageId: 4,
  createdAt: '2026-06-01T12:00:00Z',
  updatedAt: '2026-07-01T12:00:00Z',
  actionLog: [
    {
      type: 'pipeline_stage_changed',
      newStageId: 4,
      at: '2026-07-10T12:00:00Z',
    },
  ],
};
assert.equal(pipelineStageEnteredAt(client), '2026-07-10T12:00:00Z');
const pipelineStatus = pipelineAttention(client, [], '2026-07-29');
assert.equal(pipelineStatus.daysInStage, 19);
assert.equal(pipelineStatus.noNextAction, true);

console.log('relationship workspace tests passed');
