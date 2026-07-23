import assert from 'node:assert/strict';
import { mergeDashboardMeetings } from '../src/lib/calendarEvents.js';

const crm = {
  id: 'meeting-1',
  clientId: 'client-1',
  date: '2026-07-23',
  startTime: '10:00 AM',
  title: 'Owner call',
};
const syncedDuplicate = {
  id: 'cal-1',
  source: 'outlook',
  sourceEventId: 'outlook-1',
  clientId: 'client-1',
  date: '2026-07-23',
  startTime: '10:00 AM',
  title: ' Owner  call ',
};
const distinct = {
  ...syncedDuplicate,
  id: 'cal-2',
  sourceEventId: 'outlook-2',
  startTime: '11:00 AM',
};

const merged = mergeDashboardMeetings([crm], [syncedDuplicate, distinct]);
assert.equal(merged.length, 2);
assert.equal(merged[0].id, 'meeting-1');

const duplicateSync = mergeDashboardMeetings([], [syncedDuplicate, { ...syncedDuplicate, id: 'cal-retry' }]);
assert.equal(duplicateSync.length, 1);

console.log('calendar event tests passed');
