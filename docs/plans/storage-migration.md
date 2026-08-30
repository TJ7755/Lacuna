# Storage and review-history migration

**Status:** phase 5 closed in schema v22; hidden Deck and Folder stores removed after compatibility and rollback gates passed

**Reviewed:** 13 August 2026

## Purpose

Lacuna's Course/Lesson model is now the product-facing model, but the IndexedDB layer still
contains hidden Deck/Folder scheduling structures and embeds every review event in its Card row.
This plan separates the two migrations that were previously described together as a
"memory/storage migration":

1. the **domain storage migration** from hidden Deck/Folder scheduling records towards
   Course/Lesson-owned records; and
2. the **review-history storage migration** from hot card rows towards a dedicated event store.

They must not be bundled into one destructive schema upgrade. Review history is user data and
must remain exportable, restorable and available to the calibration and analytics paths throughout.

## Decisions

### Review calibration is Course-keyed

As a forward policy, a review in a Course/Lesson session updates one `UserPerformance` row keyed
by the Course id. A legacy Deck session continues to use the Deck id until that compatibility route
is retired. This makes the Course the product-level calibration unit because response-time
calibration describes the learner's behaviour in a course context, not the hidden scheduling
implementation detail; it is not yet a universal key invariant for all historical rows.

The existing backing-Deck rows remain separate. They are used only for Course pacing and workload
estimates through `performanceForCourseBackingDecks`; they must never be merged with the
Course-keyed calibration row merely because both are represented by `UserPerformance` today.

The eventual target concepts are therefore:

- `coursePerformance`: one row per Course for review calibration;
- `schedulingPerformance`: one row per retained scheduling unit for pacing/workload estimates;
- an explicit compatibility reader for legacy `userPerformance` rows during the migration window.

These are target concepts, not existing tables or approved names. The first implementation should
prove the semantics through adapters before choosing physical store names.

The first implementation may retain the current table and add typed adapters. Splitting tables is
not safe until backup, restore, merge, course deletion and undo have matching coverage.
The destructive gate remains closed: active legacy Deck routes, global study/search/editing, MCP
scope resolution, and legacy backup/import/share contracts still read Deck/Folder stores. The
current branch therefore stops at target projection and Course/Lesson runtime cutover; removing
those stores requires a later compatibility release rather than a silent schema-v22 deletion.

### Current compatibility checkpoint

The current implementation retains one physical `userPerformance` table while making its two
meanings explicit. Course-facing `performanceForCourseBackingDecks` now reads target
`schedulingPerformance` rows and adapts them to the existing pacing consumer; legacy rows remain
a fallback, and missing rows remain absent so downstream defaults still apply. Course review
calibration reads `coursePerformance`, while `updateReviewUnitPerformance` and
`restoreReviewUnitPerformance` dual-write or restore the compatibility row. Legacy Deck sessions
continue to read and write `userPerformance` by Deck id. Course/Lesson sessions pass the Course id
explicitly, while legacy Deck sessions pass the Deck id; the adapters reject an unproven legacy
row when those key spaces collide and never infer a Course calibration key from `Card.deckId`.
Active Course/Lesson FSRS sessions now read their scheduling configuration from the target
`schedulingUnits` projection, including inherited limits and goals; a source-row fallback remains
for databases opened before projection materialisation. Legacy global sessions continue to read
Deck configuration directly.

The dedicated `reviewHistory` store is the explicit persisted source for FSRS optimisation,
analytics and diagnostics. Schema v26 ended the mirrored-storage window: `Card.history` is now a
runtime hydration projection, while legacy inputs are normalised at the import seam.

### Review events move out of Card rows, but are not discarded

`ReviewLog` is an append-only user record. The canonical `reviewHistory` store is keyed by a stable
event id with card/course/time indexes. Stored Cards and current portability payloads keep an empty
`history` array; runtime readers hydrate full history through the review-history interface. No
bounded recent projection or event retention policy was introduced.

The migration must preserve:

- every existing event, including legacy rows without `eventId`;
- event order and all optional provenance (`sessionKind`, revision plan/window, marks and checker
  disputes);
- a deterministic legacy identity for rows without `eventId` (derived from the card id, original
  array position and event content, with collision handling recorded by the migration);
- export formats that currently expose review history;
- undo's ability to restore the exact pre-review Card and calibration state;
- analytics such as review volume, study time, retention by age and prediction accuracy;
- FSRS optimisation input, which must read from the canonical event store after cutover.

No retention limit or destructive pruning is approved yet. Once the event store is canonical, a
separate product decision can choose whether old events remain indefinitely or are compacted into
an explicitly versioned aggregate. Until then, full history remains recoverable.

### Compatibility is explicit and time-bounded

The following legacy fields/stores remain readable during migration:

- `decks` and `folders` tables;
- `Card.deckId` and generated-card ownership;
- `SessionHistoryEntry.deckId` and `courseId`;
- the current `userPerformance` table and its dual key spaces;
- old backup/share/APKG payloads and `/deck/:deckId` redirects.

New writes should go through named adapters, not duplicate business logic. A later removal phase
must be blocked until the old backup/share formats, MCP/Electron contracts and old bookmarks have
explicit compatibility tests.

## Scope inventory

| Concern              | Current source of truth                                         | Target                                                                     | Compatibility requirement                                                      |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Review event         | `reviewHistory` event store                                     | Closed                                                                     | Import old inline cards; preserve event ids/order                              |
| FSRS card state      | `Card` fields                                                   | `Card` fields initially                                                    | No scheduling behaviour change                                                 |
| Course calibration   | `userPerformance` keyed by Course id                            | `coursePerformance`                                                        | Preserve merge/undo semantics                                                  |
| Pacing estimate      | `userPerformance` keyed by backing Deck id                      | `schedulingPerformance`                                                    | Keep separate from calibration                                                 |
| Predicted trajectory | `sessionHistory`                                                | `sessionHistory` initially, then explicit projection                       | Preserve course/deck provenance                                                |
| Full backup          | Canonical `reviewHistory`; compact Card rows                    | Closed                                                                     | Old inline backups import unchanged; current backups remain self-contained     |
| Course snapshot      | repository snapshots containing cards and history               | Snapshot event rows with card state                                        | Restore remains atomic                                                         |
| Merge import         | `portability.ts` / `mergeImport.ts`                             | Explicit event and performance adapters                                    | Never overwrite newer local review evidence                                    |
| Share code           | Content-only; no review history                                 | Unchanged                                                                  | Scheduling/history stays private                                               |
| Analytics            | Card history plus session history                               | Event store query/projection                                               | Existing chart results stay stable                                             |
| FSRS optimisation    | Card history via `src/fsrs/optimise.ts` and persistence helpers | Event-store query through the review-event adapter                         | Same training observations; cover with `src/fsrs/optimise.persistence.test.ts` |
| Diagnostics          | Counts only                                                     | Counts plus event-store count                                              | No card content leakage                                                        |

## Implementation status

The domain-storage and review-history migrations are closed. Schema v26 migrates and verifies any
projection-only legacy events before atomically clearing stored Card histories. The Card-table hook
is the storage seam for all writers; backup, APKG and peer inputs retain legacy compatibility by
canonicalising inline evidence before crossing it. Course/Lesson and generated-card snapshots carry
event rows separately and restore atomically.

## Phases

1. **Contract and inventory** — this document; no data mutation.
2. **Read/write seam** — introduce typed review-event accessors and a canonical event shape while
   keeping Card history mirrored. Add tests for course calibration versus backing-Deck pacing.
3. **Additive schema migration** — add the event store and migration tests. Copy legacy history
   exactly, including rows without event ids; assign deterministic ids to legacy rows with explicit
   collision handling; make the copy idempotent and protected by the existing pre-migration restore
   point.
4. **Dual-write and read cutover** — repository review writes, undo, snapshots, backups, merge,
   analytics and optimisation use the event adapter. Keep the Card projection until old backups
   and imported data have passed the compatibility window.
5. **Domain storage migration — closed.** Schema v21 backfilled explicit Course/Lesson scheduling
   units and split performance stores. Schema v22 then cut the remaining global study, search,
   editing, dashboard and MCP paths over before deleting the hidden `decks` and `folders` stores.
   `schedulingUnits` is now the sole scheduling record. Old backups and `LAC0`–`LAC3` share codes
   convert through `buildDomainStorageMigration` on import; review-event identity and order are
   preserved. The destructive upgrade is blocked unless its separate pre-migration snapshot
   commits, and a failed v22 transaction leaves the database readable at v21. A completed upgrade
   has no in-place downgrade path; see [the compatibility release note](../storage-v22-compatibility.md).
6. **Review-history storage cutover — closed.** Schema v26 copies and verifies remaining inline
   events before clearing Card projections, current backup/sync wires carry canonical events once,
   and legacy inline inputs remain accepted. Migration failure leaves the v25 database unchanged.
7. **Compaction decision** — measure real event-store size and choose, separately, whether any old
   events may be compacted. Compaction requires an export format and an explicit restore story.
   This is the only phase that may propose removing old event rows; it is not implied by the event
   store migration itself.

## Release gates

Each phase requires focused tests, web and Electron typechecks where affected, lint, a migration
rollback test, and a review of the uncommitted diff before its granular commit. No phase may
remove a legacy store or stop accepting an old backup/share format without a separately reviewed
compatibility release note.
