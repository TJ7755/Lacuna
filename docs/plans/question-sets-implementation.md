# Question sets implementation plan

**Status:** implementation in progress; this document tracks the remaining work.
**Scope:** implement the product described in the [design brief](../questions-design-brief.md),
using the evidence and limitations in the [research note](../question-sets-research-2026-09-26.md).
No completion dates are assigned. Check an item only after its code and required evidence exist.

## Commit and browser gates

The prompter requires regular commits and browser testing at **every gate**, including
domain-only and documentation/compatibility milestones. This requirement supersedes
any earlier assumption that a non-UI stage could skip browser checks.

- Commit each coherent, validated slice on `feat/question-sets`; do not accumulate
  several stages in one uncommitted change. Keep incidental fixes in separate commits.
- Every gate requires a real browser check on the proposed code. Use the shared T3
  preview when available. For a domain-only or planning slice, smoke-test the current
  app and relevant existing flows; describe that scope without claiming new UI coverage.
- For UI gates, exercise the changed workflow, keyboard access and a narrow viewport.
  Save desktop and narrow-screen screenshots and share them in the chat. Check that
  each screen presents one active task with secondary controls collapsed; label legacy
  baseline screenshots separately from the new interface.
  For persistence gates, include relevant save/reload and recovery/import behaviour in
  the browser, in addition to automated database tests.
- Record the tested revision or exact working-tree scope, URL/build, viewport, actions,
  result, relevant diagnostics and screenshot evidence. Browser checks supplement the
  red-to-green automated tests; neither replaces the other.
- Do not mark a gate complete when browser testing is unavailable or failed. Record
  the blocker and keep the gate pending. Commits alone do not imply a passed gate.

The shipped Questions mode is a separate fixed/generated-question experiment, documented in
[Questions v1](question-mode.md). This plan extends that system to authored sets with nested
parts, allocations and self-marking. It does not replace old attempt records or silently change
their scheduling meaning. A completed self-marked result is descriptive evidence; the later
forecast work remains separate and must be calibrated before it is presented as a prediction.

## Decisions to preserve

- A set groups ordered questions and may link to several existing lesson and named assessment
  IDs. Exam dates remain owned by `CourseAssessment`; moving an exam must not rewrite attempts.
- A question contains shared source material and bounded nesting: question, part and subpart.
  Ordered arrays determine displayed numbering; stable IDs preserve links and historical
  attempts when content moves. Context-only nodes are allowed. Only answerable leaves may own
  allocations, and a scored parent cannot also count its children's marks.
- A mark allocation contributes its available marks once to the overall total. Dimension and
  concept/skill links describe that allocation; several links never multiply its marks. Unknown
  or unresolved evidence is not zero. An unanswered response is not assigned zero until the
  learner makes that marking decision.
- Attempts preserve the original submitted response and content/scheme version. Self-awarded
  marks, uncertainty, annotations, corrections and assistance context are separate records of
  what happened later. Editing a set cannot alter a past attempt.
- Concepts are the existing identities. The author links them manually in v1; there is no Jev
  suggestion, automatic marking or paid inference dependency. Cards, question attempts and card
  schedules remain distinct evidence streams. Sets have no FSRS state of their own.
- New persisted data is not ready for a schema migration until backup/restore, merge, Course
  share, peer sync, deletion and asset reachability have a jointly reviewed compatibility plan.
  The current application already persists legacy Questions and exposes their types through
  backups, sharing, sync and MCP, so an extra table is not an isolated change.
- Preserve the current post-instruction Question mode, its existing attempt histories and
  schedules. Do not reinterpret partial marks as old FSRS grades or migrate old Question
  evidence into set evidence without a deterministic, lossless rule and restore point.

## Integration map

These are current seams to extend; inspect surrounding code and tests again before each stage.

