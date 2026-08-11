# Course/domain boundary follow-ups

**Status:** scoped containment complete — seven boundary workstreams tracked; storage migration explicitly separate

**Branch:** `refactor/course-domain-boundary`

**Latest reviewed commit:** `ccc5078` (`docs: record export boundary cleanup`)

**Original stop commit:** `9dd9107` (`refactor(course): remove singleton deck plumbing`)

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
- Moved Learn session review-unit performance loading behind `performanceForReviewUnits`, preserving
  the distinction between Course-keyed calibration and legacy Deck-keyed calibration.
- Moved the semi-linear unlock ratchet's backing-Deck performance read behind
  `performanceForCourseBackingDecks`.
- Added regression coverage for course scoping, backing-deck fallbacks, session calibration,
  lesson import preparation and editor duplicate checks.
- Removed redundant singleton `allDecks={[deck]}` plumbing from Course/Lesson callers while
  preserving the legacy sibling-deck `Move to…` behaviour for callers that still need it.
- Completed the course-aware search boundary in `a4330f4`: SearchPage and CommandPalette now use
  one contained search-data hook, Course names are preferred for Course cards, and legacy Deck-only
  cards retain their compatibility path and result contract.
- Added the first CardList boundary seam in `4d7b482`: CardList now accepts a domain-neutral context
  for scheduling configuration, import/APKG callbacks, move targets, move handling and move undo,
  while legacy Deck callers retain their existing API and repository-backed behaviour. Card
  analytics and generated-card rendering now consume `SchedulerConfig` rather than a full Deck.
- Migrated Question Bank lesson and unassigned buckets in `501120b` to the Course context adapter.
  Text and Course-context APKG imports now persist `courseId` and `primaryLessonId` through
  explicit import options, and the page tests assert the Course/Lesson import labels and
  capabilities.
- Migrated `LessonCardsSection` in `af7958a`: both the prepared empty-lesson importer and the
  populated lesson-card list now use the explicit Course/Lesson context, while linking,
  generated-card filtering, loading guards and navigation behaviour remain unchanged.
  APKG helper remains compatible for legacy callers; its broader media/card transaction boundary
  remains part of the later portability/import audit.
- Separated `CardEditOverlay` draft keys from backing Deck identity in `fed66b9`: Course sessions
  use `bank:<courseId>` scope, Lesson sessions use `lessonId` scope, and global legacy sessions
  retain the `card.deckId` fallback. Added focused coverage for both explicit and fallback keys.
- Removed the unused Deck-shaped `deckIds`/`showShareCode` props and dead share-code UI branch from
  `UnifiedExportPanel` in `fd1a745`. Course `SharePage` sharing remains on `buildCourseShareCode`,
  while legacy `buildShareCode` and its wire-compatibility tests remain unchanged. The checkpoint
  passed 45 relevant tests, web typecheck, lint and whitespace validation.

## Remaining work

### 1. Finish the course-aware search boundary

**Status:** delivered in `a4330f4`.

**Priority:** high for a complete UI boundary

The following production surfaces used the generic legacy deck search path before `a4330f4`:

- `src/pages/SearchPage.tsx`
- `src/components/search/CommandPalette.tsx`
- `src/state/useData.ts`
- `src/db/search.ts`

They now use `useSearchData` and `searchCardsInScope`; the legacy `searchCards` adapter remains for
other compatibility callers. The completed slice:

1. Added a Course-aware card result shape alongside the existing legacy result contract.
2. Moved SearchPage and CommandPalette to that shape while retaining their deep links and ranking.
3. Resolved Course card labels from Course data rather than hidden backing-deck names.
4. Retained a deliberate compatibility path for legacy deck-only cards and old stored data.
5. Added page, command-palette and search-unit tests for mixed legacy/course data, including a
   Course card whose backing Deck row is absent.
6. Removed direct `useDecks()` usage from those user-facing surfaces; the compatibility read is now
   contained in `useSearchData`.

Do not remove `searchCards` or legacy storage until old backups and migrated records are covered.

### 2. Remove remaining course-facing Deck-shaped APIs

**Progress:** the first adapter seam, Question Bank migration, LessonCardsSection migration and
CardEditOverlay draft-key separation are delivered in `4d7b482`, `501120b`, `af7958a` and `fed66b9`.

**Priority:** high after search

The generic card-management component retains a transitional Deck-shaped compatibility API, but
production Course/Lesson callers now use the explicit context branch. The final containment audit
found no production Course/Lesson caller passing `deck` or `allDecks`; those props remain only for
legacy callers and compatibility tests.

- `src/components/cards/CardList.tsx` still accepts the legacy `deck: Deck` branch for import,
  analytics and scheduling operations, alongside the explicit context branch.
- `src/components/cards/CardList.tsx` still accepts optional legacy `allDecks` for sibling-deck
  moves, defaulting to the single legacy deck where appropriate.
