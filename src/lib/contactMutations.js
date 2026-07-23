export function buildContactOutcomeFields(contact, status, callNote, activityDate, options = {}) {
  if (!contact) return null;
  const date = activityDate || new Date().toISOString().slice(0, 10);
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