| Concern | Existing integration locations |
| --- | --- |
| Question domain, attempts and authoring | `src/questions/types.ts`, `domain.ts`, `repository*.ts`, `grading.ts`, `analytics.ts`; current screens `src/pages/QuestionsPage.tsx`, `QuestionEditor.tsx`, `QuestionLearnMode.tsx` and `src/components/questions/` |
| Concepts and cards | `src/questions/concepts.ts`, `src/db/types.ts` (`Card.conceptId`), `src/db/cardRepository.ts`, `src/db/lessonRepository.ts` |
| Dexie schema and upgrades | `src/db/schema.ts` (currently through v28; legacy Question stores were introduced at v24) and `src/db/migrations.ts`; migration upgrades must retain their historical compatibility types |
| Backup, replacement and recovery | `src/questions/backup.ts`, `src/db/backups.ts`, `src/db/importEngine.ts`, `src/db/mergeImport.ts`, `src/db/replacementLifecycle.ts`, `src/db/portability.questions.test.ts` |
| Course share and media | `src/db/share.ts`, `src/db/shareCodec.ts`, `src/db/courseFile.ts`, `src/db/assets.ts`, `src/pages/SharePage.tsx`; course share excludes personal attempts/schedules, while `.lacourse` includes referenced media |
| Peer sync and merge | `src/sync/snapshot.ts`, `src/sync/mergeSnapshots.ts`, `src/sync/manualMerge.ts`, `src/questions/merge.ts`; snapshot version is currently 12 (`lacuna-v12`) |
| Routes and course navigation | `src/App.tsx`, `src/pages/CoursePage.tsx`, `src/components/course/courseSections.ts`, `CourseTabs.tsx`, `CoursePageNavigation.tsx` |
| Path and exam links | `src/course/path.ts`, `src/components/course/PracticeNode.tsx`, `PracticeNodeEditor.tsx`, `src/course/assessmentPractice.ts`, `src/components/course/AssessmentDetailSheet.tsx`; reuse assessment IDs and existing path activity conventions |
| Search, MCP and AI contracts | `src/db/search.ts`, `src/mcp/contracts/questions.ts`, `src/mcp/tools/questions.ts` and its `definitions.ts` / `concepts.ts` modules; new discriminated types must not make existing clients misread legacy Questions |
| UI conventions and browser evidence | `docs/frontend-design.md`, `docs/WEBSITE_TEST_CHECKLIST.md`, `tests/e2e/`; include keyboard, screen-reader, narrow viewport, touch and offline checks where the relevant flow changes |

## Stage 0 — bounded pure-domain slice (complete)

The first authorised slice establishes only the in-memory model and invariants. It is deliberately
not persistence, migration or UI. Its current seam is `src/questions/questionSets.ts`, exporting
`QuestionSet`, nested question/part/subpart and allocation types, `validateQuestionSet` and
`summariseSelfMarking`, with focused unit tests.

- [x] Define ordered set, question, part/subpart, mark allocation, self-mark decision and summary
  types with stable IDs and no database dependency.
- [x] Validate legal nesting, answerability, unique identities, allocation bounds and exact
  allocation/part totals; reject double-counted scored parents.
- [x] Summarise decisions so unmarked/unsure allocations remain unresolved and totals remain
  provisional. Keep unknown distinct from zero.
- [x] Add focused tests for nested structures, invalid identities/depth/marks/options, partial marks,
  unsure/unmarked states, and one-time total accounting.
- [x] Run the targeted test and web typecheck. Record actual commands/results in the change
  report; do not mark this stage complete based only on the types compiling.
- [x] Complete and record the foundation browser smoke check, then commit this slice.

Exit condition: pure domain rules can be exercised without opening Dexie, constructing a React
screen or invoking FSRS. Do not expand this stage with new storage or a generic schema framework.

### Recorded evidence — 26 September 2026

Branch: `feat/question-sets`; starting revision:
`89674b796a1fb412d84b07d160b92db68e7df7f5`.

- Baseline `bun run test src/questions`: 8 files, 62 tests passed.
- First red: the new `questionSets.test.ts` failed to import `./questionSets` before
  implementation. The starting revision has no such module; this was an import-level
  failure, not an assertion-level regression against existing behaviour.
- A subsequent malformed-nesting/aggregate-overflow test failed by assertion before
  the validation guards were added, then passed.
