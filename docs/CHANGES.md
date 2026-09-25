# Lacuna — version 0.2.10

## Unreleased

- Moved typed answers into authoring: choose a lesson default, override individual cards
  in the editor/creator, or change selected cards together. Study sessions use those choices
  with the existing offline comparison and self-marking. Removed the global typing switch.
- Preserved answer modes through backups, course sharing and author updates; standalone
  card JSON exports include the effective mode so re-import does not depend on a lesson.


- Added `bun run ai:invites` to generate private batches of beta AI codes and matching
  server credential hashes, with an option to preserve existing users when adding a batch.
- Capped combined AI invitation configuration at 48 KiB to leave room for other
  server settings within Vercel's environment-variable budget.

- Redesigned the study-step transition as a vertical path from the completed topic to
  the next activity, removing the redundant completion and next-step subtitles. The
  topic settles back before the path and destination appear; reduced motion skips the
  sequence. Actions share aligned sizing, and Continue reveals its arrow without
  shifting neighbouring buttons. Paused steps, breaks and revision summaries remain available.
  Browser study and sync checks assert the accessible completion marker instead of the removed subtitle.

- Declared Vercel Blob in the web build's development dependencies because its
  Playwright relay fixture imports the relay store during root typechecking.
  Root-only Vercel installs now resolve the store's types.

- Loaded the desktop updater controller only in Electron, keeping it out of the
  initial browser JavaScript and restoring the existing asset budget.
- Kept committed hosted AI tool receipts and their saved ledger when Stop or disposal
  interrupts an approved local action. Bound each complete hosted request by its
  encoded byte size, retaining complete tool calls and results across continuations.
- Fixed hosted AI provider switches leaving a previous session active, and prevented tabs without
  ownership from overwriting the saved conversation or removing its access code. Older replies
  are trimmed when needed so later turns and the tool ledger remain saved. Rejected exact write
  approvals now tell the model that no change was made.

- Added a Windows CI installed-upgrade probe using the verified v0.2.7 installer and a
  long-running, installed AI companion. It records installer exit codes and process identities
  on failure. The intermittent Codex-hosted shutdown failure remains unexplained.

- Loaded route announcements separately after the initial render, keeping the combined
  maintenance changes within the existing initial JavaScript budget. Precached that deferred
  shell component so cold offline reloads retain it.

- Integrated the maintenance PRs with both Python and packaged macOS required by the test
  gate, pinned actions in the newly added jobs, and focused-test rejection in the new suites.

- Rejected invalid review response times before changing cards, review history or
  calibration, preventing non-finite timing statistics from being saved.
- Blocked startup when a pre-migration snapshot fails and the upgrade path crosses
  destructive schema versions 22, 24 or 26, including the default upgrade to v27.
  Failed snapshots remain retryable; upgrades crossing no destructive version can continue.

- Rejected cross-course card assignments before changing cards, lesson exposures or canonical
  review history. The target lesson must also belong to the selected course.

- Rejected selected backup files over 200 MB before reading or parsing them,
  preventing oversized imports from exhausting the application.
- Restricted comment-triggered OpenCode runs to the repository owner, checked out
  the default branch for both comment events, reduced token permissions, denied
  OpenCode command execution with its API key present, and pinned the action to
  a reviewed commit.

- Allocated lesson and note order indices inside their insert transactions, so concurrent
  creation in the same parent keeps distinct indices and stable listed order.

- Linked Quick search's combobox to its results list only while the list exists,
  keeping its expanded and active option state consistent for assistive technology.
- Made every CI Vitest and Playwright configuration reject focused `.only` tests,
  while keeping local focused runs available for debugging.
- Pinned release, CI and Security workflow actions to reviewed full commit SHAs,
  while keeping version comments and weekly Dependabot updates for maintenance.

- Added CI per-file coverage gates for schema migration snapshots, card and ordering
  repositories, and Learn-session persistence and orchestration. Thresholds use measured
  [baselines](maintenance/coverage.md) so a strong file cannot hide a weak one behind an
  aggregate percentage.

- Counted daily review caps and goals from persisted review events across sessions and repeat
  attempts, with local calendar-day boundaries and the existing Continue anyway override.

- Kept Course Settings section headings below the sticky mobile jumper after
  navigation, matching the existing Settings section offset.
- Ran Electron AI interaction tests against freshly built production renderer assets,
  and checked that Electron loads the hashed entry script from `dist/index.html`.
  The suite still uses its local Electron host and companion transport.

- Added locked Python test jobs for both offline tool workspaces to the required CI test
  gate, and checked the shipped short-term model against shared Python and TypeScript
  prediction cases covering coefficients, count capping and routed handovers.

- Updated Toast countdown bars through transforms instead of React state and
  width changes on every animation frame, preserving their existing timers.
- Added CI typechecking and lint coverage for release-gating Playwright suites and the web
  performance audit, fixing the newly exposed type and lint errors in those paths.

- Checked release tool versions against minimum safe versions and parsed builder
  targets and workflow action identities as YAML. Removed source-text checks already
  exercised by updater tests, Electron tests and release build gates.
- Updated page titles and added a polite route announcement for screen readers across
  shell and full-screen navigation. In-page query changes leave focus and the announcement alone.
- Made shortcut capture a labelled modal with a keyboard-accessible Cancel button.
  Focus stays inside it and returns to the selected shortcut after capture or dismissal.
- Reclaimed abandoned device-sync relay channels during the existing daily maintenance job.
  Each run scans a bounded page and resumes from a stored cursor. Cleanup uses the latest
  metadata or slot upload, waits 24 hours beyond the 90-day channel expiry, and rechecks
  uploads before deleting a group.

