# Card history consistency findings

**Date:** 12 August 2026

**Scope:** `recordReview`/`undoReview`, backup export/import, course and lesson snapshots,
lineage import/merge, and canonical review-history reads.

**Method:** Focused Vitest tests were added to the existing repository, portability,
course-repository, merge-import and review-history-read fixtures. No production code,
Dexie schema, or wire format was changed.

## Findings

### 1. `recordReview` and `undoReview`

**Result: consistent.**

`recordReview` writes one review to `Card.history` and one matching row to
`db.reviewHistory`. `undoReview` removes the event from both stores, and a subsequent
hydrated read is empty. The test also checks the deterministic event-backed canonical id.

- Test: `src/db/repository.test.ts:94-134`
- Write path: `src/db/repository.ts:822-829`
- Undo path: `src/db/repository.ts:947-957`

### 2. `exportDatabase` and `importBackup`

**Result: consistent for both import modes tested.**

A reviewed card exported and imported through both `replace` and `merge` retains exactly
one projection entry, exactly one canonical row, and one hydrated event. The canonical row
matches the exported event, with no duplication or loss.

- Test: `src/db/portability.test.ts:197-239`
- Export projection/canonical union: `src/db/portability.ts:56-127`
- Import preparation: `src/db/portability.ts:231-234`
- Merge canonical insertion and collision handling: `src/db/portability.ts:579-591`

### 3. `snapshotCourse`/`restoreCourse` and `snapshotLesson`/`restoreLesson`

**Result: divergence observed when an explicit snapshot canonical result is empty.**

The focused tests remove the canonical event from an otherwise valid snapshot while
retaining the event in the card projection. Restore then produces:

- zero matching rows in `db.reviewHistory`;
- one event in the restored `Card.history`; and
- one event from `hydrateCardsWithHistory`.

This is current behaviour, recorded rather than repaired. `restoreCourse` and
`restoreLesson` both use the card projection as a fallback only when
`snapshot.reviewHistory` is `undefined`, so an explicit empty array does not itself
reconstruct a canonical row. The resurrected read comes from the separate read adapter's
projection fallback.

- Course test: `src/db/courseRepository.test.ts:509-538`
- Lesson test: `src/db/courseRepository.test.ts:729-757`
- Course restore source: `src/db/repository.ts:1380-1383`
- Lesson restore source: `src/db/repository.ts:2605-2608`
- Read fallback source: `src/db/reviewHistoryRead.ts:18-33, 36-46, 64-81`

### 4. `importLineageFirstTime` and `mergeLineageUpdate`

**Result: consistent for the review evidence represented by the lineage wire contract.**

First lineage import creates a card with an empty projection and no canonical rows; the
hydrated read is empty. An auto-applied lineage content update preserves a locally recorded
review in both stores, including its event id, timestamp, card ownership and hydrated read.

The merge test deliberately describes preservation rather than incoming-review conflict
resolution: the current lineage payload shape does not carry review-history events, so it
cannot compare newer local evidence with competing incoming review evidence. It proves that
the content-only merge path does not overwrite existing local evidence or write one side
only.

- First-import test: `src/db/mergeImport.test.ts:48-56`
- Preservation test: `src/db/mergeImport.test.ts:436-487`
- First-import card construction (empty projection): `src/db/mergeImport.ts:585-615`
- Merge transaction includes the canonical table: `src/db/mergeImport.ts:305-323`
- Auto-applied card update changes content through `updateCard`: `src/db/mergeImport.ts:785-787`

### 5. Read precedence when only one side exists

**Result: canonical rows win when present; projection-only rows currently win when the
canonical query has no matching rows.**

The canonical-only case hydrates the card from the event store even though its projection
is empty. The reverse case hydrates the stale projection after `db.reviewHistory` is empty.
That projection fallback is the observed divergence from the canonical-authority contract
recorded in `MEMORIES.md`; no production fix was made in this audit.

- Test: `src/db/reviewHistoryRead.test.ts:78-101`
- Same-event canonical precedence coverage: `src/db/reviewHistoryRead.test.ts:58-76`
- Projection fallback source: `src/db/reviewHistoryRead.ts:18-33`
- Canonical query and merge: `src/db/reviewHistoryRead.ts:40-46`
- Hydration assignment: `src/db/reviewHistoryRead.ts:69-81`

## Validation

The focused and full suites passed after each operation commit. Final full-suite results:

- `bun run typecheck`
- `bun run lint`
- `bun run test` — 210 test files, 1,843 tests passed
