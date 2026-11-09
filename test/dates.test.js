// -----------------------------------------------------------------------------
// Due dates: what the forms and scenes accept, when a task becomes overdue
// in the local time of Gladys (daylight saving time included), and how a
// widget row shows it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, formatDue, isOverdue, localNow, parseDue } from '../src/lists/dates.js';

const TODAY = '2026-11-09';

test('parseDue accepts ISO, day-first dates, a time and +N days', () => {
  assert.equal(parseDue('2026-11-20', TODAY), '2026-11-20');
  assert.equal(parseDue('2026-1-5', TODAY), '2026-01-05');
  assert.equal(parseDue('20/11/2026', TODAY), '2026-11-20');
  assert.equal(parseDue('20.11.2026', TODAY), '2026-11-20');
  assert.equal(parseDue('20/11/2026 18:30', TODAY), '2026-11-20T18:30');
  assert.equal(parseDue('2026-11-20T08:05', TODAY), '2026-11-20T08:05');
  assert.equal(parseDue('2026-11-20 8h05', TODAY), '2026-11-20T08:05');
  assert.equal(parseDue('+0', TODAY), TODAY);
  assert.equal(parseDue('+3', TODAY), '2026-11-12');
  assert.equal(parseDue('+ 30', TODAY), '2026-12-09');
  assert.equal(parseDue('+0 20:00', TODAY), '2026-11-09T20:00');
  assert.equal(parseDue('+1 7h30', TODAY), '2026-11-10T07:30');
  assert.equal(parseDue('', TODAY), null);
  assert.equal(parseDue('  ', TODAY), null);
  assert.equal(parseDue(undefined, TODAY), null);
  assert.equal(parseDue(null, TODAY), null);
});

test('parseDue refuses what it does not understand', () => {
  for (const text of [
    'tomorrow',
    '31/02/2026',
    '2026-13-01',
    '20/11/26',
    '2026-11-20 25:00',
    '+9999',
    '1999-01-01',
  ]) {
    assert.throws(() => parseDue(text, TODAY), RangeError, text);
  }
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('localNow follows the time zone of Gladys, daylight saving time included', () => {
  // 23:30 UTC on 9 November is 00:30 on the 10th in Paris (UTC+1).
  assert.deepEqual(localNow(Date.UTC(2026, 10, 9, 23, 30), 'Europe/Paris'), {
    date: '2026-11-10',
    minute: '2026-11-10T00:30',
  });
  // Summer time: UTC+2.
  assert.equal(localNow(Date.UTC(2026, 6, 1, 22, 15), 'Europe/Paris').minute, '2026-07-02T00:15');
  assert.equal(
    localNow(Date.UTC(2026, 6, 1, 22, 15), 'America/New_York').minute,
    '2026-07-01T18:15',
  );
});

test('a whole-day task is overdue the next day, a timed one the next minute', () => {
  const at = (minute) => ({ date: minute.slice(0, 10), minute });
  assert.equal(isOverdue('2026-11-09', at('2026-11-09T23:59')), false);
  assert.equal(isOverdue('2026-11-09', at('2026-11-10T00:00')), true);
  assert.equal(isOverdue('2026-11-09T20:00', at('2026-11-09T20:00')), false);
  assert.equal(isOverdue('2026-11-09T20:00', at('2026-11-09T20:01')), true);
  assert.equal(isOverdue(null, at('2026-11-09T20:01')), false);
  assert.equal(isOverdue('soon', at('2026-11-09T20:01')), false);
});

test('formatDue is short and follows the language', () => {
  assert.equal(formatDue('2026-11-20', 'fr'), '20/11');
  assert.equal(formatDue('2026-11-20', 'de'), '20.11.');
  assert.equal(formatDue('2026-11-20', 'en'), '11/20');
  assert.equal(formatDue('2026-11-20T18:30', 'es'), '20/11 18:30');
  assert.equal(formatDue(null, 'fr'), '');
});