- Final `bun run test src/questions`: 9 files, 70 tests passed, including 8 new tests.
- `bun run typecheck:web`: passed.
- `bunx eslint src/questions/questionSets.ts src/questions/questionSets.test.ts`: passed.
- The worker's focused Prettier check passed. Migration and portability checks belong
  to the storage stages.
- T3 browser smoke on the proposed working tree at `http://127.0.0.1:5179/`, desktop
  1280×800 and narrow 390×844: Welcome course → Questions → New Question rendered,
  with no horizontal overflow in narrow views and no saved content. A browser import
  of the new module returned valid content, a provisional unmarked summary and a
  complete zero-mark summary as expected. This tests the domain in the browser and
  existing navigation, not a new question-set UI.
- Browser testing found retained focus in the departing Questions page when opening
  New Question. A separate route-transition fix releases focus before setting
  `aria-hidden`, preserving animation timing. Its regression was red before the fix
  and green afterwards, including normal/reduced motion; 11 transition tests and the
  web typecheck passed. The React Router warning from direct hash navigation did not
  recur through the visible Back link.
- Final T3 retest in a fresh tab on the same local build: New Question → visible
  Questions Back link passed at 1280×800 and 390×844, with no console warnings/errors,
  no network errors and no narrow-screen overflow. No content was saved. Gate passed.
  This remains evidence for the existing Questions UI and the domain foundation,
  not the planned question-set editor.
- Planning committed as `94820d93`; domain foundation committed as `b1832ab4`.
  Incidental route-focus fix committed separately as `f1f05847`.

Browser screenshots (local T3 artefacts):

- [Desktop editor](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mui7lp8e-0af68bd7.png)
- [Desktop library](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mui7lt8y-1683a416.png)
- [Narrow editor](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mui7m1kx-9ca13b0f.png)
- [Narrow library](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mui7m68j-5d2cb684.png)

The validator accepts typed values; it is not an untrusted JSON parser. The storage
stage must add runtime parsing before using it at import, sync or repository boundaries.
Aggregate marks are bounded to safe integers so summaries remain exact.

## Stage 1 — persistence and compatibility design

The [authored-content persistence contract](question-sets-persistence.md) defines the next
slice. Attempt records, drafts and their detailed lifecycle remain for a subsequent slice;
this does not mark all of Stage 1 or Stage 2 complete.

### Authored-content design gate — 26 September 2026

- Resumed in the isolated `Lacuna-question-sets` worktree, preserving unrelated Share
  prototype edits in the original checkout. Merged committed `master` at `d1338cc5`
  as `7ee987be`; the sole changelog conflict retains both sets of entries.
- Web typecheck and 73 focused Question/route-transition tests passed after the merge.
  Focused formatting and `git diff --check` passed.
- T3 browser at `http://127.0.0.1:5181/`, 1280×800: fresh visitor → Start revising →
  Share → Welcome course → Questions passed, with no console warnings/errors or
  network errors. This is a planning/compatibility smoke check of the existing UI.
  The new editor and storage have not passed their gates yet.
- Reviewed aggregate identity, versions, deletion, media and backup/share/sync boundaries
  with Sol and a separate Luna audit. The audit identified published-course lineage as
  an additional required boundary; fresh imports alone cannot prove sharing compatibility.


Complete this before writing a migration or adding persisted collections. Review the data shape
against every compatibility boundary in the integration map and agree one versioning plan.

- [x] Decide whether sets become a distinct entity around existing Questions or whether existing
  Question definitions evolve in place. Specify stable-ID mapping and how old fixed/generated
  definitions are represented without changing their schedule or history.
- [ ] Specify records and indexes for authored set content, lesson/assessment links, attempts,
  answer snapshots, allocations, decisions and annotations. Identify what is canonical, what is
  derived, and how content/scheme revisions are pinned by an attempt.
- [x] Specify media references and garbage-collection reachability for authored source diagrams,
  question content and retained attempt receipts. A set must not lose an image after it is edited
  or deleted while historical attempts still refer to it.
- [x] Specify ownership and deletion rules: deleting a set/content revision, a concept, lesson,
  assessment or course; retain personal attempts as readable evidence where the brief requires it.
