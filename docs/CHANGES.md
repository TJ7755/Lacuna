# Lacuna — version 0.1.0

## Unreleased — Explicit domain storage migration

- Began the approved full storage migration on `feat/storage-migration` with schema v21.
  Course- and Lesson-owned scheduling units are now materialised alongside the compatibility
  Deck rows, with separate Course calibration and scheduling-unit pacing stores. Cards and
  canonical review events carry their resolved scheduling-unit id, so later cutover slices can
  stop discovering hidden backing Decks without changing scheduling behaviour in this checkpoint.
- Kept legacy Deck/Folder stores, old backup/share/APKG formats and compatibility readers intact;
  this first slice is additive and rollback-safe rather than a premature destructive cutover.
- Cut Course calibration reads and review/undo writes over to `coursePerformance`, while Course
  pacing reads use `schedulingPerformance`. Course writes mirror the old calibration row for
  rollback, and legacy Deck sessions retain their explicit Deck key space; missing pacing rows
  continue to use downstream defaults rather than becoming zero-second estimates.
- Routed the active Course dashboard, sidebar and read-side course statistics through the same
  pacing adapter. Newly-created Course cards now carry their scheduling-unit id, and newly-created
  backing units initialise target pacing rows, so fresh installs and upgraded databases share the
  same target-store path.
- Kept target scheduling configuration current on repository Course, Lesson and assessment writes.
  Course settings cascade to inherited Lesson units, lesson exam-date/time-zone overrides remain
  authoritative, target performance rows initialise on fresh data, and Lesson/Course deletion
  snapshots restore the target rows atomically. Legacy Deck/Folder stores remain untouched.
- Closed compatibility transaction gaps at Share, lineage-merge and occlusion boundaries by
  including the target stores in their parent transactions. Added a Deck-only legacy-backup
  round-trip assertion, and made canonical review-event deduplication ignore projected ownership
  metadata so a later scheduling-unit stamp cannot duplicate one event.
- Cut active Course/Lesson Learn sessions over to the `schedulingUnits` configuration projection
  for FSRS scoring and review/time limits, with a source fallback for pre-projection databases;
  legacy global Deck sessions retain their existing configuration path.
- Kept destructive Deck/Folder removal gated because active legacy routes, global study/search/editing,
  MCP scope resolution and backup/import/share contracts still require those stores. This branch
  deliberately ends at the reviewed additive cutover instead of shipping a breaking schema deletion.
+- Follow-up review fixes combine duplicate legacy performance profiles when several backing Decks
+  resolve to one target scheduling unit, preserve legacy calibration when rebuilding a missing target
+  row, and use constant-time scheduling-unit membership checks during schema upgrade.

## Unreleased — One place for study on the dashboard

- The dashboard's study control now holds the same position whether or not a study flow was
  interrupted. It resumes when there is a flow to resume, and otherwise opens the study sheet at
  its course picker. Previously it appeared only mid-flow, so the ordinary case reached study
  through a course card or the sidebar's Review today — an extra tap, and on a phone one hidden
  behind the hamburger drawer. The control stays hidden until at least one active course exists,
  so the empty state still reads as create-a-course.
- This closes the last of the learn screen redesign follow-ups. The alternatives were rejected
  deliberately: a second button in the header competes with New course at phone width, and a
  bottom-bar study entry would undo the change that gave the mobile bottom bar to course sections.

## Unreleased — Dead StudyEntry screen removed

- Removed the unused "Choose what to study" entry screen. The study bottom sheet
  (`StudySheet.tsx`) replaced it, so `StudyEntry` and its `entryHasChoice` helper had no
  production callers left anywhere; both are deleted. The file now holds only
  `StudyFlowMessage` and is renamed to `StudyFlowMessage.tsx`, which the course study flow
  still renders for its empty, blocked and caught-up states. The single-option shortcut
  documented in the "Study entry" section below is unchanged: a session with no decision
  to make still opens directly.

## Unreleased — Learn screen follow-ups reconciled

- Replaced the stale "Follow-ups, delegable once this lands" record in
  `docs/plans/learn-screen-redesign.md` with an in-place reconciliation, dated 12 August 2026,
  of all three items.
- Follow-up 1, the "Choose what to study" screen: delivered. The interstitial was replaced by a
  bottom sheet (`src/components/learn/StudySheet.tsx`) opened via `StudySheetContext` from the
  sidebar and the course path; the old `StudyEntry` screen is no longer rendered anywhere, with
  `CourseStudyFlow.tsx:15` importing only `StudyFlowMessage`. The dead component itself is being
  removed by a separate worker.
- Follow-up 2, the landing-page "SMOOTH SCROLL ON" pill: delivered. `Welcome.tsx:329-346`
  requires a `wheel` event before the pill is revealed, so on touch it never appears.
- Follow-up 3, the dashboard study control above the fold on mobile: partially delivered. The
  resume-study control sits above the fold at `Dashboard.tsx:137-156` when a study flow is
  interrupted, but it is conditional on `resumableCourse`; with none, study is reached through
  the sidebar's Review today control behind the mobile hamburger drawer or a course card's Study
  action. Whether an unconditional study entry belongs on the dashboard remains a live design
  question for Claude Code.
- Marked the learn screen redesign **delivered** in `docs/next_plan.md`, keeping only the one
  remaining open design question rather than an implementation diary, per roadmap rule 5.

## Unreleased — Deployment planning

- Recorded that Lacuna is not yet in real use and adjusted roadmap sequencing so data-integrity
  work takes priority before the September 2026 start of genuine revision history; work measured
  by observed usage remains deferred until then.

## Unreleased — Mobile navigation and course section transitions

- Fixed header text wrapping at phone widths. The course tab labels wrapped inside their own
  pills, breaking the segmented control; the dashboard header competed for about 280px between a
  4xl title and a button that would not shrink; the lesson view-mode toggle was stranded
  right-aligned on its own line once its row wrapped; and the course stat pills packed one-and-two
  to a row by whatever happened to fit. Tabs now abbreviate below sm while keeping their full
  accessible name, and the pills use a two-column grid.
- Added a mobile bottom navigation bar carrying Courses, Study, Search, Analytics and Settings.
  Deliberately opaque rather than translucent: content scrolling under a blurred bar competes with
  the icons. It mounts inside `AppShell`, so it is absent from Learn mode, which lives outside the
  shell and already pins its own grading controls to the bottom of the screen.
- Course tabs are a full-width 48px control below sm, returning to the compact pill above it.
- Moving between a course's sections now slides sideways in the direction of travel through the
  tab order, rather than using the standard page transition, so the sections read as one surface.
  The direction is passed through `AnimatePresence`'s `custom`, because an exiting element
  otherwise keeps the props it last rendered with and leaves towards the wrong side.
- Sections can also be swiped between on touch. The gesture is claimed only once movement is
  clearly horizontal, so vertical scrolling wins a close call, and it is inert outside an exact
  section route: deeper pages such as a lesson or the card editor are destinations within a
  section rather than siblings of it. The pointer is captured for the gesture and cancelled
  gestures are discarded; once the threshold is crossed, easing the finger back cannot reverse
  the selected direction.
- `COURSE_SECTIONS` is now the single source of section order, shared by the tab bar, the
  transition and the swipe, since all three must agree on what the next section is.

## Unreleased — Study entry and landing-page scroll toggle

- The study entry screen now appears only when there is a decision to make. With one way into
  the course it was a full-screen gate whose only action was "continue", tapped through before
  every session; the course page already names what Study will open and the learn header confirms
  it. `entryHasChoice` lives beside the buttons it describes in `StudyEntry.tsx` so the skip
  condition cannot drift from the screen it governs.
- This was deliberately framed as a rule rather than an exception for the single-option case: the
  screen's appearance now always means something needs choosing, so the first time an assessment
  overlaps your material the screen carries information rather than being routine.
- The landing page's smooth-scroll toggle is revealed by a wheel event rather than by any scroll.
  `useSmoothScroll` only intercepts `wheel`, so on a phone the pill offered an escape from
  behaviour that was never happening, while sitting pinned over the heading and covering a word.

## Unreleased — Learn screen: card, header and swipe undo

- The study card sizes to its content behind a 12rem floor instead of a 29rem one, and the card
  and its controls centre together as one block. Previously the card was centred within the
  region above the reveal button, so short cards floated in an oversized container while the
  leftover height collected beneath the controls.
- The study header no longer encodes progress three ways. The percentage readout and the counter
  ring are gone; focus mode and full screen moved into the card-actions menu on both pointer and
  touch. Focus mode keeps a header control while active so a chrome-less screen has a visible exit.
- The surviving progress track and pip bar now carry `role="progressbar"` and the progress value
  themselves. The removed ring had been the only accessible progress value, because the visual
  tracks were `aria-hidden` or an unvalued group.
- A swipe-committed grade now offers Undo in a toast. Undo already existed but was reachable only
  by keyboard shortcut, which is no use to the phone user who made the accidental swipe.
  Deliberate taps on Yes and No do not raise the toast.
- Added a test asserting that touch grading controls live in a `fixed bottom-0` container, so the
  thumb-zone property cannot regress unnoticed.
