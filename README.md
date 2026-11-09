# Local lists for Gladys Assistant

Shopping lists and to-do lists stored **in Gladys itself**, with no account,
no cloud and no other server: the Gladys counterpart of the `local_todo`
integration of Home Assistant.

## Features

- **Several lists**, created from the Configuration screen: shopping lists,
  and to-do lists whose tasks have an optional due date (a day, or a day and
  a time).
- **One device per list**: the items left (to buy or to do) and, for a to-do
  list, the overdue tasks, kept in the history and usable in scene
  conditions.
- **Dashboard widget** "Local list": the items left, overdue tasks in red,
  buttons to add an item, check one off, uncheck one and clear the done
  items. Each button can be hidden.
- **Scene triggers**: item added, item checked off, list done (the last item
  checked off), task overdue (once per task).
- **Scene actions**: add an item (with a due date such as `+1` or
  `20/11/2026 18:30`), check off or uncheck an item by its text, clear the
  done items, read a list as one text (for a message or a speech).
- **Persistence** in one JSON file under `/data`: atomic writes, a backup of
  the previous version, versioned schema, an unreadable file kept aside.
- Four languages: English, French, German, Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later.
- Nothing else.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-local-lists`
   (or install **Local lists** from the catalog once it is listed).
2. In **Configuration**, click **Create a list**: a name and a kind.
3. Open the **Discovery** tab and add the list, then put the **Local list**
   widget on a dashboard.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The lists live in `/data/lists.json` (schema version 1), the only writable
path of the sandboxed container. Every change runs alone, on a copy of the
lists, is written to a temporary file flushed to disk and renamed over
`lists.json` (the previous version is copied to `lists.json.bak` first), and
only then is sent to Gladys: states, scene events, widget refresh. A change
that cannot be written changes nothing and is reported to the user.

Each list gets a random id at its creation: the device external id is built
from it, never from the name, so a list renamed in Gladys keeps its history,
scenes and widgets. The devices are published with `should_poll: false`; a
minute timer of the container finds the tasks that became overdue (in the
time zone of Gladys) and republishes the counts that changed, plus a 12-hour
heartbeat.

The Gladys chat assistant cannot reach the lists: the integration SDK has no
way to expose them to it (Gladys 5.3). Scenes are the way.

## Tested, and what was not

- **Tested** (`npm test`, 80+ tests): the persistence (restart, truncated
  file, backup, fifty concurrent changes, failed write), the due dates and
  the time zone, every scene action and trigger, the widget content against
  the SDK's `validateWidgetContent`, the conformity of the devices with the
  feature table of the Gladys core, the four languages.
- **Tested in the Docker image**, with the constraints of the Gladys sandbox
  (read-only rootfs, all capabilities dropped, 256 MB): the image starts,
  fails cleanly without Gladys, and the lists written in the volume survive
  a restart of the container.
- **Not tested**: a real Gladys instance. Feedback welcome.

## Limitations

- 50 lists, 500 items per list, 200 characters per item.
- No sub-tasks, no recurring tasks (a scene adds them), no sharing outside
  Gladys, no import or export from another service.
- A list is renamed through its device in Gladys, not in the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and a temporary `/data`. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- The idea and the feature set follow the
  [`local_todo`](https://www.home-assistant.io/integrations/local_todo/)
  integration of Home Assistant (Apache-2.0); no code was copied.
- The architecture and the conformity tests follow
  [gladys-kitchenowl](https://github.com/guim31/gladys-kitchenowl) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Home Assistant
or the Open Home Foundation.

## License

Apache-2.0
