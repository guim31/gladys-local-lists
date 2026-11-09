// -----------------------------------------------------------------------------
// Gladys devices: one per list.
//
// Identity: the random id the list got at its creation (`list` / `<id>`),
// never its name.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
//   - every list: items left to buy or tasks left to do, counter-sensor/integer;
//   - task lists: overdue tasks, counter-sensor/integer.
// A list never changes kind, so a device never changes structure.
//
// Published with should_poll: false: the counts change on the integration's
// own actions, and overdue tasks on its minute timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { LIMITS } from './lists/model.js';

export const DEVICE_TYPE = 'list';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  REMAINING: 'remaining',
  OVERDUE: 'overdue',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: { items: 'Items to buy', tasks: 'Tasks to do', overdue: 'Overdue tasks' },
  fr: { items: 'Articles à acheter', tasks: 'Tâches à faire', overdue: 'Tâches en retard' },
  de: { items: 'Zu kaufende Artikel', tasks: 'Offene Aufgaben', overdue: 'Überfällige Aufgaben' },
  es: { items: 'Artículos por comprar', tasks: 'Tareas pendientes', overdue: 'Tareas atrasadas' },
};

const COUNTER = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  // Display bounds: a list never holds more items.
  min: 0,
  max: LIMITS.items,
};

export const listIds = (gladys, listId) => gladys.externalIds(DEVICE_TYPE, listId);

/** The list id behind a device external id, null for anything else. */
export function listIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  return typeof externalId === 'string' && externalId.startsWith(prefix)
    ? externalId.slice(prefix.length) || null
    : null;
}

/** The device of a list, as published to Gladys. */
export function buildDevice(gladys, list, language = 'fr') {
  const ids = listIds(gladys, list.id);
  const names = NAMES[language] ?? NAMES.en;
  const features = [
    {
      ...COUNTER,
      name: list.kind === 'tasks' ? names.tasks : names.items,
      external_id: ids.feature(FEATURE_KEYS.REMAINING),
    },
  ];
  if (list.kind === 'tasks') {
    features.push({
      ...COUNTER,
      name: names.overdue,
      external_id: ids.feature(FEATURE_KEYS.OVERDUE),
    });
  }
  return { name: list.name, external_id: ids.device, should_poll: false, features };
}

/**
 * The states of a list device, in the `publishStates` format.
 * @param {object} gladys
 * @param {object} list
 * @param {(item: object) => boolean} overdue
 */
export function listStates(gladys, list, overdue) {
  const ids = listIds(gladys, list.id);
  const todo = list.items.filter((item) => !item.done);
  const states = [
    { device_feature_external_id: ids.feature(FEATURE_KEYS.REMAINING), state: todo.length },
  ];
  if (list.kind === 'tasks') {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.OVERDUE),
      state: todo.filter(overdue).length,
    });
  }
  return states;
}
