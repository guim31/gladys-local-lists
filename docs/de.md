# Lokale Listen

Einkaufs- und Aufgabenlisten, die **in Gladys selbst** gespeichert sind:
kein Konto, keine Cloud, kein anderer Server. Zeige eine Liste im Dashboard,
füge mit einem Tippen einen Eintrag hinzu oder hake ihn ab, lass eine Szene
„Müllbeutel“ auf die Einkaufsliste setzen, dich an eine überfällige Aufgabe
erinnern oder die Liste vorlesen, bevor du gehst.

> **Feedback willkommen.** Diese Integration wurde mit dem Test-Gladys des
> SDK und in ihrem Docker-Image getestet, noch nicht im Alltag mit einem
> echten Gladys. Wenn etwas nicht wie beschrieben funktioniert, sag es bitte
> im [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-local-lists/issues).

## Was du brauchst

- Gladys Assistant 5.2.0 oder neuer (die Formulare der Widget-Schaltflächen).
- Sonst nichts: Die Integration speichert die Listen in ihrem eigenen
  Volume.

## Einrichtung

1. Installiere die Integration und öffne ihren Tab **Konfiguration**.
2. **Liste erstellen**: Gib ihren Namen ein (z. B. `Einkauf`) und wähle ihre
   Art:
   - **Einkaufsliste**: zu kaufende Artikel;
   - **Aufgabenliste (Fälligkeiten)**: Aufgaben, jede mit einer optionalen
     Fälligkeit.
3. Öffne den Tab **Erkennung** und füge die Liste hinzu: So wird sie zu
   einem Gerät von Gladys, das du umbenennen und einem Raum zuordnen kannst.
4. Füge das Widget **Lokale Liste** zu einem Dashboard hinzu.

**Listen anzeigen** zeigt die Listen und wie viele Einträge auf jeder offen
sind. **Liste löschen** löscht eine Liste und ihre Einträge endgültig: Gib
zur Bestätigung ihren genauen Namen ein. Lösche danach auch ihr Gerät in
Gladys. Eine Liste wird hier nicht umbenannt: Benenne ihr Gerät in Gladys
um, das Widget und die Szenen verwenden diesen Namen.

**Sprache der Funktionsnamen**: die Sprache der Namen, die die Funktionen
beim Hinzufügen einer Liste erhalten, und der an Szenen gesendeten
Meldungen (standardmäßig Französisch).

## Geräte

Ein Gerät pro Liste, mit:

- **Zu kaufende Artikel** (Einkaufsliste) oder **Offene Aufgaben**
  (Aufgabenliste): die Anzahl der noch nicht abgehakten Einträge;
- **Überfällige Aufgaben** (nur Aufgabenlisten): die Aufgaben, deren
  Fälligkeit vorbei ist.

Diese Zahlen werden im Verlauf gespeichert und funktionieren in den
Szenenbedingungen von Gladys („wenn mehr als 10 Artikel zu kaufen sind…“).
Eine Fälligkeit ohne Uhrzeit ist am nächsten Tag überfällig, eine mit
Uhrzeit in der Minute danach.

## Dashboard

Das Widget **Lokale Liste** zeigt eine Liste: die Anzahl der offenen
Einträge, die Einträge (höchstens zehn Zeilen; die Aufgaben mit ihrer
Fälligkeit, die überfälligen in Rot) und vier Schaltflächen:

- **Hinzufügen**: ein Eintrag und bei einer Aufgabenliste eine optionale
  Fälligkeit;
- **Abhaken** und **Zurücksetzen**: Wähle den Eintrag in einer Liste;
- **Erledigte löschen**: entfernt die abgehakten Einträge, nach einer
  Bestätigung.

Einstellungen: die Liste (leer: die erste), **Erledigte Einträge anzeigen**
und **Auszublendende Schaltflächen** (z. B. ein Wandtablet, das die Liste
nur anzeigt).

## Szenen

### Auslöser

- **Eintrag zu einer lokalen Liste hinzugefügt**: Ein Eintrag wurde im
  Widget oder durch eine Szene hinzugefügt, oder ein abgehakter Eintrag ist
  wieder auf der Liste. Variablen: der Eintrag, die Liste, die Fälligkeit.
- **Eintrag auf einer lokalen Liste abgehakt**: Variablen: der Eintrag, die
  Liste, die Anzahl der offenen Einträge.
- **Lokale Liste erledigt**: Der letzte offene Eintrag einer Liste wurde
  abgehakt.
