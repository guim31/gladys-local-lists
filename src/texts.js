// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget layout: results of
// the Configuration actions, of the scene actions and of the widget buttons,
// and their errors. Four languages, the four of the Gladys interface; German
// says "du", Spanish "usted". test/i18n.test.js checks every table.
//
// Every message is a function of (item, list, count): the item text, the
// list name and a number, used or not.
// -----------------------------------------------------------------------------

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const MESSAGES = {
  en: {
    added: (item, list) => `"${item}" added to ${list}.`,
    already: (item, list) => `"${item}" is already on ${list}.`,
    checked: (item, list) => `"${item}" checked off on ${list}.`,
    unchecked: (item, list) => `"${item}" is back on ${list}.`,
    itemGone: (item, list) => `This item is no longer on ${list}.`,
    cleared: (item, list, count) => `Done items removed from ${list}: ${count}.`,
    nothingDone: (item, list) => `No done item on ${list}.`,
    listCreated: (item, list) =>
      `List "${list}" created. Add it in Discovery to use it on the dashboard and in scenes.`,
    listDeleted: (item, list, count) =>
      `List "${list}" deleted (${count} items). Delete its device in Gladys too.`,
    noLists: () => 'No list yet: create one with the button above.',
    summary: (item, list, count) => `${list}: ${count} left`,
    unknownList: () => 'This list no longer exists: choose another one.',
    noListNamed: (item, list) => `No list is named "${list}".`,
    nameTaken: (item, list) => `A list named "${list}" already exists.`,
    emptyName: () => 'Enter a name for the list.',
    emptyItem: () => 'Enter the item.',
    tooManyLists: (item, list, count) => `${count} lists at most.`,
    tooManyItems: (item, list, count) => `${list} is full (${count} items): remove the done items.`,
    badDue: (item) => `Due date not understood ("${item}"): e.g. 2026-11-20, 20/11/2026 18:30, +3.`,
    saveFailed: () => 'The lists could not be saved in /data: see the integration logs.',
  },
  fr: {
    added: (item, list) => `« ${item} » ajouté à ${list}.`,
    already: (item, list) => `« ${item} » est déjà dans ${list}.`,
    checked: (item, list) => `« ${item} » coché dans ${list}.`,
    unchecked: (item, list) => `« ${item} » est de nouveau à faire dans ${list}.`,
    itemGone: (item, list) => `Cet élément n'est plus dans ${list}.`,
    cleared: (item, list, count) => `Éléments faits retirés de ${list} : ${count}.`,
    nothingDone: (item, list) => `Aucun élément fait dans ${list}.`,
    listCreated: (item, list) =>
      `Liste « ${list} » créée. Ajoutez-la dans Découverte pour l'utiliser au tableau de bord et dans les scènes.`,
    listDeleted: (item, list, count) =>
      `Liste « ${list} » supprimée (${count} éléments). Supprimez aussi son appareil dans Gladys.`,
    noLists: () => 'Aucune liste pour le moment : créez-en une avec le bouton ci-dessus.',
    summary: (item, list, count) => `${list} : ${count} restant(s)`,
    unknownList: () => "Cette liste n'existe plus : choisissez-en une autre.",
    noListNamed: (item, list) => `Aucune liste ne s'appelle « ${list} ».`,
    nameTaken: (item, list) => `Une liste « ${list} » existe déjà.`,
    emptyName: () => 'Saisissez un nom pour la liste.',
    emptyItem: () => "Saisissez l'élément.",
    tooManyLists: (item, list, count) => `${count} listes au maximum.`,
    tooManyItems: (item, list, count) =>
      `${list} est pleine (${count} éléments) : retirez les éléments faits.`,
    badDue: (item) => `Échéance incomprise (« ${item} ») : ex. 2026-11-20, 20/11/2026 18:30, +3.`,
    saveFailed: () =>
      "Les listes n'ont pas pu être enregistrées dans /data : voir les logs de l'intégration.",
  },
  de: {
    added: (item, list) => `„${item}“ zu ${list} hinzugefügt.`,
    already: (item, list) => `„${item}“ steht schon auf ${list}.`,
    checked: (item, list) => `„${item}“ auf ${list} abgehakt.`,
    unchecked: (item, list) => `„${item}“ ist wieder offen auf ${list}.`,
    itemGone: (item, list) => `Dieser Eintrag steht nicht mehr auf ${list}.`,
    cleared: (item, list, count) => `Erledigte Einträge von ${list} entfernt: ${count}.`,
    nothingDone: (item, list) => `Kein erledigter Eintrag auf ${list}.`,
    listCreated: (item, list) =>
      `Liste „${list}“ erstellt. Füge sie unter Erkennung hinzu, um sie im Dashboard und in Szenen zu nutzen.`,
    listDeleted: (item, list, count) =>
      `Liste „${list}“ gelöscht (${count} Einträge). Lösche auch ihr Gerät in Gladys.`,
    noLists: () => 'Noch keine Liste: Erstelle eine mit der Schaltfläche oben.',
    summary: (item, list, count) => `${list}: ${count} offen`,
    unknownList: () => 'Diese Liste gibt es nicht mehr: Wähle eine andere.',
    noListNamed: (item, list) => `Keine Liste heißt „${list}“.`,
    nameTaken: (item, list) => `Eine Liste „${list}“ gibt es schon.`,
    emptyName: () => 'Gib einen Namen für die Liste ein.',
    emptyItem: () => 'Gib den Eintrag ein.',
    tooManyLists: (item, list, count) => `Höchstens ${count} Listen.`,
    tooManyItems: (item, list, count) =>
      `${list} ist voll (${count} Einträge): Entferne die erledigten Einträge.`,
    badDue: (item) =>
      `Fälligkeit nicht verstanden („${item}“): z. B. 2026-11-20, 20.11.2026 18:30, +3.`,
    saveFailed: () =>
      'Die Listen konnten nicht in /data gespeichert werden: Sieh dir die Protokolle der Integration an.',
  },
  es: {
    added: (item, list) => `«${item}» añadido a ${list}.`,
    already: (item, list) => `«${item}» ya está en ${list}.`,
    checked: (item, list) => `«${item}» marcado en ${list}.`,
    unchecked: (item, list) => `«${item}» vuelve a estar pendiente en ${list}.`,
    itemGone: (item, list) => `Este elemento ya no está en ${list}.`,
    cleared: (item, list, count) => `Elementos hechos quitados de ${list}: ${count}.`,
    nothingDone: (item, list) => `Ningún elemento hecho en ${list}.`,
    listCreated: (item, list) =>
      `Lista «${list}» creada. Añádala en Descubrimiento para usarla en el panel y en las escenas.`,
    listDeleted: (item, list, count) =>
      `Lista «${list}» eliminada (${count} elementos). Elimine también su dispositivo en Gladys.`,
    noLists: () => 'Todavía no hay ninguna lista: cree una con el botón de arriba.',
    summary: (item, list, count) => `${list}: ${count} pendiente(s)`,
    unknownList: () => 'Esta lista ya no existe: elija otra.',
    noListNamed: (item, list) => `Ninguna lista se llama «${list}».`,
    nameTaken: (item, list) => `Ya existe una lista «${list}».`,
    emptyName: () => 'Introduzca un nombre para la lista.',
    emptyItem: () => 'Introduzca el elemento.',
    tooManyLists: (item, list, count) => `${count} listas como máximo.`,
    tooManyItems: (item, list, count) =>
      `${list} está llena (${count} elementos): quite los elementos hechos.`,
    badDue: (item) =>
      `Fecha límite no entendida («${item}»): p. ej. 2026-11-20, 20/11/2026 18:30, +3.`,
    saveFailed: () =>
      'No se han podido guardar las listas en /data: consulte los registros de la integración.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A message in one language. */
export function message(key, language, item = '', list = '', count = 0) {
  return pick(MESSAGES, language)[key](fit(String(item), 60), fit(String(list), 40), count);
}

/** The same message in every language (Configuration screen, toasts). */
export const allLanguages = (key, item, list, count) =>
  Object.fromEntries(
    Object.keys(MESSAGES).map((language) => [language, message(key, language, item, list, count)]),
  );

/**
 * An error the user caused and can fix: thrown by the hub, shown in the
 * language of whoever sees it (the widget user, or the configured language).
 */
export class UserError extends Error {
  constructor(key, item = '', list = '', count = 0) {
    super(message(key, LANGUAGE_FALLBACK, item, list, count));
    this.name = 'UserError';
    this.key = key;
    this.args = [item, list, count];
  }

  localized(language) {
    return message(this.key, language, ...this.args);
  }
}