- Corrected two findings in `docs/plans/learn-screen-redesign.md`, both wrong for the same reason.
  The swipe finding claimed there was no answer-phase restriction, no commit threshold and no drag
  feedback; all three already existed and only the undo gap was real. The thumb-zone finding
  claimed the grading controls sat mid-screen on a phone; they are already anchored to the bottom,
  and the measurement had been taken in a resized desktop browser, which reports no touch points
  and so renders the pointer layout. Both entries are kept and marked rather than deleted.
- **Lesson for future passes:** a browser session at phone width is not a phone. Input mode
  resolves from reported touch points once on mount, so resizing a desktop window renders the
  pointer layout however narrow it gets. Verify a finding against the code before planning work
  from it.

## Unreleased — Loading placeholders and card entry animation

- Loading placeholders no longer flash. `useDelayedPending` withholds a placeholder until
  loading has lasted 250ms, and the `DelayedFallback` wrapper applies it at all fifteen
  placeholder sites, fading the placeholder in rather than snapping it on. Route chunks are
  prefetched, so warm navigation now shows no placeholder at all; the placeholder remains for
  cold chunk fetches and large courses. The delay is the enforced guarantee; a child fallback
  cannot enforce a minimum visible lifetime once its loading owner replaces it.
- `DelayedFallback` is a wrapper component rather than a hook call at each site, because
  mounting a placeholder is itself the loading signal. This avoids hoisting a hook above the
  pre-existing early returns in fifteen components, which would have risked breaking the
  rules of hooks for no gain.
- Fixed the card entry animation in `CardList`. Rows animated the first time they entered the
  virtual window, so whether a row faded in depended on how far the list had been scrolled,
  and rows revealed by scrolling staggered on their absolute card index and so always waited
  the capped delay. Rows now animate once as the list's own entrance, staggered by position
  among the rendered rows; scrolling reveals rows immediately. The `index` prop is renamed
  `staggerIndex`, since feeding it the absolute index is what caused the defect.
- Not fixed yet: the placeholder-to-content swap is still a hard cut, which reads as a
  flicker on a fast load. `AppShell` already crossfades route changes, but it animates the
  placeholder rather than the content that replaces it. Recorded in
  `docs/plans/learn-screen-redesign.md`.

## Unreleased — Course-facing Deck terminology audit

- Added `docs/course-terminology-audit.md`, tracing Course-facing Deck terminology into
  wire-format, internal scheduling and safe-rename categories. No source code or wire format
  changed.

## Unreleased — September phone performance pass

- Removed the whole-card-pool aggregate scan from the `recordReview` write transaction.
  Historical trajectory points are now sampled after commit at most once per local day;
  an existing point is detected before the card read, and sampling failure never loses a
  committed review. The benchmark now measures one call at 500, 2,000 and 10,000 cards
  plus the separate once-daily sampling cost.
- Disabled chart entry animations, moved progress bars from layout properties to
  compositor transforms, and removed persistent chrome backdrop blurs.
- Added lazy asynchronous image loading for Markdown card content and occlusion diagrams,
  route-chunk prefetching for sidebar navigation, and one combined sidebar live data read.
- Updated diagnostics to count canonical review events rather than daily trajectory samples.
- Isolated Pomodoro flow consumers from the per-second countdown, pruned virtual-list
  measurement callbacks, terminated idle share workers, fast-pathed single-unit session
  indexing, removed persistent decorative animation loops and count-up rAFs, slowed MCP
  polling while hidden, and pruned the backup-folder mirror.
- Kept `Card.history` and `sessionHistory` retention unchanged because pruning them would
  alter storage or analytics semantics while the storage migration is still in progress.

## Unreleased — Remaining performance follow-up

- Kept `recordReview` limited to the reviewed card, review event rows and performance row;
  the average-retrievability trajectory is sampled after commit at most once per day per
  unit, with no stored aggregate or cache.
- Split the share worker onto a transport-only codec so payload validation stays on the
  main thread without bundling the database, zod or mathjs into the worker.
- Moved KaTeX CSS into the lazy Markdown chunk. The final audit measured initial CSS at
  107,735 bytes / 16,210 bytes gz, down from 138,632 bytes / 24,777 bytes gz before this
  follow-up; the Markdown CSS chunk is 29,290 bytes / 8,070 bytes gz.
- Recorded the final before/after measurements in `docs/PERFORMANCE.md`: one
  `recordReview` call at 500, 2,000 and 10,000 cards, session timings, bundle sizes,
  worker size and the full test-suite result.

## Unreleased — Performance audit measurements

- Added `bun run perf:audit` for repeatable production bundle, 10,000-card session,
  and review-write measurements. The baseline values and timing protocol are recorded
  in `docs/PERFORMANCE.md` so performance changes are compared against the same work.

## Unreleased — FSRS weight-set provenance

- Recorded a short fingerprint of the `w` array on reviews written by the repository, and
  surfaced it in review-history CSV and JSON exports. The fingerprint deliberately excludes
  interval-choice settings such as `requestRetention` and does not store the weight vector.
- Landed this before any optimised weights are applied so future calibration analysis can
  attribute every new prediction to the weight set that produced it; older and imported history
  remains valid but has no fingerprint.

## Unreleased — Storage boundary follow-ups

- Routed FSRS optimisation, review analytics and diagnostics through the canonical
  `reviewHistory` event store, retaining `Card.history` as a compatibility projection while old
  backups and callers remain supported.
- Added named review-calibration read, update and undo adapters. Course/Lesson reviews remain
  Course-keyed; legacy Deck reviews remain Deck-keyed; backing-Deck pacing rows stay separate.
- Kept the physical `userPerformance` table and deferred destructive Deck/Folder storage
  migration until backup, restore, merge, deletion and undo coverage justify it.
- Made canonical review events win over stale card projections even when the shared event id's
  metadata differs, preventing compatibility reads from double-counting one review.
- Made an explicitly supplied empty canonical history authoritative, including during snapshot
  restores, so stale `Card.history` projections cannot resurrect deleted review events while
  ordinary compatibility reads continue to preserve legacy-only history.

## Unreleased — Specification accuracy audit

- Reconciled `docs/SPEC.md` with the current router, lazy-loading boundary, CourseAssessment
  storage, schema-v20 canonical review history, backup/merge behaviour, generated-card component
  names, explicit bulk selection, course archiving, motion controls and Electron MCP contract.
- Marked the v0.0.2/v0.0.3 sections as historical release notes so their former Deck UI names are
  not mistaken for current routes.

## Unreleased — Calibration harness deferred

No code changed. This entry records a decision and the findings behind it, so neither is re-derived.

- Considered building the offline calibration harness that `docs/scientific-assessment.md` §5 names
  as the highest-value scientific step, and deferred it: there is no real review corpus to measure,
  so the harness would produce nothing until an unknown future date. Recorded the deferral and its
  gate in `docs/next_plan.md`, and a status note at the head of §5 so the assessment does not read as
  active work.
- Confirmed that deferring is free. `ReviewLog.retrievabilityAtReview` is a genuine ex-ante
  prediction, computed from pre-grade state in `applyReview` and persisted in the same transaction as
  the grade, and full JSON backups preserve it. Reviews recorded now stay analysable indefinitely, so
  no data is lost by waiting.
- Noted that `src/fsrs/calibration.ts` already computes a per-day Brier score; a future harness
  extends it with horizon bucketing, log loss, calibration bins and uncertainty rather than starting
  fresh.
- Recorded two durable facts in `MEMORIES.md`: review logs do not record which FSRS weight set
  produced a prediction, which is unrecoverable once optimised weights are applied; and
  `tooling/short-term-memory/` is an external-corpus Python project, not a precedent for analysing
  Lacuna's own data.
- Two methodological questions remain open and should be settled before any harness is built:
  whether a scheduler can be validly evaluated on review data whose timing it chose, and whether
  long-horizon exam-day projection is measurable from observed intervals at all.

## Unreleased — Agent instruction split

- Split the agent instructions in two: `AGENTS.md` now holds the agent-agnostic house rules and the
  `.agent-mail` protocol, which every non-Claude worker uses by default, while `CLAUDE.md` holds only
  the Claude-specific delegation, model-choice and worker-supervision rules.
- Recorded Freebuff as the preferred delegation route ahead of Codex and OpenCode. It has no headless
  mode, so Claude writes a mailbox-aware prompt for the prompter to run rather than driving it.
- Removed GLM 5.2, which is no longer available.
- Added `MEMORIES.md` as the agent-agnostic store of durable working facts, edited in place, distinct
  from this chronological changelog.

## Unreleased — Scientific assessment

- Added `docs/scientific-assessment.md`, recording the evidence strength, modelling assumptions,
  corrected literature framing and validation priorities for Lacuna's exam-driven scheduling,
  response-time grading and assessment revision layers.

## Unreleased — Storage migration contract

- Recorded the first proposed migration boundary in `docs/plans/storage-migration.md`: Course-keyed
  calibration remains separate from backing-Deck pacing performance, review events move towards
  a dedicated recoverable event store, and no history pruning or legacy-store removal is proposed
  until backup, restore, merge, optimisation and compatibility coverage is complete.
- Kept canonical review-history ownership metadata in sync when cards move between decks or
  lessons, and dual-wrote review events imported from APKG files.
