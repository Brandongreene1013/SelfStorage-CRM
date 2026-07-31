import assert from 'node:assert/strict';
import { CRM_HISTORY_LIMIT, popCrmView, pushCrmView } from '../src/lib/crmNavigation.js';

assert.deepEqual(pushCrmView([], 'Dashboard', 'Database'), ['Dashboard']);
assert.deepEqual(pushCrmView(['Dashboard'], 'Database', 'Database'), ['Dashboard']);
assert.deepEqual(pushCrmView(['Dashboard'], 'Database', 'Core Clients'), ['Dashboard', 'Database']);
assert.deepEqual(popCrmView(['Dashboard', 'Database']), { view: 'Database', history: ['Dashboard'] });
assert.deepEqual(popCrmView([]), { view: 'Dashboard', history: [] });

const longHistory = Array.from({ length: CRM_HISTORY_LIMIT + 10 }, (_, index) => `View ${index}`);
assert.equal(pushCrmView(longHistory, 'Pipeline', 'Database').length, CRM_HISTORY_LIMIT);

console.log('CRM navigation tests passed');