- **Aufgabe überfällig**: Eine Aufgabe hat ihre Fälligkeit überschritten,
  ohne abgehakt zu sein, einmal pro Aufgabe (erneut, wenn sie zurückgesetzt
  und wieder überfällig wird). Eine Aufgabe, die überfällig wurde, während
  Gladys aus war, löst beim nächsten Start aus.

Jeder Auslöser kann auf eine Liste beschränkt werden (leer: alle Listen).

### Aktionen

- **Zu einer lokalen Liste hinzufügen**: die Liste, der Eintrag und bei
  einer Aufgabenliste eine optionale Fälligkeit: `2026-11-20`, `20.11.2026`,
  `20.11.2026 18:30` oder `+N` für in N Tagen (`+0` für heute, `+1 08:00`
  für morgen um 8 Uhr). Ein Eintrag, der schon auf der Liste steht, wird
  nicht doppelt hinzugefügt (eine Aufgabe übernimmt die neue Fälligkeit);
  ein früher abgehakter Eintrag wird wieder offen.
- **Eintrag einer lokalen Liste abhaken**: anhand seines Textes (Groß- und
  Kleinschreibung und Akzente zählen nicht), erledigt oder wieder offen.
  Ausgaben: gefunden, geändert, Anzahl offen.
- **Erledigte Einträge einer lokalen Liste löschen**: Ausgabe: die Anzahl
  der entfernten.
- **Lokale Liste lesen**: Ausgaben: die offenen Einträge als ein Text
  (`Milch, Eier, Brot`), ihre Anzahl, die überfälligen Aufgaben. Zum Senden
  in einer Nachricht oder zum Vorlesen.

### Szenen-Ideen

- Jeden Montag um 19 Uhr: „Zu einer lokalen Liste hinzufügen“ Müll
  rausbringen, auf die Liste Haushalt, Fälligkeit `+0 20:00`. Um 20 Uhr
  nicht erledigt: „Aufgabe überfällig“ erinnert dich.
- Ein NFC-Tag am Schrank: „Zu einer lokalen Liste hinzufügen“ Kaffee.
- Wenn du das Haus verlässt (Anwesenheit): „Lokale Liste lesen“, dann den
  Text an dein Handy senden.
- „Aufgabe überfällig“: eine Telegram-Nachricht mit der Aufgabe und ihrer
  Liste.
- „Lokale Liste erledigt“: eine Benachrichtigung „Alles gekauft“.

Der Chat-Assistent von Gladys kann die Listen nicht selbst lesen oder
füllen: Das SDK der Integrationen bietet dafür in Gladys 5.3 keinen Weg.
Szenen sind der Weg.

## Deine Daten

Alles wird in einer Datei gespeichert, `lists.json`, im Volume der
Integration (`/data`), mit der vorherigen Version als `lists.json.bak`. Jede
Änderung wird in eine temporäre Datei geschrieben und dann umbenannt: Ein
Stromausfall hinterlässt nie eine halbe Datei. Ist die Datei beim Start
unlesbar, wird sie als `lists.json.corrupt` aufbewahrt und stattdessen die
Sicherung gelesen. Die Deinstallation der Integration löscht ihr Volume und
damit die Listen.

## Fehlerbehebung

- **Die Liste fehlt in den Szenen oder in den Widget-Einstellungen**: Füge
  zuerst ihr Gerät im Tab Erkennung hinzu.
- **„Fälligkeit nicht verstanden“**: Verwende `2026-11-20`,
  `20.11.2026 18:30` oder `+3`.
- **„Die Listen konnten nicht gespeichert werden“**: Das Volume der
  Integration ist voll oder schreibgeschützt; nichts wurde geändert. Sieh
  dir die Protokolle der Integration an.
- Protokolle: in Gladys, auf der Seite der Integration, **Protokolle**.
  Starte die Integration mit `LOG_LEVEL=debug` für mehr Details.

## Grenzen

- 50 Listen, 500 Einträge pro Liste, 200 Zeichen pro Eintrag, 40 pro
  Listenname.
- Keine Unteraufgaben, keine wiederkehrenden Aufgaben, kein Teilen außerhalb
  von Gladys: Die Listen leben nur in Gladys. Eine wiederkehrende Aufgabe ist
  eine Szene, die sie hinzufügt.
- Das Widget zeigt zehn Zeilen; die Formulare bieten die ersten fünfzig
  Einträge an.
- Kein Import aus einem anderen Dienst und kein Export dorthin.