- Reduced schema-v20 migration memory use by avoiding retained event-identity JSON copies.

## Unreleased — Course/Deck boundary follow-up paused

- Hardened Course/Lesson backing-deck resolution against cross-course legacy adoption and
  concurrent duplicate creation, preserving existing scheduling calibration rows.
- Documented the reviewed stop point for the small Course/Lesson boundary pass at commit `9dd9107`.
  The remaining search, Deck-shaped component APIs, generic Deck hooks, dual UserPerformance
  semantics, portability surfaces and eventual storage migration are recorded in
  `docs/course-domain-boundary-follow-ups.md`; no further production changes are included in
  this paused pass.

## Unreleased — Arc 14 flow simplification complete

- Preserved published-course lineage on first import from both share-code entry points, so later
  classroom revisions merge into the tracked recipient copy instead of silently creating another
  course.
- Routed dashboard cards with queued classroom changes to the update-review screen, including
  single-lesson courses that otherwise skip the course overview.
- Made the sequence-editor introduction follow the selected preset instead of retaining the ordered
  list description after switching to script/dialogue mode.
- Removed the horizontal card-exit/card-entry movement after grading. The next card now fades and
  settles in place instead of making the study surface twitch left and back.
- Portalled the touch-first card-actions sheet out of the animated sticky header, so it anchors to
  the viewport instead of opening upwards from a header-height containing block.
- Made the course path the canonical manual-practice editor, exposed labelled insertion controls,
  and distinguished automatic from manual nodes without pretending custom filters are authorable.
- Kept course tabs visible from lesson views and standardised card, sequence, occlusion, linking,
  and card-import actions across lessons and the Question bank.
- Separated course sharing, card/APKG import, external batch staging, full backup, merge, and local
  replacement language. Media omissions now point directly to full backup and destructive local
  replacement requires explicit confirmation.
- Added persistent archived-course management, confirmation before course deletion, batch-discard
  protection, and shortcut-conflict rejection.
- Added targeted critical-domain coverage and a one-worker Chromium production smoke suite to CI,
  capped Vitest and Playwright at one worker, and extracted practice persistence and Learn
  card-capability rules from oversized modules.

## Unreleased — Roadmap consolidation

- Replaced the 3,700-line combined roadmap and implementation diary with a short current
  roadmap, archived the historical arc specifications, and extracted Arc 14's course-setup
  slice into the sole active implementation plan.
- New course creation now shows the seven-day local Exam date before saving, allows it to be
  changed in the same modal, rejects invalid local times, and creates the course's Final exam
  with the chosen instant and time zone while preserving the initial Lesson 1 and share-code flow.
- Portalled the New course overlay out of the mobile navigation drawer so the sidebar entry uses
  the full viewport instead of squeezing the modal into the transformed drawer width.
- Replaced competing course-header Study actions with one **Study** entry. The course conductor
  now distinguishes starting the next lesson, due review and named assessment revision before a
  session starts, while direct Practice-node and assessment selections retain their exact scope.
- Exposed the existing cross-course session as **Review today** in the configurable sidebar and
  replaced bare “Today” and retired “deck” language on that flow.
- Updated historical section references throughout the repository to point at the archive.
- Formally closed Arc 11. Its offline numeric/working authoring and grading scope is delivered;
  the model-dependent ten-minute clipboard benchmark was retired as an invalid release gate,
  while tuple answers, scaffold items and advanced maths-input work remain separate proposals.

## Unreleased — ADR for study-day time semantics

- Added `docs/architecture/fsrs-time-semantics.md`: a proposed ADR for one global
  study clock (04:00 rollover, learner-configured IANA time zone, exact epoch-ms
  instants) and the distinction between exact elapsed duration, study-day index
  and calendar-day. Implementation is explicitly deferred pending product review;
  the archived `archive/fsrs-validation` branch holds the experimental
  implementation and validation tooling.

## Unreleased — Audit correctness fixes

- Revalidated structured item payloads at the card repository, share-code and backup boundaries.
  Empty or semantically invalid v1 working schemes are rejected, payloads cannot be attached to
  cloze cards, and unknown future item versions remain intact for read-only fallback.

## Unreleased — Confirmed release-defect fixes

- Fixed the production CSP/font and analytics-load errors, restored mobile navigation focus,
  added a branded not-found route, made Method controls keyboard-operable, and named Settings,
  authoring and sharing controls.
- Added inline validation for blank course and sequence creation, consolidated toast announcements
  into one live region, corrected Working and Sequence card badges, and fixed iPhone SE Settings
  text-size overflow.
- Corrected full-backup import previews to count course lessons rather than internal backing decks.
- Added the omitted note count to course share-code previews on both import surfaces.

## Unreleased — Automated-test signal cleanup

- Removed KaTeX quirks-mode, React Router future-flag, Recharts zero-size and Happy DOM iframe
  fetch noise from the test harness and fixtures.
- Awaited asynchronous editor, lesson-management, LearnMode and report transitions instead of
  asserting before their user-visible state had settled.
- Removed expected share-validation and error-boundary logging, completed the navigation fixture
  for the Question Bank test, and closed pre-migration snapshot connections after each operation.
- The full suite now passes with 205 files and 1,774 tests without stderr output.

## Unreleased — Browser QA fixes

- Newly created lessons now open directly from single-lesson course views. Course and lesson
  headers expose inline renaming through an edit control or double-click, while distributed locked
  courses remain read-only.

## Unreleased — Preview tooling

- Removed the obsolete Cloudflare Vite plugin, Wrangler configuration and Wrangler dependencies
  now that the web application is deployed through Vercel. `bun run preview` now serves the
  production build directly with Vite instead of blocking on Wrangler's interactive agent-skills
  prompt, and the stale Wrangler deploy command has been removed.

## Unreleased — Image occlusion (Arc 6, second slice)

- Added image occlusion: upload a labelled diagram, draw boxes over it once, and one ordinary
  card is generated per box. A **label** box covers text printed on the diagram, so the author
  types nothing; a **feature** box points at an unlabelled part and is answered by uncovering its
  paired label. Every label is covered on every question face, so no card is answerable by
  reading the picture or by elimination. Schema v19 adds an `occlusions` table and an
  `occlusionRegionId` index on cards.
- Stored mask coordinates as fractions of the image rather than pixels, so masks hold their
  position at any viewport size and zoom, and persisted an explicit `shape` field from the first
  version so later geometry never has to guess what an old record meant.
- Routed editing through the same regeneration contract as sequences: moving, resizing, re-pairing
  or changing the role of a box rewrites that card's content and keeps its FSRS memory state;
  deleting a box removes its card with an undo; replacing the image warns before regenerating
  everything. Scheduling fields are never written by regeneration.
- Made generated cards read-only, badged and grouped under their owning diagram everywhere cards
  are listed, searched or shown in the command palette, matching the sequence conventions.
- Carried occlusions through backups (replace and merge), diagnostics counts, share codes and the
  published-lineage merge. A diagram is referenced only by its occlusion, never by card Markdown,
  so backup export and asset garbage collection both gather those hashes explicitly.
- Added five MCP tools — list, get, create, update and delete occlusion. `create_occlusion`
  references a diagram already stored in the install; there is no asset-upload tool, so region
  ids, roles and fractional coordinates are the whole agent-facing contract.
- Made the share-code media warning honest about diagrams. It previously counted only cards with
  an asset reference in their Markdown, which missed occlusion cards entirely; it now names them
  and says what the recipient actually receives — a placeholder for embedded files, and a text
  fallback with no image for a diagram card. Backups remain the way to move media between
  machines.
- Fixed sequence-generated cards duplicating on a lineage merge. A published course packs those
  cards like any other, so the merge both adopted the packed copy and regenerated the card from
  its sequence, leaving two per item with the adopted one frozen at the publishing revision.

## Unreleased — Audio cards (Arc 6, first slice)

- Widened the content-addressed image store into a media store without a schema migration.
  Existing records remain images; audio records carry `kind: 'audio'`, omit dimensions and retain
  the same SHA-256 deduplication, object-URL cache, garbage collection and backup round-trip.
- Added structured audio authoring to the card editor. MP3, M4A/MP4, Ogg, WAV and WebM files up to
  25 MB can be selected or recorded; the editor writes an ordinary `front_back` card containing a
  `![audio](lacuna-asset://…)` Markdown marker and an optional prompt.
- Rendered local audio markers as native players. Global autoplay and playback-speed settings live
  under Study & scheduling. The Learn face can return to the player with the R key without resetting
  the answer phase, response timer or available grading controls.
- Fixed Anki imports silently dropping audio. Supported `[sound:…]` media is now stored, rewritten
  to Lacuna's audio marker and returned with the imported card; rejected media no longer leaves a
  partial deck and cards behind.
- Prevented overlapping microphone permission requests from starting unreachable recorders, and
  made share-code warnings and placeholders describe omitted audio as media rather than images.
- Recorded the approved Arc 6 defaults: rectangle regions with an explicit shape field, all-label
  masking, a 2560px occlusion-image ceiling and desktop-first occlusion authoring.

## Unreleased — Answer forms and the revision loop (Arc 11 free-tier trial)

