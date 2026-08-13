# Sync P3: mutation timestamps and tombstones

**Status:** drafted, not started

**Written:** 13 August 2026

**Implements:** phase P3 of [the Arc 8 sync plan](../arc8-sync-plan.html)

## Purpose

Multi-device sync merges two snapshots by taking the newest version of each record and excluding
anything either device deleted. Neither operation is implementable against the current schema:

- **No mutation timestamps.** Only `NoteAnnotation`, `RevisionPlan` and `PracticeMilestone` carry
  `updatedAt`. Every other content table has `createdAt` at best, so "newest wins" has nothing to
  compare.
- **No tombstones.** A deleted record is simply absent from a snapshot, so the device that still
  has it wins by existing and the deletion reverts on the next sync. Deleted courses resurrect.

This document decomposes that work into slices small enough to delegate. It is the specification;
individual worker briefs are derived from it and must not re-decide anything settled here.

## Rebasing onto post-v22 reality

The Arc 8 plan was written against schema v20 and lists `Deck` among the tables gaining
`updatedAt`. That is now wrong in two ways, and both must be corrected before any brief goes out:

- **The schema version is v23.** v21 added the target storage projections; v22 removes the legacy
  stores.
- **`Deck` and `Folder` no longer exist.** They are deleted by the v22 cutover. A worker briefed
  from the original plan would faithfully add `updatedAt` to a table that is gone.

Do not start any slice below until the v22 cutover has merged.

## Decisions already taken

Workers must not revisit these.

### One helper, not scattered timestamps

Every write path stamps `updatedAt` through a single helper rather than calling `Date.now()` at
each site. Ten scattered calls become ten places to forget one. The helper is defined in slice 1
and every later slice imitates it.

### Tombstones cover cascades, not just roots

Deleting a course cascades into its lessons, notes, cards and links. **Every deleted row gets its
own tombstone, including cascaded ones.**

The alternative — one tombstone for the course, and let the merge infer that its children went with
it — requires the merge module to know the entire ownership graph and keep that knowledge in step
with the schema forever. That is exactly the hidden coupling that makes a merge algorithm
unmaintainable. A tombstone per row is more rows and no cleverness, which is the right trade here.

### Not every delete needs a tombstone

There are 99 delete call sites across `src/db/`. A tombstone is required only where the deleted row
is **carried in a snapshot** — that is, where it appears in `BackupFile`. Deletions of purely local
or derived state do not need one:

- **Tombstone required:** cards, courses, lessons, notes, lessonCards, lessonCardExposures,
  lessonCompletions, noteAnnotations, practiceNodes, practiceMilestones, courseAssessments,
  sequences, revisionPlans, occlusions, schedulingUnits, coursePerformance, schedulingPerformance.
- **No tombstone:** `backups` (local restore points), `appState`, `assetCache`, and the undo path
  in `undoReview`, which removes a review event that was never a user-visible deletion.

Assets are exempt for a different reason: they merge by content hash, so union is trivially
correct and a deleted asset that is still referenced elsewhere must not disappear. Asset garbage
collection stays as it is.

### Review history keeps its existing identity

`reviewHistory` rows already carry a unique-constrained `eventId` and commit idempotently. Nothing
in this phase touches them. Deleting a card cascades into its review events, and those deletions
follow the card's tombstone rather than getting their own.

## Slices

Slices 1 and 2 establish the patterns every later slice imitates, and are not delegated. Slices 3
onward are independent of each other except where stated, and each is a single commit.

### Slice 1 — schema v23 skeleton *(not delegated)*

Add to `src/db/schema.ts` and `src/db/types.ts`:

- the `tombstones` table, indexed `'[table+recordId], deletedAt'`;
- `syncState` under the existing `appState` key-value table — channel id, wrapped key material,
  last pushed generation, last successful sync, last error. No new table.
- the `updatedAt` field on the content interfaces listed in slice 3–5, typed as required;
- an upgrade pass backfilling `updatedAt` from `createdAt`, or from `lastReviewed` for cards where
  that is later.

Pre-migration snapshot per the existing convention. The upgrade must abort cleanly, leaving the
database readable at v22.

### Slice 2 — the write helper *(not delegated)*

A single helper in `src/db/repository.ts` (or a new `src/db/mutationStamp.ts` if it reads better)
that stamps `updatedAt` on a record write, plus a `recordTombstone` helper that writes a tombstone
row inside the caller's existing Dexie transaction.

`recordTombstone` must accept an existing transaction rather than opening its own. A tombstone
written in a separate transaction from its deletion can survive a rollback that the deletion does
not, leaving a tombstone for a record that still exists — which the merge would then honour by
deleting a live record on every other device.

