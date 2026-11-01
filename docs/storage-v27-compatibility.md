# Schema v27 compatibility note

Lacuna now supports local databases at schema v27 or later. Schema v27 shipped in v0.2.10
on 20 September. New installations create the current schema directly.

## Before upgrading

Lacuna checks the stored database version before opening an upgrade transaction. A database
older than v27 is refused without changing its rows. The error explains how to recover; do
not clear browser storage or uninstall the previous build before exporting your data.

Open the same browser profile and origin with a previous Lacuna build that supports your
database, export a JSON backup from Settings, and keep that file. Verify that the backup file
was saved before clearing site storage or resetting the desktop profile,
then reopen the current build and import the backup. Alternatively, import into a separate
browser profile to preserve the original. Some pre-v22 backups are refused as described below;
use an intermediate compatible build to upgrade those before exporting again.

Supported upgrades retain the full pre-migration snapshot. The v31 activity rewrite does not
run if the snapshot cannot be committed. Keep the snapshot if you may need an older build.

## Import changes

The local database floor does not set the backup-file or share-link floor. Existing supported
backup files still pass through import validation and scheduling projection reconstruction.
The existing refusal of non-empty pre-v22 Deck and Folder backups remains in place.

Current course shares retain older supported payload versions and `LAC0`–`LAC3` encodings.
The old flat Deck payload is still recognised and explicitly refused. These boundaries are
independent of the local database schema; deleting their compatibility would break saved files
and links. Old Bank bookmarks also retain their redirect.

## Rollback and downgrade

A refused database remains at its original version and can be opened by a compatible previous
build. An aborted supported upgrade leaves the source database unchanged.

A completed upgrade cannot be downgraded in place. IndexedDB cannot lower its version. Use a
compatible previous build and import a suitable pre-migration snapshot instead.

## Schema declarations

Dexie 4 creates a fresh database from the latest declared schema without running upgrade
callbacks. Existing databases run the callbacks for declared versions above their stored
version. The complete v27 schema is therefore retained as the baseline, with v28–v31 changes;
the v27 upgrade itself is unnecessary because older databases are refused before opening.
See [Dexie's version documentation](https://dexie.org/docs/Dexie/Dexie.version()).
