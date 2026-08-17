import { localDateValue } from './activityDates.js';

export function buildContactOutcomeFields(contact, status, callNote, activityDate, options = {}) {
  if (!contact) return null;
  const date = activityDate || localDateValue();
  const fields = {
    status,
    callHistory: [
      ...(contact.callHistory ?? []),
      { date, outcome: status, notes: callNote ?? '' },
    ],
    lastCalled: date,
  };
  if (options.callbackDate !== undefined) fields.callbackDate = options.callbackDate;
  if (options.notes !== undefined) fields.notes = options.notes;
  if (options.actionEntry) {
    fields.actionLog = [...(contact.actionLog ?? []), options.actionEntry];
  }
  return fields;
}
