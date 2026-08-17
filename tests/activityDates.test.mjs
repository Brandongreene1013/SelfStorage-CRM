import test from 'node:test';
import assert from 'node:assert/strict';
import { activityTimestamps, addLocalDays, localDateValue } from '../src/lib/activityDates.js';

test('localDateValue uses local calendar fields instead of UTC slicing', () => {
  const date = new Date(2026, 7, 17, 23, 30);
  assert.equal(localDateValue(date), '2026-08-17');
});

test('activityTimestamps records selected occurrence date and actual save time', () => {
  const saved = new Date(2026, 7, 17, 12, 8, 38, 803);
  const result = activityTimestamps('2026-08-12', saved);
  assert.equal(result.date, '2026-08-12');
  assert.equal(result.recordedAt, saved.toISOString());
  const occurred = new Date(result.at);
  assert.equal(occurred.getFullYear(), 2026);
  assert.equal(occurred.getMonth(), 7);
  assert.equal(occurred.getDate(), 12);
  assert.equal(occurred.getHours(), saved.getHours());
});

test('addLocalDays remains correct across month boundaries', () => {
  assert.equal(addLocalDays(1, new Date(2026, 7, 31, 23, 30)), '2026-09-01');
});
