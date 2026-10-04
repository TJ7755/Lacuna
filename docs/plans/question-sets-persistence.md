# Question-set persistence and compatibility contract

**Status:** reviewed contract for schema v28 and the first authored-content slice.
**Scope:** authored question-set content and the compatibility rules that later attempt,
portability, sharing and sync work must preserve. This document does not authorise attempt or UI
storage in the first persistence slice.

## Entity boundary and identities

Authored question sets are a distinct aggregate beside the existing `QuestionDefinition` and
`QuestionAttempt` records. Legacy fixed and generated Questions retain their FSRS schedules,
content versions, concept relationship rows and attempt history unchanged. There is no implicit
mapping between a legacy Question ID and a set, nested question, part or allocation ID.

One `questionSets` row owns the complete ordered authored document: set metadata, lesson and
assessment links, questions, parts, subparts, answers, allocations and concept links. Every set,
node, multiple-choice option and allocation keeps its stable authored ID. Arrays are canonical
order; no order projections or relationship tables are introduced.

The stored `QuestionSetRecord` extends the pure `QuestionSet` with:

- `contentVersion`, a positive safe integer starting at 1 and incremented only when the authored
  aggregate changes;
- `contentRevisionId`, a fresh opaque ID for each changed aggregate;
- `createdAt` and `updatedAt`, finite epoch-millisecond mutation stamps.

The store is indexed by `id`, `courseId`, `lessonIds`, `assessmentIds` and `updatedAt`. Nested
concept IDs remain inside the aggregate because they are validated and replaced atomically; they
are not queried as an independent ownership relation in this slice.

## Repository and validation boundary

The public authored-content repository is the only write seam:

```ts
createQuestionSet(input: QuestionSet, now?: number): Promise<QuestionSetRecord>
getQuestionSet(id: string): Promise<QuestionSetRecord | null>
listQuestionSets(courseId: string): Promise<QuestionSetRecord[]>
updateQuestionSet(
  id: string,
  content: QuestionSet,
  options: { expectedContentRevisionId: string; now?: number },
): Promise<QuestionSetRecord>
deleteQuestionSet(id: string, now?: number): Promise<void>
```

`parseQuestionSetRecord(value: unknown)` is the strict untrusted-data boundary. It rejects unknown
object keys, missing or wrongly typed fields, non-finite timestamps, invalid version values and
every pure-domain validation issue. Repository writes validate before opening their transaction,
then transactionally confirm that the Course exists and every referenced Lesson, Assessment and
Concept exists in that same Course. Create clears an older set tombstone. Update preserves `id`,
`courseId` and `createdAt`; it requires the revision the editor opened, increments
`contentVersion`, replaces the whole aggregate, stamps a fresh `contentRevisionId`, and advances
`updatedAt` by at least one millisecond even when the wall clock stalls or moves backwards.
Supplying identical content is a no-op that preserves the revision and timestamps. Delete removes
the row and writes a newer `questionSets` tombstone in the same transaction. Recreating a
deliberately restored ID stamps the new row later than its tombstone before clearing that
tombstone, so a peer cannot immediately delete the restored content again.

Concept deletion is refused while current authored content refers to the Concept. Lesson and
assessment deletion remove their links by repository update, producing a new content revision.
Lesson undo restores the removed link as another revision while retaining intervening set edits.
Course deletion cascades authored sets and writes their tombstones; Course undo restores the
captured aggregates with revisions newer than those tombstones. These rules prevent current rows
from becoming invalid without fabricating replacement links.

## Future attempts and retained revisions

Attempts will be separate personal records, never fields on `questionSets`. A submitted attempt
will pin `questionSetId`, `contentVersion` and `contentRevisionId`, and carry an immutable complete
content/scheme receipt plus submitted responses. Later self-mark decisions, annotations,
corrections, assistance and reveal context will remain distinct evidence attached to that receipt.
Editing or deleting current authored content cannot rewrite the receipt.

Deleting a set will hide current content and emit a tombstone, while later attempt persistence
will retain readable receipts. Deleting a Concept, Lesson or Assessment will not rewrite an
attempt receipt: its labels and authored links are historical snapshots. Course deletion may
remove personal attempts as part of the explicit whole-Course cascade, but portable recovery must
be able to restore them together. Immutable attempt-ID collisions with unequal receipts are hard
conflicts; neither recovery nor peer merge may choose one with `updatedAt`.

## Media ownership

