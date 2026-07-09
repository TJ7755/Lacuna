# Lacuna — version 0.0.3

> **GitHub Release Note for v0.0.3**
>
> This release adds a new algorithm-free study mode, formal card types, and polishes the touch-first experience.
>
> **What's new**
> - **Simple learn mode** — a YES/NO-only study loop with no FSRS algorithms, no DB writes, and a live pill UI (Wrong/Remaining/Right). Perfect for pure memorisation without scheduling.
> - **Card types** — cards can now be Basic (front/back), Reversed (back/front), or Typing-answer (type the answer before revealing). The typing card shows a live input field and compares the typed answer against the correct answer on reveal.
> - **Touch-first polish** — default font size auto-switches to Large in touch mode, swipe gestures are configurable in settings, and the text selection focus ring is cleaned up.
> - **Study options dropdown** — every deck now offers Simple learn, Cram mode, Due cards, New cards, Leech cards, and Flagged cards from a single menu.
> - **Folder deletion** — folders can now be deleted from the dashboard with a confirmation dialog.
> - **Share code importing** — fixed Base45 whitespace stripping that corrupted share code decoding for both legacy and compressed formats.
>
> **Bug fixes**
> - Fixed internal text selection ring overlapping the external focus ring.
> - Fixed share code import showing 0 cards due to Base45 whitespace corruption.
> - Fixed folder deletion missing from the dashboard.
> - Fixed touch mode not defaulting to Large font size.
> - Fixed gesture settings not persisting correctly.
>
> **Full changelog below**

## Unreleased — Course architecture (data model and scheduling groundwork)

First, additive stage of the migration from `Folder -> Deck -> Card` to
`Course -> Lesson -> Note + Card`. The new model is built alongside the existing
Deck/Folder model; nothing is removed and the Deck-based UI keeps running. There
is no user-visible change yet — the UI is delivered in a later stage.

- Added the course domain types in `src/db/types.ts`: `Course`, `CourseExamDate`,
  `Lesson`, `Note`, `LessonCardLink`, `PracticeNode`, `UnlockMode`, plus optional
  `courseId`/`primaryLessonId` on `Card` and `courseId` on `SessionHistoryEntry`
  and `UserPerformance`, and the matching optional `BackupFile` arrays.
- Added schema **v9** (`src/db/schema.ts`) with six new stores (courses, lessons,
  notes, lessonCards, practiceNodes, courseExamDates) and an additive upgrade that
  folds each standalone deck into a single-lesson course and each folder into a
  course of ordered lessons, then stamps `courseId`/`primaryLessonId` onto cards,
  session history and performance rows. Mapping lives in `src/db/courseMigration.ts`
  (pure, with an injected id generator); decks with a missing folder reference are
  treated as standalone so none are dropped.
- Added UI-independent repository CRUD for courses, lessons, notes, lesson-card
  links, practice nodes and course exam dates (`src/db/repository.ts`), reusable by
  both the future course UI and any AI authoring path.
- Carried the six new tables through export, import (replace and merge), automatic
  backups and diagnostics, mirroring the existing folders handling; older backups
  without the new arrays still import.
- Introduced `SchedulerConfig` and widened the FSRS core (forward simulation,
  horizon, progress, objective) plus `studyPool` and `examEveAvailable` to accept
  any `SchedulerConfig`, so the engine can schedule a Course as well as a Deck with
  no behaviour change for decks.
- Added `src/fsrs/examDate.ts` (per-card exam-date resolution: lesson override, then
  nearest applicable future checkpoint, then the course default) and
  `src/fsrs/practice.ts` (`shouldInsertPractice`, the auto-practice insertion rule).
- Fixed a pre-existing flaky test: `portability.test.ts` relied on the wall clock
  advancing between two writes, so the merge tie-break test failed intermittently in
  the warm full-suite run.

### Notes engine (course UI groundwork)

- Extended `MarkdownView` with an opt-in `allowEmbeds` prop (default `false`). When
  set, bare YouTube (`youtube.com/watch?v=ID`, `youtu.be/ID`) and Vimeo
  (`vimeo.com/ID`) URLs on their own line become responsive 16:9 iframes on the
  privacy-first embed hosts (`youtube-nocookie.com`, `player.vimeo.com`), and
  `<details>`/`<summary>` collapsibles render. Card rendering stays on the default
  path and is byte-for-byte unchanged.
