# Storage and review-history migration

**Status:** contract recorded; implementation follows in separately reviewed slices

**Reviewed:** 11 August 2026

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

### Current compatibility checkpoint

The current implementation retains one physical `userPerformance` table while making its two
meanings explicit. `performanceForCourseBackingDecks` reads backing-Deck rows for pacing and
workload estimates. `performanceForReviewUnit`, `updateReviewUnitPerformance` and
`restoreReviewUnitPerformance` handle the already-resolved calibration unit for review, record
and undo paths: Course/Lesson sessions pass the Course id, while legacy Deck sessions pass the
Deck id. These adapters must not infer a Course calibration key from `Card.deckId`.

The dedicated `reviewHistory` store is now the explicit read source for FSRS optimisation,
analytics and diagnostics, while `Card.history` remains a mirrored compatibility projection for
old backups and callers during the migration window.

### Review events move out of Card rows, but are not discarded

`ReviewLog` is an append-only user record. The target is a dedicated `reviewHistory` store keyed
by a stable event id, with indexes for card, course, session and timestamp. During the compatibility
window, Cards retain their existing `history` array as a compatibility projection; its size and
removal date are deliberately unspecified until the event-store cutover has been measured and
validated. No bounded "recent" projection is being introduced by this plan.

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
| Review event         | `Card.history[]`                                                | `reviewHistory` event store                                                | Import old cards; preserve event ids/order                                     |
| FSRS card state      | `Card` fields                                                   | `Card` fields initially                                                    | No scheduling behaviour change                                                 |
| Course calibration   | `userPerformance` keyed by Course id                            | `coursePerformance`                                                        | Preserve merge/undo semantics                                                  |
| Pacing estimate      | `userPerformance` keyed by backing Deck id                      | `schedulingPerformance`                                                    | Keep separate from calibration                                                 |
| Predicted trajectory | `sessionHistory`                                                | `sessionHistory` initially, then explicit projection                       | Preserve course/deck provenance                                                |
| Full backup          | `BackupFile.cards[].history` plus session rows                  | A future versioned `reviewHistory` section plus compatibility card history | Old backups import unchanged; new backups remain self-contained                |
| Course snapshot      | repository snapshots containing cards and history               | Snapshot event rows with card state                                        | Restore remains atomic                                                         |
| Merge import         | `portability.ts` / `mergeImport.ts`                             | Explicit event and performance adapters                                    | Never overwrite newer local review evidence                                    |
| Share code           | Content-only; no review history                                 | Unchanged                                                                  | Scheduling/history stays private                                               |
| Analytics            | Card history plus session history                               | Event store query/projection                                               | Existing chart results stay stable                                             |
| FSRS optimisation    | Card history via `src/fsrs/optimise.ts` and persistence helpers | Event-store query through the review-event adapter                         | Same training observations; cover with `src/fsrs/optimise.persistence.test.ts` |
| Diagnostics          | Counts only                                                     | Counts plus event-store count                                              | No card content leakage                                                        |

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
5. **Domain storage migration** — only after event storage is stable: decide whether the hidden
   scheduling Deck rows can be removed, migrate performance semantics, and preserve old wire
   formats and bookmarks through adapters.
6. **Compaction decision** — measure real event-store size and choose, separately, whether any old
   events may be compacted. Compaction requires an export format and an explicit restore story.
   This is the only phase that may propose removing old event rows; it is not implied by the event
   store migration itself.

## Release gates

Each phase requires focused tests, web and Electron typechecks where affected, lint, a migration
rollback test, and a review of the uncommitted diff before its granular commit. No phase may
remove a legacy store or stop accepting an old backup/share format without a separately reviewed
compatibility release note.