- [x] Specify conflict handling for concurrent authored edits and immutable attempt-ID collisions
  in local recovery and peer merge. Do not apply `updatedAt` last-writer-wins to immutable
  submitted evidence.
- [x] Specify forward and backward compatibility for current backup v11, sync snapshot v11,
  Course share v3 and `.lacourse` file v1. Decide if each envelope version increments, whether
  old readers fail closed or preserve unknown data, and which metadata is intentionally excluded.
- [x] Specify the pre-migration snapshot/restore path for existing beta data and the failure mode
  if the snapshot cannot be made. Existing destructive schema work requires a recoverable point.
- [x] Audit direct database table lists, transaction scopes, repository projections, replacement
  exclusions, tombstones, diagnostics, import validation and asset scans for all four current
  Question stores plus any proposed records.
- [x] Run and record the browser gate, then commit the reviewed compatibility design.

Exit condition: a reviewer can trace one set and one attempt through local save, backup replace,
recovery merge, Course share import/export, peer sync, deletion and restore without data becoming
orphaned, silently dropped or reinterpreted.

## Stage 2 — durable repositories and portability

Implement the approved versioning design in small slices. Repository APIs own validation and
transactions; UI and MCP must not write raw rows. Every new record remains behind compatibility
normalisers until it has passed its validators.

- [ ] Add schema upgrade(s), repositories, indexes, validation and transaction boundaries for
  sets and attempts. Keep pure domain modules independent of Dexie.
- [ ] Add deterministic backup normalisation, export, replace-import and recover-merge behaviour.
  Prove older v11 backups retain current meaning and new backups round-trip the added content.
- [ ] Extend Course share and `.lacourse` codecs to carry authored sets and required media while
  excluding personal answers, self-marks, annotations and scheduling state.
- [ ] Extend peer snapshots, tombstones and merge to converge authored bundles while preserving
  each user's attempt history and failing closed on immutable receipt collisions.
- [ ] Extend deletion cascades and asset reachability. Test remove/restore around referenced media
  and retained historical attempt snapshots.
- [ ] Update backup, snapshot, share and file validators and version documentation. Keep ordinary
  CSV/TSV/Markdown/Anki exports Card-only unless the product brief is explicitly revised.
- [ ] Add migration, legacy compatibility, round-trip, collision and recovery tests that fail on
  merge-base and pass with this work. Test upgrades from representative live schema versions;
  do not test only a freshly created database.
- [ ] Run and record browser save/reload and relevant portability/recovery checks; commit
  the validated persistence slices regularly.

Exit condition: a backup or sync replica can be restored and the same content and evidence
semantics survive. Existing Question schedules and attempt records have explicit regression
coverage.

### Authored-content storage gate — 26 September 2026

The authored-content portion of Stage 2 is implemented. Attempts, drafts, annotations and
retained attempt media remain unimplemented, so the combined stage checkboxes above remain open.

- [x] Schema v28, strict aggregate codec and transactional repositories, with same-course
  references, required stale-save detection and monotonically increasing mutation stamps.
- [x] Concept deletion protection, Lesson/Assessment unlinking, Course deletion and undo;
  lesson undo restores its link without overwriting intervening edits to the set.
- [x] Backup/peer v12, replacement, recovery, deletion receipts and deterministic set merge.
- [x] Course-share v4 and `.lacourse` v1 content/media round trip with fresh identity mapping.
- [x] Published set updates reject conflicting local edits/deletions atomically. Published
  export/import of assessment-linked sets fails explicitly until assessment lineage is supported.
- [x] Media garbage collection and sync size/ownership accounting include current set content.

