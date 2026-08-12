# Card history consistency findings

**Date:** 12 August 2026

**Scope:** `recordReview`/`undoReview`, backup export/import, course and lesson snapshots,
lineage import/merge, and canonical review-history reads.

**Method:** Focused Vitest tests were added to the existing repository, portability,
course-repository, merge-import and review-history-read fixtures. The review also repaired
canonical-authority handling in the read adapter and snapshot restore paths; no Dexie schema or
wire format changed.

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

**Result: consistent for replace and non-empty merge imports.**

A reviewed card exported and imported through both modes retains exactly one projection entry,
exactly one canonical row, and one hydrated event. The merge case also starts with local review
data and re-imports the same backup, proving that unrelated local evidence survives and the
incoming event is not duplicated.

- Test: `src/db/portability.test.ts:197-270`
- Export projection/canonical union: `src/db/portability.ts:56-127`
- Import preparation: `src/db/portability.ts:231-234`
- Merge canonical insertion and collision handling: `src/db/portability.ts:579-591`

### 3. `snapshotCourse`/`restoreCourse` and `snapshotLesson`/`restoreLesson`

**Result: consistent when an explicit canonical result is empty.**

The focused tests remove the canonical event from an otherwise valid snapshot while retaining the
event in the card projection. Restore now treats the explicit canonical array as authoritative:

- zero matching rows are restored to `db.reviewHistory`;
- the restored `Card.history` projection is empty; and
- a hydrated read is empty.

Snapshots from older callers that omit `reviewHistory` still reconstruct canonical rows from the
card projection for compatibility. Explicitly supplied canonical results never resurrect stale
projection events.

- Course test: `src/db/courseRepository.test.ts:509-536`
- Lesson test: `src/db/courseRepository.test.ts:729-755`
- Restore projection normalisation: `src/db/reviewHistory.ts:61-89`
- Restore paths: `src/db/repository.ts:523-540, 1333-1394, 1507-1552`

### 4. `importLineageFirstTime` and `mergeLineageUpdate`

**Result: consistent for the review evidence represented by the lineage wire contract.**

First lineage import creates a card with an empty projection and no canonical rows; the hydrated
read is empty. An auto-applied lineage content update preserves a locally recorded review in both
stores, including its event id, timestamp, card ownership and hydrated read.

The merge test deliberately describes preservation rather than incoming-review conflict
resolution: the current lineage payload shape does not carry review-history events, so it cannot
compare newer local evidence with competing incoming review evidence. It proves that the
content-only merge path does not overwrite or write one side only.

- First-import test: `src/db/mergeImport.test.ts:48-56`
- Preservation test: `src/db/mergeImport.test.ts:436-487`
- First-import card construction (empty projection): `src/db/mergeImport.ts:585-615`
- Merge transaction includes the canonical table: `src/db/mergeImport.ts:305-323`
- Auto-applied card update changes content through `updateCard`: `src/db/mergeImport.ts:785-787`

### 5. Read precedence when only one side exists

**Result: explicit canonical results are authoritative; default reads retain the compatibility
fallback.**

When a canonical row is present, hydration uses it even if the card projection is stale. The
normal read adapter still retains legacy-only projection rows while the compatibility window is
open. Callers that supply a canonical result, including an explicit empty array, bypass that
fallback and receive exactly the supplied events. Snapshot restores use that explicit boundary
to prevent stale projections from being written back.

- Tests: `src/db/reviewHistoryRead.test.ts:34-105`, `src/db/read.test.ts:126-151`
- Read adapter: `src/db/reviewHistoryRead.ts:9-92`
- Projection normalisation: `src/db/reviewHistory.ts:61-89`

## Validation

The focused and full suites were run after the repair:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
