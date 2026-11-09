// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The list is
// a device of the integration (`source: "devices"`); items are found by their
// text, case and accents ignored, so a scene variable fits too
// (`{{triggerEvent.data.item}}`).
//
// - `add_item`: "the milk is finished" on an NFC tag, the bin day reminder
//   created every Monday with a due date (`+1`);
// - `set_item_done`: check off (or put back) an item by name;
// - `clear_done`: remove the done items, e.g. every Sunday night;
// - `read_list`: the items left as one text, for a message or a speech.
//
// Errors are thrown in the configured language: a scene shows them as is.
// -----------------------------------------------------------------------------

import { UserError } from './texts.js';

// The `items` output is a string of 1000 characters at most (scene variables).
const ITEMS_MAX_LENGTH = 1000;

function joinItems(items) {
  let text = '';
  for (const item of items) {
    const next = text ? `${text}, ${item}` : item;
    if (next.length > ITEMS_MAX_LENGTH - 2) {
      return `${text}…`;
    }
    text = next;
  }
  return text;
}

const localize = (hub, fn) => async (fields) => {
  try {
    return await fn(fields ?? {});
  } catch (err) {
    throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
  }
};

export function sceneActions(hub) {
  return {
    add_item: localize(hub, async (fields) => {
      const { list, item, already } = await hub.addItem({
        device: fields.list,
        text: fields.item,
        due: fields.due,
        source: 'scene',
      });
      return {
        item: item.text,
        list_name: hub.displayName(list),
        already_on_list: already,
        due: item.due ?? '',
      };
    }),

    set_item_done: localize(hub, async (fields) => {
      const { list, item, changed } = await hub.setDone({
        device: fields.list,
        text: fields.item,
        done: fields.state !== 'todo',
        source: 'scene',
      });
      return {
        item: item?.text ?? String(fields.item ?? ''),
        list_name: hub.displayName(list),
        found: item !== null,
        changed,
        remaining: list.items.filter((entry) => !entry.done).length,
      };
    }),

    clear_done: localize(hub, async (fields) => {
      const { list, removed } = await hub.clearDone({ device: fields.list, source: 'scene' });
      return { list_name: hub.displayName(list), removed };
    }),

    read_list: localize(hub, async (fields) => {
      const { list, remaining, overdue, items } = hub.readList(fields.list);
      return { list_name: hub.displayName(list), remaining, overdue, items: joinItems(items) };
    }),
  };
}

export const SCENE_ACTION_KEYS = Object.keys(sceneActions({ config: {} }));
