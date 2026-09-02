# Schema v22 compatibility note

Schema v22 permanently removes Lacuna's hidden Deck and Folder stores. Course and Lesson
scheduling now uses `schedulingUnits` exclusively.

## Before upgrading

Lacuna creates a full pre-migration snapshot before starting the v22 upgrade. If that snapshot
cannot be committed, the upgrade does not run. Keep the snapshot if you may need to use an older
build.

## Import changes

- Importing an `.apkg` without choosing an existing destination now creates a Course named after
  the Anki deck. Its cards are placed in that Course's default Card scheduling unit. It no longer
  creates a Lacuna Deck.
- A backup carrying non-empty pre-v22 `decks` or `folders` rows is rejected with an explicit
  message. It is not converted, and no partial import occurs. Current-shaped backups may retain
  empty legacy arrays for wire compatibility.
- `LAC0`–`LAC3` are encoding prefixes, not support-version promises. Current course share payloads
  import through those encodings; the old v1 flat Deck payload is recognised and rejected with an
  explicit message. No Deck-to-Course conversion occurs at this boundary.

## Rollback and downgrade

An upgrade that aborts partway remains at schema v21 and the database stays readable by the
previous build.

A completed v22 upgrade cannot be downgraded in place. IndexedDB cannot lower its version and the
Deck and Folder rows no longer exist. The only recovery path is to install the previous Lacuna
build and import the pre-migration snapshot. Schema v22 is not reversible.
