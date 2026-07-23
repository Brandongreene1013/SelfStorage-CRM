import assert from 'node:assert/strict';
import { mergeQueueContact } from '../src/components/tasks/taskUtils.js';
import { buildContactOutcomeFields } from '../src/lib/contactMutations.js';

{
  const queueContact = {
    id: 'contact-1',
    ownerName: 'Old Name',
    queueReason: 'Callback task due today',
    queueTaskId: 'task-1',
    queueTaskTitle: 'Call back',
  };
  const latestContact = {
    id: 'contact-1',
    ownerName: 'Current Name',
    status: 'callback',
  };
  const merged = mergeQueueContact(queueContact, latestContact);

  assert.equal(merged.ownerName, 'Current Name');
  assert.equal(merged.queueTaskId, 'task-1');
  assert.equal(merged.queueReason, 'Callback task due today');
  assert.equal(merged.queueTaskTitle, 'Call back');
}

{
  const actionEntry = {
    type: 'callback',
    date: '2026-07-23',
    note: 'Call next week',
    at: '2026-07-23T13:00:00.000Z',
    priority: 'normal',
  };
  const fields = buildContactOutcomeFields({
    callHistory: [{ date: '2026-07-20', outcome: 'voicemail', notes: '' }],
    actionLog: [{ type: 'voicemail', date: '2026-07-20' }],
  }, 'callback', 'Call next week', '2026-07-23', {
    actionEntry,
    callbackDate: '2026-07-30',
    notes: 'Call next week',
  });

  assert.equal(fields.status, 'callback');
  assert.equal(fields.lastCalled, '2026-07-23');
  assert.equal(fields.callbackDate, '2026-07-30');
  assert.equal(fields.notes, 'Call next week');
  assert.equal(fields.callHistory.length, 2);
  assert.deepEqual(fields.callHistory[1], {
    date: '2026-07-23',
    outcome: 'callback',
    notes: 'Call next week',
  });
  assert.equal(fields.actionLog.length, 2);
  assert.deepEqual(fields.actionLog[1], actionEntry);
}

console.log('reliability tests passed');
