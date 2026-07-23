import assert from 'node:assert/strict';
import {
  aggregateActivityMetrics,
  buildActivityAnalytics,
  deriveActivityEvents,
  easternDateString,
  hasMeaningfulOwnerName,
  withOwnerIdentificationMilestone,
} from '../src/lib/activityAnalytics.js';

const reportingDate = '2026-07-23';
const contact = {
  id: 'contact-1',
  ownerName: 'Jane Owner',
  ownershipGroupId: 'group-1',
  ownerIdentifiedAt: '2026-07-23T13:00:00.000Z',
  actionLog: [
    {
      eventId: 'call-1',
      type: 'voicemail',
      date: reportingDate,
      at: '2026-07-23T14:00:00.000Z',
      note: 'Left a message',
    },
    {
      eventId: 'email-1',
      type: 'email',
      date: reportingDate,
      at: '2026-07-23T15:00:00.000Z',
      note: 'Sent follow-up',
    },
  ],
  callHistory: [
    { date: reportingDate, outcome: 'voicemail', notes: 'Left a message' },
  ],
};

{
  const analytics = buildActivityAnalytics({ contacts: [contact] }, reportingDate);
  assert.deepEqual(analytics.today, {
    calls: 1,
    voicemails: 1,
    conversations: 0,
    emails: 1,
    tractiqReportsSent: 0,
    meetingsSet: 0,
    ownersIdentified: 1,
    ownersWorked: 1,
    actions: 2,
  });
  assert.equal(analytics.events.filter(event => event.type === 'voicemail').length, 1);
}

{
  const secondOwner = {
    id: 'contact-2',
    ownerName: 'Second Owner',
    actionLog: [{
      eventId: 'call-2',
      type: 'no_answer',
      date: reportingDate,
      at: '2026-07-23T16:00:00.000Z',
    }],
  };
  const metrics = buildActivityAnalytics({ contacts: [contact, secondOwner] }, reportingDate).today;
  assert.equal(metrics.calls, 2);
  assert.equal(metrics.ownersWorked, 2);
  assert.equal(metrics.actions, 3);
}

{
  const task = {
    id: 'task-1',
    title: 'Send TractIQ report',
    taskType: 'tractiq_report',
    status: 'open',
    relatedType: 'contact',
    relatedId: contact.id,
  };
  assert.equal(buildActivityAnalytics({ contacts: [contact], tasks: [task] }, reportingDate).today.tractiqReportsSent, 0);
  const completed = {
    ...task,
    status: 'completed',
    completedAt: '2026-07-23T17:00:00.000Z',
  };
  const metrics = buildActivityAnalytics({ contacts: [contact], tasks: [completed] }, reportingDate).today;
  assert.equal(metrics.tractiqReportsSent, 1);
  assert.equal(metrics.emails, 2);
  assert.equal(metrics.actions, 3);
  assert.equal(metrics.ownersWorked, 1);
}

{
  const appointmentContact = {
    id: 'contact-3',
    ownerName: 'Meeting Owner',
    ownershipGroupId: 'group-3',
    actionLog: [{
      eventId: 'appointment-1',
      type: 'appointment',
      date: reportingDate,
      at: '2026-07-23T14:30:00.000Z',
    }],
  };
  const linkedClient = {
    id: 'client-3',
    name: 'Meeting Owner',
    ownershipGroupId: 'group-3',
  };
  const meeting = {
    id: 'meeting-1',
    clientId: linkedClient.id,
    title: 'Valuation call',
    createdAt: '2026-07-23T14:35:00.000Z',
  };
  const metrics = buildActivityAnalytics({
    contacts: [appointmentContact],
    clients: [linkedClient],
    meetings: [meeting],
  }, reportingDate).today;
  assert.equal(metrics.calls, 1);
  assert.equal(metrics.conversations, 1);
  assert.equal(metrics.meetingsSet, 1);
  assert.equal(metrics.actions, 1);
  assert.equal(metrics.ownersWorked, 1);
}

{
  const duplicateEntries = deriveActivityEvents({
    contacts: [{
      id: 'contact-4',
      ownerName: 'Retry Owner',
      actionLog: [
        { eventId: 'same-event', type: 'no_answer', date: reportingDate },
        { eventId: 'same-event', type: 'no_answer', date: reportingDate },
      ],
    }],
  });
  assert.equal(duplicateEntries.length, 1);
  assert.equal(aggregateActivityMetrics(duplicateEntries, new Set([reportingDate])).calls, 1);
}

{
  const emailEntries = deriveActivityEvents({
    contacts: [{
      id: 'contact-email',
      ownerName: 'Email Owner',
      actionLog: [{ type: 'email', messageId: 'message-1', date: reportingDate }],
    }],
    emailEvents: [{
      direction: 'sent',
      message_id: 'message-1',
      activity_date: reportingDate,
      matched_table: 'contacts',
      matched_id: 'contact-email',
    }],
  });
  const metrics = aggregateActivityMetrics(emailEntries, new Set([reportingDate]));
  assert.equal(metrics.emails, 1);
  assert.equal(metrics.actions, 1);
}

assert.equal(easternDateString('2026-07-24T02:30:00.000Z'), '2026-07-23');
assert.equal(hasMeaningfulOwnerName('  Unknown Owner '), false);
assert.equal(hasMeaningfulOwnerName(' Jane Owner '), true);

{
  const milestone = withOwnerIdentificationMilestone(
    { id: 'contact-5', ownerName: '', ownerIdentifiedAt: null },
    { ownerName: 'New Owner' },
    '2026-07-23T18:00:00.000Z',
  );
  assert.equal(milestone.ownerIdentifiedAt, '2026-07-23T18:00:00.000Z');
  const capitalizationEdit = withOwnerIdentificationMilestone(
    { id: 'contact-5', ownerName: 'New Owner', ownerIdentifiedAt: '2026-07-23T18:00:00.000Z' },
    { ownerName: 'NEW OWNER' },
    '2026-07-24T18:00:00.000Z',
  );
  assert.equal(capitalizationEdit.ownerIdentifiedAt, undefined);
  const failedSaveView = buildActivityAnalytics({
    contacts: [{ id: 'contact-5', ownerName: 'New Owner', ownerIdentifiedAt: null }],
  }, reportingDate);
  assert.equal(failedSaveView.today.ownersIdentified, 0);
}

console.log('activity analytics tests passed');
