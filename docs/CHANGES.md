# Lacuna — version 0.2.10

## 0.2.10 beta — on-demand learning and maintenance

- Added optional Simple Learn passes for whole courses or individual lessons inside the Study
  sheet, with a lesson-scoped entry on lesson pages. Study stays available when nothing is due.
  These passes include already introduced and not-yet-due cards, retain FSRS review recording,
  and save progress separately without completing lessons or advancing curricular gates.
  Styled the scope picker's expanded menu in Chromium/Electron, deferred lesson-list queries
  until the options are expanded, and skipped unused curricular queries in optional course passes.

- Shortened repository memories and the README, split the specification into focused contracts,
  archived older change history, and moved the root glossary, historical QA report and test
  configuration into their owning directories. Removed five obsolete lint suppressions.
- Refreshed release, toolchain and live-user maintenance guidance; added a documentation
  index and repaired historical links without turning archived plans into an active backlog.
- Aligned browser TypeScript library declarations with the ES2022 built-ins already used
  by the application and tests, restoring typechecking after dependency installation.
- Kept virtual-list rendering bounded when the viewport moves below the last row,
  including after a list shrinks, rather than mounting every off-screen row.
- Migrated the application and companion tooling to React 19, TypeScript 7, Vite 8,
  Vitest 5 and ESLint 10, adapting compiler, lint and test configuration to their supported APIs.
  CI uses Node.js 24 and now gates the initial asset budget and the handwriting prototype's
  build and tests as well as its audit.
- Kept charts and Markdown lazy under Vite 8 so the launch bundle and visited-page
  offline cache retain their existing guarantees.
- Aligned the vendored browser optimiser WebAssembly with binding 0.5, preventing
  native tests and browser optimisation from silently using different trainer versions.
- Removed an unused AI mailbox change assignment exposed by the upgraded linter;
  mailbox processing and cancellation behaviour are unchanged.
- Reused completed route prefetches directly so React 19 does not delay the first
  navigation behind a Suspense fallback; cold loads retain their existing loading UI.
- Restricted route prefetch lookups to registered own properties and covered inherited
  property names with regression tests.
- Contained failed downloads of study options and keyboard shortcuts within dismissible
  overlays, preserving the current page and its state.
- Verified the upgraded Zod emitter accepts valid checkpoint assessments in its JSON
  Schema while retaining the existing runtime tool contract and permission scopes.
- Updated Electron to 44.4.1 and Electron Builder to 26.16.1, retaining the release
  configuration checks for vulnerable transitive dependencies.
- Displayed the app version beside the Settings heading on web and desktop.
- Removed duplicated update-version and scheduling-card subtitles.
- Joined the course-path lamp's shade, arm and base into a continuous illustration.
- Fixed recurring and ad-hoc due-review sessions repeating successfully answered cards
  immediately, despite scheduling their next review for tomorrow. These entry points now
  carry the existing due filter into Learn; due sessions recheck each updated due date and
  finish when no scheduled reviews remain due, independently of predicted exam readiness.
- Softened image-occlusion masks with opaque neutral fills, keeping passive masks light
  in both themes, and a distinct accent-coloured
  target with a clearer Fraunces question mark. Revealed labels use a single outline; card and
  diagram sizing, masking rules and scheduling remain unchanged.

## 0.2.9 beta — reliable course reads and study counts

- Aligned the release configuration test with the v0.2.9 package version.
- Fixed course settings section highlighting after asynchronous course loading;
  the desktop rail and mobile jumper now follow scrolling.
- Kept assessment card exclusions within the settings editor when card text is long.
- Centred sidebar hover details on their course row while keeping the popup inside the viewport.
- Enabled internal FSRS interval fuzz for new scheduling configurations by default;
  existing saved preferences are retained.
- Read courses and their final assessments in one database transaction across navigation,
  search, course views and plain queries. Concurrent imports, deletions and replacements
  can no longer mix course and assessment snapshots and trigger a false missing-final error.
- Applied course daily new-card and maximum-review limits to the dashboard forecast.
- Counted only scheduled reviews in “Due” totals and the recurring review step,
  while retaining new cards in “Ready” totals and curricular Practice.
- Removed the redundant reviewed-count and accuracy subtitle between study steps.
- Verified keyboard grading against persisted review history in the browser smoke test,
  replacing its assertion on the removed step subtitle.

## 0.2.8 beta — optional introductions and FSRS learning

- Added a per-course **Learn first** setting, enabled by default. Turning it off lets
  new cards enter spaced repetition without a separate introduction pass, while
  retaining lesson locks and daily new-card pacing. Shared courses retain the preference.
- Simple Learn now records real FSRS reviews using Practice's timing-based grading,
  calibration and hint handling. Its Yes/No queue still repeats missed cards and
  finishes when every card is correct; later Practice uses the resulting memory state.
  Existing introduction records are preserved without inventing historical reviews.

- Windows and Linux packages are published through the native release workflow.
  macOS packages are deferred and will be added separately.
- Removed automatically suspended cards from Simple Learn's queue and progress,
  retaining their recorded review without serving them again or completing the lesson.
- Wait for the lesson's course setting before starting its study session, preventing
  a temporary introduction session when Learn first is disabled.
- Made the review-activity subscription test wait for each observed value rather than
  assuming one event-loop turn completes IndexedDB notifications on every platform.
- Updated packaged-application verification to enter through the current landing action.
- Updated browser analytics and concurrent-review fixtures for graded introductions;
  the sync scenario still requires exactly two distinct, converged review events.
- Gave the large-transaction rollback test a bounded timeout suitable for contended
  runners, retaining its atomicity checks and verifying failure in the second batch.

- Updated the public landing page with a spacious exam-focused hero, twelve flat animated
  illustrations, a centred logo on scroll and a clear closing action. The approved design
  is served directly at `/welcome` and `/landing`, without variant or comparison controls.
  The availability calendar keeps the exam fixed and links selected free slots to an
  illustrative FSRS recall curve with a labelled 80–100% axis. Keyboard access, reduced
  motion and narrow-screen layouts are supported; the superseded hero and chart are removed.
- Updated Download and Method to the same dark visual style. Download presents one
  platform action and compatibility line, with installation guidance on request. Method
  retains its interactive explanations and discloses coefficient details on request.

## Earlier history

See [changes through v0.2.7](archive/changes-through-0.2.7.md) for the complete earlier record.
