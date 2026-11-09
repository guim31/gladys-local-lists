// -----------------------------------------------------------------------------
// Persistence under /data: the lists survive a restart, a write is atomic
// and never mixes two changes, an unreadable file falls back on the backup
// (and is kept for a repair), a failed write changes nothing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ListStore } from '../src/store.js';
import { normalizeDocument } from '../src/lists/model.js';
import {
  CHORES,
  GROCERIES,
  createWorld,
  emptyDataDir,
  fixtureDataDir,
  listIds,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const onDisk = (dir, name = 'lists.json') => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const texts = (document, id) =>
  document.lists.find((list) => list.id === id).items.map((item) => item.text);

test('the lists survive a restart of the container', async (t) => {
  const dataDir = emptyDataDir();
  const first = await createWorld({ dataDir });
  const created = await first.fake.action('create_list', { name: 'Courses', kind: 'shopping' });
  assert.equal(created.success, true, created.error);
  const [device] = first.fake.discoveredDevices;
  await first.fake.sceneAction('add_item', { list: device.external_id, item: 'Lait' });
  await first.app.stop();

  const second = await world(t, { dataDir });
  assert.deepEqual(
    second.fake.discoveredDevices.map((entry) => entry.external_id),
    [device.external_id],
    'same list, same device',
  );
  assert.deepEqual(texts(second.hub.document, second.hub.lists[0].id), ['Lait']);
  assert.equal(onDisk(dataDir).schema, 1);
});

test('fifty concurrent additions are all written, in one valid file', async (t) => {
  const w = await world(t);
  const device = listIds(w.gladys, GROCERIES).device;
  const acks = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      w.fake.sceneAction('add_item', { list: device, item: `Article ${i}` }),
    ),
  );
  assert.ok(acks.every((ack) => ack.success));
  await w.hub.store.flush();
  const saved = texts(onDisk(w.dataDir), GROCERIES);
  assert.equal(saved.length, 53);
  for (let i = 0; i < 50; i += 1) {
    assert.ok(saved.includes(`Article ${i}`), `Article ${i}`);
  }
  assert.ok(!existsSync(join(w.dataDir, 'lists.json.tmp')), 'no temporary file left');
  // The backup is the version before the last write: one item fewer.
  assert.equal(texts(onDisk(w.dataDir, 'lists.json.bak'), GROCERIES).length, 52);
});

test('a truncated lists.json is kept aside and the backup is read', async (t) => {
  const dataDir = fixtureDataDir();
  const good = readFileSync(join(dataDir, 'lists.json'), 'utf8');
  writeFileSync(join(dataDir, 'lists.json.bak'), good);
  writeFileSync(join(dataDir, 'lists.json'), good.slice(0, 200));

  const w = await world(t, { dataDir });
  assert.deepEqual(
    w.hub.lists.map((list) => list.name),
    ['Courses', 'Maison'],
  );
  assert.equal(readFileSync(join(dataDir, 'lists.json.corrupt'), 'utf8'), good.slice(0, 200));
  // The restored lists are written back at once.
  assert.deepEqual(texts(onDisk(dataDir), GROCERIES), ['Lait', 'Œufs', 'Pain']);

  // The first write after it must not copy the broken file over the backup.
  await w.fake.sceneAction('add_item', { list: listIds(w.gladys, GROCERIES).device, item: 'Riz' });
  // (The start already wrote once: the overdue task of the fixture.)
  assert.deepEqual(
    texts(onDisk(dataDir, 'lists.json.bak'), GROCERIES),
    ['Lait', 'Œufs', 'Pain'],
    'the backup is the last good version',
  );
  assert.ok(texts(onDisk(dataDir), GROCERIES).includes('Riz'));
});

test('with no usable file at all, the integration starts empty and deletes nothing', async () => {
  const dataDir = emptyDataDir();
  writeFileSync(join(dataDir, 'lists.json'), '{"schema":1,"lists":');
  writeFileSync(join(dataDir, 'lists.json.bak'), 'not json');
  const store = new ListStore(dataDir);
  const { document, source } = await store.load();
  assert.equal(source, 'reset');
  assert.deepEqual(document.lists, []);
  assert.deepEqual(readdirSync(dataDir).sort(), [
    'lists.json',
    'lists.json.bak',
    'lists.json.corrupt',
  ]);

  // A JSON that is not a lists document is unusable too.
  writeFileSync(join(dataDir, 'lists.json'), '[1, 2]');
  assert.equal((await new ListStore(dataDir).load()).source, 'reset');
});

test('a first start finds no file and creates none until a change', async () => {
  const dataDir = emptyDataDir();
  const { source } = await new ListStore(dataDir).load();
  assert.equal(source, 'new');
  assert.deepEqual(readdirSync(dataDir), []);
});

