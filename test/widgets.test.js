// -----------------------------------------------------------------------------
// The "Local list" widget: content within the core vocabulary and budget
// (the SDK's validateWidgetContent), the list chosen in the settings, the
// hidden buttons, the four actions and their toasts, the empty states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  CHORES,
  GROCERIES,
  createAll,
  createWorld,
  emptyDataDir,
  listIds,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('list', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);
const buttons = (data) => ofType(data, 'button');
const button = (data, key) => buttons(data).find((entry) => entry.action.key === key);

async function tap(w, target, values) {
  const ack = await w.fake.widgetAction('list', target.action.key, target.action.params, {
    settings: {},
    values,
  });
  return ack;
}

test('empty settings: the first list, its count, items and buttons', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.deepEqual(ofType(data, 'value'), [
    { type: 'value', value: 2, label: 'Courses', icon: 'shopping-cart' },
  ]);
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [
      ['Lait', '—'],
      ['Œufs', '—'],
    ],
  );
  assert.deepEqual(
    buttons(data).map((entry) => entry.action.key),
    ['add', 'check', 'uncheck', 'clear_done'],
  );
  // A shopping list has no due date field.
  assert.deepEqual(
    button(data, 'add').action.fields.map((field) => field.key),
    ['item'],
  );
  assert.deepEqual(
    button(data, 'check').action.fields[0].options.map((option) => option.label.en),
    ['Lait', 'Œufs'],
  );
  assert.equal(button(data, 'clear_done').action.confirm, true);
});

test('a task list: due dates, overdue rows, the due field in the form', async (t) => {
  const w = await world(t);
  await createAll(w);
  const data = await content(w, { device: listIds(w.gladys, CHORES).device }, 'fr');
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value, row.icon, row.color]),
    [
      ['Changer le filtre de la hotte', '08/11 · en retard', 'alert-circle', 'danger'],
      ['Sortir les poubelles', '09/11 20:00', 'circle', undefined],
      ['Arroser les plantes', '—', 'circle', undefined],
    ],
  );
  assert.deepEqual(
    button(data, 'add').action.fields.map((field) => field.key),
    ['item', 'due'],
  );
  // No done item: no Uncheck nor Clear done.
  assert.deepEqual(
    buttons(data).map((entry) => entry.action.key),
    ['add', 'check'],
  );
  assert.equal(ofType(data, 'value')[0].icon, 'check-square');
});

test('settings: show the done items, hide buttons', async (t) => {
  const w = await world(t);
  const data = await content(w, { show_done: true, hide: ['add', 'clear'] });
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [
      ['Lait', '—'],
      ['Œufs', '—'],
      ['Pain', 'Done'],
    ],
  );
  assert.deepEqual(
    buttons(data).map((entry) => entry.action.key),
    ['check', 'uncheck'],
  );
});

test('the buttons: add, check off, uncheck, clear, with a toast in four languages', async (t) => {
  const w = await world(t);
  await createAll(w);
  let data = await content(w);

  const added = await tap(w, button(data, 'add'), { item: 'Farine' });
  assert.equal(added.success, true, added.error);
  assert.deepEqual(added.data.message, {
    en: '"Farine" added to Courses.',
    fr: '« Farine » ajouté à Courses.',
    de: '„Farine“ zu Courses hinzugefügt.',
    es: '«Farine» añadido a Courses.',
  });
  assert.equal(w.fake.sceneEvents.at(-1).key, 'item_added');

  data = await content(w);
  const milk = button(data, 'check').action.fields[0].options.find((o) => o.label.en === 'Lait');
  const checked = await tap(w, button(data, 'check'), { item: milk.value });
  assert.equal(checked.data.message.en, '"Lait" checked off on Courses.');
  assert.equal(w.fake.lastState(listIds(w.gladys, GROCERIES).feature('remaining')), 2);

  data = await content(w);
  const unchecked = await tap(w, button(data, 'uncheck'), { item: milk.value });
  assert.equal(unchecked.data.message.en, '"Lait" is back on Courses.');

  // A second tap from a stale tablet: still "back on", never "checked off".
  const again = await tap(w, button(data, 'uncheck'), { item: milk.value });
  assert.equal(again.data.message.en, '"Lait" is back on Courses.');

  data = await content(w);
  const cleared = await tap(w, button(data, 'clear_done'));
  assert.equal(cleared.data.message.en, 'Done items removed from Courses: 1.');
  data = await content(w);
  assert.equal(button(data, 'clear_done'), undefined);
});

test('a stale button: an item already gone, a list deleted', async (t) => {
  const w = await world(t);
  const data = await content(w);
  const check = button(data, 'check');
  const gone = await tap(w, check, { item: 'nope' });
  assert.equal(gone.data.message.en, 'This item is no longer on Courses.');
  await w.fake.action('delete_list', { name: 'Courses' });
  const deleted = await tap(w, check, { item: '100000000001' });
  assert.equal(deleted.success, false);
  assert.equal(deleted.error, 'This list no longer exists: choose another one.');
});

test('a bad due date typed in the form is refused with an explanation', async (t) => {
  const w = await world(t);
  const data = await content(w, { device: listIds(w.gladys, CHORES).device });
  const ack = await tap(w, button(data, 'add'), { item: 'Vidange', due: 'bientôt' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Due date not understood \("bientôt"\)/);
});

test('empty states: no list, a deleted list, a list with nothing left', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  const none = await content(w, {}, 'fr');
  assert.match(ofType(none, 'text')[0].text, /^Aucune liste/);
  await w.fake.action('create_list', { name: 'Vide', kind: 'shopping' });
  const empty = await content(w);
  assert.deepEqual(
    ofType(empty, 'text').map((entry) => entry.text),
    ['Nothing left on the list.'],
  );
  assert.deepEqual(
    buttons(empty).map((entry) => entry.action.key),
    ['add'],
  );
  const unknown = await content(w, { device: listIds(w.gladys, 'gone').device });
  assert.match(ofType(unknown, 'text')[0].text, /no longer exists/);
});

test('a long list: ten rows at most, the last one counts the rest', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  await w.fake.action('create_list', { name: 'Longue', kind: 'shopping' });
  const device = w.fake.discoveredDevices[0].external_id;
  for (let i = 1; i <= 14; i += 1) {
    await w.fake.sceneAction('add_item', { list: device, item: `Article ${i}` });
  }
  const data = await content(w);
  const rows = ofType(data, 'status')[0].items;
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.at(-1), { label: 'More items', icon: 'more-horizontal', value: 5 });
});