**Automated evidence:** schema v28 regression failed at baseline `7ee987be` by assertion
(`expected 27 to be 28`). The new course-file set regression failed at that baseline because
`questionSetRepository` did not exist, then passed on the implementation. Additional tests
cover malformed rows/graphs, old backups, raw v23 migration, revisions, deletion/undo, recovery
followed by peer sync, same-ID course collisions, equal-time convergence, media and share privacy.
The broad `src/db src/sync src/questions src/shareLinks` run passed **101 files / 1,048 tests**;
the final web/server/Electron typecheck and focused ESLint passed. After extracting the shared
set helpers, 75 relevant share/lineage/course-file tests passed. MCP lineage guard tests passed
13/13; the local-set guard failed by assertion at baseline (`expected true to be false`).
The final browser recheck after extraction retained the set, diagram and legacy attempt with
clean diagnostics. One earlier broad run had a session-history snapshot
failure; the unchanged assertion passed on five focused reruns, three full course-repository
reruns and the final broad run. No assertion was relaxed to make it pass.

**Browser evidence:** T3 on `http://127.0.0.1:5183/`. The origin initially ran baseline
`7ee987be` with schema v27 and a completed legacy Question attempt. The server was then switched
to the implementation, preserving the same browser database. Schema v28 opened with a
pre-migration snapshot and an empty new store; legacy Question, attempt, Cards and Concepts
compared exactly with their saved pre-upgrade values.

Browser repository/API checks on that real IndexedDB database then proved:

1. A nested biology set with a diagram, subparts, all three allocation dimensions, and
   Lesson/Assessment/Concept links survives save and reload.
2. Backup replacement restores the set and image and retains the existing restore point.
3. Recovery merge followed by peer self-merge retains restored sets. The first browser run
   caught an old tombstone deleting a recovered set; the regression and browser retest now pass.
4. Peer merges select a newer authored revision, commute for the tested replicas and honour
   deletion receipts. Card and legacy Question evidence remain separate.
5. Course-file export/decode/import preserves the image, remaps links into the imported Course
   and copies no personal attempts.
6. Published-set import and a teacher update work; a conflicting local edit blocks the next
   update without advancing the imported revision. Assessment-linked published export reports
   the unsupported boundary instead of producing an unusable share.
7. The actual old reader at `7ee987be`, served separately on port 5184, rejects `lacuna-v12`.
   The same reader accepts a numeric-only version bump, confirming why the marker is required.

Final existing-UI smoke: Questions → New Question → visible Questions Back link at 390×844,
plus the Questions library at 1280×800. No horizontal overflow, console warnings/errors or
network errors. These screenshots show the **legacy interface after the storage changes**,
not the planned set editor:

- [Desktop library](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-muirje5s-18c2e9e8.png)
- [Narrow library](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-muirjn1i-7c3bbc79.png)
- [Narrow legacy editor](/Users/tj7755/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-muirk8wp-81f67596.png)

**Remaining boundaries at this gate:** no new set editor or learner UI, draft/attempt persistence, set-aware
sharing summaries or path/exam entry points. MCP lineage preview/apply rejects sets until it
can accurately preview their changes. No Jev, automatic marking or exam-score forecast is added.

### Local author-draft storage gate — 26 September 2026

- [x] Incomplete drafts in device-local `appState`, with nested runtime parsing, explicit
  corruption errors and revision-based stale-write protection.
- [x] Atomic complete-set save and draft removal through the existing repository.
- [x] Immutable add/remove/reorder helpers for questions, parts and subparts.
- [x] Draft media retention and Course deletion/undo, including fresh restored revisions.
- [x] T3 browser: reload recovery, rejected invalid/stale saves, unchanged saved content,
  successful complete save/removal, backup exclusion, draft-only media retention/release,
  and Course deletion/undo with stale-tab rejection.

Validation: 115 tests passed across draft storage, editing helpers, asset cleanup and
Course repository coverage. Baseline `aa6a0eb5` fails the new draft API import and the
draft-media retention assertion; the proposed implementation passes both. Full web,
server and Electron typechecks and focused ESLint passed.

Drafts remain excluded from backup/share/sync. Live upload protection belongs to editor
integration. Personal attempts, learner UI and the authoring UI remain unimplemented.
The prompter has assigned the UI redesign to the primary agent, not Sol or Luna;
stop after this storage gate before starting that redesign.

## Stage 3 — authoring and validation

Build on the existing Questions tab and editor conventions, but introduce a set workspace rather
than squeezing a paper hierarchy into the current single-question form.

