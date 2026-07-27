import assert from 'node:assert/strict';
import { marketFromRecord, inferActiveMarkets } from '../api/_intelligenceMarkets.js';

assert.deepEqual(
  marketFromRecord({ address: '123 Main St, Dallas, TX 75201' }),
  { label: 'Dallas, TX', city: 'Dallas', state: 'TX' },
);
assert.deepEqual(
  marketFromRecord({ market: 'Atlanta GA' }),
  { label: 'Atlanta, GA', city: 'Atlanta', state: 'GA' },
);

const now = new Date('2026-07-27T12:00:00Z').getTime();
const markets = inferActiveMarkets({
  contacts: [
    {
      id: 'contact-dallas', city: 'Dallas', state: 'TX',
      callback_date: '2026-07-28',
      action_log: [{ at: '2026-07-26T15:00:00Z' }],
    },
    { id: 'contact-atlanta', city: 'Atlanta', state: 'GA', action_log: [] },
  ],
  clients: [
    { id: 'client-dallas', contact_id: 'contact-dallas', stage_id: 6, updated_at: '2026-07-25T12:00:00Z' },
    { id: 'client-atlanta', contact_id: 'contact-atlanta', stage_id: 2, updated_at: '2026-04-01T12:00:00Z' },
    { id: 'closed', address: 'Orlando, FL', stage_id: 10, updated_at: '2025-01-01T12:00:00Z' },
  ],
  properties: [{ id: 'property-houston', city: 'Houston', state: 'TX', updated_at: '2026-07-26T12:00:00Z' }],
  tasks: [
    { status: 'open', priority: 'urgent', due_date: '2026-07-28', related_type: 'property', related_id: 'property-houston' },
    { status: 'completed', priority: 'urgent', due_date: '2026-07-28', related_type: 'contact', related_id: 'contact-atlanta' },
  ],
}, { now });

assert.equal(markets[0].label, 'Dallas, TX', 'advanced pipeline + recent callback ranks first');
assert.ok(markets.some(market => market.label === 'Houston, TX'), 'open property task creates an active-market signal');
assert.ok(!markets.some(market => market.label === 'Orlando, FL'), 'old post-close record is not treated as active');
assert.ok(markets[0].reasons.includes('recent calls or actions'));

console.log('intelligence active-market tests passed');