- Consolidated decorative modal backdrops into a shared layer hidden from the
  accessibility tree, preserving each overlay's existing click-to-close behaviour.
- Added a required macOS CI smoke for the unsigned packaged Electron app. It checks native
  launch, a course stored across reload, and a seeded study answer in the desktop renderer.

- Added a focused iPhone-sized WebKit browser gate for course navigation, touch study and
  offline navigation. Its single-worker CI job joins the existing required browser check;
  the full Chromium suite remains split across two shards.
- Raised the card editor's touch action bar above the mobile course navigation so its
  Add card action remains tappable.

- Removed repeated lesson headings from the notes-first study screen, leaving the lesson
  name in its header and the notes section heading above the content.
- Moved lesson deletion confirmation below its row so its consequences and action labels
  remain readable at narrow widths, including long unbroken lesson names. Cancelling
  returns focus to the delete button.
- Began the built-in AI Gateway work with a bounded hosted request and streaming-event
  contract, plus a loopback-only AI SDK harness for testing model text and tool calls. Added
  opt-in built-in AI in the existing sidebar for web and Electron, with issued beta access codes,
  server-side free-route selection and atomic limits, streamed answers, local tools and approvals,
  and local transcript recovery. Provider calls remain disabled until the hosted service is
  configured with secrets and a quota store. Kept the server SDKs outside the packaged Electron
  runtime dependency set.
  Replaced the unavailable pinned Gateway model with `poolside/laguna-s-2.1-free` and
  `inclusionai/ling-3.0-flash-fin`, retaining the live zero-price check for each route.
  OpenRouter routes take priority over Gateway when configured and require a live zero-price and
  tool-support check before use. Every Gateway price field must also be zero.
  Prefer pinned OpenRouter Nemotron Ultra and Gemma 4 free models, checking live zero pricing
  and tool support for each, before the variable free router. Log failed provider routes for diagnosis.
  Tell hosted models the exact local tool wrappers and approval behaviour, and try the next
  verified free route when a provider finishes without usable text or a tool call.
  Report a rejected write as a rejection with no mutation, so the model does not describe
  it as an expired or reused approval.
  Verified live preview reads, an approved write, a rejected write and Stop at zero provider
  cost; vague GCSE course requests now ask for a subject rather than inventing a syllabus.
  Made hosted function imports resolvable by Vercel's Node ESM runtime and added a
  compiled-module regression test after the first deployed session request failed at load time.
  Used Lacuna's Electron preload to choose the hosted service URL, so an ordinary browser
  running inside an Electron shell still calls its own preview deployment.

- Corrected Cards virtualisation for lesson lists below the viewport, retaining only
  boundary overscan rows instead of rendering a full viewport in every lesson.
  Study motion and pause timings are unchanged. See the
  [Windows investigation](performance/2026-09-21/optimisation.md).

- Extended the existing performance harness with optional per-operation traces,
  frame/input and transaction diagnostics; ignored stale frame timestamps after a
  diagnostic reset so frame intervals cannot become negative.

- Added optional desktop startup profiling and recorded repeated launches and dashboard
  reloads against the populated Windows profile, separating trace overhead from timings.

- Recorded a managed Windows laptop performance baseline, including installed desktop
  interaction timings, populated-app process samples and the existing heavy-data workload.
  See [measurement methods and limits](performance/2026-09-21/README.md).

- Kept desktop AI connected when navigating between courses, Dashboard and Settings.
  Only navigation that replaces the main document invalidates its AI listener; hash
  routes and subframe loads no longer strand the runtime in its starting state.

- Refined the session report with a clear completion tick, one heading, readable stat labels,
  responsive progress spacing and aligned actions. Progress changes use percentage points,
  and the progress bar announces the study objective.

- Reused date formatters and removed redundant target-time calculations within timezone
  conversion, preserving daylight-saving gap handling and calendar-day grouping.
- Set Vercel's install command to `bun install --frozen-lockfile`, matching CI and
  preventing npm from resolving a different dependency tree and failing on ESLint peers.
- Kept restarted Pomodoro focus sessions counting down while already running.
- Ignored storage quota estimates after their hook is cleaned up, and simplified polling
  ownership so unmounting always stops its interval without retaining a timer ref.

- Kept resized card images and occlusion diagrams at least one pixel wide and tall,
  preventing very thin uploads from failing when their shorter edge rounds to zero.
- Added maintainer commands to wait for exact-commit checks, create a release draft, verify
  downloaded artefacts and updater metadata, and explicitly publish a Windows/Linux beta.
  Publication verifies provenance and checksums afresh and documents the platform scope.
- Reused the existing CI asset budget instead of installing dependencies and rebuilding assets
  in the release verifier. Windows release builds now run the existing packaged interaction
  smoke test before uploading; release configuration tests no longer hard-code the app version.
- Split the full browser CI suite across two shards, preserving the required `browser-smoke`
  aggregate check and uploading each shard's reports for failure diagnosis.

## 0.2.10 beta — on-demand learning and maintenance

- Added optional Simple Learn passes for whole courses or individual lessons inside the Study
  sheet, with a lesson-scoped entry on lesson pages. Study stays available when nothing is due.
  These passes include already introduced and not-yet-due cards, retain FSRS review recording,
  and save progress separately without completing lessons or advancing curricular gates.
  Styled the scope picker's expanded menu in Chromium/Electron, deferred lesson-list queries
  until the options are expanded, and skipped unused curricular queries in optional course passes.
- Updated browser regression setup to choose the scheduled lesson from Study before testing
  grading, motion, keyboard accessibility and sync; retained the existing behavioural assertions.

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
