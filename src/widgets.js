// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.2+): `list`.
//
// The use case: the kitchen tablet shows the shopping list or the chores,
// and a tap adds an item, checks one off or clears what is done, without
// opening anything else. The list is chosen in the widget settings (a list
// device); empty, the first list.
//
// Budget (8 components: 1 status, 4 buttons, 2 texts at most): one tile (the
// count left), one status list (up to 10 rows: the items left, then the done
// ones if the setting asks for them), and up to four buttons — "Add" (a form:
// the item, and the due date for a task list), "Check off" and "Uncheck"
// (forms listing the items) and "Clear done" (confirmed). Each button can be
// hidden in the settings. The figures are values, not bound to device
// features, so the widget works before the device is added. Forms on widget
// buttons came with Gladys 5.2.0 (#3168).
// -----------------------------------------------------------------------------

import { formatDue } from './lists/dates.js';
import { sortedItems } from './lists/model.js';
import { WIDGET_KEY } from './hub.js';
import { allLanguages, pick, UserError } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  ADD: 'add',
  CHECK: 'check',
  UNCHECK: 'uncheck',
  CLEAR: 'clear_done',
});
// Values of the `hide` setting, one per button.
export const HIDE_OPTIONS = ['add', 'check', 'uncheck', 'clear'];
const MAX_ROWS = 10;
// Items offered in a select of a form.
const MAX_OPTIONS = 50;