- Hardened the embed path against untrusted, imported content: the sanitise schema
  restricts iframe `src` to the two embed hosts by regex (so a malicious `src` is
  stripped) and limits iframe attributes; a follow-up plugin removes any sourceless
  iframe shell left behind. The embed-wrapper's layout classes are whitelisted so
  the responsive box survives sanitisation. Render-cache keys are namespaced by
  `allowEmbeds` to avoid cross-mode collisions.
- Extended `MarkdownEditor` with a matching `allowEmbeds` prop that adds
  "Collapsible" and "Video" toolbar actions and forwards the flag to its live
  preview; card editors are unaffected.
- Added `src/components/notes/LessonNotes.tsx` (collapsible per-note renderer) and
  `src/components/notes/LessonNoteEditor.tsx` (single-note editor; persistence is
  injected via `onSave`, so it suits both the lesson-view CRUD flow and any AI
  authoring path).
- Added tests covering embed conversion, the responsive wrapper, the two security
  cases (disallowed host and `javascript:` src both stripped), the `allowEmbeds`
  guard, collapsible rendering, and note ordering/rendering.

### Course path and data layer (UI groundwork)

- Added `src/state/useCourseData.ts`: reactive Dexie live-query hooks for courses,
  lessons, notes, course/lesson cards, practice nodes and exam dates, mirroring
  `useData.ts`. `useLessonCards` unions primary-lesson cards with
  `LessonCardLink`-linked cards, de-duplicated by id.
- Added `CourseSummary` and the pure `computeCourseSummaries` (lesson/card counts,
  mastery, unreviewed, eligible), computed with the Course as the `SchedulerConfig`;
  extension-lesson cards are excluded from all counts and orphaned card sets are
  guarded. Plus `useCourseSummaries` and the aggregated `useCourseDashboardData`.
- Added `src/course/path.ts`: pure course-path logic — live linear release-date
  cascade (skipping extension lessons), lesson unlock resolution for open/linear/
  semi-linear modes, lesson status, path assembly with derived checkpoint
  placement, and the curriculum "Lesson X of N" position.
- Added presentational path-node components under `src/components/course/` (lesson
  node, checkpoint marker, connecting line) and a registry-pattern renderer that
  falls back to an "Unrecognised step" placeholder for unknown node types, so a
  course exported by a future build still renders.
- Added tests for `computeCourseSummaries` and the full path module.

### Course and lesson pages (UI groundwork)

- Add the CoursePath page (route `/course/:courseId`): renders the lesson path with
  per-segment completion styling, the nearest upcoming exam date, and curriculum
  position and mastery shown as distinct labelled metrics; courses with exactly one
  lesson render the lesson inline instead of a one-item path.
- Add the LessonView page (route `/course/:courseId/lesson/:lessonId`, also rendered
  inline for single-lesson courses): full notes CRUD (add, edit, two-step inline
  delete, up/down reorder) over the Phase 3 note components, plus a read-only card
  list. A temporary Study control bridges to the existing deck-based learn flow until
  a course/lesson-aware learn mode lands.
- Make `CardList`'s "New card" action optional so the lesson card list can omit it
  until lesson card creation arrives (Phase 5).
- Wire both pages as lazy-loaded routes in `App.tsx`.

### Course UI cutover (Phases 4c)

- The dashboard is now a responsive course grid (new `CourseCard`) backed by `useCourseDashboardData`, keeping the study-signals header, "study all" entry and review heatmap; the deck/folder grid, folder tree, drag-and-drop, multi-select, merge, move-to-folder, deck sort and inline deck/folder creation were removed from it.
- The sidebar now lists active courses and their lessons (multi-lesson courses collapsible, single-lesson courses plain links, with a per-course due badge); folder/deck drag-and-drop and folder create/rename/delete were removed. Added `useAllLessons()` to back the lesson tree.
- The bare `/deck/:deckId` route now redirects to the dashboard; the deck learn, card-edit and settings routes remain so the lesson pages can bridge to them until a course/lesson-aware learn mode and lesson card creation arrive.

### Cutover fixes (browser verification)