Authored Markdown/media references in current content are reachable from `questionSets`. Future
attempt receipts are an additional reachability root, so editing or deleting the current set must
not collect media still referenced by a retained receipt. The existing asset scanner must be
extended for both roots before set media is exposed in authoring. Course sharing carries current
authored content and its media; it excludes personal attempt receipts, answers and marking data.

## Backup, replacement, recovery and sync

Backup and peer-sync envelopes increment from v11 to v12 when they add `questionSets` as validated
authored content. Older v11 inputs normalise to an empty `questionSets` collection and retain all
legacy Question meaning. Future attempt records require another envelope increment; they must not
be added silently to v12. Newer envelopes fail closed in older readers that cannot preserve the
added collections; silently dropping unknown stores is forbidden. V12 uses `app: 'lacuna-v12'`
because old readers accept unfamiliar numeric versions. Historical raw snapshots used schema
numbers rather than backup versions: the reader preserves those boundaries, and raw v22/v23
content still passes through the legacy Question migration. New snapshots from v24 onwards use
the current portable envelope.

Replace-import includes `questionSets` in candidate validation, replacement deletion and restore.
Peer merge treats a set as one revisioned aggregate. The greater `updatedAt` wins; equal timestamps
use the lexically greater `contentRevisionId` as a stable tie-break. Equal revision IDs with unequal
content are a hard validation error. Tombstones defeat older live rows. Backup recovery merge keeps
its existing per-ID behaviour: the most recently touched copy wins, with the same deterministic
revision-ID tie-break added for equal set timestamps. It does not acquire peer-sync conflict-review
semantics merely because the row shape is shared. Recovering a deleted set advances its mutation
stamp beyond deletion receipts and clears the local receipt so a later sync cannot discard the
recovered content. Future immutable attempts merge by ID only when
receipts are byte-for-byte equivalent; a mismatch is surfaced for review.

Course share payloads increment from v3 to v4 when they begin carrying current authored sets. The
outer `.lacourse` envelope remains v1 and carries the v4 payload; old payload parsers fail closed.
Imported sets receive collision-safe stable IDs and all nested references are remapped as a single
operation. Personal attempts, annotations, decisions, schedules and tombstones are excluded.
Ordinary Card exports remain Card-only. Published updates track accepted set revisions and refuse
conflicting local edits or deletions atomically. Assessment-linked sets are supported by ordinary
unpublished course imports; published export/import rejects them until assessment lineage exists.
MCP lineage preview/apply also rejects sets until its preview can represent their changes.

## Migration and operational coverage

Schema v28 adds an empty `questionSets` store. It neither transforms nor scans the four legacy
Question stores, so existing Questions, relationships, attempts and schedules remain byte-for-byte
unchanged. The existing pre-migration hook attempts a snapshot before every version increase, so it
also attempts one before v28. Its current failure policy only blocks upgrades that cross a version
listed as destructive; because v28 is additive, a snapshot failure after the old version was read
is logged and the upgrade may continue. This slice does not pretend the hook gives v28 a stronger
guarantee than the code does.

The compatibility work must cover direct table lists and transaction scopes in schema typing,
diagnostics, backups, import validation, replacement exclusions, Course deletion, tombstone
pruning, asset scans, Course share, `.lacourse`, peer snapshots and merge. Tests must include an
upgrade from v27 containing legacy Question data, repository reference integrity, revision/no-op
behaviour, deletion tombstones, and the relevant portability round trips before Stage 2 is marked
complete.

## Device-local author drafts — subsequent storage slice

Incomplete author work is stored in existing `appState` under
`questionSetDraft:<encodedCourseId>:<encodedSetId>`, without changing schema v28 or
portable envelopes. Each entry carries schema version 1, the incomplete document,
its base saved-content revision (null for a new set), a draft revision and timestamp.
Runtime parsing verifies nested shape and key identity; complete domain validation
runs when saving the finished document. Malformed stored work is never silently replaced.

Draft writes use compare-and-swap revisions. A finished save checks both the draft and
saved-content revisions, writes through the existing set repository, then removes the
draft in the same transaction. Failure preserves both previous states. Immutable editing
helpers retain node identities across insertion, deletion and reordering.

Drafts are local recovery data, excluded from backup, share and peer sync. Course deletion
and undo include them; undo issues fresh revisions. Asset cleanup retains media referenced
by saved drafts. The future editor must additionally protect the interval between creating
an uploaded asset and saving its draft reference; this storage slice does not close that
live-upload interval.

The primary agent owns the UI redesign. No delegated UI implementation is included in
this slice, and work stops before the authoring interface.