test('a write that fails changes nothing and tells the user', async (t) => {
  const w = await world(t);
  const before = structuredClone(w.hub.document);
  t.mock.method(w.hub.store, 'save', async () => {
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  });
  const ack = await w.fake.sceneAction('add_item', {
    list: listIds(w.gladys, GROCERIES).device,
    item: 'Beurre',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /could not be saved/);
  assert.deepEqual(w.hub.document, before);
  assert.equal(
    w.fake.sceneEvents.filter((event) => event.key === 'item_added').length,
    0,
    'no event for a change that did not happen',
  );
  // The next change works again.
  t.mock.restoreAll();
  const retry = await w.fake.sceneAction('add_item', {
    list: listIds(w.gladys, GROCERIES).device,
    item: 'Beurre',
  });
  assert.equal(retry.success, true, retry.error);
});

test('a hand-edited file is repaired, unknown fields are kept', () => {
  const document = normalizeDocument(
    {
      schema: 1,
      future: { kept: true },
      lists: [
        {
          id: 'abc',
          name: ' Courses ',
          kind: 'shopping',
          items: [{ text: 'Lait', due: '2026-11-10' }, { text: '' }, 'x'],
        },
        { id: 'abc', name: 'courses', kind: 'weird', color: 'blue', items: 'none' },
        { name: '' },
        {
          id: 'Bad Id!',
          name: 'Maison',
          kind: 'tasks',
          items: [
            { id: 'i1', text: 'A', due: 'later', done: 'yes' },
            { id: 'i1', text: 'B', due: '2026-11-10T08:00', done: true },
          ],
        },
      ],
    },
    '2026-11-09T09:00:00.000Z',
  );
  assert.deepEqual(document.future, { kept: true });
  assert.deepEqual(
    document.lists.map((list) => [list.name, list.kind]),
    [
      ['Courses', 'shopping'],
      ['courses (2)', 'shopping'],
      ['Maison', 'tasks'],
    ],
  );
  const [courses, second, maison] = document.lists;
  assert.notEqual(second.id, courses.id, 'duplicate list id replaced');
  assert.equal(second.color, 'blue');
  assert.match(maison.id, /^[a-z0-9]+$/);
  assert.deepEqual(
    courses.items.map((item) => [item.text, item.due, item.done]),
    [['Lait', null, false]],
  );
  assert.deepEqual(
    maison.items.map((item) => [item.text, item.due, item.done, item.done_at !== null]),
    [
      ['A', null, false, false],
      ['B', '2026-11-10T08:00', true, true],
    ],
  );
  assert.notEqual(maison.items[0].id, maison.items[1].id);
  assert.throws(() => normalizeDocument({ lists: 'x' }), TypeError);
});

test('the chores fixture is read as is', async (t) => {
  const w = await world(t);
  assert.deepEqual(texts(w.hub.document, CHORES), [
    'Sortir les poubelles',
    'Changer le filtre de la hotte',
    'Arroser les plantes',
  ]);
});

test('a lists.json that cannot be read (permissions) is never replaced by the backup', async () => {
  const dataDir = fixtureDataDir();
  writeFileSync(join(dataDir, 'lists.json.bak'), '{"schema":1,"lists":[]}');
  chmodSync(join(dataDir, 'lists.json'), 0o000);
  try {
    if (process.getuid?.() === 0) {
      return; // root reads anything: nothing to check
    }
    await assert.rejects(new ListStore(dataDir).load(), { code: 'EACCES' });
    assert.ok(!existsSync(join(dataDir, 'lists.json.corrupt')));
  } finally {
    chmodSync(join(dataDir, 'lists.json'), 0o644);
  }
  assert.equal(texts(onDisk(dataDir), GROCERIES).length, 3);
});

test('a second broken file does not overwrite the first one kept aside', async () => {
  const dataDir = emptyDataDir();
  writeFileSync(join(dataDir, 'lists.json'), 'first broken');
  await new ListStore(dataDir).load();
  writeFileSync(join(dataDir, 'lists.json'), 'second broken');
  await new ListStore(dataDir).load();
  assert.equal(readFileSync(join(dataDir, 'lists.json.corrupt'), 'utf8'), 'first broken');
  const dated = readdirSync(dataDir).filter((name) => name.startsWith('lists.json.corrupt-'));
  assert.equal(dated.length, 1);
  assert.equal(readFileSync(join(dataDir, dated[0]), 'utf8'), 'second broken');
});

test('the same broken file is kept once, whatever the number of restarts', async () => {
  const dataDir = emptyDataDir();
  writeFileSync(join(dataDir, 'lists.json'), 'broken');
  for (let i = 0; i < 3; i += 1) {
    await new ListStore(dataDir).load();
  }
  assert.deepEqual(readdirSync(dataDir).sort(), ['lists.json', 'lists.json.corrupt']);
});

test('while lists.json cannot be read, every command is refused and nothing is written', async (t) => {
  const dataDir = fixtureDataDir();
  const store = new ListStore(dataDir);
  t.mock.method(store, 'load', async () => {
    throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
  });
  const w = await world(t, { store });
  const ack = await w.fake.action('create_list', { name: 'Nouvelle', kind: 'shopping' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /not loaded/);
  assert.equal(texts(onDisk(dataDir), GROCERIES).length, 3);
  assert.ok(!existsSync(join(dataDir, 'lists.json.bak')));
  // The next connection tries again.
  store.load.mock.restore();
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.hub.lists.length, 2);
});