### Slice 3 — stamp course, lesson and note writes

**Files:** `src/db/repository.ts`, `src/db/courseRepository.ts`

Apply the slice 2 helper to every write path for `courses`, `lessons`, `notes` and
`noteAnnotations`. Includes create, update, reorder, publish, detach and restore paths.

**Tests:** each write path leaves `updatedAt` strictly greater than it was before. A restore from
snapshot preserves the restored record's original `updatedAt` rather than stamping it anew — a
restore is not an edit, and stamping it would make an old record beat a newer one on another
device.

### Slice 4 — stamp card writes

**Files:** `src/db/repository.ts`

Every card write: create, update, suspend, bury, tag, flag, reschedule, move, assign to lesson,
and the review path.

**Note the interaction with review:** `recordReview` writes the card. It must stamp `updatedAt`
like any other write. This is safe because the merge derives scheduler state by replaying review
events rather than by taking the newer card record, so a stamped card does not cause a scheduler
field to win a comparison it should not.

**Tests:** as slice 3, plus a review leaving `updatedAt` advanced.

### Slice 5 — stamp the remaining content tables

**Files:** `src/db/repository.ts`, `src/db/sequenceRepository.ts`,
`src/db/occlusionRepository.ts`, `src/db/practiceNodeRepository.ts`

`sequences`, `occlusions`, `practiceNodes`, `practiceMilestones`, `courseAssessments`,
`lessonCards`, `lessonCardExposures`, `lessonCompletions`, `revisionPlans`, `schedulingUnits`,
`coursePerformance`, `schedulingPerformance`.

**Tests:** one per table, asserting a write advances `updatedAt`.

### Slice 6 — tombstone card deletions

**Files:** `src/db/repository.ts`

`deleteCards` and every path that removes a card, including the cascade from lesson and course
deletion where cards are involved.

**Tests:** deleting a card writes exactly one tombstone with the correct table and record id;
deleting two cards writes two; the tombstone lands in the same transaction, so a rolled-back
delete leaves no tombstone.

### Slice 7 — tombstone course and lesson cascades

**Files:** `src/db/repository.ts`

`deleteCourse` and `deleteLesson`, covering every table each cascades into. Depends on slice 6.

**Tests:** deleting a course with two lessons, four notes and six cards writes a tombstone for
every removed row. Restoring that course from its undo snapshot removes those tombstones again — an
undone deletion is not a deletion, and leaving the tombstones would delete the restored course on
every other device at the next sync.

### Slice 8 — remaining tombstone paths

**Files:** `src/db/repository.ts`, `src/db/occlusionRepository.ts`,
`src/db/practiceNodeRepository.ts`, `src/db/sequenceRepository.ts`

Every remaining deletion of a snapshot-carried record: sequences, occlusions, practice nodes and
milestones, assessments, revision plans, lesson links, exposures and completions.

**Tests:** one per path.

### Slice 9 — backup format

**Files:** `src/db/portability.ts`, `src/db/types.ts`, `src/db/export.ts`

- `BACKUP_VERSION` 9 to 10.
- `tombstones` added to `BackupFile`, `exportDatabase()` and backup validation.
- Older backups import unchanged, an absent `tombstones` array meaning none.

**Tests:** a v9 backup imports cleanly; a v10 round trip preserves tombstones;
`src/db/legacyCompat.test.ts` still passes unmodified.

### Slice 10 — tombstone pruning

**Files:** `src/db/repository.ts` or a small dedicated module

Prune tombstones older than 90 days. That window is the maximum time a device may be offline and
still merge correctly; beyond it, the stale device must be reset from a pull rather than merged.

**Tests:** a tombstone older than the window is pruned, one inside it is kept.

## Delegation

Slices 1 and 2 are mine: they set the pattern, and a helper designed badly is inherited by every
slice after it.

Slices 3 through 10 are mechanical once those exist — a named helper, named files, and existing
code to imitate. They suit free-tier workers, one slice per brief, in the order above. Slices 3, 4
and 5 are independent of each other and may run in any order; 7 depends on 6; 9 and 10 depend on 1.

**Territory warning:** slices 3 through 8 all touch `src/db/repository.ts`. Only one may run at a
time. This is the constraint that governs the schedule, not model availability.

## Not in scope

- The merge module itself (P4), the relay (P1), crypto (P2) and any UI (P6).
- Retiring the `Card.history` compatibility mirror. The merge unions review events across both
  `sessionHistory` and `Card.history[]` by design, so the mirror is not a blocker for sync.
- The pre-v16 legacy `ReviewLog` decision, which belongs with P4.