- Removed the duplicate "Cards (N)" heading on the lesson view: `CardList` gained an optional `hideHeader` prop so the embedded list no longer repeats the heading `LessonView` already renders (other callers unaffected).
- Fixed the `MarkdownEditor` toolbar overflowing when `allowEmbeds` is on (the Collapsible and Video actions overlapped and clipped): the toolbar now wraps instead of silently overflowing a hidden scroll region.
- Fixed the dashboard seven-day forecast showing "Unknown deck": the course cutover stopped passing decks to `StudySignals`, so the forecast now groups slices by `courseId` (falling back to `deckId` for legacy cards) and resolves names and colours from the active courses (`DeckForecastSlice.deckId` renamed to `sourceId`).

### Course-scoped sharing and question bank (Phase 5)

- `SharePage` now exports and imports whole courses instead of individual decks: pick a
  course, generate a share code, QR code or plain-text export directly from it. Share
  codes moved to payload v2 (course metadata, ordered lessons with notes and cards, exam
  dates); legacy v1 deck codes still import and are auto-migrated into a single course.
  Typing-answer cards round-trip through the compact `k:3` type code alongside Basic and
  Reversed.
- Added the Question Bank page (route `/course/:courseId/bank`): every card in a course
  grouped by lesson, with an Unassigned bucket for cards not tied to a lesson, bulk
  assign-to-lesson from the card list, and unassigned card creation backed by a lazily
  created per-course bank deck.
- Fixed a regression from the export rewrite: the pre-generation warning that images in
  the selected material will be replaced with placeholders was dropped when the export
  flow moved from decks to courses. Reinstated it against the selected course's cards
  (`referencedAssetHashesInCards`).

### Course-scoped sessions and practice nodes (Phase 6)

- Widened `session.ts` to `SessionUnit` scopes (deck/course/lesson, `LessonCardLink`-aware)
  and `recordReview` to `SchedulerConfig` with a deck/course discriminator; course reviews
  bump `Course.lastInteractedAt` and populate `sessionHistory.courseId`. Cards linked into
  multiple lesson units are deduped in the serve pool by card id, scored via the
  `primaryLessonId`-owning unit or else the most urgent matching unit (previously entered
  the pool once per unit with last-write-wins priority by map order).
- Added practice nodes on the course path: `practice-auto`/`practice-manual` `PathNode`
  variants, manual `PracticeNode` records and `shouldInsertPractice` auto slots woven into
  `buildPath`, a distinct `PracticeNode` component, and clicks wired to the course practice
  session route. A due-count snapshot no longer keeps the volume trigger latched after it
  fires — only the `practiceMaxGap` backstop can insert another auto slot until a manual
  node re-arms the volume trigger.
- Added `/course/:courseId/learn` (practice over due course cards) and
  `/lesson/:lessonId/learn` (new cards, including `LessonCardLink`-linked cards) routes,
  replacing `LessonView`'s temporary shadow-deck study bridge.
- Wired `nextLessonUnlockCondition` and `ratchetLessonUnlock` on session completion in
  semi-linear mode: the one-way `unlockedAt` ratchet advances once a lesson is taught and,
  where a manual practice node sits in the slot after it, that practice session is also
  completed. Auto practice nodes deliberately do not gate the ratchet, since they are
  recomputed from a volatile due-card snapshot and would make the one-way ratchet flap.
- Added a `kind` (deck/course) discriminator to `ReviewUndo`.
- Fixed a `tsc -b` break in `QuestionBank.test.tsx` and `SharePage.test.tsx`: their fixtures
  predated the Course practice fields (vitest does not type-check, so this only surfaced on
  the project build).

## 0.0.3 — Simple learn mode, card types, and touch-first polish

