// -----------------------------------------------------------------------------
// The lists against the SDK's fake Gladys: one device per list with its
// counts, the Configuration actions, the four scene actions, the four scene
// events (once each, never repeated after a restart) and the minute timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_CONFIG,
  CHORES,
  GROCERIES,
  createAll,
  createClock,
  createWorld,
  emptyDataDir,
  listIds,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const groceries = (w) => listIds(w.gladys, GROCERIES);
const chores = (w) => listIds(w.gladys, CHORES);
const MINUTE = 60_000;

test('one device per list, with the items left and the overdue tasks', async (t) => {
  const w = await world(t);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => [
      device.name,
      device.external_id,
      device.should_poll,
      device.features.map((feature) => feature.name),
    ]),
    [
      ['Courses', groceries(w).device, false, ['Items to buy']],
      ['Maison', chores(w).device, false, ['Tasks to do', 'Overdue tasks']],
    ],
  );
  // Nothing published for devices not added in Gladys.
  assert.equal(w.fake.states.length, 0);
  await createAll(w);
  assert.equal(w.fake.lastState(groceries(w).feature('remaining')), 2);
  assert.equal(w.fake.lastState(chores(w).feature('remaining')), 3);
  assert.equal(w.fake.lastState(chores(w).feature('overdue')), 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('feature names follow the configured language', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  assert.deepEqual(
    w.fake.discoveredDevices.flatMap((device) => device.features.map((feature) => feature.name)),
    ['Articles à acheter', 'Tâches à faire', 'Tâches en retard'],
  );
  await w.fake.configUpdated({ language: 'de' });
  assert.deepEqual(w.fake.discoveredDevices[0].features[0].name, 'Zu kaufende Artikel');
});

test('Configuration: create, show and delete lists', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  assert.match((await w.fake.action('show_lists', {})).data.message.en, /No list yet/);

  const created = await w.fake.action('create_list', { name: '  Bricolage ', kind: 'tasks' });
  assert.equal(created.success, true, created.error);
  assert.match(created.data.message.fr, /Liste « Bricolage » créée/);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => [device.name, device.features.length]),
    [['Bricolage', 2]],
  );

  const taken = await w.fake.action('create_list', { name: 'bricolage', kind: 'shopping' });
  assert.equal(taken.success, false);
  assert.equal(taken.error, 'A list named "bricolage" already exists.');
  const empty = await w.fake.action('create_list', { name: '   ', kind: 'shopping' });
  assert.equal(empty.error, 'Enter a name for the list.');

  await w.fake.sceneAction('add_item', {
    list: w.fake.discoveredDevices[0].external_id,
    item: 'Étagère',
  });
  assert.equal((await w.fake.action('show_lists', {})).data.message.en, 'Bricolage: 1 left');

  const wrong = await w.fake.action('delete_list', { name: 'Brico' });
  assert.equal(wrong.error, 'No list is named "Brico".');
  const deleted = await w.fake.action('delete_list', { name: 'BRICOLAGE' });
  assert.equal(deleted.success, true, deleted.error);
  assert.match(deleted.data.message.en, /List "Bricolage" deleted \(1 items\)/);
  assert.deepEqual(w.fake.discoveredDevices, []);
});

test('errors follow the configured language', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  const ack = await w.fake.sceneAction('add_item', {
    list: chores(w).device,
    item: 'Vidange',
    due: 'demain',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /^Échéance incomprise \(« demain »\)/);
  const unknown = await w.fake.sceneAction('read_list', { list: listIds(w.gladys, 'gone').device });
  assert.equal(unknown.error, "Cette liste n'existe plus : choisissez-en une autre.");
});

test('add_item: added once, a duplicate is not added, a done item comes back', async (t) => {
  const w = await world(t);
  await createAll(w);
  const add = (item, extra = {}) =>
    w.fake.sceneAction('add_item', { list: groceries(w).device, item, ...extra });

  const first = await add('Beurre');
  assert.deepEqual(first.data.outputs, {
    item: 'Beurre',
    list_name: 'Courses',
    already_on_list: false,
    due: '',
  });
  const again = await add('  BEURRE ');
  assert.equal(again.data.outputs.already_on_list, true);
  // "Pain" was bought (done): it is back to buy, not a second line.
  const bread = await add('pain', { due: '+2' });
  assert.equal(bread.data.outputs.already_on_list, false);
  assert.equal(bread.data.outputs.due, '', 'no due date on a shopping list');
  assert.deepEqual(
    w.hub.lists[0].items.map((item) => [item.text, item.done]),
    [
      ['Lait', false],
      ['Œufs', false],
      ['Pain', false],
      ['Beurre', false],
    ],
  );
  assert.deepEqual(
    events(w, 'item_added').map((event) => event.data),
    [
      { list: groceries(w).device, list_name: 'Courses', item: 'Beurre', due: '' },
      { list: groceries(w).device, list_name: 'Courses', item: 'Pain', due: '' },
    ],
  );
  assert.equal(w.fake.lastState(groceries(w).feature('remaining')), 4);
});

