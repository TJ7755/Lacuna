# Schema v22 compatibility note

Schema v22 permanently removes Lacuna's hidden Deck and Folder stores. Course and Lesson
scheduling now uses `schedulingUnits` exclusively.

## Before upgrading

Lacuna creates a full pre-migration snapshot before starting the v22 upgrade. If that snapshot
cannot be committed, the upgrade does not run. Keep the snapshot if you may need to use an older
build.

## Import changes

- Importing an `.apkg` without choosing an existing destination now creates a Course named after
  the Anki deck. Its cards are placed in that Course's question bank scheduling unit. It no longer
  creates a Lacuna Deck.
- Backups from before schema v22 and `LAC0`, `LAC1`, `LAC2` and `LAC3` share codes still import.
  Their Deck data is converted to Courses and scheduling units during import.
- A pre-Course backup's folder hierarchy is not recreated. Lacuna reports the discarded folder
  names in the import result so the loss of organisation is explicit. Cards, review events and
  performance data are retained.

## Rollback and downgrade

An upgrade that aborts partway remains at schema v21 and the database stays readable by the
previous build.

A completed v22 upgrade cannot be downgraded in place. IndexedDB cannot lower its version and the
Deck and Folder rows no longer exist. The only recovery path is to install the previous Lacuna
build and import the pre-migration snapshot. Schema v22 is not reversible.