- Value predicates now accept an answer written as `y = 3` as well as a bare `3`. The verifier
  normalises an equation to `left - right`, so a named answer compared unequal to its own value and
  scored zero. This was found through authoring, but the study face runs the same verifier, so a
  student ending their working the natural way lost the mark too. Only a bare variable on the left
  is reduced, waypoints are untouched, and the line as written is still tried first, so nothing that
  matched before stops matching.
- Revised items can now be pasted back. Previously "Revise with AI" copied a prompt whose reply had
  nowhere to go: the per-item editor is a structured form, and the only free-text box re-parsed the
  whole batch, discarding every other item and every accept/reject decision. Each item now has its
  own paste target, and a batch-level control revises every failing item in one round trip, matching
  replies back by position and applying nothing on a count mismatch.

## Unreleased — Batch authoring hardening (Arc 11 free-tier trial)

- The batch review step now accepts a block closed by a mirrored `<<<LACUNA_ITEMS_V1>>>` instead
  of `<<<END_LACUNA_ITEMS_V1>>>`. Free-tier models mirror the opening delimiter often enough that
  a correct response was being rejected wholesale; a second opening token is unambiguous once the
  block is open, and a correct closing delimiter still takes precedence.
- The batch prompt now states the answer shape: a numeric answer and an `equals` criterion each
  take one constant expression with no variables and at most one `=`, and a multi-variable
  solution is written as one criterion per variable. Without this, a model asked about
  simultaneous equations returns `x=6,y=4` as a single answer, which both the numeric validator
  and the scheme compiler correctly reject.

## Unreleased — Verification engine corrections (Arc 11 follow-up)

- Fixed multi-variable equivalence checking. Sample signs were derived from the attempt and
  variable indices, so with two variables only the alternating sign patterns were ever drawn and
  the same-sign quadrants were unreachable: `abs(x*y)` compared equal to `-x*y`. Each variable now
  draws its own sign. The existing tests missed this because every one of them used a single
  variable, where index-derived signs do cover both halves of the line.
- Fixed domain-restricted comparisons. An expression such as `sqrt(x - 100)` evaluated to a
  non-finite value at every sampled point and did not compare equal even to itself. Sample
  magnitude now widens as attempts fail, so the sampler reaches the region where such an
  expression is defined.
- Separated "cannot check" from "wrong". Comparison returns `equivalent`, `different` or
  `undetermined` instead of a boolean, so a comparison that runs out of valid sample points is no
  longer reported as a difference.
- Working lines the checker cannot decide are recorded as `undetermined` rather than as misses,
  including lines whose scheme expression no longer parses or whose predicate arguments are
  unusable. They earn no marks but are shown as unchecked instead of a red zero, keep the dispute
  control, and carry the distinction into the persisted verdict and any dispute report. Older
  review logs without the flag are unaffected.
- Renamed `equivalentByRandomEvaluation` to `compareByRandomEvaluation`, since it no longer answers
  a yes/no question. It had no callers outside `verify.ts` and its tests.
- Recorded the greedy scheme-line matching limit in `docs/archive/roadmap-2026-08-11.md` §11.9: a student line that
  satisfies two scheme lines consumes whichever comes first, which can underscore a later line.
  Deferred deliberately, with the reproducing shape written down.
- Staged batch items no longer report "0 of N fixtures pass" when the mark scheme itself failed to
  compile. The fixtures were never run in that case, so the row now reads "Fixtures unavailable"
  and the scheme errors stand on their own.
- Removed the revision prompt from accepted staged items. Acceptance is terminal — there is no
  Edit, Reject or Restore afterwards — so the copied prompt could not be applied to anything.
- Fixed Learn mode silently mis-marking items it cannot render. A card whose `payload` has an
  unrecognised `v` or a known-but-unbuilt `kind` (currently `scaffold`, reserved but not built —
  see §11.2) used to fall through to the classic flip card with an empty back, offering the
  Again/Hard/Good/Easy controls for a question that was never actually answered. It now renders
  read-only via `UnknownItemFace` — the `front` fallback plus a plain notice — with no submit
  control and no `onAnswer` callback at all, so neither the on-screen controls nor the keyboard
  shortcuts can grade it. Only the share/backup round-trip validated unknown payloads correctly
  before this fix; study time did not.

## Unreleased — Item-type generalisation (Arc 11)

- Added the optional, versioned `Card.payload` model for structured practice items. Numeric
  and working payloads are implemented; the scaffold discriminant is reserved without a
  placeholder authoring or study surface. Backups, share codes and lineage merging validate
  known payloads fully and preserve unsupported versions as opaque values so they round-trip
  instead of being rejected — study-time handling of unsupported payloads is covered
  separately above, under the follow-up fix.
- Added an offline expression-verification engine over the restricted `mathjs/number` entry
  point. It accepts ordinary school notation, renders a KaTeX preview and checks algebraic
  equivalence through reproducible seeded evaluation rather than pretending to be a symbolic
  proof system.
- Added numeric-item authoring to the card editor: exact, tolerance and alternative-answer
  checks share a lenient maths input, live KaTeX preview and touch-sized symbol palette.
  Structured answers persist in the card payload rather than being hidden in display text.
- Added automatic numeric study marking and FSRS grade mapping. Numeric cards bypass reveal,
  typing comparison and self-grading, then persist earned and available marks in ordinary
  review history; Simple learn uses the same verdict without writing review history.
- Added line-oriented working-item schemes with independent compiler errors, plain-English
  previews, autocomplete and the v1 `equals`, `within`, `matches-one-of` and `contains`
  predicates. A built-in answer harness pins sample fixtures and reruns them whenever a scheme
  changes, and generated fixtures must actually earn their declared marks.
- Added automatic working-item study marking, per-line verdicts and deterministic checker
  dispute reports. Learners can report a whole numeric verdict or individual working line in
  FSRS-backed sessions; the submitted content, verdict and random seeds remain reproducible in
  the review log.
- Added a clipboard-only authoring pipeline. Tutors can copy a question-to-scheme prompt or
  build a note-grounded batch prompt, leave concept density and item count to the model or set
  either constraint independently, then paste the delimited result into a visual staging view.
  Each proposal is validated independently and can be edited, accepted, rejected or returned
  to a chatbot through a complaint-aware revision prompt. Lacuna stores no model key and sends
  no notes itself.
- Added optional exam-board and specification provenance to courses and Course Settings. Both
  values are plain strings, commit on blur, clear cleanly when blank and enter note-grounded
  batch-generation prompts only when present; no curriculum taxonomy or schema version was added.
- Clarified that batch generation creates durable concept checks rather than arbitrary-number
  worksheets. Working-item prompts now prefer reusable symbolic methods and derivations, and the
  authoring dialog states that parameterised exercise variants are not supported yet.
- Reserved generated `numeric` items for constant scalar answers. Generation and revision prompts
  now direct formula recall and all other variable-bearing answers into checked working items or
  omit them, preventing symbolic equations from being mislabelled as numeric answers.
- Disabled the PWA service worker in development and deduplicated React-family dependencies in Vite.
  Development startup also unregisters existing workers and clears their stale runtime caches.
  Modules can no longer be served from different optimiser cache generations, which previously
  caused invalid-hook crashes after route changes.
- Added structured numeric and working payloads to `lacuna.create_card` and
  `lacuna.update_card`. MCP writes use the same numeric validator, mark-scheme compiler and
  fixture runner as the visual editor and staging path.
- Added pure marks-analysis helpers for machine-marked review totals and criterion-labelled
  working performance, ready for later readiness and diagnostic UI.
- Measured the shipped verifier boundary: a standalone minified bundle of `verify.ts` plus
  `mathjs/number` is 153.75 KB (43,571 bytes gzip); the production application chunk containing
  it is 648,459 bytes minified (187,658 bytes gzip). These figures are recorded as measured
  boundaries, not falsely attributed to mathjs alone.
- Completed an in-app-browser close-out pass covering hand authoring, a passing 2/2 fixture,
  numeric and working study, an FSRS-backed checker dispute, batch prompt/staging/revision,
  lesson acceptance and a four-item share-code export/import. Deterministic sample model output
  was used; no external chatbot was contacted.
- Smoothed the end of each lesson with a staged, motion-speed-aware transition into the
  completion result and next-step controls instead of replacing the card surface abruptly.
- Fixed broken images in fresh and existing seeded Welcome courses. Bundled SVGs now use the
  asset layer's durable byte representation, and startup repairs missing or legacy Blob-backed
  seed assets without touching user images.
- Kept practice-session chrome mounted across Yes and No answers. Cards now hand off with a
  short motion-speed-aware transition while the objective track and ring interpolate from their
  previous values, removing the false impression of a page refresh or progress reset.
- Added an exhaustive manual website release checklist covering every current route, authoring
  path, study mode, setting, import/export flow, responsive state and explicit deferred boundary.
- Added Arc 13 as a bounded post-feature consolidation and release-verification pass covering dead
  and duplicate code, oversized modules, test/build warning hygiene, bundle baselines and execution
  of the complete website checklist.

## Unreleased — Browser QA

- Completed a desktop and mobile in-app-browser audit across every application route and
  recorded the coverage, reproduction steps and verification results in
  `BROWSER_QA_AUDIT.md`.