test('the list name in scenes is the name given in Gladys', async (t) => {
  const w = await world(t);
  await createAll(w);
  await w.fake.deviceUpdated({ ...w.fake.devices[0], name: 'Courses de la semaine' });
  const ack = await w.fake.sceneAction('add_item', { list: groceries(w).device, item: 'Riz' });
  assert.equal(ack.data.outputs.list_name, 'Courses de la semaine');
});

test('add_item on a task list: due date as typed or in N days', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('add_item', {
    list: chores(w).device,
    item: 'Rendre les livres',
    due: '+3',
  });
  assert.equal(ack.data.outputs.due, '2026-11-12');
  const timed = await w.fake.sceneAction('add_item', {
    list: chores(w).device,
    item: 'Appeler le plombier',
    due: '10/11/2026 9h00',
  });
  assert.equal(timed.data.outputs.due, '2026-11-10T09:00');
  // Already there: the due date is updated.
  const moved = await w.fake.sceneAction('add_item', {
    list: chores(w).device,
    item: 'Rendre les livres',
    due: '+5',
  });
  assert.deepEqual(
    [moved.data.outputs.already_on_list, moved.data.outputs.due],
    [true, '2026-11-14'],
  );
});

test('set_item_done: completed, list done, back to do, not found', async (t) => {
  const w = await world(t);
  await createAll(w);
  const set = (item, state = 'done') =>
    w.fake.sceneAction('set_item_done', { list: groceries(w).device, item, state });

  const milk = await set('lait');
  assert.deepEqual(milk.data.outputs, {
    item: 'Lait',
    list_name: 'Courses',
    found: true,
    changed: true,
    remaining: 1,
  });
  assert.equal(events(w, 'list_emptied').length, 0);
  const eggs = await set('oeufs');
  assert.equal(eggs.data.outputs.remaining, 0);
  assert.deepEqual(
    events(w, 'item_completed').map((event) => [event.data.item, event.data.remaining]),
    [
      ['Lait', 1],
      ['Œufs', 0],
    ],
  );
  assert.deepEqual(
    events(w, 'list_emptied').map((event) => event.data),
    [{ list: groceries(w).device, list_name: 'Courses' }],
  );
  assert.equal(w.fake.lastState(groceries(w).feature('remaining')), 0);

  const twice = await set('Lait');
  assert.deepEqual([twice.data.outputs.found, twice.data.outputs.changed], [true, false]);
  const back = await set('Lait', 'todo');
  assert.deepEqual([back.data.outputs.changed, back.data.outputs.remaining], [true, 1]);
  const missing = await set('Caviar');
  assert.deepEqual(
    [missing.data.outputs.found, missing.data.outputs.changed, missing.data.outputs.item],
    [false, false, 'Caviar'],
  );
  assert.equal(events(w, 'item_completed').length, 2);
});

test('clear_done and read_list', async (t) => {
  const w = await world(t);
  const cleared = await w.fake.sceneAction('clear_done', { list: groceries(w).device });
  assert.deepEqual(cleared.data.outputs, { list_name: 'Courses', removed: 1 });
  const nothing = await w.fake.sceneAction('clear_done', { list: groceries(w).device });
  assert.equal(nothing.data.outputs.removed, 0);

  const read = await w.fake.sceneAction('read_list', { list: chores(w).device });
  assert.deepEqual(read.data.outputs, {
    list_name: 'Maison',
    remaining: 3,
    overdue: 1,
    // Earliest due date first, then without one.
    items: 'Changer le filtre de la hotte, Sortir les poubelles, Arroser les plantes',
  });
});

test('read_list cuts a long list to the 1000 characters of a scene variable', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  await w.fake.action('create_list', { name: 'Long', kind: 'shopping' });
  const device = w.fake.discoveredDevices[0].external_id;
  for (let i = 0; i < 60; i += 1) {
    await w.fake.sceneAction('add_item', { list: device, item: `Article numéro ${i} du marché` });
  }
  const read = await w.fake.sceneAction('read_list', { list: device });
  assert.ok(read.data.outputs.items.length <= 1000);
  assert.ok(read.data.outputs.items.endsWith('…'));
  assert.equal(read.data.outputs.remaining, 60);
});

