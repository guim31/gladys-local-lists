// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// and one line per change asked by the user. The minute timer writes
// nothing, and the item texts (household data) never reach the logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROCERIES, createAll, createWorld, listIds } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the minute timer writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  await createAll(w);
  assert.ok(
    logs.texts().some((text) => text.includes('2 list(s) loaded')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(60_000);
    await w.hub.tick();
  }
  await w.fake.widgetGet('list', { settings: {}, language: 'en', units: 'metric' });
  await w.fake.sceneAction('read_list', { list: listIds(w.gladys, GROCERIES).device });
  assert.deepEqual(logs.texts(), []);
});

test('one line per change, without the item text', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('add_item', {
    list: listIds(w.gladys, GROCERIES).device,
    item: 'Médicaments de Paul',
  });
  assert.deepEqual(logs.texts().length, 1);
  assert.match(logs.texts()[0], /Item added to "Courses" \(scene\)/);
  assert.ok(!logs.texts()[0].includes('Médicaments'));
});
