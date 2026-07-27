import assert from 'node:assert/strict';
import {
  buildCrmExport,
  getCrmRecord,
  searchCrm,
  searchCrmActivity,
  summarizeCrm,
} from '../api/_crmAnalyst.js';

const snapshot = {
  counts: {
    contacts: 2,
    clients: 1,
    properties: 1,
    ownershipGroups: 1,
    lists: 1,
    tasks: 2,
    meetings: 1,
  },
  records: [
    {
      recordType: 'contact',
      id: 'contact-1',
      name: 'Jordan Smith',
      ownerEntity: 'Smith Storage LLC',
      relationshipType: 'Owner',
      facilityName: 'Lone Star Storage',
      facilityAddress: '100 Main St',
      city: 'Austin',
      state: 'TX',
      market: 'Austin, TX',
      phone: '512-555-0100',
      email: 'jordan@example.com',
      leadSource: 'Cold Call',
      status: 'working',
      leadTemperature: 'warm',
      notes: 'Interested in selling after the expansion is leased.',
      listName: 'Texas Owners',
      actionLog: [
        {
          eventId: 'event-1',
          type: 'conversation',
          date: '2026-07-26',
          at: '2026-07-26T15:00:00Z',
          note: 'Discussed expansion timeline and a possible September follow-up.',
        },
      ],
      callHistory: [
        {
          outcome: 'conversation',
          date: '2026-07-26',
          notes: 'Discussed expansion timeline and a possible September follow-up.',
        },
        {
          outcome: 'left_vm',
          date: '2026-07-20',
          notes: 'Left a voicemail about the Austin facility.',
        },
      ],
      createdAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-07-26T15:00:00Z',
    },
    {
      recordType: 'contact',
      id: 'contact-2',
      name: 'Formula Test',
      facilityName: 'Coastal Storage',
      state: 'FL',
      market: 'Tampa, FL',
      phone: '',
      email: '',
      notes: '=HYPERLINK("bad")',
      actionLog: [],
      callHistory: [],
    },
    {
      recordType: 'client',
      id: 'client-1',
      contactId: 'contact-1',
      name: 'Jordan Smith',
      relationshipType: 'Seller',
      facilityName: 'Lone Star Storage',
      facilityAddress: '100 Main St',
      city: 'Austin',
      state: 'TX',
      market: 'Austin, TX',
      phone: '512-555-0100',
      email: 'jordan@example.com',
      status: '1st Appointment',
      pipelineStage: '1st Appointment',
      pipelineStageId: 3,
      leadTemperature: 'warm',
      notes: 'Potential exclusive listing.',
      actionLog: [],
      createdAt: '2026-07-15T10:00:00Z',
    },
    {
      recordType: 'property',
      id: 'property-1',
      name: 'Jordan Smith',
      facilityName: 'Lone Star Storage',
      facilityAddress: '100 Main St',
      city: 'Austin',
      state: 'TX',
      market: 'Austin, TX',
      notes: 'Climate controlled expansion.',
    },
    {
      recordType: 'task',
      id: 'task-1',
      name: 'Jordan Smith',
      title: 'Call after expansion opens',
      description: 'Ask for updated rent roll.',
      status: 'open',
      priority: 'high',
      dueDate: '2026-07-25',
    },
    {
      recordType: 'task',
      id: 'task-2',
      title: 'Completed research',
      status: 'completed',
      dueDate: '2026-07-10',
    },
    {
      recordType: 'meeting',
      id: 'meeting-1',
      name: 'Jordan Smith',
      title: 'Property tour',
      date: '2099-09-01',
      facilityName: 'Lone Star Storage',
    },
  ],
};

{
  const result = searchCrm(snapshot, { query: 'expansion timeline' });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.results[0].id, 'contact-1');
  assert.ok(result.results[0].matchingSnippets.some(snippet => /expansion timeline/i.test(snippet)));
}

{
  const result = searchCrm(snapshot, {
    recordTypes: ['contact'],
    state: 'TX',
    leadTemperature: 'warm',
    hasEmail: true,
  });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.results[0].name, 'Jordan Smith');
}

{
  const result = searchCrmActivity(snapshot, {
    name: 'Jordan',
    query: 'September follow-up',
  });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.activities[0].type, 'conversation');
  assert.equal(result.activities[0].date, '2026-07-26');
}

{
  const result = searchCrmActivity(snapshot, {
    activityTypes: ['voicemail'],
  });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.activities[0].type, 'left_vm');
}

{
  const result = getCrmRecord(snapshot, { recordType: 'contact', id: 'contact-1' });
  assert.equal(result.found, true);
  assert.equal(result.record.activities.length, 2);
  assert.equal('actionLog' in result.record, false);
}

{
  const result = summarizeCrm(snapshot);
  assert.equal(result.contacts.withEmail, 1);
  assert.equal(result.clients.byPipelineStage['1st Appointment'], 1);
  assert.equal(result.tasks.open, 1);
  assert.equal(result.meetings.upcoming, 1);
}

{
  const result = buildCrmExport(snapshot, {
    title: 'Warm Texas Owners',
    recordTypes: ['contact', 'client'],
    state: 'TX',
    hasEmail: true,
    columns: ['name', 'email', 'phone', 'facilityName', 'facilityAddress'],
  });
  assert.equal(result.filename, 'Warm Texas Owners.xlsx');
  assert.equal(result.rowCount, 1, 'linked contact/client records should be deduplicated');
  assert.deepEqual(result.columns.map(column => column.key), [
    'name',
    'email',
    'phone',
    'facilityName',
    'facilityAddress',
  ]);
}

{
  const result = buildCrmExport(snapshot, {
    title: 'Formula Safe',
    recordTypes: ['contact'],
    query: 'Formula Test',
    columns: ['name', 'notes'],
  });
  assert.equal(result.rows[0].notes, '\'=HYPERLINK("bad")');
}

console.log('crmAnalyst tests passed');
