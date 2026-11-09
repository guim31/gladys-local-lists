// -----------------------------------------------------------------------------
// The lists hub: the lists document in memory, every change to it, and what
// each change sends to Gladys (devices, states, scene events, widget nudges).
//
// Changes are serialized: each one runs alone on a copy of the document, the
// copy is written to /data, and only then does it become the current
// document. Two scenes adding an item at the same time both get it; a write
// that fails changes nothing and is reported to the user.
//
// A minute timer finds the tasks that became overdue (one `task_overdue`
// event per task, remembered in the file so a restart does not repeat it) and
// republishes the counts: only the changes, plus a 12-hour heartbeat.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, listIdOf, listIds, listStates } from './devices.js';
import { isOverdue, localNow, parseDue } from './lists/dates.js';
import { cleanText, KINDS, LIMITS, matchKey, newId, sortedItems } from './lists/model.js';
import { message, UserError } from './texts.js';

const logger = createLogger({ name: 'local-lists' });

export const WIDGET_KEY = 'list';

// Scene trigger keys: permanent once published.
export const TRIGGERS = Object.freeze({
  ITEM_ADDED: 'item_added',
  ITEM_COMPLETED: 'item_completed',
  LIST_EMPTIED: 'list_emptied',
  TASK_OVERDUE: 'task_overdue',
});

const TICK_MS = 60_000;
// The front shows "no recent value" past 48 h: an unchanged count is sent again.
const HEARTBEAT_MS = 12 * 3600_000;