test('an overdue task fires once, at the minute, and never again after a restart', async (t) => {
  const dataDir = (await import('./helpers/world.js')).fixtureDataDir();
  const clock = createClock();
  const w = await createWorld({ clock, dataDir });
  await createAll(w);
  // At start: the task due yesterday became overdue while the integration was off.
  assert.deepEqual(
    events(w, 'task_overdue').map((event) => event.data),
    [
      {
        list: chores(w).device,
        list_name: 'Maison',
        item: 'Changer le filtre de la hotte',
        due: '2026-11-08',
      },
    ],
  );

  // The bins are due at 20:00 (Paris): nothing at 20:00, the event at 20:01.
  clock.time = Date.UTC(2026, 10, 9, 19, 0);
  await w.hub.tick();
  assert.equal(events(w, 'task_overdue').length, 1);
  clock.advance(MINUTE);
  await w.hub.tick();
  assert.deepEqual(
    events(w, 'task_overdue').map((event) => event.data.item),
    ['Changer le filtre de la hotte', 'Sortir les poubelles'],
  );
  assert.equal(w.fake.lastState(chores(w).feature('overdue')), 2);
  clock.advance(MINUTE);
  await w.hub.tick();
  assert.equal(events(w, 'task_overdue').length, 2, 'once per task');
  await w.app.stop();

  const restarted = await world(t, { clock, dataDir });
  assert.equal(events(restarted, 'task_overdue').length, 0, 'not repeated after a restart');

  // Done, then back to do: it is overdue again, so it fires again.
  const set = (state) =>
    restarted.fake.sceneAction('set_item_done', {
      list: chores(restarted).device,
      item: 'Sortir les poubelles',
      state,
    });
  await set('done');
  await set('todo');
  await restarted.hub.tick();
  assert.deepEqual(
    events(restarted, 'task_overdue').map((event) => event.data.item),
    ['Sortir les poubelles'],
  );
});

test('a quiet minute publishes nothing; the counts are sent again after 12 hours', async (t) => {
  // The SDK dates the published states with the system clock: mock it.
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 10, 9, 0) });
  const w = await world(t, { clock: { now: () => Date.now() } });
  await createAll(w);
  await w.hub.tick();
  const published = w.fake.states.length;
  t.mock.timers.tick(MINUTE);
  await w.hub.tick();
  assert.equal(w.fake.states.length, published, 'nothing changed, nothing sent');
  t.mock.timers.tick(12 * 3600_000);
  await w.hub.tick();
  assert.equal(w.fake.states.length, published + 3, 'heartbeat of the three counts');
});

test('a device added in Gladys gets its states at once, and the widget a refresh', async (t) => {
  const w = await world(t);
  const refreshes = w.fake.widgetRefreshes.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[1]);
  assert.equal(w.fake.lastState(chores(w).feature('remaining')), 3);
  assert.equal(w.fake.lastState(chores(w).feature('overdue')), 1);
  assert.equal(w.fake.lastState(groceries(w).feature('remaining')), undefined);
  assert.ok(w.fake.widgetRefreshes.length > refreshes);
});

test('a scene change refreshes the widget, a reconnection publishes everything again', async (t) => {
  const w = await world(t, { config: BASE_CONFIG });
  await createAll(w);
  const refreshes = w.fake.widgetRefreshes.length;
  await w.fake.sceneAction('add_item', { list: groceries(w).device, item: 'Sel' });
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);

  const published = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.fake.states.length, published + 3, 'every count sent again');
});

test('an overdue event Gladys refused is sent again at the next minute', async (t) => {
  const clock = createClock(Date.UTC(2026, 10, 9, 19, 0));
  const w = await world(t, { clock });
  const before = events(w, 'task_overdue').length;
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  t.mock.method(w.gladys, 'publishSceneEvent', async () => {
    throw new Error('Gladys unreachable');
  });
  clock.advance(MINUTE * 2);
  await w.hub.tick();
  assert.equal(events(w, 'task_overdue').length, before);
  assert.equal(
    w.hub.lists[1].items.find((item) => item.text === 'Sortir les poubelles').overdue_notified,
    false,
    'not remembered as sent',
  );
  w.gladys.publishSceneEvent.mock.mockImplementation(original);
  clock.advance(MINUTE);
  await w.hub.tick();
  assert.deepEqual(
    events(w, 'task_overdue')
      .slice(before)
      .map((event) => event.data.item),
    ['Sortir les poubelles'],
  );
  await w.hub.tick();
  assert.equal(events(w, 'task_overdue').length, before + 1, 'once');
});

test('a saved change succeeds even when Gladys does not take the devices', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  t.mock.method(w.gladys, 'publishDiscoveredDevices', async () => {
    throw new Error('socket closed');
  });
  const ack = await w.fake.action('create_list', { name: 'Zed', kind: 'shopping' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    w.hub.lists.map((list) => list.name),
    ['Zed'],
  );
});

test('the lists renamed in Gladys: shown with both names, deleted by either', async (t) => {
  const w = await world(t);
  await createAll(w);
  await w.fake.deviceUpdated({ ...w.fake.devices[0], name: 'Épicerie' });
  assert.equal(
    (await w.fake.action('show_lists', {})).data.message.en,
    'Épicerie (Courses): 2 left · Maison: 3 left',
  );
  const deleted = await w.fake.action('delete_list', { name: 'epicerie' });
  assert.equal(deleted.success, true, deleted.error);
  assert.deepEqual(
    w.hub.lists.map((list) => list.name),
    ['Maison'],
  );
});

test('set_item_done finds an item added with a text longer than the limit', async (t) => {
  const w = await world(t);
  const long = `Article ${'x'.repeat(300)}`;
  await w.fake.sceneAction('add_item', { list: groceries(w).device, item: long });
  const ack = await w.fake.sceneAction('set_item_done', {
    list: groceries(w).device,
    item: long,
    state: 'done',
  });
  assert.equal(ack.data.outputs.found, true);
});