- Corrected Share guidance that confused `LAC0–LAC3` encoding prefixes with share-payload
  versions.
- Updated Help text to match the current course picker, course-settings ownership and
  configurable lesson unlocking, and removed the nonexistent automatic Cram dropdown.
- Added accessible names to previously unnamed settings and practice-node switches.
- Applied the interrupted forgetting-curve logo consistently across the app and package icon.
- Added pasted LAC share-code import to the New Course flow, with preview and safe copy import.
- Replaced the dashboard's deck-era predicted-score rail with a selectable course-card
  metric: completed curriculum lessons, reviewed-card coverage or today's workload. Ready
  counts now exclude future-scheduled reviews.
- Course and lesson header pills now use the dashboard's count-up animation, including the
  configured motion speed and reduced-motion behaviour.
- Added a right-click and keyboard context menu to dashboard course cards. Its confirmed Archive
  action preserves all course data, removes the course from active study and offers reliable Undo.
- Added consistent transitions between the app shell, welcome page and full-screen study routes,
  including practice-session exits, animation-speed settings and reduced-motion handling.

> **GitHub Release Note for v0.1.0**
>
> This release completes the Course Architecture Plan: Lacuna is now organised around
> **courses, lessons, notes and cards** throughout the UI. The legacy deck and folder
> surfaces are gone; scheduling, sharing, search, analytics and settings are course-aware.
>
> **What's new**
>
> - **Course model** — courses with ordered lesson paths, notes, practice nodes, exam
>   checkpoints, question bank, course settings and course-scoped learn sessions.
> - **Migration** — existing decks and folders upgrade automatically to courses and lessons
>   (schema v9); v1 share codes still import.
> - **Teacher tooling** — add lessons, configure lesson session filters, author manual
>   practice nodes, manage exam dates, undo course deletion.
> - **Analytics** — per-course analytics on the path; global analytics compares courses.
> - **Simple learn mode and recall presentation** (from v0.0.3) — algorithm-free YES/NO
>   study loop; Basic, Reversed and Cloze cards with optional type-before-reveal feedback.
>
> **Note:** internal `decks`/`folders` tables remain as hidden backing storage; dropping them
> is deferred to a later migration. See `docs/archive/roadmap-2026-08-11.md` for Arc 1 (sequence learning).
>
> **Full changelog below**

## Unreleased — Handwritten maths input prototype (Appendix A.2)

**No application changes.** Everything here lives in `tooling/handwriting-maths/`, an
exploratory prototype with no integration commitment, following the precedent of
`tooling/short-term-memory` and `tooling/semantic-answer-match`. It is not imported by
the browser or Electron builds, and `src/` is untouched. The deliverable is knowledge;
promotion to a numbered arc is a separate, later decision.

- **The question:** can a young student write `x^2 + 3` with a finger faster and more
  happily than they can find `^` on a keyboard? Two separable halves — recognition
  accuracy, and input preference. The preference half survives a poor recognition
  result, and is what feeds Arc 11 §11.3's palette design.
- **Recognition pipeline, all four stages** as pure, unit-tested modules: stroke capture
  and normalisation (`strokes.ts`), stroke grouping into symbols (`group.ts`), symbol
  recognition via the $P point-cloud recogniser (`dollarP.ts`), and baseline/superscript
  layout parsing into an expression string (`layout.ts`), joined by `interpret.ts`.
  $P rather than the $1 recogniser the plan named, because $1 is single-stroke only and
  cannot represent `=`, `x` or a two-stroke `4`. Fraction bars are out of scope for this
  pass. Scoped to nineteen symbol classes at 11+ level, not GCSE.
- **Preference harness** (`trial.ts`): three arms — written, typed, tapped — over
  identical targets, with Latin-square ordering so no method is systematically first,
  median-based summaries over correct entries only, and CSV export.
- **First session (22 July 2026), one adult, one phone.** Median entry: tapped 5.25s,
  written 5.66s, typed 6.84s. The finding worth carrying forward is the cost of `^`:
  typing a superscript target cost +2.21s against +0.47s for handwriting, and the two
  slowest typed entries of the session were exactly the two superscript targets. That is
  a direct input to Arc 11 §11.3 — `^` is the expensive character, and it is expensive
  even for a 115 WPM typist. Recorded with its caveats in the tooling README: n = 1, and
  the canvas arm is self-scored and produces no string, so its figure is a lower bound
  until the retained ink can be scored by `interpret()`.
- **Dataset and licence position recorded** before any training happens: MathWriting and
  CROHME are CC BY-NC-SA, HASYv2 is ODbL. Lacuna sells nothing so NonCommercial is not
  the obstacle; **ShareAlike** against the repository's MIT licence is. Irrelevant while
  nothing ships, decisive if handwriting input is ever promoted into `src/`.
- **`docs/archive/roadmap-2026-08-11.md` correction:** Arc 11 §11.3 claimed mathjs was "already shipped". It is
  not a dependency. The line now names adopting it as a decision the arc must make,
  weighed against a purpose-built parser, and pins the KaTeX claim to the packages that
  genuinely are present (`katex`, `rehype-katex`).

## Unreleased — UI de-clutter and navigation restructure (Arc 10)

No new capabilities — every change is navigation, layout, or consolidation of features
that already existed, following a July 2026 audit of redundant entry points, hidden
features and unstructured settings pages.

- **Study Today merged into the Dashboard.** Each Dashboard course card now has a direct
  **Study** action; the "resume active session" banner moved from the old Study Today
  page to the top of the Dashboard. The standalone page is gone and `/study` now
  redirects to `/`, the same shim pattern already used for `/deck/:deckId`. The `learn`
  sidebar nav item (labelled "Study today", pointing at `/study`) is removed; existing
  stored sidebar settings drop the stale entry automatically while preserving the order
  and visibility of everything else.
- **Shared course tab navigation.** A new `CourseTabs` component (Path / Question bank /
  Analytics / Settings) is now rendered on all four course surfaces, replacing
  CoursePath's small breadcrumb-row icon links — every course surface is one click from
  every other in any direction.
- **Editors return to where you came from.** Opening the card or sequence editor from
  the Question bank vs. from a lesson now sends its "back" link, Cancel and post-save
  navigation to the surface you actually opened it from, instead of always falling back
  to the Question bank.
- **CourseSettings regrouped, and now commits instantly.** The nine settings sections are
  grouped under five headings (Basics, Study, Content, Assessments, Danger zone) behind
  a scrollspy side-rail matching global Settings, extracted into a shared component that
  also gained a mobile fallback (a sticky section jumper) for viewports below `xl`, where
  the rail previously simply disappeared.
  **Behaviour change:** the previous split save model — some fields staged behind a
  sticky "Save changes" button, others (exam dates, lesson management, practice nodes)
  committing instantly — is gone. Every field on Course Settings now commits
  immediately: text and numeric fields on blur (with the same validation/clamping as
  before), toggles and selects on change, and the target-retention slider once per
  drag rather than on every tick. There is no longer a way to edit a setting and back
  out without saving.
- **Discoverability fixes:** the sidebar's Search entry now opens the command palette
  directly and shows the `Ctrl/Cmd+K` hint, rather than just linking to `/search`; the
  Help and Method pages now cross-link each other, so `/method` is reachable outside the
  one-time `/welcome` flow; the global Analytics page's course comparison links each
  course's name to its own `/course/:id/analytics`.
- **Upcoming assessments surfaced on the course path.** CoursePath's header now shows a
  compact strip of upcoming assessment dates (checkpoints and the final), reusing the
  existing `AssessmentDetailSheet` on click, so exam dates are visible without opening
  Course Settings.

## Unreleased — Classroom distribution: versioned courses and re-import merge (Arc 7)

Schema v18. Teachers can now **Publish** a course so that re-sharing an updated code
merges into a student's already-imported copy instead of always creating a duplicate.

- Added a teacher-side **Publish** action (schema v18, `Course.distribution`) that stamps
  a course with a stable lineage id on first publish and increments a revision counter on
  every subsequent publish; the teacher's own course is never locked and stays freely
  editable and re-publishable.
- Added a re-import **merge path** (`src/db/mergeImport.ts`) for students who have already
  imported a published course: new lessons/notes/cards apply immediately, and edits or
  removals of material the student has not touched apply automatically once the student
  opts in per course (`autoAcceptUpdates`) or otherwise queue for later review
  (`pendingMergeReviews`). A student's own edit is never silently overwritten — a conflict
  between a student's change and an incoming teacher change always queues, leaving the
  student's version active. Sequence content changes continue to flow through the existing
  sequence-regeneration path unchanged.
- Added a **locked/read-only mode** for a student's imported copy of a published course:
  lesson, note and card editing is disabled while the copy tracks its teacher's lineage.
  Students can **detach** at any time (a one-way action) to unlock the course and edit it
  freely, at the cost of no longer receiving merged updates from that teacher.
- Added a **review panel** for queued updates: an "Update available" badge on the course
  card and a "Review updates" link in the course header open a page listing every
  outstanding update, removal and conflict, with per-item and bulk (Accept all) actions.
  Conflicts default to keeping the student's own version. Accepting "Accept all" never
  overrides a student's own edit — conflicts always stay queued for an individual
  decision.