- [ ] Add set library and overview states in the existing Questions route: Study and Author modes,
  search/filters, continue practice, status, marks and compact set rows.
- [ ] Add the title-first authoring workspace, outline, document editor and narrow-screen drawer
  described in the brief. Save local drafts with clear Saving/Saved/Retry states.
- [ ] Present Question, Mark scheme and Links as separate steps, with one active part
  and one expanded allocation at a time. Keep outline and set settings on demand.
- [ ] Add question/part/subpart editing with stable IDs, automatic labels, keyboard reorder,
  context-only nodes, answer formats and shared Markdown/media source material.
- [ ] Add mark-scheme and author-defined allocation editing, including partial marks, alternatives,
  dependencies and holistic criteria without forcing an assessment-objective split.
- [ ] Add manual Atomic concepts / skill linking by extending existing Concept and card search.
  Show related cards before saving links; never create a duplicate concept from a card entry point.
- [ ] Add preview using the actual learner renderer. Drafts may be incomplete; practice/share
  actions require valid answerable content, allocation totals and media references.
- [ ] Prove reorder preserves IDs and historical attempt lookup, and removing/rewriting content
  cannot mutate an existing attempt snapshot.
- [ ] Verify desktop and mobile layout, keyboard-only use, accessible names and focus order,
  browser back/filter restoration, autosave recovery and offline editing.
- [ ] Record the authoring browser gate and commit the validated slice.

Exit condition: an author can create, edit, preview and validate a complete set with manual links,
without configuring lesson/exam/concepts before writing. The set library and unanswered
learner view do not expose the scheme; author preview can exercise the full marking flow.

## Stage 4 — practice, self-marking, annotations and resume

- [ ] Implement Practice and Paper feedback timing. Practice reveals feedback after the
  independent question/dependency group; Paper stores responses until paper submission. Do not
  add a timer to v1.
- [ ] Persist a presentation/attempt snapshot before display and save partial answers as the
  learner moves. Preserve original answer separately from later correction.
- [ ] Add explicit unanswered-part handling before submission; record assistance when a learner
  opens related cards/lessons before submitting.
- [ ] Implement side-by-side desktop answer/scheme and a single-flow small-screen marking view.
  Decisions must support zero through maximum, partial credit where configured, and a distinct
  Unsure state without defaulting to zero/full marks.
- [ ] Show one active answerable part during answering and one active criterion during
  marking, preserving parent context and dependent-part feedback rules. Capture both
  states in desktop and narrow-screen gate screenshots.
- [ ] Add accessible text highlighting, comments and Add note controls. Keep annotations separate
  from the original answer. Pen drawing is out of scope.
- [ ] Add optional multi-reason reflection and a separate corrections area; neither silently
  changes first-attempt evidence.
- [ ] Add Save and finish later, resume at the active question/scroll location, return to the
  originating entry point and preserve library filter/scroll state.
- [ ] Keep self-marked results labelled as such; show unresolved decisions as provisional and
  completion separately from score. Repeating creates a new attempt.
- [ ] Add tests for close/reopen resume, Paper reveal timing, dependency groups, answer snapshot
  immutability, assisted exposure, annotation persistence and zero-mark completed attempts.
- [ ] Run touch and browser evidence on supported web targets and packaged desktop as applicable;
  specifically check focus, selection-based annotation, enlarged diagrams and long answers on
  narrow screens.
- [ ] Record the learner-flow browser gate and commit the validated slice.

Exit condition: an attempt can be answered, left, resumed, self-marked, annotated and completed
without loss or accidental conversion of unknown/unsure to zero.

## Stage 5 — sharing, path and exam entry points

These depend on the persistence work and can then proceed in parallel UI slices.

- [ ] Publish/import a set through existing course sharing, assigning fresh local identities where
  required and leaving learner attempts private. Include required referenced media in `.lacourse`.
- [ ] Add an optional **Practice Qs** path activity after a lesson by extending existing path and
  practice-node models. Preserve stable activity IDs and existing Path completion behaviour.
