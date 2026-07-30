import assert from 'node:assert/strict';
import {
  coreClientToDb,
  dbToCoreClient,
} from '../src/lib/coreClients.js';

const legacy = dbToCoreClient({
  id: 'core-1',
  contact_id: 'contact-1',
});
assert.equal(legacy.brokerageContinuumStage, 'research', 'existing profiles default to Research');

const mapped = dbToCoreClient({
  id: 'core-2',
  contact_id: 'contact-2',
  brokerage_continuum_stage: 'second_appointment',
  brokerage_continuum_stage_entered_at: '2026-07-20T12:00:00Z',
});
assert.equal(mapped.brokerageContinuumStage, 'second_appointment');
assert.equal(mapped.brokerageContinuumStageEnteredAt, '2026-07-20T12:00:00Z');

const payload = coreClientToDb({
  contactId: 'contact-2',
});
assert.equal('brokerage_continuum' in payload, false, 'general profile saves cannot overwrite the audited stage');
assert.equal('brokerage_continuum_stage' in payload, false, 'stage changes must use the transactional RPC');

console.log('core client mapping tests passed');