- Added `useStudyMode` hook (`src/state/studyMode.ts`) with `fsrs` and `simple` modes, persisted to `localStorage`.
- Added Simple learn mode to LearnMode: no FSRS scheduling, no DB writes, YES/NO only. Wrong cards are re-queued at the end of the deck and loop until all cards are marked YES.
- Added live pill UI in Simple learn mode showing Wrong (red), Remaining (grey), and Right (green) counts that update on every answer.
- SessionReport skips the grade-distribution chart in Simple mode since grades are not meaningful.
- Added `simpleMode` flag to `SessionSummary` and `SessionReport` for mode-aware reporting.
- Added card type selector in CardEditor and CardEditOverlay: Basic (front/back), Reversed (back/front), and Typing-answer.
- Added `answer` field to Card type for typing-answer cards.
- Updated `createCard` and `createCardForDeck` in repository.ts to accept and persist `cardType` and `answer`.
- Updated CardContent to render a typing-answer input field during the question phase and compare answers on reveal.
- Updated CardEditor and CardEditOverlay with card type selector (dropdown) and conditional answer field for typing cards.
- Added "Simple learn" to the existing DeckView study dropdown menu (alongside Cram, Due, New, Leech, and Flagged).
- Fixed Base45 whitespace stripping in share.ts — the Base45 alphabet includes space as a valid character, so stripping all whitespace corrupted the encoding. Only strip whitespace for legacy base64 (LAC0/LAC1) formats.
- Fixed internal box-shadow ring on `input:focus-visible` in `index.css` so only the external `:focus-visible` ring applies.
- Added folder delete confirmation dialog in Dashboard with AnimatePresence.
- Auto-set font scale to Large (1.15) when switching to touch mode from default (1.0); never clobber explicit choices when switching to keyboard mode.
- Wired `lacuna:font-scale` custom event from `inputMode.ts` to `FontScaleContext` so the Settings page reflects the change immediately.
- Added gesture settings (swipe left/right action mapping) in Settings and wired them into Dashboard card swipes.
- Fixed 10 ESLint errors across Dashboard, DeckSettings, and LearnMode.
- TypeScript is clean; 332 tests pass.

---

# Lacuna — version 0.0.2

> **GitHub Release Note for v0.0.2**
>
> This patch release expands test coverage to page-level flows, adds virtualisation for large card lists, and polishes mobile gesture interactions.
>
> **What's new**
> - Page-level integration tests for CardList, Dashboard, SharePage, SessionReport, and LearnSkeleton.
> - Lightweight dependency-free virtual card list for decks with more than 50 cards.
> - Haptic feedback on all major mobile gestures (swipe, long-press, grade, tray actions).
> - Spring physics on card swipe snap-back and bottom-sheet drag handles.
>
> **Bug fixes**
> - Fixed image-asset handling in `fake-indexeddb` test environments (continued from v0.0.2).
> - Fixed pre-existing `touchstart` type error in Dashboard.
> - Fixed DeckSearchOverlay props destructuring bug.
>
> **Full changelog below**

## 0.0.2 — Page-level tests, card list virtualisation, and mobile gesture polish

- Added page-level integration tests:
  - `CardList.test.tsx`: empty state, card rendering, select mode, selection toggling, card expansion, import panel, new card button.
  - `Dashboard.test.tsx`: skeleton, empty state, deck cards, select mode, folder rendering, header buttons.
  - `SharePage.test.tsx`: loading, empty state, deck list, selection, import section.
  - `SessionReport.test.tsx`: goal reached, stat values, progress bar, chart rendering, back button, daily limit, distractions.
  - `LearnMode.test.tsx`: LearnSkeleton rendering, header and main structure.
- Added `useVirtualList` hook — a lightweight dependency-free virtual list with window scroll tracking, binary search for visible ranges, and dynamic item measurement via `ResizeObserver` / `getBoundingClientRect`.
- Integrated virtualisation into `CardList` with a threshold of 50 cards. Small decks render as a simple grid; large decks use absolute positioning with `translateY` to keep only visible cards in the DOM.
- Added `skipAnimation` prop to `CardRow` so cards that scroll back into view do not re-trigger entrance animations.
- Added `src/utils/haptic.ts` — a haptic feedback utility with light, medium, and strong vibration patterns via `navigator.vibrate`.
- Triggered haptic feedback on gesture commits: long-press (`hapticStrong`), swipe-to-grade (`hapticMedium`), swipe-to-study (`hapticMedium`), mastery gestures (`hapticMedium`), card tray open/close (`hapticLight`), and tray actions (`hapticLight` / `hapticMedium`).
- Added spring physics to `FlipCard` swipe (`stiffness: 480`, `damping: 32`) for snap-back instead of abrupt reset.
- Polished `TouchMenuSheet` drag handle with drag-to-close gesture, keyboard accessibility (Enter/Space to close), and a larger touch target.
- Fixed pre-existing `touchstart` type error in `Dashboard.tsx` (`MouseEvent` → `Event`).
- Fixed `DeckSearchOverlay` props destructuring bug.