- [ ] Show related sets from the lesson and assessment detail views, and support return to the
  original path/lesson/exam entry point after practice.
- [ ] Link sets to existing assessment IDs, not copied dates. Moving an exam changes planning
  context only; historical attempt timestamps, marks and content versions stay fixed.
- [ ] Expose related questions in card detail through existing Concept relationships. Manual links
  only; no Jev/classifier or paid suggestion call in v1.
- [ ] Add duplicate/import, missing-media, stale-assessment, set-removal and offline share/import
  regression cases.
- [ ] Record the sharing/path/exam browser gate and commit the validated slice.

Exit condition: the same set is reachable from library, lesson, assessment and optional path
activity without creating a parallel course hierarchy or requiring a library detour to resume.

## Stage 6 — descriptive analytics and release evidence

- [ ] Add set and attempt statuses, self-marked earned/available totals and dimension summaries.
  A mixed allocation contributes once overall and is not fabricated into dimension evidence.
- [ ] Show sample sizes, self-marked provenance, assistance, repeated/unseen context, coverage
  gaps and unknown values. Keep question marks separate from card recall/schedule analytics.
- [ ] Do not use repeated exposure as unseen transfer, corrections as original performance, or
  marks as calibrated exam probability. No combined numeric exam forecast in this stage.
- [ ] Add actionable recommendations only where evidence supports them (for example, related
  card review or a fresh question); do not manufacture card failures or cross-write FSRS state.
- [ ] Add regression coverage for denominators, multi-concept allocations, zero marks, incomplete
  marking, exclusions, repeats and coverage gaps.
- [ ] Complete the relevant browser checklist and release review: backup/restore, cross-device
  sync, share privacy, keyboard/screen-reader use, mobile layout, and offline launch/navigation.
- [ ] Record the analytics/release browser gate and commit the validated slice.

Exit condition: released analytics describe observed evidence and clearly expose its limits.

## Stage 7 — calibrated exam forecast (follow-up, not v1 completion)

- [ ] Define the assessment blueprint, representative mark distribution and evidence provenance
  before selecting a statistical model. Question counts alone are not exam topic weights.
- [ ] Collect later, preferably unseen and timed outcomes with independent marking on a sample;
  retain self-marked provenance and expose uncertainty/coverage.
- [ ] Evaluate on held-out learners, question families and later periods. Compare against recall-only
  and recent-question baselines; audit calibration and subgroup failure modes.
- [ ] Prevent duplicate evidence when several cards or concepts inform one allocation. Treat
  missing coverage as unknown, not zero, and preserve dependencies between parts.
- [ ] Ship a numeric estimate only after measured calibration supports it. Otherwise retain the
  descriptive card recall + question evidence view proposed by the brief.
- [ ] Record the forecast browser gate and commit the validated slice before release review.

## Regression and validation contract

Every intentional behaviour change needs an automated regression that fails at merge-base and
passes at the proposed head; tests must not weaken existing assertions to obtain a pass. Include
the current Question v1 tests in targeted runs whenever shared legacy behaviour is touched.

Useful repository commands (run the narrow suite for the slice, then typecheck; broaden only when
the touched integration boundary requires it):

```sh
bun run test src/questions/questionSets.test.ts
bun run test src/questions src/db/portability.questions.test.ts src/db/share.test.ts src/db/courseFile.test.ts src/sync/mergeSnapshots.questions.test.ts
bun run typecheck:web
bun run test:e2e:web
```

The first command applies once the pure-domain test file exists. The second is a broad example for
storage/share/sync integration, not a substitute for running each relevant migration, recovery,
UI or browser test. For destructive migration work, compare an intended merge-base build/database
with the proposed version and prove both the generated restore point and recovery path. Record the
actual commands and results in the implementation report; this plan does not claim any command
has already passed.

## Out of scope for v1

Jev or another classifier suggesting links; automatic marking; classroom assignment collection;
freehand annotation; timed papers; arbitrary user-authored executable generators; a mixed
Cards-and-Questions FSRS session; Question-set FSRS state; and a numerical exam-day forecast
without calibration. Future work can revisit these with separate evidence and design review.
