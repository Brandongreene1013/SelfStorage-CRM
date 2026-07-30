import assert from 'node:assert/strict';
import {
  classifySchemaProbe,
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
} from '../src/lib/supabaseErrors.js';
import {
  dbToPipelineOpportunity,
  withCanonicalContact,
} from '../src/lib/pipelineOpportunity.js';

assert.equal(isMissingColumnError({
  code: 'PGRST204',
  message: "Could not find the 'owner_identified_at' column",
}, 'owner_identified_at'), true);
assert.equal(isMissingColumnError({
  code: 'PGRST204',
  message: "Could not find the 'owner_identified_at' column",
}, 'lead_source'), false);
assert.equal(isMissingTableError({
  code: 'PGRST205',
  message: "Could not find the table 'public.market_stories'",
}, 'market_stories'), true);
assert.equal(isPermissionDeniedError({ code: '42501', message: 'permission denied' }), true);
assert.equal(classifySchemaProbe(null), 'ready');
assert.equal(classifySchemaProbe({ code: '42501', message: 'permission denied' }), 'server_only');
assert.equal(classifySchemaProbe({
  code: 'PGRST205',
  message: "Could not find the table 'public.market_stories'",
}), 'migration_needed');

const opportunity = dbToPipelineOpportunity({
  id: 'opp-1',
  contact_id: 'contact-1',
  name: 'Stale Name',
  phone: '555-OLD',
  email: 'old@example.com',
  lead_source: 'Cold Call',
  mailing_addresses: [],
  action_log: [],
});
const canonical = withCanonicalContact(opportunity, {
  id: 'contact-1',
  ownerName: 'Current Owner',
  phone: '555-NEW',
  email: 'new@example.com',
  leadSource: 'Referral',
  mailingAddress: '1 Main St',
  mailingAddresses: ['1 Main St'],
  notes: 'Canonical relationship note',
});
assert.equal(canonical.name, 'Current Owner');
assert.equal(canonical.phone, '555-NEW');
assert.equal(canonical.email, 'new@example.com');
assert.equal(canonical.notes, 'Canonical relationship note');
assert.equal(opportunity.name, 'Stale Name');
assert.equal(withCanonicalContact(opportunity, { id: 'different' }), opportunity);

console.log('stabilization tests passed');

