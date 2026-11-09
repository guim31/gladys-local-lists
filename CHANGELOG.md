# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-09

### Added

- Shopping lists and to-do lists stored in Gladys (`/data/lists.json`), with
  no account and no cloud: created and deleted from the Configuration screen.
- One device per list: the items left to buy or to do, and the overdue tasks
  of a to-do list.
- Dashboard widget "Local list": the items left, overdue tasks in red, and
  buttons to add, check off, uncheck and clear the done items (each can be
  hidden).
- Scene triggers: item added, item checked off, list done, task overdue.
- Scene actions: add an item (with an optional due date such as `+1` or
  `20/11/2026 18:30`), check off or uncheck an item by its text, clear the
  done items, read a list as one text.
- Atomic writes with a backup of the previous version; an unreadable file is
  kept aside and the backup is read.
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-local-lists/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-local-lists/releases/tag/v1.0.0
