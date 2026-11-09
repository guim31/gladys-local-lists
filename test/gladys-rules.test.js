// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (a shopping list and a chores list as stored in /data), in every
// feature-name language, and with the fifty lists the integration allows.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_CONFIG, createAll, createWorld, emptyDataDir } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

// Fifty lists, half of them task lists, each with an overdue task.
async function fiftyLists(world) {
  for (let i = 1; i <= 50; i += 1) {
    const kind = i % 2 ? 'shopping' : 'tasks';
    const ack = await world.fake.action('create_list', { name: `Liste ${i}`, kind });
    assert.equal(ack.success, true, ack.error);
    const device = world.fake.discoveredDevices.at(-1).external_id;
    await world.fake.sceneAction('add_item', { list: device, item: 'Élément', due: '01/01/2026' });
  }
  const refused = await world.fake.action('create_list', { name: 'Liste 51', kind: 'shopping' });
  assert.equal(refused.success, false, 'fifty lists at most');
}

const scenarios = [
  { label: 'English names', config: BASE_CONFIG, devices: 2 },
  { label: 'French names', config: { language: 'fr' }, devices: 2 },
  { label: 'German names', config: { language: 'de' }, devices: 2 },
  { label: 'Spanish names', config: { language: 'es' }, devices: 2 },
  { label: 'fifty lists', config: BASE_CONFIG, devices: 50, empty: true, fill: fiftyLists },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const world = await createWorld({
      config: scenario.config,
      ...(scenario.empty ? { dataDir: emptyDataDir() } : {}),
    });
    const { gladys } = world;
    try {
      await scenario.fill?.(world);
      await createAll(world);
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, scenario.devices);

      const deviceNames = new Set();
      for (const device of devices) {
        const where = device.name;
        assert.ok(!deviceNames.has(device.name), `${where}: duplicate device name`);
        deviceNames.add(device.name);

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the fixtures fits the declared bounds.
          const value = gladys.fake.lastState(feature.external_id);
          if (feature.type === 'text') {
            assert.equal(typeof value, 'string', `${at}: no text published`);
            assert.ok(value.length > 0, `${at}: empty text`);
          } else {
            assert.equal(typeof value, 'number', `${at}: no state published`);
            assert.ok(
              value >= feature.min && value <= feature.max,
              `${at}: ${value} out of bounds`,
            );
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await world.app.stop();
    }
  });
}
