import assert from 'node:assert/strict';
import {
  BROKERAGE_CONTINUUM_STAGES,
  brokerageContinuumDirection,
  brokerageContinuumSearchMatches,
  continuumDaysInStage,
  continuumDropRequiresReview,
  continuumTransitionRequirements,
  isBrokerageContinuumStage,
  isContinuumStalled,
  normalizeBrokerageContinuumStage,
  suggestedContinuumStageFromPipeline,
} from '../src/lib/brokerageContinuum.js';

assert.deepEqual(
  BROKERAGE_CONTINUUM_STAGES.map(stage => stage.value),
  [
    'research', 'cold_call', 'first_appointment', 'second_appointment',
    'exclusive_listing', 'market_sell', 'field_offers', 'contract',
    'due_diligence', 'close', 'post_close',
  ],
  'canonical stages remain ordered and stable',
);
assert.equal(isBrokerageContinuumStage('due_diligence'), true);
assert.equal(isBrokerageContinuumStage('Valuation'), false);
assert.equal(normalizeBrokerageContinuumStage('Valuation'), 'research');
assert.equal(brokerageContinuumDirection('field_offers', 'market_sell'), 'backward');
assert.equal(brokerageContinuumDirection('post_close', 'exclusive_listing'), 'backward');
assert.equal(continuumTransitionRequirements('cold_call', 'exclusive_listing').reasonRequired, true);
assert.equal(continuumTransitionRequirements('contract', 'due_diligence').reasonRequired, false);
assert.equal(continuumTransitionRequirements('contract', 'market_sell', 'contract_terminated').noteRequired, true);
assert.equal(continuumDropRequiresReview('research', 'cold_call'), false);
assert.equal(continuumDropRequiresReview('research', 'first_appointment'), false);
assert.equal(continuumDropRequiresReview('research', 'exclusive_listing'), true);
assert.equal(continuumDropRequiresReview('due_diligence', 'market_sell'), true);
assert.equal(brokerageContinuumSearchMatches('first_appointment', 'first appt'), true);
assert.equal(brokerageContinuumSearchMatches('due_diligence', 'dd'), true);
assert.equal(continuumDaysInStage('2026-07-20T12:00:00Z', new Date('2026-07-30T12:00:00Z')), 10);
assert.equal(suggestedContinuumStageFromPipeline(8), 'contract');
assert.equal(suggestedContinuumStageFromPipeline(9), 'close');

const stalledProfile = {
  contactId: 'contact-1',
  brokerageContinuumStage: 'cold_call',
  brokerageContinuumStageEnteredAt: '2026-07-01T12:00:00Z',
  sellingTimeline: 'unknown',
};
assert.equal(isContinuumStalled(stalledProfile, [], '2026-07-30'), true);
assert.equal(isContinuumStalled(stalledProfile, [{
  status: 'open',
  relatedType: 'contact',
  relatedId: 'contact-1',
  dueDate: '2026-08-02',
}], '2026-07-30'), false);

console.log('brokerage continuum tests passed');
