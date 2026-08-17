export function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(days, date = new Date()) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return localDateValue(shifted);
}

// Preserve the day the user selected while still recording the exact save time.
// `at` is the occurrence timestamp used by activity displays; `recordedAt` is
// the audit timestamp for when the CRM actually received the entry.
export function activityTimestamps(activityDate, recordedAt = new Date()) {
  const date = activityDate || localDateValue(recordedAt);
  const [year, month, day] = date.split('-').map(Number);
  const occurredAt = new Date(recordedAt);
  occurredAt.setFullYear(year, month - 1, day);
  return {
    date,
    at: occurredAt.toISOString(),
    recordedAt: recordedAt.toISOString(),
  };
}

export function formatActivityDate(dateString) {
  if (!dateString) return '';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
}
