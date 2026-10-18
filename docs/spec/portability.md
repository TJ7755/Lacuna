# Portability and published-content boundaries

[import](../../src/db/import.ts), [portability](../../src/db/portability.ts),
[share](../../src/db/share.ts), [courseFile](../../src/db/courseFile.ts) and
[mergeImport](../../src/db/mergeImport.ts) own accepted formats and field mappings.
[backupSnapshot](../../src/db/backupSnapshot.ts) owns the current backup marker/version;
[backupValidation](../../src/db/backupValidation.ts) owns accepted older inputs.
The Course-file envelope version is independent of its inner share-payload version.
Read those definitions instead of treating copied version numbers as a compatibility promise.

## Import and backup

Validate record shapes and references before writes. Known structured item payloads share their
validation across authoring and import. Unsupported future payloads retain readable fallback data
without acquiring a grading path. Bad input must report the affected record/field and leave no
partial content or media behind.

A full backup represents a consistent snapshot of records and referenced media. Read them in one
readonly transaction, then perform expensive byte encoding outside it. Encoding yields between
bounded chunks across assets, including inside a large asset, while preserving bytes, metadata and
asset order. This responsiveness must not weaken the snapshot boundary. Pre-migration snapshots
commit outside the upgrading database transaction so an aborted upgrade retains recovery evidence.
A failed safety snapshot blocks destructive replacement or migration.

Canonical review events are preserved and deduplicated by their evidence identity. Legacy inline
history is normalised without losing available events. Reconstructed scheduling, receipt and
projection data must respect existing merge ownership; a content import is not permission to
replace learner evidence. See [storage compatibility](../storage-v22-compatibility.md) for the
irreversible retired-store boundary.

Device-local annotations, authoring drafts and live AI authority have explicit exclusions. Backup,
peer sync, manual Combine and Course sharing are different formats with different owners; adding
one field everywhere by habit is not a compatibility policy. Follow the actual schemas.

Anki's SQLite parser requires WebAssembly compilation in HTML, hosted worker responses and the
packaged renderer policy. Permit that capability without enabling JavaScript string evaluation.
A response-policy fix also needs a new worker asset identity so cached responses cannot retain the
old restriction. See [Anki boundary tests](../../src/build/apkgBoundary.test.ts).

## Course material versus learner state

A Course share carries reusable material, Concepts, Question definitions and authored sets, not
personal scheduling, reviews, Attempts, completions or unrelated bank content. Ordinary imports
create fresh local identities and remap every relationship coherently. Sequences/Occlusions and
their generated Card/Concept IDs must agree after regeneration as well as immediately after import.

Course files carry referenced media; text codes replace omitted media with clear placeholders.
Occlusion diagrams are referenced by their source entity, not necessarily by Card Markdown.
Question definitions and retained receipts can also keep assets reachable. Do not delete a recent
upload before its authoring transaction can attach it. Files reject missing, duplicate, unrelated
or corrupt media and enforce size limits before reading/decoding and before export.

Sharing a locked/published copy is not a way to fork teacher authority silently. Respect the
existing source/adopted identity registry and public-edit locks.

[SharePage](../../src/pages/SharePage.tsx) keeps archived Courses selectable for link management
and labels them **Archived** in both the picker and selected label, including a single Course.
An explicit Course request wins. Otherwise selection prefers an active shared Course, then an
active Course; when all are archived, it falls back to a shared Course, then the first Course.

## Classroom distribution

[lineageDiff](../../src/db/lineageDiff.ts) is the pure comparison seam;
[mergeImport](../../src/db/mergeImport.ts) applies accepted decisions transactionally.
A published lineage has permanent source identities and revisions. Importing a newer revision
updates material while retaining learner Card state, canonical history and Question evidence.
Repeated/equal/older revisions must not duplicate or roll back accepted content.

Teacher edits, learner edits and upstream removals require their explicit three-way decisions.
Persist the accepted upstream baseline separately from the local chosen result so a deferred or
Keep mine decision is not presented again as new evidence on every update. Adopted IDs must remain
recognisable even when a source item disappears and later returns. Do not match unrelated local
records by coincidental content or overwrite personal evidence through a teacher correction.

Preview is read-only. Review later and interrupted reviews retain pending decisions. Applying a
batch, updating lineage bookkeeping and recording Undo belong to the same ownership/transaction
boundary. Consult the existing diff/merge tests before changing deletion, adoption or baseline rules.

## Relay and recovery

Published share credentials remain private; they never travel inside exported Course files/codes.
A stable published URL can point to successive revisions. Pairing/share tokens are bearer
capabilities; reveal and transmit them only through their supported flow.

An ambiguous write acknowledgement may follow a committed write. Use bounded receipt reads and
compare-and-swap checks rather than unconditional repair or repeated writes. Full replacement
invalidates local AI authority; peer/recovery apply preserves it under its exclusive lifecycle.
Recovery snapshots and user confirmation remain required at their existing destructive boundaries.

[Specification index](../SPEC.md)
