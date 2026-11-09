// -----------------------------------------------------------------------------
// Due dates of the tasks, in the local time of Gladys (the supervisor injects
// TZ). A due date is stored as typed by the user, normalized to a local
// `YYYY-MM-DD` (the whole day) or `YYYY-MM-DDTHH:MM` (that minute): no time
// zone conversion ever happens on stored values, and both forms compare as
// strings with the local "now" of the same shape.
// -----------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value) => String(value).padStart(2, '0');

/**
 * The local date and minute at `now` in `timeZone`.
 * @param {number} now milliseconds since the epoch
 * @param {string} [timeZone] IANA name, the system zone when omitted
 * @returns {{ date: string, minute: string }} `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`
 */
export function localNow(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minute: `${date}T${parts.hour}:${parts.minute}` };
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** `YYYY-MM-DD` plus `days` days. */
export function addDays(date, days) {
  const [, year, month, day] = date.match(DATE).map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Parse a due date typed in a form or computed by a scene.
 * Accepted: `2026-11-20`, `20/11/2026`, `20.11.2026`, each optionally followed
 * by a time (`18:30`, `18h30`), and `+N` (N days from today, 0 to 3650),
 * optionally with a time too (`+0 20:00`: tonight at 8 pm).
 * @param {unknown} raw
 * @param {string} today local `YYYY-MM-DD`
 * @returns {string|null} normalized due date, null when empty
 * @throws {RangeError} when the text is not understood
 */
export function parseDue(raw, today) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = String(raw).trim();
  if (text === '') {
    return null;
  }
  const relative = text.match(/^\+\s*(\d{1,4})(?:\s+(\d{1,2})[:hH](\d{2}))?$/);
  if (relative && Number(relative[1]) > 3650) {
    throw new RangeError(`Due date out of range: ${text}`);
  }
  const match = relative
    ? [text, ...addDays(today, Number(relative[1])).split('-'), relative[2], relative[3]]
    : (text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:hH](\d{2}))?$/) ??
      text
        .match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{1,2})[:hH](\d{2}))?$/)
        ?.map((value, index, all) => (index === 1 ? all[3] : index === 3 ? all[1] : value)));
  if (!match) {
    throw new RangeError(`Due date not understood: ${text}`);
  }
  const [year, month, day] = match.slice(1, 4).map(Number);
  if (year < 2000 || year > 2999 || !validDate(year, month, day)) {
    throw new RangeError(`Due date not understood: ${text}`);
  }
  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (match[4] === undefined) {
    return date;
  }
  const [hour, minute] = [Number(match[4]), Number(match[5])];
  if (hour > 23 || minute > 59) {
    throw new RangeError(`Due date not understood: ${text}`);
  }
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

/** A stored due date that is still well-formed (a hand-edited file may not be). */
export function isDue(value) {
  return typeof value === 'string' && (DATE.test(value) || DATE_TIME.test(value));
}

/**
 * Overdue: a whole-day due date once that day is over, a due date with a time
 * once that minute is over.
 * @param {string|null} due
 * @param {{ date: string, minute: string }} local from localNow()
 */
export function isOverdue(due, local) {
  if (!isDue(due)) {
    return false;
  }
  return due.length === 10 ? due < local.date : due < local.minute;
}

/**
 * Short display of a due date in a widget row: `20/11`, `20.11.`, `11/20`,
 * with the time when there is one.
 */
export function formatDue(due, language) {
  if (!isDue(due)) {
    return '';
  }
  const [year, month, day] = due.slice(0, 10).split('-').map(Number);
  const date = new Intl.DateTimeFormat(language, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return due.length === 10 ? date : `${date} ${due.slice(11)}`;
}