- Added an **"Apply updates automatically" toggle** to a shared course's settings, so a
  student can opt a course into silently applying future teacher updates instead of
  queuing them for review.
- Re-scanning or re-pasting a share code for a course already imported now **updates that
  course in place** instead of creating a duplicate: the preview shows what revision it
  would update to, and confirming applies the merge, reporting what changed and whether
  anything needs review. Re-scanning a code that is not newer than the local copy is
  reported as already up to date, with nothing applied.
- Added two MCP tools for agent-driven distribution: `lacuna.diff_lineage_update`
  (read-tier) previews what a re-published share code would change against a tracked
  course without writing anything, and `lacuna.apply_lineage_update` (write-tier,
  consent-gated) applies it through the same merge path the app uses, including
  resolving queued review items.

## Unreleased — Assessment-aware revision planning (Arc 3)

- Unified checkpoint and final assessments under stable `CourseAssessment` ids with independent
  path placement, prefix or custom lesson coverage, explicit card exclusions, validation and
  full backup/share/MCP round-trips.
- Made checkpoint nodes interactive and added exact assessment details. Relevant Practice nodes
  and Study now offer named assessment revision without silently replacing ordinary curriculum
  work or mixing overlapping assessment horizons.
- Added one persistent multi-day plan per assessment with editable daily windows, explicit
  assessment/plan/window provenance, safe leave-and-resume behaviour, deterministic explained
  replans, factual completion summaries and read-only archival after the deadline. Revision never
  completes a curricular Practice milestone or includes untaught, excluded or unavailable cards.
- Integrated the benchmark-selected `half-life-logistic-v3-routed` runtime through the existing
  expected-gain boundary. Exact-second predictions blend smoothly back into ordinary FSRS-6,
  simulated outcomes apply one normal FSRS transition, coefficient and feature validation use the
  typed Practice fallback, model-version changes explain replans, and readiness remains gated on a
  valid prediction with uncertainty. Successful simulations retain the established deterministic
  Good convention; local terms use the documented 500-example threshold and 1,000-example
  shrinkage prior.
- Retired the legacy `?mode=cram` entry and its 48-hour weakest-first product claims. Help,
  Welcome, the seeded example course, README and SPEC now describe the shipped named-assessment
  flow, local-only privacy, retry, milestone, replan and archival semantics consistently.

## Unreleased — MCP server and shared UI foundations (Arc 2 / Arc 5)

The Electron implementation now contains the Arc 2 MCP surface. A real MCP-client
end-to-end smoke pass has completed: tool listing, implicit read grants, blocking
write/destructive consent, destructive-with-undo, idempotent import preview/import, and
the cold-start renderer-not-ready case all behaved as designed.

- Added a versioned MCP tool registry backed by the existing repository/read layers: course,
  lesson, note, card, sequence and exam-date reads and writes; analytics-style summaries;
  destructive/bulk operations; and idempotent card-import preview/import.
- Added the Electron-only stdio server using the pinned official MCP SDK. The main process
  owns the transport while correlated IPC calls execute handlers in the renderer, where
  IndexedDB lives. Calls time out cleanly when the renderer is unavailable, and the web
  bundle does not import the SDK.
- Added per-process, course-scoped permissions. Reads are granted implicitly with an in-app
  notice; first-time write/destructive calls block on human consent. The Electron-only MCP
  Settings section reports server status and lets the user grant or revoke read, write and
  destructive access. Grants disappear when Lacuna closes.
- Added renderer-side scope resolution for ID-only inputs, rejecting missing entities,
  mismatched ownership and multi-course calls before consent. Destructive/bulk actions keep
  their repository snapshots inside the renderer and expose an in-app Undo action without
  leaking the snapshot to the MCP client.
- Added the shared `ConfirmInline`, warning colour tokens, reorder-chevron reuse and a typed,
  token-backed `Select` component. The shared select is adopted by sequence, practice-node,
  card-list and course-comparison controls. Split the former 1,519-line Settings page into a
  thin composition over ten section modules while preserving its scrollspy and navigation.

## Unreleased — Sequence learning (Arc 1 v1 slice)

Adds overlapping-cloze **sequence learning**: authoring an ordered list once (the periodic
table, a timeline, a chain of steps) generates a full set of ordinary FSRS cards, each
cueing recall from a configurable window of preceding items. See `docs/archive/roadmap-2026-08-11.md` Arc 1 for
the design; the v2 lines-mode slice is not part of this release.

- Added lesson edit-mode authoring for `LessonCardLink`: teachers can search and link
  existing course cards without moving or duplicating them. Linked cards are visibly marked,
  excluded from destructive bulk actions, and can be removed from the lesson without deleting
  the shared card.

- Added `Sequence`/`SequenceItem` types (`src/db/types.ts`) and one optional field on
  `Card`, `sequenceItemId`, present iff the card was generated from a sequence item.
- Added schema **v11** (`sequences: 'id, courseId, primaryLessonId, createdAt'`, plus a
  `sequenceItemId` index on `cards`) — additive, no upgrade needed. (v10 was already taken
  by the lesson-view-mode override above, so sequences landed at v11 rather than v10.)
- Added a pure generation/regeneration module, `src/db/sequenceGeneration.ts`: derives
  positional (and, optionally, label -> value) cards from a sequence's items, and diffs a
  previous against an edited sequence to update/regenerate/delete only the affected cards
  while preserving FSRS memory state wherever the recall target is unchanged.
- Added repository CRUD (`src/db/repository.ts`): `createSequence`/`updateSequence`/
  `deleteSequence`/`listSequences`, plus `snapshotSequence`/`restoreSequence` for the
  standard undo pattern.
- Wired sequences through **backup export/import** (replace and merge), **diagnostics**
  bundles, and **course share codes** as an additive v2 field, with id remapping for
  sequences, items and their generated cards' `sequenceItemId` (including label-card
  suffixes) on import.
- Added the **sequence editor** (`src/pages/SequenceEditor.tsx`) at
  `/course/:courseId/sequence/new`, `/course/:courseId/sequence/:sequenceId/edit`, and a
  lesson-scoped `/course/:courseId/lesson/:lessonId/sequence/new`, with entry points beside
  "Add card" in Lesson View and the Question Bank.
- Reworked sequence item entry with add-below controls, a trailing append control,
  responsive 44px actions and accessible item labels. Newly added items are focused and
  scrolled into view, while `Ctrl/Cmd+Enter` inserts after non-empty item content without
  allowing blank chains.
- Grouped and badged generated cards across management surfaces: `CardList` groups a
  sequence's cards under its name (`SequenceCardGroup`) and excludes them from bulk-select;
  a `SequenceBadge` marks generated cards in global search and the command palette; the
  card editor renders generated cards read-only (edit the sequence instead).