export const TEXT = {
  noList: {
    en: 'No list yet: create one in the configuration of the integration.',
    fr: "Aucune liste pour le moment : créez-en une dans la configuration de l'intégration.",
    de: 'Noch keine Liste: Erstelle eine in der Konfiguration der Integration.',
    es: 'Todavía no hay ninguna lista: cree una en la configuración de la integración.',
  },
  unknown: {
    en: 'This list no longer exists: choose another device in the widget settings.',
    fr: "Cette liste n'existe plus : choisissez un autre appareil dans les réglages du widget.",
    de: 'Diese Liste gibt es nicht mehr: Wähle ein anderes Gerät in den Widget-Einstellungen.',
    es: 'Esta lista ya no existe: elija otro dispositivo en la configuración del widget.',
  },
  empty: {
    en: 'Nothing left on the list.',
    fr: 'Plus rien dans la liste.',
    de: 'Nichts mehr auf der Liste.',
    es: 'No queda nada en la lista.',
  },
  more: { en: 'More items', fr: 'Autres éléments', de: 'Weitere Einträge', es: 'Más elementos' },
  done: { en: 'Done', fr: 'Fait', de: 'Erledigt', es: 'Hecho' },
  overdue: { en: 'overdue', fr: 'en retard', de: 'überfällig', es: 'atrasada' },
  add: { en: 'Add', fr: 'Ajouter', de: 'Hinzufügen', es: 'Añadir' },
  check: { en: 'Check off', fr: 'Cocher', de: 'Abhaken', es: 'Marcar' },
  uncheck: { en: 'Uncheck', fr: 'Décocher', de: 'Zurücksetzen', es: 'Desmarcar' },
  clear: { en: 'Clear done', fr: 'Vider les faits', de: 'Erledigte löschen', es: 'Quitar hechos' },
  item: { en: 'Item', fr: 'Élément', de: 'Eintrag', es: 'Elemento' },
  due: { en: 'Due date', fr: 'Échéance', de: 'Fälligkeit', es: 'Fecha límite' },
  duePlaceholder: {
    en: '2026-11-20 or +3',
    fr: '20/11/2026 ou +3',
    de: '20.11.2026 oder +3',
    es: '20/11/2026 o +3',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function textOnly(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

function itemRow(item, overdue, language) {
  if (item.done) {
    return { label: fit(item.text, 40), icon: 'check-circle', value: t(TEXT.done, language) };
  }
  const late = overdue(item);
  const due = formatDue(item.due, language);
  return {
    label: fit(item.text, 40),
    icon: late ? 'alert-circle' : 'circle',
    ...(late ? { color: 'danger' } : {}),
    value: due ? fit(late ? `${due} · ${t(TEXT.overdue, language)}` : due, 40) : '—',
  };
}

function rows(items, overdue, language) {
  const all = items.map((item) => itemRow(item, overdue, language));
  if (all.length <= MAX_ROWS) {
    return all;
  }
  return [
    ...all.slice(0, MAX_ROWS - 1),
    { label: t(TEXT.more, language), icon: 'more-horizontal', value: all.length - MAX_ROWS + 1 },
  ];
}

const options = (items) =>
  items
    .slice(0, MAX_OPTIONS)
    .map((item) => ({ value: item.id, label: { en: fit(item.text, 40) } }));

function button(key, label, icon, list, language, extra = {}) {
  return {
    type: 'button',
    label: t(label, language),
    icon,
    style: 'secondary',
    ...extra.button,
    action: { key, params: { list: list.id }, ...extra.action },
  };
}

async function get(hub, { settings = {}, language = 'en' }) {
  if (hub.lists.length === 0) {
    return textOnly(TEXT.noList, language);
  }
  const list = settings.device ? hub.listOfDevice(settings.device) : hub.lists[0];
  if (!list) {
    return textOnly(TEXT.unknown, language);
  }
  const hidden = new Set(Array.isArray(settings.hide) ? settings.hide : []);
  const overdue = hub.overdueTest();
  const ordered = sortedItems(list.items);
  const todo = ordered.filter((item) => !item.done);
  const done = ordered.filter((item) => item.done);
  const shown = settings.show_done === true ? ordered : todo;

  const components = [
    {
      type: 'value',
      value: todo.length,
      label: fit(hub.displayName(list), 24),
      icon: list.kind === 'tasks' ? 'check-square' : 'shopping-cart',
    },
  ];
  if (shown.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
  } else {
    components.push({ type: 'status', items: rows(shown, overdue, language) });
  }
  if (!hidden.has('add')) {
    const fields = [{ key: 'item', type: 'string', required: true, label: TEXT.item }];
    if (list.kind === 'tasks') {
      fields.push({
        key: 'due',
        type: 'string',
        required: false,
        label: TEXT.due,
        placeholder: TEXT.duePlaceholder,
      });
    }
    components.push(button(ACTIONS.ADD, TEXT.add, 'plus', list, language, { action: { fields } }));
  }
  if (!hidden.has('check') && todo.length > 0) {
    components.push(
      button(ACTIONS.CHECK, TEXT.check, 'check', list, language, {
        action: {
          fields: [
            {
              key: 'item',
              type: 'select',
              required: true,
              label: TEXT.item,
              options: options(todo),
            },
          ],
        },
      }),
    );
  }
  if (!hidden.has('uncheck') && done.length > 0) {
    components.push(
      button(ACTIONS.UNCHECK, TEXT.uncheck, 'rotate-ccw', list, language, {
        action: {
          fields: [
            {
              key: 'item',
              type: 'select',
              required: true,
              label: TEXT.item,
              options: options(done),
            },
          ],
        },
      }),
    );
  }
  if (!hidden.has('clear') && done.length > 0) {
    components.push(
      button(ACTIONS.CLEAR, TEXT.clear, 'trash-2', list, language, {
        button: { style: 'danger' },
        action: { confirm: true },
      }),
    );
  }
  return { ttl_seconds: 300, components };
}

// The core does not tell the language of the user who tapped: the toast is
// sent in the four languages, an error in the configured one.
async function action(hub, { actionKey, params = {}, values = {} }) {
  const listId = typeof params.list === 'string' ? params.list : null;
  if (!listId || !Object.values(ACTIONS).includes(actionKey)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  try {
    if (actionKey === ACTIONS.ADD) {
      const { list, item, already } = await hub.addItem({
        listId,
        text: values.item,
        due: values.due,
        source: 'widget',
      });
      return {
        message: allLanguages(already ? 'already' : 'added', item.text, hub.displayName(list)),
      };
    }
    if (actionKey === ACTIONS.CLEAR) {
      const { list, removed } = await hub.clearDone({ listId, source: 'widget' });
      return {
        message: allLanguages(
          removed ? 'cleared' : 'nothingDone',
          '',
          hub.displayName(list),
          removed,
        ),
      };
    }
    const done = actionKey === ACTIONS.CHECK;
    const { list, item } = await hub.setDone({
      listId,
      itemId: String(values.item ?? ''),
      done,
      source: 'widget',
    });
    if (!item) {
      return { message: allLanguages('itemGone', '', hub.displayName(list)) };
    }
    return {
      message: allLanguages(done ? 'checked' : 'unchecked', item.text, hub.displayName(list)),
    };
  } catch (err) {
    throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
  }
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