- `src/components/cards/cardListContext.ts` is the shared Course/Lesson capability adapter; it
  avoids a second card-list implementation while keeping scheduling configuration explicit.

This is the agreed stopping point for the UI boundary in this branch. Removing the compatibility
union requires a separate caller inventory and migration of old deck-management surfaces; it must
not be done by silently dropping legacy move, import or scheduling behaviour. The contract supports:

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

**Status:** delivered in `974d2e4`.

The repository-wide audit found no production or test callers for `useDecks()` or `useDeck()`;
they were unused generic APIs rather than required compatibility paths, so both exports were
removed. The `Deck` type and internal Deck-backed dashboard computations remain because they are
still used by the legacy dashboard and scheduler-compatible summary code. The target is not zero
`Deck` symbols; it is zero accidental Deck discovery in Course/Lesson UI code.

### 4. Clarify and test the two UserPerformance meanings

**Status:** naming and focused persistence/undo coverage delivered; storage decision deferred

**Priority:** medium, before any storage migration

The current table deliberately contains two key spaces:

- backing-Deck ids, used for Course pacing/workload estimates by
  `performanceForCourseBackingDecks`;
- Course ids (or legacy Deck ids for global sessions), used for review calibration by
  `recordReview` and `performanceForReviewUnits`.

This is intentional transitional behaviour, but the names are easy to confuse. The adapter
names now make the two key spaces explicit, and focused tests prove that a Course-keyed row does
not enter backing-Deck pacing or workload estimates. The checkpoint passed 20 relevant tests,
web typecheck, lint and whitespace validation. Further work should:

1. Add tests proving that course-session grading does not accidentally use a shadow-deck row.
2. Check undo, course deletion, backup restore, merge import and course snapshot/restore for both
   key spaces.
3. Decide whether the product eventually needs one course-level calibration row, one row per
   lesson, or one row per backing scheduling unit. Record that decision before changing storage.

Do not merge the two lookup paths merely because both return `UserPerformance`.

### 5. Audit remaining course-facing export, share and import entry points

**Progress:** the unused Deck-shaped export-panel API is removed in `fd1a745`; the Course SharePage
and legacy wire-compatible share/backup/import paths remain intentionally separate.

**Priority:** medium

The generic portability APIs still use legacy identifiers in places, notably:

- `src/components/import/UnifiedExportPanel.tsx` no longer accepts `deckIds`; its full-backup and
  card/review export surface is now Course-neutral;
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

## Agreed scope for this branch

This branch completes the scoped containment work in workstreams 2–6. Workstream 2 started with
`4d7b482` and continued through `501120b`, `af7958a` and `fed66b9`; its production Course/Lesson
callers now use the explicit context seam while the legacy CardList union remains intentionally
available. Workstream 3 is delivered in `974d2e4`. Workstream 4's naming and persistence/undo
coverage is recorded in `27c7188`/`2f53a40`; workstream 5's export-panel API slice is delivered in
`fd1a745`/`ccc5078`; and workstream 6 is documented as ongoing internal containment. The eventual
storage migration in workstream 7 is explicitly excluded from this PR because it requires a
separate schema, rollback and release plan.

The branch will continue using small implementation commits, focused validation and a code review
at every commit boundary. This document will be updated after each meaningful slice.

## Explicitly not left to do in this pass

These are not unfinished implementation items for the paused branch:

- Generic Search/Command Palette migration is complete in `a4330f4`; no further search work is
  required unless a later slice exposes a regression.
- The internal `Deck` tables are not dead code and are not to be deleted now.
- `db.userPerformance.get(deck.id)` in the post-review refresh path is an intentional lookup of
  the already-resolved review unit; it is not the initial Course/Lesson deck-discovery leak.
- `CardList`'s optional `allDecks` default is intentional transitional compatibility, not an
  accidental required prop.
- Browser or product-feature work is outside this maintenance follow-up.

## Final checkpoint and deferred work

The final containment audit confirms that:

- production Course/Lesson CardList callers use `CardListContext` rather than Deck-shaped props;
- the legacy `deck`/`allDecks` union is retained only for compatibility and is covered by legacy
  CardList tests;
- course-keyed and backing-Deck-keyed `UserPerformance` rows remain separate, with focused review,
  undo, shadow-row and retry coverage already present;
- Course sharing and full-backup wire formats remain behind their explicit compatibility boundaries;
- `docs/PERFORMANCE.md` was already committed in `6e116d1` and had no pending change on this branch.

Deferred work is deliberately separate from this PR:

1. Decide the eventual `UserPerformance` storage semantics (course, lesson or scheduling-unit row).
2. Migrate or remove the legacy CardList compatibility union after an old-caller inventory.
3. Design and implement the full storage migration with schema, rollback, wire-compatibility and
   release testing.

Any future slice should remain small, use focused tests plus web typecheck/lint, and receive a code
review before its own commit.