- Styled the cue items distinctly from the recall prompt on generated cards in Learn mode
  (`CardContent`'s `sequenceCue`), with no FSRS or session-flow changes.

## Unreleased — Sequence learning (Arc 1 v2 slice: lines mode data layer and editor)

Adds the **lines mode** skin to the existing overlapping-cloze `Sequence` model, for
memorising scripted scenes: paste a script, tag each line's speaker, and only "your"
lines generate recall cards — other speakers' lines are cue-only context. See
`docs/archive/roadmap-2026-08-11.md` §1.5. The study-flow half (first-letter hints, strict grading in Learn
mode) is a separate, not-yet-started slice.

- Added `Sequence.mode?: 'list' | 'lines'` and `Sequence.mySpeaker?: string`, plus
  `SequenceItem.speaker?: string` (`src/db/types.ts`). All additive and optional — no
  schema/index change was needed, and every existing (list-mode) sequence is unaffected.
- Extended `src/db/sequenceGeneration.ts`: only the item whose `speaker` matches
  `mySpeaker` generates a card in lines mode (`isMyLine`); other speakers' lines still
  count towards the cue window and render as `NAME: line` in generated fronts (`cueText`),
  so a card reads like a script. The first-in-scene prompt reads "First line?" instead of
  "First item?" in lines mode. Regeneration/diffing needed no new logic: `diffRegeneration`
  already keys on `sequenceItemId`, so switching `mySpeaker` diffs like any other edit
  (deletes the old speaker's cards, creates the new speaker's).
- Added `src/db/scriptSplitter.ts` (`splitScript`): a pure parser that turns pasted script
  text into speaker-tagged items, recognising `NAME: dialogue` lines and folding
  non-matching following lines in as wrapped continuations.
- Added `src/components/sequences/ScriptPasteImport.tsx`: a paste → preview → correct →
  confirm modal (mirroring `LinkCardsDialog`'s shell) around `splitScript`, so the author
  can fix a misattributed speaker or line before it replaces the editor's items.
- Extended the sequence editor (`src/pages/SequenceEditor.tsx`,
  `src/components/sequences/SequenceItemRow.tsx`): a List/Lines mode picker at creation
  time (mode is fixed once a sequence exists), a per-item speaker field in lines mode, a
  "my speaker" picker built from the speakers already entered, and a "Paste script…"
  entry point for the splitter. Saving is blocked until a speaker is chosen.
- Extended portability: `sequences`' `mode`/`mySpeaker`/`speaker` ride through backup
  export/import unchanged (generic per-table copy already round-trips whole `Sequence`
  objects) and through course share codes as further additive v2 keys (`m`, `ms`, `sp` on
  `ShareSequence`/`ShareSequenceItem`) — older v2 codes without them still parse.

## Unreleased — Lesson view study/edit mode

- Locked curriculum lessons now remain locked for study but can be opened for
  authoring while the course is in Edit mode. In Edit mode, lessons can also be
  reordered directly on the course path by holding and dragging a lesson node;
  `Alt+ArrowUp`/`Alt+ArrowDown` provides the keyboard equivalent, while the
  existing Course Settings controls remain available.
- Split `LessonView` into two modes instead of always showing full notes/cards
  CRUD: **study** (the new default) renders notes read-only and shows a cards
  summary (count, due count, mastery %); **edit** is the previous full-CRUD
  behaviour, unchanged. Added `LessonNotesStudyView` (`src/components/notes/`)
  and `LessonCardsSummary` (`src/components/cards/`) for the study-mode
  sections.
- Added a persisted global default (`src/state/lessonViewMode.ts`, mirroring
  `practiceDefaults`/`motionSpeed`) with a toggle on the Settings page, and an
  optional per-course override (`Course.lessonViewMode`, schema **v10**,
  additive) with a toggle on Course Settings (`LessonViewModeSection`,
  `src/pages/settings/`).
- Added `src/course/lessonViewMode.ts`: `resolveLessonViewMode` (course
  override, else global default) and `canEditLessons`, a single gate for
  whether edit mode is available at all — today always `true`, but the sole
  hook point for a future teacher/student locked-course sync.

## Unreleased — Landing page

- Welcome path is now a playable micro-course: interactive exam curve (drag the
  horizon; also drives the dashboard mock), multi-card grading demo, interactive
  path demo that unlocks later nodes, practice queue instead of a feature grid,
  and a soft-gated checkpoint CTA. British English throughout.

## 0.1.0 — Course architecture

Completes the migration from `Folder -> Deck -> Card` to `Course -> Lesson -> Note + Card`
(Arc 0 in `docs/archive/roadmap-2026-08-11.md`). The course model is built, the UI is cut over, and legacy
deck/folder surfaces are removed. Internal backing decks remain in storage only.

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

### Settings and course management (Phase 7)

- Extracted `DeckSettings.tsx` (848 lines) into reusable pieces under `src/pages/settings/`:
  `SchedulingFieldsSection` (pure controlled fields), `OptimisationPanel` (generalised to a
  `{ id, fsrsParameters, autoOptimise }` entity with an `onUpdate` callback instead of calling
  `updateDeck` directly), `DangerZoneSection` (delete-with-undo-toast, parameterised), and the
  `parseSteps` helper, so the new `CourseSettings.tsx` can share them. Added a `DeckSettings`
  smoke test to guard behaviour through the extraction; `DeckSettings.tsx` and its route remain
  as the legacy deck-scoped settings surface until Phase 8.
- Added `src/state/practiceDefaults.ts` (localStorage-backed, mirrors `optimiseSetting.ts`
  conventions) for the `autoPractice`/threshold/urgent-window/max-gap fields on `Course`.
  `createCourse` now seeds new courses from these defaults instead of hardcoded literals;
  explicit opts still override. `Settings.tsx` gains a "Course defaults" sub-section inside
  Study & scheduling exposing the fields, with the urgent-window field framed as the revision
  period.
- Added the course-only settings sections `UnlockModeSection`, `PracticeSettingsSection`,
  `ExamDatesSection` and `LessonManagementSection` under `src/pages/settings/`, and composed
  them into the new `CourseSettings.tsx` page (route `/course/:courseId/settings`), with an
  entry point from `CoursePath`. Course deletion uses a plain confirmation dialogue with no
  undo — an intentional trade-off for this phase; undo is deferred.
- Fixed card exporters (plain text, CSV, TSV, Markdown, JSON) showing the internal lesson
  backing-deck name for course-created cards; they now resolve `"<Course name> — <Lesson name>"`
  (or just the course name) via `courseId`/`primaryLessonId` lookups, falling back to the deck
  map for legacy deck-only cards. `deck_name`/`deck_colour` CSV headers are unchanged. This was
  the only import/export gap: `portability.ts` (backups, merge/replace import) already carried
  `courseExamDates` and `practiceNodes` correctly; `import.ts` needed no changes. Added
  merge-mode test coverage for both tables in `portability.ts`.
- Fixed a `CourseSettings` not-found branch that could never be reached: `useCourse` can only
  ever resolve `Course | undefined` (Dexie's `.get()` has no not-found sentinel), so a bad
  `courseId` hung on the loading skeleton forever instead of showing "not found". Resolved the
  course locally with the same null-sentinel `useLiveQuery` pattern `CoursePath` already uses.
- Fixed `parsePositiveIntOr` rejecting `0` for the practice threshold and urgent-window fields,
  where `0` is a meaningful value (see `src/fsrs/practice.ts`) and the inputs allow `min=0`; the
  maximum lesson gap keeps its floor of 1, matching its `min=1` input.

### Phase 8 close-out (Arc 0 — one data model, paid-down deferrals)

- Rewrote `HelpPage.tsx` for the Course/Lesson/Note model (courses & lessons, study modes,
  filtered study, how to study, keyboard shortcuts, touch gestures, progress & scheduling,
  card types, tips), replacing the deck-era copy. Fixed the coloured left accent left over on
  the section cards and removed a gesture-configuration line that no longer described anything
  the app does (dashboard swipe actions are fixed, not user-configurable).
- Added `src/db/search.ts`'s `searchCourseContent` (courses, lessons and notes, ranked
  alongside the existing card search) and rewired `SearchPage` and `CommandPalette` to search
  both cores and deep-link results to `/course/:courseId/...` routes, replacing the deck/card-only
  search.
- Added course-scoped analytics: `src/components/analytics/CourseAnalytics.tsx` (predicted
  exam-day trajectory, stability profile and review volume over a course's deduplicated card
  set) plus a lesson-level breakdown chart (cards, mastery, completion per lesson), rendered at
  the new `/course/:courseId/analytics` route with an entry point from `CoursePath`. Fixed a
  related inconsistency: an empty lesson's mastery now follows the same course-level convention
  (empty = 100%, not 0%) as `computeCourseSummaries`.
- Removed the legacy deck-facing UI surfaces: `DeckView.tsx`, `DeckSettings.tsx` (and its test),
  `DeckAnalytics.tsx`, `DeckSearchOverlay.tsx`, `folderTree.ts`, and the `/deck/:deckId/*` routes
  (view, settings, card create/edit, learn) — all superseded by their course/lesson equivalents.
  `/deck/:deckId` now redirects to `/` so old links don't dead-end. The `gestureSettings.ts`
  module (per-user configurable swipe actions) was removed alongside it, since it configured a
  deck-card affordance that no longer has a settings surface; swipe-to-study/archive on the
  dashboard course cards is now fixed behaviour. The `decks`/`folders` tables are untouched —
  this was a UI-surface removal only (see `docs/archive/roadmap-2026-08-11.md` §0.3).
- Wired the dashboard's course-ordering control (recent / ready to study / mastery / exam date /
  name / created) and the Settings → Sidebar due-count and archived-course visibility toggles,
  which had stopped taking effect during the course-UI cutover. Compact mode and the
  per-nav-item visibility toggles were unaffected and continued to work throughout.
- Rewrote the first-run seed (`src/db/seed.ts`) to build a demo **course** (with lessons, notes
  and cards) instead of a demo deck, so a fresh install no longer seeds deck-era example content
  into a UI that can't show it.
- Rewrote `README.md` and `SPEC.md` for the Course/Lesson/Note model: route map, wireframes,
  navigation, search, analytics, sharing and settings sections now describe courses and lessons
  throughout; the data-model section documents the `decks`/`folders` tables honestly as the
  legacy backing structure each lesson still runs on (a lesson is a hidden single-lesson deck),
  rather than as a user-facing concept.

### Lesson session filters, manual practice-node authoring, and course-deletion undo

- **Teacher-configured lesson session filters.** Lessons gain an optional, un-indexed
  `Lesson.sessionFilter` (`'new' | 'due' | 'mixed'`; default `'new'` preserves current
  behaviour). `LearnMode`'s lesson-session card selection now honours it, reusing the same
  due semantics (`isDue`/`dueCards`, new in `src/fsrs/eligibility.ts`) as the course-level
  session. Teachers set it per lesson from `LessonManagementSection`, with plain-language
  descriptions for each option (New material / Revision / Both). The field round-trips
  through v2 share payloads as `sf`. `CoursePath`'s due-count logic was also switched to the
  new shared `dueCards` helper instead of an inlined duplicate.
- **Manual practice-node authoring.** Adds create/edit/delete UI for teacher-authored
  `PracticeNode` records: a hover-revealed "+" between lesson nodes on `CoursePath` inserts
  one at a specific gap, an edit badge on manual practice nodes lets a teacher reposition,
  rename or delete them, and a new `PracticeNodesSection` in course settings mirrors
  `ExamDatesSection`'s list/inline-edit pattern. Auto-inserted practice nodes are untouched by
  this UI and remain computed fresh on every path render. Filters are intentionally left out
  of the form (no existing `CardFilter`-builder UI to reuse) but remain supported in storage.
  Create/update/delete are wrapped in try/catch with a failure toast so a repository error
  cannot soft-lock the editor.
- **Course deletion undo.** Replaces `CourseSettings`' blocking `window.confirm()` with the
  same snapshot + undo-toast pattern deck deletion uses (`DangerZoneSection`), closing the
  deferral noted above. Adds `snapshotCourse`/`restoreCourse` to `repository.ts`, capturing
  everything `deleteCourse` removes — including the lessons' hidden backing decks and
  question-bank deck, and their session history and calibration profiles. Incidentally,
  `deleteCourse` itself never removed those backing decks, their `userPerformance` rows, or
  the course/deck-scoped `sessionHistory` rows, leaving them orphaned on every course
  deletion; `deleteCourse` now sweeps them up too.

### Add lesson UI (course architecture close-out)

- Added `AddLessonControl` (`src/components/course/AddLessonControl.tsx`): inline form wired
  to the existing `createLesson` repository function, with a suggested default name
  (`Lesson N`). Surfaces on the course path (including the empty state), in course settings
  under Lessons (`LessonManagementSection`), and on single-lesson course views where the path
  is hidden (`LessonView`). Creating a second lesson switches the course from the inline
  single-lesson view to the full path.

### Global analytics course cutover (Arc 0 close-out)

- Migrated `/analytics` from the legacy deck model to courses: `CourseComparison` replaces
  `DeckComparison`, cards and session history are scoped to active courses via `courseId`,
  leech counts use `leechCountByCourse`, and the predicted exam-day trajectory uses a new
  `globalTrajectorySeries` helper that averages per-course snapshots per day. Removed
  `DeckComparison.tsx`.

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
>
> - Page-level integration tests for CardList, Dashboard, SharePage, SessionReport, and LearnSkeleton.
> - Lightweight dependency-free virtual card list for decks with more than 50 cards.
> - Haptic feedback on all major mobile gestures (swipe, long-press, grade, tray actions).
> - Spring physics on card swipe snap-back and bottom-sheet drag handles.
>
> **Bug fixes**
>
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
>
> - Smoother page transitions and toast animations throughout the app.
> - Added a comprehensive unit-test suite covering UI components, hooks, and state modules.
>
> **Bug fixes**
>
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

## Schema v22 removal contract

**Outcome:** The destructive half of the storage migration now has a written contract, so the
removal can be specified once and implemented against a fixed target rather than negotiated
commit by commit.

- `docs/plans/storage-v22-removal.md`: states, per gate-holder, what is deleted, what compatibility
  adapter replaces it, and what must be tested before the deletion lands. Two decisions are fixed:
  full removal of the hidden backing Deck (`schedulingUnits` becomes the sole scheduling record),
  and conversion-on-import for pre-v22 backups and `LAC0`-`LAC3` share codes, reusing
  `buildDomainStorageMigration` rather than a second implementation.
- The contract requires the existing `ensurePreMigrationSnapshot` mechanism to be hardened rather
  than replaced: its failure is currently caught and logged, which is acceptable for an additive
  migration but not for a destructive one. For v22 a failed snapshot must block the upgrade.
- Rollback is explicitly one-way. An aborted upgrade leaves the database at v21; a completed one
  has no downgrade path, only snapshot restore under the previous build. The release note must say
  so plainly.
- Workstream 2 of `docs/course-domain-boundary-follow-ups.md` (the CardList legacy Deck-shaped
  union) is subsumed by gate 3 and must not be run as a separate pass.

**Checks:** documentation only; no code changed.

## PWA installation on iPhone

**Outcome:** Lacuna installs to an iPhone home screen with its own icon, and the Settings panel
teaches the gesture rather than claiming the browser cannot install web apps.

The app was already a PWA — `vite-plugin-pwa`, a manifest, Apple meta tags and an install panel
all existed. Two specific things were broken.

- `index.html` pointed `apple-touch-icon` at an SVG. iOS silently ignores an SVG there and uses a
  screenshot of the page as the home-screen icon instead. It now points at a 180px PNG.
- `scripts/generate-icons.ts` rasterises `public/icon.svg` into `public/icons/` with `sharp`
  (a devDependency; run `bun run icons:generate`). The maskable variant scales the artwork to 80%
  on an opaque background so Android's circular mask cannot crop it.
- `public/manifest.json`: split the single `"any maskable"` entry into separate `any` and
  `maskable` icons, since one bitmap cannot serve both well. Added `id` and `scope`, and set
  `start_url` to `/#/` to match the hash router.
- `src/hooks/useInstallPrompt.ts`: iOS never fires `beforeinstallprompt`, so `isInstallable` was
  permanently false there and the panel told iPhone users their browser was unsupported. The hook
  now returns an `InstallMethod` discriminant (`prompt`, `manual-ios`, `unavailable`) and detects
  iPadOS, which reports itself as `MacIntel` and is distinguished from a desktop Mac only by its
  touch-point count. Installation is also detected through the legacy `navigator.standalone` flag.
- `src/pages/settings/InstallSection.tsx`: shows the Share-sheet gesture on iOS, with a new
  `IosShareIcon` inline so the button is recognisable on the user's own screen.
- Tests: `src/release/pwaAssets.test.ts` asserts every manifest icon exists on disk, that the
  Apple touch icon is a PNG that exists, and that exactly one icon is maskable — the last of which
  is the regression that caused this work.

**Deliberately not done:** `viewport-fit=cover` was not added. The status bar is already set to
`black-translucent`, which only takes effect with `viewport-fit=cover`, and enabling it without
matching `env(safe-area-inset-*)` padding in the stylesheet would push content under the notch.
There is currently no safe-area handling anywhere in the CSS, so that is a separate piece of work.

**Checks:** `typecheck`, `lint`, `test` and `build` pass.

## Unreleased — Grok added as a delegation route

**Outcome:** Grok 4.6 is available as a headless mailbox worker, driven by Claude directly rather
than by the prompter.

- A SuperGrok subscription was taken out on 13 August 2026. The `grok` CLI (Grok Build TUI 1.0.3,
  at `~/.local/bin/grok`) is signed in through grok.com OIDC with coding-data retention opted out,
  and offers `grok-4.6` (default, 500k context) and `grok-4.5`.
- Verified headless operation with `grok -p`, so unlike Freebuff it needs no supervision from the
  prompter. It supports `--effort low|medium|high|xhigh`, `--json-schema` for enforced structured
  output, `--tools`/`--disallowed-tools` and `--rules` for scoping, and several streaming output
  formats.
- `-w/--worktree` is silently ignored under `-p`. A Grok worker that needs isolation must be given
  a worktree created beforehand and pointed at it with `--cwd`.
- `CLAUDE.md`: added a Grok section, a table row (intelligence 9, cost 8, speed 8), Grok to the
  permitted-without-asking mailbox workers, and Grok as a fourth independent concurrency quota
  alongside OpenCode, Cline and Codex.
- Taste and 3D remain unrated and must not be guessed, on the same rule that already governs
  DeepSeek V4 Pro. Until the prompter supplies a number, Grok gets no frontend, design or 3D work.
  Its intelligence rating does put it out of the slop tier, so it takes whole tasks like Sol rather
  than needing them decomposed — and unlike Sol, its output is usually mergeable as written rather
  than needing a polishing pass. Review it as a competent colleague's branch, not as a draft.
- A first real session registered 0% of the SuperGrok allowance, against an estimated 5% had the
  same work gone to Claude. One data point, not a measured ceiling, so the cost rating stays at 8;
  the practical consequence is that Grok need not be rationed the way Sol must be.

**Checks:** documentation only; no code changed.

## Unreleased — Grok 4.6 taste rating

**Outcome:** Grok's taste column in `CLAUDE.md` is a 7.5, so design work can be delegated to a
worker other than Claude for the first time.

- Measured on 13 August 2026 with a from-scratch landing-page redesign, briefed as a replacement
  for a page the prompter disliked. The returned concept set the product name as the word missing
  from the headline and punched the forgetting curve into the sentence as the gap itself — an idea
  rather than a restyling, and notably not the cream-and-serif look that LLM-authored landing pages
  default to.
- The draft was **not** adopted; the prompter prefers the existing `/welcome` page, and Grok deleted
  `design/landing-draft/` and reverted its own changelog entry. The rating stands on the thinking,
  not the outcome — a future agent reading the table should not infer that the work failed.
- Defects found on review, recorded because they are the shape of mistake this tier still makes:
  a visually-hidden chart description nested *inside* the `<h1>` and also referenced by the SVG's
  `aria-labelledby`, so the heading's accessible name contained the whole description twice and
  mutated live as the chart was dragged; one line of copy that broke the register; and three
  Google Fonts families loaded from a third party on a page whose central claim is that nothing
  leaves the device.
- The 3D and graphical column remains unrated and must not be inferred from this. Taste in a flat
  editorial layout is not evidence about 3D.

**Checks:** documentation only; no code changed.
