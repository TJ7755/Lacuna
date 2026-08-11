# Course/domain boundary follow-ups

**Status:** paused after the reviewed Part 1 implementation stop point

**Branch:** `refactor/course-domain-boundary`

**Stop commit:** `9dd9107` (`refactor(course): remove singleton deck plumbing`)

**Reviewed:** 11 August 2026

## Purpose

This document records the work that remains after the small, reviewed pass to reduce the two
application models. It is a maintenance follow-up, not a new product arc. Do not resume it by
removing the internal scheduling structures blindly: the FSRS engine and persistence layer still
need stable scheduling units while the migration is incomplete.

The product-facing model is **Course → Lesson → Note + Card**. `Deck`, `Folder`, `deckId` and
`UserPerformance` remain internal compatibility and scheduling concepts for now.

## Completed in the paused pass

The following changes are complete and reviewed, in small commits:

- Centralised Course/Lesson backing-deck discovery in `src/db/backingDecks.ts`.
- Migrated course card creation, lesson card creation, card editing, lesson card import, and
  Course/Lesson card consumers away from discovering backing deck ids from card rows.
- Moved CoursePath and course-study-flow backing-performance reads behind the adapter.
- Moved Learn session unit-performance loading behind `performanceForSessionUnits`, preserving the
  distinction between Course-keyed calibration and legacy Deck-keyed calibration.
- Moved the semi-linear unlock ratchet's backing-performance read behind `performanceForCourse`.
- Added regression coverage for course scoping, backing-deck fallbacks, session calibration,
  lesson import preparation and editor duplicate checks.
- Removed redundant singleton `allDecks={[deck]}` plumbing from Course/Lesson callers while
  preserving the legacy sibling-deck `Move to…` behaviour for callers that still need it.

## Remaining work

### 1. Finish the course-aware search boundary

**Priority:** high for a complete UI boundary

The following production surfaces still use the generic legacy deck search path:

- `src/pages/SearchPage.tsx`
- `src/components/search/CommandPalette.tsx`
- `src/state/useData.ts`
- `src/db/search.ts`

They still load `useDecks()` and pass `Deck[]` into `searchCards`. The follow-up should:

1. Define one course-aware search result shape for courses, lessons, notes and cards.
2. Move SearchPage and CommandPalette to that shape and keep their existing deep links and ranking.
3. Resolve display labels from Course/Lesson data, not hidden backing-deck names.
4. Keep a deliberate compatibility path for legacy deck-only cards and old stored data.
5. Update the page, command-palette and search-unit tests, including mixed legacy/course data.
6. Remove `useDecks()` from those user-facing surfaces once the compatibility path is contained in
   the search adapter.

Do not remove `searchCards` or legacy storage until old backups and migrated records are covered.

### 2. Remove remaining course-facing Deck-shaped APIs

**Priority:** high after search

The generic card-management component still has an internal Deck-shaped API:

- `src/components/cards/CardList.tsx` still requires `deck: Deck` for import, analytics and
  scheduling operations.
- `src/components/cards/CardList.tsx` still accepts optional legacy `allDecks` for sibling-deck
  moves.
- `src/components/cards/CardEditOverlay.tsx` still derives a draft-session key from
  `card.deckId`.
- Course-facing pages still ultimately provide hidden Deck objects to generic card components.

The next slice should separate the Course/Lesson command surface from the legacy deck-management
surface without duplicating CardList behaviour. Prefer a small scheduling-context or adapter
contract over a second card-list implementation. The contract must continue to support:

- course/lesson card creation and import;
- card analytics;
- generated-card read-only rules;
- bulk assignment and lesson linking;
- legacy sibling-deck moves where they are genuinely available; and
- undo and duplicate-check behaviour.

Add focused tests before removing any Deck-shaped prop. The legacy move feature must either remain
behind an explicitly legacy adapter or be removed in a separately approved change; it must not be
silently lost as part of this boundary work.

### 3. Contain the remaining generic Deck hooks

**Priority:** medium

`src/state/useData.ts` still exposes `useDecks()` and `useDeck()`. After SearchPage and
CommandPalette are migrated, audit every remaining caller and classify it as one of:

- legacy compatibility/import/export;
- internal scheduling/diagnostics; or
- an accidental user-facing Course/Lesson leak.

Then keep the hooks only where the first two categories require them, or move those reads behind
named adapters. The target is not necessarily zero `Deck` symbols; the target is zero accidental
Deck discovery in Course/Lesson UI code.