---

# Lacuna — version 0.0.2

> **GitHub Release Note for v0.0.2**
>
> This patch release focuses on reliability, test coverage, and visual polish.
>
> **What's new**
> - Smoother page transitions and toast animations throughout the app.
> - Added a comprehensive unit-test suite covering UI components, hooks, and state modules.
>
> **Bug fixes**
> - Fixed image-asset round-trip handling in test environments (`fake-indexeddb`) by storing assets as `Uint8Array` and converting back to `Blob` on demand.
> - Fixed `usePomodoro` settings parsing so `0` is handled correctly.
> - Fixed a typo in the Dashboard copy ("examotion" → "exam").
> - Prevented test-suite race conditions by disabling parallel test-file execution.
>
> **Full changelog below**

## 0.0.2 — Bug fixes, test suite hardening, and visual polish

- Fixed `fake-indexeddb` Blob round-trip issue by storing image assets as `Uint8Array` and converting back to `Blob` via `toBlob()` when DOM APIs need one. Added `blobToArrayBuffer` and `blobToText` helpers for robust cross-environment Blob reading.
- Added `fileParallelism: false` to `vitest.config.ts` so database tests sharing `fake-indexeddb` state do not race each other.
- Added comprehensive unit tests for UI components (`Button`, `Toggle`, `Toast`, `TagInput`, `FadeInView`, `DateTimePicker`, `ProgressBar`), hooks (`usePomodoro`, `useFocusTrap`, `useLongPress`, `useInstallPrompt`, `useStorageQuotaWarning`), and state modules (`sidebarSettings`, `dashboardSort`, `gradingMode`, `inputMode`, `motionSpeed`, `optimiseSetting`, `shortcutBindings`, `shortcuts`).
- Fixed `usePomodoro` settings parsing to use `??` instead of `||` for proper falsy handling.
- Fixed typo in Dashboard copy: "examotion" → "exam".
- Smoother page transitions in `AppShell` — added subtle scale animation (0.995 → 1) alongside the existing fade-and-lift, with a slightly longer duration for a more settled feel.
- Smoother toast exit animation with refined timing and easing.

---

## Planned for 0.0.3

- Expand test coverage to page-level flows (Learn mode, Dashboard, Deck view) and integration tests for the import/export engine.
- Refine mobile touch interactions — spring-tuning on swipe gestures, bottom-sheet behaviour, and touch-target feedback.
- Accessibility audit: focus management in modals and drawers, ARIA live regions for toasts, and screen-reader labels on icon-only controls.
- Performance: virtualise the card list for large decks and investigate image lazy-loading in Markdown renders.

---

# Lacuna — production hardening (round two)

British English throughout. Changes are grouped by work-order task.

## Task 1 — Official FSRS trainer

**Outcome:** Replaced the hand-rolled coordinate-descent optimiser with
`@open-spaced-repetition/binding` (`computeParameters()` via fsrs-rs WASM in the optimisation
Web Worker).

- Added `@open-spaced-repetition/binding`; npm overrides for transitive WASM deps.
  The `binding-wasm32-wasi` WASM binary and worker are vendored into `public/` and `src/fsrs/`
  so the package no longer needs to be installed (it incorrectly declares `cpu: wasm32` and
  fails on x64 VMs).
- `src/fsrs/optimise.ts` converts card histories to binding review items, calls the trainer with
  `enableShortTerm: true`, validates weights against `CLAMP_PARAMETERS` bounds, then clips.
- `src/fsrs/bindingOptimiser.ts` lazy-loads the WASM trainer (`initOptimizer` + Vite `?url` /
  `?worker`).
- Vite: `optimizeDeps.exclude` for the binding; COOP/COEP headers on dev and preview servers.
- Tests: history conversion, out-of-range rejection, gating threshold, persistence feeding
  `makeEngine`.

## Task 2 — Out-of-sample validation

**Outcome:** The before/after calibration metric is now computed on held-out data, not on the
same reviews the weights were fitted to. The confirmation dialog only offers to apply fitted
weights when they genuinely beat the defaults out of sample.

