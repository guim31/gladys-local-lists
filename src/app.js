// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the hub, so index.js stays a few lines and the tests drive the
// very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { ListsHub } from './hub.js';
import { sceneActions } from './scenes.js';
import { ListStore } from './store.js';
import { allLanguages, INIT_FAILED, UserError } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'local-lists-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, now, timeZone, timers
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new ListsHub({
    gladys,
    store: options.store ?? new ListStore(),
    now: options.now,
    timeZone: options.timeZone,
    timers: options.timers ?? true,
  });

  // Resolved once the lists are loaded; every handler waits for it, so a
  // command arriving during the start is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): send again what Gladys may have lost.
        await hub.resync(config);
        return;
      }
      started = true;
      await hub.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.publishDevices()));
  // The devices are published with should_poll: false; this only serves a
  // Gladys that would poll anyway.
  gladys.onPoll(whenReady(() => hub.publishStates()));
  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady(() => hub.onDeviceChanged()));
  gladys.onDeviceDeleted(whenReady(() => hub.onDeviceChanged()));
  gladys.onConfigUpdated(whenReady((config) => hub.reconfigure(normalizeConfig(config))));

  // Configuration actions: the answer is shown under the button, in the four
  // languages (the Configuration screen shows the user's one).
  const configurationAction = (fn) =>
    whenReady(async (fields = {}) => {
      try {
        return await fn(fields);
      } catch (err) {
        throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
      }
    });
  gladys.onAction(
    'create_list',
    configurationAction(async ({ name, kind }) => {
      const list = await hub.createList({ name, kind });
      return allLanguages('listCreated', '', list.name);
    }),
  );
  gladys.onAction(
    'delete_list',
    configurationAction(async ({ name }) => {
      const list = await hub.deleteList({ name });
      return allLanguages('listDeleted', '', list.name, list.items.length);
    }),
  );
  gladys.onAction(
    'show_lists',
    configurationAction(async () =>
      Object.fromEntries(
        ['en', 'fr', 'de', 'es'].map((language) => [language, hub.summary(language)]),
      ),
    ),
  );

  for (const [key, handler] of Object.entries(sceneActions(hub))) {
    gladys.onSceneAction(key, whenReady(handler));
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, context = {}) =>
        widget.action(hub, { actionKey, params, ...context }),
      ),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
