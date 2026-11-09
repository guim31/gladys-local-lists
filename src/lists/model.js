// -----------------------------------------------------------------------------
// The lists document, as stored in /data/lists.json:
//
//   { schema: 1, lists: [{ id, name, kind, created_at, items: [
//       { id, text, done, due, created_at, done_at, overdue_notified } ] }] }
//
// `kind` is `shopping` or `tasks` (only tasks have due dates). Ids are random,
// generated here, and become the device external ids: never derived from a
// name. `normalizeDocument` repairs what a hand edit or an older version may
// have left (missing fields, wrong types, duplicate ids) and keeps unknown
// fields, so a newer file read by an older version loses nothing it did not
// understand.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { isDue } from './dates.js';

export const SCHEMA_VERSION = 1;
export const KINDS = ['shopping', 'tasks'];

export const LIMITS = Object.freeze({
  lists: 50,
  items: 500,
  name: 40,
  text: 200,
});

export const newId = () => randomBytes(6).toString('hex');

/** Trimmed, single-spaced, bounded text. */
export function cleanText(value, max) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

/** Comparison key of a name or an item: case, accents and blanks ignored. */
export const matchKey = (value) =>
  cleanText(value, 1000)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');

export const emptyDocument = () => ({ schema: SCHEMA_VERSION, lists: [] });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const dateOr = (value, fallback) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;

function normalizeItem(raw, kind, ids, now) {
  if (!isObject(raw)) {
    return null;
  }
  const text = cleanText(raw.text, LIMITS.text);
  if (!text) {
    return null;
  }
  let id = typeof raw.id === 'string' && /^[a-z0-9]{1,32}$/.test(raw.id) ? raw.id : newId();
  while (ids.has(id)) {
    id = newId();
  }
  ids.add(id);
  const done = raw.done === true;
  return {
    ...raw,
    id,
    text,
    done,
    due: kind === 'tasks' && isDue(raw.due) ? raw.due : null,
    created_at: dateOr(raw.created_at, now),
    done_at: done ? dateOr(raw.done_at, now) : null,
    overdue_notified: raw.overdue_notified === true,
  };
}

/**
 * A well-formed document from whatever JSON was read.
 * @param {unknown} raw
 * @param {string} now ISO date used for missing creation dates
 * @returns {object} the document
 * @throws {TypeError} when `raw` is not a lists document at all
 */
export function normalizeDocument(raw, now = new Date().toISOString()) {
  if (!isObject(raw) || !Array.isArray(raw.lists)) {
    throw new TypeError('Not a lists document');
  }
  const listIds = new Set();
  const names = new Set();
  const lists = [];
  for (const entry of raw.lists) {
    if (!isObject(entry)) {
      continue;
    }
    let name = cleanText(entry.name, LIMITS.name);
    if (!name) {
      continue;
    }
    // Names are unique (scene fields and the Configuration actions use them).
    for (let n = 2; names.has(matchKey(name)); n += 1) {
      name = `${cleanText(entry.name, LIMITS.name - 4)} (${n})`;
    }
    names.add(matchKey(name));
    let id = typeof entry.id === 'string' && /^[a-z0-9]{1,32}$/.test(entry.id) ? entry.id : newId();
    while (listIds.has(id)) {
      id = newId();
    }
    listIds.add(id);
    const kind = KINDS.includes(entry.kind) ? entry.kind : 'shopping';
    const itemIds = new Set();
    const items = (Array.isArray(entry.items) ? entry.items : [])
      .map((item) => normalizeItem(item, kind, itemIds, now))
      .filter(Boolean)
      .slice(0, LIMITS.items);
    lists.push({ ...entry, id, name, kind, created_at: dateOr(entry.created_at, now), items });
  }
  return { ...raw, schema: SCHEMA_VERSION, lists: lists.slice(0, LIMITS.lists) };
}

/**
 * Display order: what is left to do first (earliest due date first, then
 * without due date, oldest first), then what is done (latest first).
 */
export function sortedItems(items) {
  const todo = items
    .filter((item) => !item.done)
    .sort((a, b) => {
      if (a.due && b.due) {
        return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      }
      return a.due ? -1 : b.due ? 1 : 0;
    });
  const done = items
    .filter((item) => item.done)
    .sort((a, b) => (a.done_at < b.done_at ? 1 : a.done_at > b.done_at ? -1 : 0));
  return [...todo, ...done];
}