- `src/fsrs/optimise.ts`: added `chronologicallySplitSequences` to split each deck's history
  into a training portion (80% by time) and a held-out validation portion (20%).
- `evaluateParameters` accepts `scoreAfterTimestamp` so only validation reviews are scored.
- `optimiseParameters` trains on the training portion, evaluates before/after on the validation
  portion, and sets `isOutOfSampleWin` in the result.
- Raised `MIN_OPTIMISE_REVIEWS` from 400 to 1,000; the UI copy explains the train/validation split.
- `DeckSettings.tsx` only shows the "Apply" button when `isOutOfSampleWin` is true; plain copy
  is shown when the fit does not improve out of sample.
- Tests: split correctness, validation-only scoring, gating on out-of-sample win, defensive
  guard against an empty training set.

## Task 3 — Pre-migration snapshot ordering

**Outcome:** The pre-migration snapshot is now captured in a separate committed transaction
before the destructive migration runs, so it survives even if the upgrade aborts and rolls
back the main database.

- `src/db/preMigrationSnapshots.ts`: a dedicated Dexie database (`lacuna-pre-migration`) stores
  snapshots keyed by target schema version.
- `src/db/schema.ts`: `ensurePreMigrationSnapshot` detects a pending upgrade via
  `indexedDB.databases()` (with a fallback to raw `indexedDB.open` for older browsers), reads
  all data from the current version, and writes the snapshot to the separate DB before the
  first Dexie query triggers the open. `readAllDataFromVersion` now includes the `assets`
  table in the payload.
- `savePreMigrationSnapshot` also mirrors the snapshot to the configured folder if the File
  System Access API is available.
- `backups.ts` already exempts `tag === 'pre-migration'` from the ten-snapshot pruning.
- Tests: a simulated migration failure proves the snapshot remains restorable; the snapshot is
  skipped when the database is already at the target version.

## Task 4 — Persistent storage

**Outcome:** The app now requests `navigator.storage.persist()` on first run and surfaces the
result honestly in the backup UI.

- `src/db/persistence.ts`: `requestPersistentStorage` and `checkPersistentStorage` handle
  granted, denied, and unsupported browsers; `estimate()` results are surfaced when available.
- `src/App.tsx`: requests persistence once on first run (guarded by localStorage flag).
- `src/pages/Settings.tsx`: shows whether storage is persisted, approximate quota usage, and
  a "Request persistence" button when not yet granted. When denied or unsupported, the UI
  states plainly that the browser may delete data and points to regular exports or folder
  mirroring as the safeguard.
- Tests: unsupported, granted, denied, and thrown-estimate cases are mocked and asserted.

## Task 5 — Asset garbage collection

**Outcome:** Orphaned image assets are now collected automatically after destructive card
operations.

- `src/db/assets.ts`: `collectOrphanedAssets` scans every card's Markdown, builds the set of
  still-referenced hashes, and deletes unreferenced rows. `scheduleAssetGc` debounces the
  sweep (3-second quiet period) so bulk edits collapse into one pass.
- `src/db/repository.ts`: `deleteDeck`, `deleteCards`, and `updateCard` (when front or back
  changes) now call `scheduleAssetGc` after the transaction commits.
- Tests: deleting a sole-referencing card removes the asset; a shared asset survives until
  the last referencing card is gone; replacing an image in a card orphans and collects the
  old one.

## Task 6 — Object URL session cache

**Outcome:** Image object URLs are cached per hash for the app lifetime, eliminating the
  create/revoke churn on every card flip in a fast Learn session.

- `src/db/assetCache.ts`: `resolveAssetUrl` caches one object URL per hash; subsequent
  renders return the same URL. `resolveAssetMarkdownCached` replaces all asset references
  in a Markdown string with cached URLs.
- `src/components/markdown/MarkdownView.tsx`: switched from `resolveAssetMarkdown` (per-mount
  create/revoke) to `resolveAssetMarkdownCached`.
- `src/App.tsx`: registers a `beforeunload` handler that calls `revokeAllCachedUrls` to
  release the URLs at app teardown.
- Tests: stable URL across repeated calls, null for missing assets, correct Markdown
  replacement, and revocation at teardown.

**Checks:** `typecheck` and `test` pass.