### 4. Clarify and test the two UserPerformance meanings

**Priority:** medium, before any storage migration

The current table deliberately contains two key spaces:

- backing-deck ids, used for course pacing/workload estimates by `performanceForCourse`;
- Course ids, used for Course/Lesson review calibration by `recordReview` and
  `performanceForSessionUnits`.

This is intentional transitional behaviour, but the names are easy to confuse. Follow-up work
should:

1. Rename or document the two adapter functions so their key semantics are unmistakable.
2. Add tests proving that course-session grading does not accidentally use a shadow-deck row.
3. Add tests proving CoursePath pacing continues to use backing-deck calibration rows.
4. Check undo, course deletion, backup restore, merge import and course snapshot/restore for both
   key spaces.
5. Decide whether the product eventually needs one course-level calibration row, one row per
   lesson, or one row per backing scheduling unit. Record that decision before changing storage.

Do not merge the two lookup paths merely because both return `UserPerformance`.

### 5. Audit remaining course-facing export, share and import entry points

**Priority:** medium

The generic portability APIs still use legacy identifiers in places, notably:

- `src/components/import/UnifiedExportPanel.tsx` accepts `deckIds`;
- `src/db/share.ts` exposes `buildShareCode(deckIds)`;
- `src/db/portability.ts`, `src/db/export.ts`, `src/db/mergeImport.ts` and related tests retain
  Deck-shaped backup/share records for compatibility;
- `src/db/search.ts` and export helpers still use `card.deckId` internally.

Audit the actual Course-facing callers and migrate their public props and commands to Course ids
where they still expose Deck terminology. Preserve legacy LAC and backup formats through explicit
compatibility adapters and migration tests. Do not change wire formats casually: share-code and
backup compatibility is part of the product contract.

### 6. Keep internal scheduling code explicitly internal

**Priority:** ongoing containment, not wholesale removal

The following references are expected to remain while the scheduler uses deck-shaped units:

- `src/fsrs/session.ts`'s legacy `Deck[]` support and `deckId` card indexing;
- `src/db/backingDecks.ts`'s access to `db.decks` and `db.userPerformance`;
- repository review persistence, undo, snapshots, deletion and restoration;
- global `/learn` sessions that genuinely operate across legacy and course-backed units;
- diagnostics, backup, merge and migration code that must understand stored legacy rows.

These references should receive comments or named adapters where ambiguity is likely, but they are
not themselves evidence that the Course/Lesson UI boundary is unfinished.

### 7. Decide and implement the eventual storage migration separately

**Priority:** deferred architectural work

Removing the two models completely is a later migration, not the next small refactor. It would
need an explicit schema and rollback plan covering at least:

- `Deck` and `Folder` tables and all indexes;
- `Card.deckId` and generated-card ownership;
- `UserPerformance` primary-key semantics;
- `SessionHistoryEntry.deckId` and `courseId` provenance;
- FSRS `SchedulerConfig` and session-unit contracts;
- card import/APKG and duplicate checks;
- backup, restore, merge and share-code wire compatibility;
- asset and generated-card garbage collection;
- MCP and Electron data contracts;
- old bookmarks and `/deck/:deckId` compatibility redirects;
- migration, rollback, performance and full-release tests.

Do not start this storage migration as an incidental cleanup in the search or CardList slices.

## Explicitly not left to do in this pass

These are not unfinished implementation items for the paused branch:

- Generic Search/Command Palette migration is documented above, but no further code should be
  changed after the stop commit without a new small reviewed commit.
- The internal `Deck` tables are not dead code and are not to be deleted now.
- `db.userPerformance.get(deck.id)` in the post-review refresh path is an intentional lookup of
  the already-resolved review unit; it is not the initial Course/Lesson deck-discovery leak.
- `CardList`'s optional `allDecks` default is intentional transitional compatibility, not an
  accidental required prop.
- Browser or product-feature work is outside this maintenance follow-up.

## Suggested implementation order when resumed

1. Course-aware SearchPage and CommandPalette adapter.
2. Search and mixed legacy/course regression tests.
3. Course-facing CardList/CardEdit scheduling-context contract.
4. Remaining `useData` caller classification and hook containment.
5. UserPerformance naming/semantics decision and persistence tests.
6. Course-facing export/share prop audit with compatibility tests.
7. Separate proposal for the eventual storage migration.

Each resumed slice should stay small, be validated with focused tests plus web typecheck/lint, and
receive a code review before its own commit.