export class ListsHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {import('./store.js').ListStore} options.store
   * @param {() => number} [options.now] clock, milliseconds
   * @param {string} [options.timeZone] IANA time zone, TZ of the container by default
   * @param {boolean} [options.timers] run the minute timer (off in the tests)
   */
  constructor({ gladys, store, now = Date.now, timeZone, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    this.timeZone = timeZone;
    this.timers = timers;
    this.config = { language: 'fr' };
    this.document = { schema: 1, lists: [] };
    this.queue = Promise.resolve();
    this.timer = null;
    // Problems logged once, until they are over (key → message).
    this.problems = new Map();
  }

  // --- Quiet logs: one line when a problem starts, one when it ends --------

  problem(key, text) {
    if (!this.problems.has(key)) {
      logger.warn(text);
    } else {
      logger.debug(text);
    }
    this.problems.set(key, text);
  }

  resolved(key) {
    if (this.problems.delete(key)) {
      logger.info(`Back to normal: ${key}`);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const { document, source } = await this.store.load();
    this.document = document;
    logger.info(
      `${document.lists.length} list(s) loaded (${source === 'new' ? 'first start' : source})`,
    );
    if (source === 'backup') {
      // Put the restored lists back in lists.json at once (the broken file
      // stays as lists.json.corrupt, the backup is left untouched).
      await this.store.save(document).catch((err) => logger.error(`Cannot write: ${err.message}`));
    }
    // The timer runs even if the first publication below fails: a later
    // reconnection only resynchronizes.
    if (this.timers && !this.timer) {
      this.timer = setInterval(() => {
        this.tick().catch((err) => this.problem('tick', `Minute check failed: ${err.message}`));
      }, TICK_MS);
      this.timer.unref?.();
    }
    await this.resync(config);
  }

  /** After a (re)connection: send again what Gladys may have lost. */
  async resync(config) {
    this.config = config;
    await this.publishDevices();
    this.gladys.forgetPublishedStates();
    await this.tick();
    await this.gladys.setConnectionStatus(true);
  }

  async reconfigure(config) {
    const languageChanged = config.language !== this.config.language;
    this.config = config;
    if (languageChanged) {
      // Feature names of devices not added yet follow the new language.
      await this.publishDevices();
      this.refreshWidget();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.queue.catch(() => {});
    await this.store.flush();
  }

  // --- Reading ---------------------------------------------------------------

  local() {
    return localNow(this.now(), this.timeZone);
  }

  overdueTest() {
    const local = this.local();
    return (item) => !item.done && isOverdue(item.due, local);
  }

  get lists() {
    return this.document.lists;
  }

  /** The list of a device external id, null when it no longer exists. */
  listOfDevice(externalId) {
    const id = listIdOf(this.gladys, externalId);
    return this.lists.find((list) => list.id === id) ?? null;
  }

  /** The name the user sees: the device name given in Gladys, else the list name. */
  displayName(list) {
    const deviceId = listIds(this.gladys, list.id).device;
    const device = (this.gladys.devices ?? []).find((entry) => entry.external_id === deviceId);
    return device?.name || list.name;
  }

  /** Lists whose device was added in Gladys. */
  createdLists() {
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    return this.lists.filter((list) => created.has(listIds(this.gladys, list.id).device));
  }

  // --- Publishing ------------------------------------------------------------

  async publishDevices() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.lists.map((list) => buildDevice(this.gladys, list, this.config.language)),
      );
      this.resolved('devices');
    } catch (err) {
      // The lists are saved: the devices follow at the next scan or reconnection.
      this.problem('devices', `Devices not published: ${err.message}`);
    }
  }

  async publishStates(lists = this.createdLists()) {
    const overdue = this.overdueTest();
    const states = lists.flatMap((list) => listStates(this.gladys, list, overdue));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States not published: ${err.message}`);
    }
  }

  /** Publish scene events; resolves with the ones Gladys accepted. */
  async fire(events) {
    const sent = [];
    for (const event of events) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
        sent.push(event);
        this.resolved('scene-event');
      } catch (err) {
        this.problem('scene-event', `Scene event ${event.key} refused: ${err.message}`);
      }
    }
    return sent;
  }

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    const list = this.listOfDevice(device?.external_id);
    if (list) {
      this.gladys.forgetPublishedStates(device.external_id);
      await this.publishStates([list]);
    }
    this.refreshWidget();
  }

  onDeviceChanged() {
    this.refreshWidget();
  }

  // --- Changes ---------------------------------------------------------------

  /**
   * Run one change on a copy of the document, write it, then make it current
   * and send its effects. `change(draft, effects)` fills `effects.events` and
   * sets `effects.structure` when lists were created or deleted; it returns
   * the result of the operation.
   * @param {(draft: object, effects: object) => any} change
   * @param {{ source?: string }} [options] `widget`: the core reloads the widget itself
   */
  mutate(change, { source } = {}) {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.document);
      const effects = { events: [], structure: false, changed: false };
      const result = change(draft, effects);
      if (!effects.changed) {
        return result;
      }
      try {
        await this.store.save(draft);
      } catch (err) {
        logger.error(`Cannot write the lists: ${err.message}`);
        throw new UserError('saveFailed');
      }
      this.document = draft;
      if (effects.structure) {
        await this.publishDevices();
      }
      await this.publishStates();
      await this.fire(effects.events);
      if (source !== 'widget') {
        this.refreshWidget();
      }
      return result;
    });
    // The next change waits for this one, whatever its outcome.
    this.queue = run.catch(() => {});
    return run;
  }

  /** The list behind a device external id, in a draft. */
  draftList(draft, { device, listId }) {
    const id = listId ?? listIdOf(this.gladys, device);
    const list = draft.lists.find((entry) => entry.id === id);
    if (!list) {
      throw new UserError('unknownList');
    }
    return list;
  }

  eventBase(list) {
    return {
      list: listIds(this.gladys, list.id).device,
      list_name: this.displayName(list),
    };
  }

  createList({ name, kind }) {
    return this.mutate((draft, effects) => {
      const clean = cleanText(name, LIMITS.name);
      if (!clean) {
        throw new UserError('emptyName');
      }
      if (draft.lists.some((list) => matchKey(list.name) === matchKey(clean))) {
        throw new UserError('nameTaken', '', clean);
      }
      if (draft.lists.length >= LIMITS.lists) {
        throw new UserError('tooManyLists', '', '', LIMITS.lists);
      }
      const ids = new Set(draft.lists.map((list) => list.id));
      let id = newId();
      while (ids.has(id)) {
        id = newId();
      }
      const list = {
        id,
        name: clean,
        kind: KINDS.includes(kind) ? kind : 'shopping',
        created_at: new Date(this.now()).toISOString(),
        items: [],
      };
      draft.lists.push(list);
      Object.assign(effects, { structure: true, changed: true });
      logger.info(`List "${clean}" created (${list.kind})`);
      return list;
    });
  }

  deleteList({ name }) {
    return this.mutate((draft, effects) => {
      const wanted = matchKey(name);
      const index = draft.lists.findIndex(
        (list) => matchKey(list.name) === wanted || matchKey(this.displayName(list)) === wanted,
      );
      if (index < 0) {
        throw new UserError('noListNamed', '', cleanText(name, LIMITS.name));
      }
      const [list] = draft.lists.splice(index, 1);
      Object.assign(effects, { structure: true, changed: true });
      logger.info(`List "${list.name}" deleted (${list.items.length} items)`);
      return list;
    });
  }

  /**
   * Put an item on a list. Already there and not done: nothing is added (a
   * task gets the new due date, if one is given). Already there and done: it
   * is back to do, like a product bought last week and needed again.
   * @returns {Promise<{ list, item, already: boolean }>}
   */
  addItem({ device, listId, text, due, source }) {
    return this.mutate(
      (draft, effects) => {
        const list = this.draftList(draft, { device, listId });
        const clean = cleanText(text, LIMITS.text);
        if (!clean) {
          throw new UserError('emptyItem');
        }
        let dueDate = null;
        if (list.kind === 'tasks') {
          try {
            dueDate = parseDue(due, this.local().date);
          } catch {
            throw new UserError('badDue', cleanText(String(due), 40));
          }
        }
        const key = matchKey(clean);
        const same = list.items.filter((item) => matchKey(item.text) === key);
        const open = same.find((item) => !item.done);
        if (open) {
          if (dueDate && dueDate !== open.due) {
            Object.assign(open, { due: dueDate, overdue_notified: false });
            effects.changed = true;
          }
          return { list, item: open, already: true };
        }
        let item = same[0];
        if (item) {
          Object.assign(item, {
            done: false,
            done_at: null,
            due: dueDate,
            overdue_notified: false,
          });
        } else {
          if (list.items.length >= LIMITS.items) {
            throw new UserError('tooManyItems', '', list.name, LIMITS.items);
          }
          const ids = new Set(list.items.map((entry) => entry.id));
          let id = newId();
          while (ids.has(id)) {
            id = newId();
          }
          item = {
            id,
            text: clean,
            done: false,
            due: dueDate,
            created_at: new Date(this.now()).toISOString(),
            done_at: null,
            overdue_notified: false,
          };
          list.items.push(item);
        }
        effects.changed = true;
        effects.events.push({
          key: TRIGGERS.ITEM_ADDED,
          data: { ...this.eventBase(list), item: item.text, due: item.due ?? '' },
        });
        logger.info(`Item added to "${list.name}"${source ? ` (${source})` : ''}`);
        return { list, item, already: false };
      },
      { source },
    );
  }

  /**
   * Check an item off (`done: true`) or put it back to do (`done: false`),
   * found by id (widget) or by text (scenes: case and accents ignored).
   * @returns {Promise<{ list, item: object|null, changed: boolean }>}
   */
  setDone({ device, listId, itemId, text, done, source }) {
    return this.mutate(
      (draft, effects) => {
        const list = this.draftList(draft, { device, listId });
        const key = text === undefined ? null : matchKey(cleanText(text, LIMITS.text));
        const candidates = list.items.filter((item) =>
          itemId ? item.id === itemId : matchKey(item.text) === key,
        );
        const item = candidates.find((entry) => entry.done !== done) ?? candidates[0] ?? null;
        if (!item || item.done === done) {
          return { list, item, changed: false };
        }
        const before = list.items.filter((entry) => !entry.done).length;
        if (done) {
          Object.assign(item, { done: true, done_at: new Date(this.now()).toISOString() });
          const remaining = before - 1;
          effects.events.push({
            key: TRIGGERS.ITEM_COMPLETED,
            data: { ...this.eventBase(list), item: item.text, remaining },
          });
          if (remaining === 0) {
            effects.events.push({ key: TRIGGERS.LIST_EMPTIED, data: this.eventBase(list) });
          }
        } else {
          Object.assign(item, { done: false, done_at: null, overdue_notified: false });
        }
        effects.changed = true;
        logger.info(
          `Item ${done ? 'checked off' : 'back to do'} on "${list.name}"${source ? ` (${source})` : ''}`,
        );
        return { list, item, changed: true };
      },
      { source },
    );
  }

  /** Remove the done items of a list. @returns {Promise<{ list, removed: number }>} */
  clearDone({ device, listId, source }) {
    return this.mutate(
      (draft, effects) => {
        const list = this.draftList(draft, { device, listId });
        const before = list.items.length;
        list.items = list.items.filter((item) => !item.done);
        const removed = before - list.items.length;
        if (removed > 0) {
          effects.changed = true;
          logger.info(`${removed} done item(s) removed from "${list.name}"`);
        }
        return { list, removed };
      },
      { source },
    );
  }

  /** What a scene can read of a list: counts and the items left, in order. */
  readList(device) {
    const list = this.draftList(this.document, { device });
    const overdue = this.overdueTest();
    const todo = sortedItems(list.items).filter((item) => !item.done);
    return {
      list,
      remaining: todo.length,
      overdue: todo.filter(overdue).length,
      items: todo.map((item) => item.text),
    };
  }

  /** One line per list, for the "Show the lists" action. */
  summary(language) {
    if (this.lists.length === 0) {
      return message('noLists', language);
    }
    return this.lists
      .map((list) => {
        const shown = this.displayName(list);
        const name = shown === list.name ? shown : `${shown} (${list.name})`;
        return message('summary', language, '', name, list.items.filter((i) => !i.done).length);
      })
      .join(' · ');
  }

  // --- Minute timer ----------------------------------------------------------

  /**
   * Fire the tasks that became overdue, then republish the counts. A task is
   * remembered as notified only once Gladys accepted its event: while Gladys
   * is unreachable, it is tried again every minute.
   */
  async tick() {
    await this.queue;
    const overdue = this.overdueTest();
    const pending = [];
    if (this.gladys.connected !== false) {
      for (const list of this.lists.filter((entry) => entry.kind === 'tasks')) {
        for (const item of list.items.filter(
          (entry) => overdue(entry) && !entry.overdue_notified,
        )) {
          pending.push({
            listId: list.id,
            itemId: item.id,
            key: TRIGGERS.TASK_OVERDUE,
            data: { ...this.eventBase(list), item: item.text, due: item.due },
          });
        }
      }
    }
    const sent = await this.fire(pending);
    if (sent.length > 0) {
      await this.mutate((draft, effects) => {
        for (const { listId, itemId } of sent) {
          const item = draft.lists
            .find((list) => list.id === listId)
            ?.items.find((entry) => entry.id === itemId);
          if (item && !item.done) {
            item.overdue_notified = true;
            effects.changed = true;
          }
        }
      })
        .then(() => this.resolved('save'))
        .catch((err) => this.problem('save', `Overdue tasks not recorded: ${err.message}`));
    }
    await this.publishStates();
  }
}
