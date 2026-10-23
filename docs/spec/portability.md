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
A failed safety snapshot blocks destructive replacement or migration. Pre-upgrade media uses the
shared encoder so restoring the snapshot retains audio/image kinds and bytes.

The daily backup worker captures, encodes, stores, prunes and mirrors through the same
[restore-point writer](../../src/db/backupRestorePoint.ts) as explicit backups. Only small status
messages cross to the UI; bytes, metadata, asset order, protected snapshots and the five-minute
ordinary throttle stay intact. Retain the ten most recent ordinary snapshots. Create a daily
snapshot when none exists or the newest is at least 24 hours old; failed attempts remain retryable.
The worker and required restore/cleanup code must be available on
first use offline. Without Worker support, use the existing local path; worker failures stay
non-fatal and must not replay heavy work on the UI thread. Explicit and destructive-operation
safety backups retain their awaited path.

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

Lesson prerequisites are advisory same-Course links, transported by `ShareLesson.pr` using the
payload-scoped Lesson `i` identities. Ordinary import remaps every link to fresh local identities;
lineage import adopts source identities and includes links in its existing edit/diff/review snapshots.
Missing prerequisite metadata means no links. Duplicate, self, missing, cross-Course and cyclic
references are rejected. A batch is validated at its transaction boundary, so valid dependency
reversals can be accepted together; a partial acceptance or combined peer graph that remains invalid
fails atomically. Lesson deletion removes inbound links; undo restores those links without replacing
unrelated edits to the dependent Lessons.

`Course.creator` is a literal creator/project display label transported through `payload.by`, not
verified human authorship or approval. Null/absent `by` means no label; string values, including an
empty string, survive unchanged. Lineage updates use the existing Course-detail baseline policy,
retaining a locally edited creator. Legacy copies acquire the label on their next source update;
ordinary imports made by older builds cannot recover a label they discarded. These are additive
fields without a database/index or envelope-version change. Older share readers can discard them
on import/re-export, so lossless round-trips require a supporting build and the original source file
should be retained. Backups retain the metadata and validate the final reference graph.

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

## Local lesson order

Full personal backups, Course undo snapshots and peer sync retain `Course.localLessonOrder`.
Course-file/share payloads exclude it and keep publisher lesson order; fresh content imports have
no preference. This optional field needs no store, index or schema migration. Older clients can
retain the field while ignoring its presentation meaning.

The preference inherits whole-Course merge rules: recovery uses `createdAt` and keeps the current
row on ties; peer sync uses `updatedAt` with canonical JSON breaking ties. Concurrent order and
other Course settings are not merged independently; a competing whole-row change can replace
an order or reset.

## Specification metadata

Course `specificationRef` and course-scoped Concept `specificationPointIds` survive backup/restore,
peer sync, share codes and Course files. Validate before writes: malformed references, duplicate
route/point IDs and links on legacy-scheduling-unit Concepts are invalid. Unknown valid catalogue
IDs and additive nested metadata remain portable; a Course selection change never silently drops
Concept links. Sparse arrays are rejected before JSON conversion can turn holes into null values.
Sync uses the existing whole-Concept last-writer rule and deterministic timestamp
tie-break, rather than unioning removed links back into the record.

Ordinary sharing remaps local Concept IDs while preserving qualified catalogue point IDs and the
Custom fallback strings. Published source metadata retains the reference/fallback text: teacher
corrections update an unchanged selection, while learner selection changes stay local. Concept
links follow published-content update policy; learner schedules, Attempts and reviews stay personal.
These optional keys do not change transport versions or encryption.

## Classroom distribution

[lineageDiff](../../src/db/lineageDiff.ts) is the pure comparison seam;
[mergeImport](../../src/db/mergeImport.ts) applies accepted decisions transactionally.
A published lineage has permanent source identities and revisions. Importing a newer revision
updates material while retaining learner Card state, canonical history and Question evidence.
Repeated/equal/older revisions must not duplicate or roll back accepted content.

New shared-course imports enable **Apply updates automatically**. Non-conflicting author updates
use the existing automatic application path; conflicts with learner edits still wait for review.
Learners can turn the setting off in Course settings. Re-imports, reopening, backup restore and
peer sync retain saved preferences through their existing record rules; this default does not
migrate existing Courses or attach detached copies to a lineage.

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

### Question Set Concept recovery

Published-course updates retain Concepts referenced by surviving Question Sets, including targets
and prerequisites at question, part and subpart depth. During peer sync or manual Combine, a
surviving Question Set prevents deletion of a referenced Concept when an original record belonging
to that Course remains in either snapshot. The merge defers that Concept's deletion while keeping its receipt, so later removal of the
last referencing set honours the original deletion independently of peer merge order. Ordinary
unreferenced Concept deletions and deleted Question Sets still honour their receipts.

For databases already damaged by earlier course updates, keep a full export of the affected device
and obtain an intact full backup from before the update or another paired device. Use Settings'
**Combine two devices** with that file, or sync with the intact device after both are updated.
Combine takes a restore point before replacement and retains Question Sets and attempt receipts.
Check the recovered course and export a fresh full backup afterwards. This restores original
Concept metadata; it does not reconstruct missing records from question text.

If neither snapshot contains the missing Concept, or its Course does not match, the merge still
fails without replacing the database. Keep the affected export and look for an older intact backup;
do not delete Question Sets or edit deletion receipts to force sync through. A snapshot whose
Concept records have all been lost cannot be repaired automatically by this workflow.
