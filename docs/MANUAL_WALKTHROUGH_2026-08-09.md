# Manual walkthrough record — 9 August 2026

## Scope and environment

- Evidence commit: `ea29734a47ff25d1ea9fed5551a60d1883039cee`
- Commit subject: `fix(course): streamline lesson creation and renaming`
- The browser pass began before this walkthrough, its supporting reports and the checklist were
  committed. Those documentation-only changes are now recorded together and do not alter the
  application evidence captured against the commit above.
- Package manager: Bun 1.3.14
- Production command: `bun run preview --host 0.0.0.0`
- Production URL: `http://127.0.0.1:4173/`
- Browsers used: Helium on macOS for the first partial pass, then the T3 collaborative preview for
  the successful continuation
- T3 viewports: 1280 × 800 desktop and 375 × 667 iPhone SE portrait
- Checklist target: `ea29734a47ff25d1ea9fed5551a60d1883039cee`

This is not a release sign-off. The checklist now targets the commit actually tested below, and the
documentation produced by the run is committed as a single release record. Browser automation became
unable to send input during the first pass, then recovered in the T3 collaborative preview for two
continuations. Untested cases are recorded as untested, not quietly promoted to passes.

## Release gates

| Check | Result | Evidence and nitpicks |
| --- | --- | --- |
| `bun install --frozen-lockfile` | Pass | Checked 1,019 installs across 1,093 packages; no changes. |
| `bun run typecheck` | Pass | Web, Electron, preload and MCP TypeScript projects passed. |
| `bun run lint` | Pass | No ESLint findings. |
| `bun run test` | Pass with noisy stderr | 194 files and 1,723 tests passed in 69.32 seconds. See warning inventory below. |
| `bun run build` | Pass with warnings | 2,537 modules transformed; production and service-worker files generated. See build warning inventory below. |
| `bun run preview --host 0.0.0.0` | Pass | Production preview started at port 4173. |
| Direct load | Pass | Empty profile loaded at `#/welcome`. |
| Hard refresh | Pass | The active course reloaded with persisted data; a later reload also passed with the preview server stopped. |
| Browser console clean | Fail | T3 captured a CSP refusal for a `data:` WOFF2 font and an `Uncaught` entry on production load. |

## Test and build warning inventory

These do not fail the current gates, but a green line surrounded by warnings is still warning debt.

1. Several component tests emit `KaTeX doesn't work in quirks mode`. Affected test groups observed:
   `LearnMode`, `ItemStagingReview`, `LessonView`, `MarkdownView`, `CardContent`,
   `MathsAnswerInput`, `NumericAnswerEditor` and `BatchAuthoringPromptDialog`. The production document
   does have a doctype; the test harness does not reproduce that condition cleanly.
2. React Router v7 migration warnings recur across route-based tests for both
   `v7_startTransition` and `v7_relativeSplatPath`. The warnings are repetitive enough to obscure
   useful stderr.
3. React `act(...)` warnings occur in `LearnMode`, `SequenceEditor`, `OcclusionEditor`,
   `LessonManagementSection` and `AddLessonControl` tests. These mean the tests may assert before all
   user-visible state settles; passing is not proof that the timing is sound.
4. Recharts emits zero-width/zero-height warnings in several `LearnMode` cases. Chart tests are
   exercising an invalid container size and therefore do not prove the rendered chart is usable.
5. `MarkdownView` tests emit multiple aborted iframe fetches and network errors for YouTube and
   Vimeo embeds during teardown. Expected teardown noise should be suppressed or isolated.
6. One `QuestionBank` test logs `No routes matched location "/course/course-1/cards/new"` while
   passing. That test does not mount a complete enough router to verify the navigation it triggers.
7. Share-code rejection tests print full validation failures to stderr. The rejection is intentional;
   the console noise is not useful in a successful run.
8. A migration test logs that another connection wants to delete the test database. It passed, but
   the cleanup protocol is noisy and could conceal a real IndexedDB lifecycle problem later.
9. The expected `ToastProvider` error-boundary test writes React's full component error to stderr.
10. Vite reports that `src/db/assets.ts` and `src/db/backups.ts` are both statically and dynamically
    imported, so the dynamic imports do not create separate chunks.
11. Vite reports production chunks over 500 kB. Largest observed uncompressed JavaScript chunks:
    `markdown` 777.82 kB, `app` 665.62 kB, `charts` 416.65 kB, `index` 375.19 kB and `vendor`
    327.24 kB. This is a performance warning, not a release failure by itself.
12. The generated PWA precache contains only five entries totalling 1,108.72 KiB. Offline behaviour
    was not verified, so the small entry count should not be interpreted as proof of a problem.

## Manual walkthrough results

### First run and landing page

| Case | Result | Observation |
| --- | --- | --- |
| Empty profile redirects to `#/welcome` | Pass | Direct production load opened the welcome route. |
| Main heading and explanatory copy render | Pass | Heading was exposed correctly as level 1. |
| Seeded dashboard illustration renders | Pass | The first illustration had a useful accessible description and no broken-image indicator. |
| Both seeded SVG illustrations render | Partial | One dashboard illustration was observed. The second could not be conclusively identified before input failed. |
| Exam-date demonstration exposes a control | Pass | Slider was exposed with the name `Exam date in weeks from today`, value 12 and increment/decrement actions. |
| Interactive grading demonstration starts | Pass | `Show answer` revealed the answer and Yes/No controls. |
| Yes grading path | Pass | Yes produced a timed inferred grade and changed mock exam impact. |
| No grading path | Pass | No produced `Again` and a negative per-card exam impact. |
| Three-card sequence | Pass | Progress advanced from card 1 to 3 and ended in a session-complete state. |
| Course-path demonstration | Partial | Notes and Cards advanced to Done; the final Exam step was not completed before input failed. |
| Landing CTA seeds Welcome once | Not verified | Controller input failed before a trustworthy on-screen CTA click. |
| Reload does not duplicate Welcome | Not verified | Depends on the preceding case. |
| Delete Welcome and do not recreate | Not verified | Destructive case was not started without a verified backup. |
| `#/method` and interactive charts | Not verified | Input failed before route navigation. |
| Welcome/Method/application history animation | Not verified | Input failed before route navigation. |

### Landing-page nitpicks

1. In the light theme, `Create your first course` uses low-contrast orange text on a pale orange
   fill. It looks disabled even though it is the primary action.
2. `TRY ONE CARD FIRST` and `IMPORT ANKI / JSON` are fainter still. They read like decorative
   letter-spaced labels until the accessibility tree reveals that they are controls.
3. The landing page uses mixed casing for actions: sentence case for the primary CTA, uppercase for
   secondary actions, then sentence case again inside the demos. The hierarchy is not improved by
   this inconsistency.
4. The grading result header exposes an `AGAIN` button beside the cumulative exam delta. Visually and
   semantically, `Again` is easily confused with the inferred FSRS grade named Again. A reset action
   should say `Restart demo`.
5. The accessibility text around the first response collapses spacing into strings such as
   `exam ΔR + 0.4 %`. The visible copy also places a space before `%`, which is typographically odd.
6. The demo reports grades with doubled whitespace in the accessibility text, for example
   `Inferred grade:  Hard` and `ANSWERED IN  7.3 S`.
7. The completion copy says `You pressed one button per card`; the user actually presses Show answer
   and then Yes or No, plus Next between cards. The intended claim is about grading buttons, but the
   sentence is literally false.
8. The top-right `SMOOTH SCROLL ON` control is exposed as a toggle button and remains permanently
   prominent. It reads like an implementation/debug control rather than product navigation.
9. `Study all — try a demo card` is the accessible name of the dashboard illustration's button,
   while the nearby hero action says `TRY ONE CARD FIRST`. Two separate routes into the same demo use
   different labels.
10. Locked sections repeat `Complete the lesson above to unlock this node` three times in close
    succession. The repetition makes the page longer without adding information.
11. `Connect your own AI assistant` promises an explicit one-time permission per course and instant
    undo. This is strong behavioural copy; it should remain tied to tests because it is easy for
    implementation and marketing copy to diverge.

## Browser and controller limitations

1. The T3 collaborative preview opened the production URL but every snapshot failed.
2. Even evaluating `location.href` in that preview timed out after 15 seconds.
3. Opening a replacement collaborative-preview tab failed.
4. The browser runtime fallback reported `No browser is available`.
5. Helium could be controlled through macOS accessibility and supplied useful screenshots and an
   accessibility tree for the landing walkthrough.
6. Helium later returned `noWindowsAvailable` for input despite continuing to return the Lacuna
   window and accessibility tree for reads. Raising the window did not make subsequent input
   reliable.
7. Off-screen controls remained in the accessibility tree with stale or absent hit regions. One
   attempted off-screen click advanced a different currently visible step, so off-screen click
   results were discarded rather than recorded as passes.
8. Because the failure is in the control surface rather than a reproducible Lacuna action, it is not
   filed here as an application defect.

## Untested checklist sections

The following sections of `docs/WEBSITE_TEST_CHECKLIST.md` remain untested in this run:

- application shell and navigation;
- dashboard and course lifecycle;
- course path and shared course tabs beyond the landing mock;
- lesson notes, annotations and membership;
- question bank and bulk authoring;
- classic, numeric, working, sequence and occlusion editors;
- lesson study, FSRS practice and continuous course flow;
- revision plans and practice milestones;
- course and global settings;
- global search and command palette;
- analytics;
- sharing, publishing and lineage updates;
- import, export and backups;
- help and discoverability;
- mobile, dark-theme, reduced-motion, zoom, keyboard, touch, offline, resilience and privacy passes;
- Electron-only boundaries and smoke tests;
- final backup restoration and release sign-off.

## Continuation with the collaborative preview

The production preview was rebuilt and restarted later in the same run. The T3 collaborative
preview then attached successfully at 1280 × 800 CSS pixels and at the iPhone 12 Pro portrait
preset. This does not erase the controller failures above; it records the later recovery and the
additional cases that became testable.

### Additional results

| Case | Result | Observation |
| --- | --- | --- |
| Production rebuild and preview restart | Pass with warnings | Type checking and the production build completed; the same dynamic-import and large-chunk warnings remained. |
| Hard refresh | Pass | `Cmd+R` reloaded the active course and preserved the selected dark theme and collapsed-sidebar preference. |
| Browser console clean | Fail | Initial load and hard refresh log a CSP refusal for a `data:` WOFF2 font plus an `Uncaught` exception entry. The app remains interactive, but the release gate says the console must be clean, not clean apart from the errors. |
| Visible global navigation | Pass | Dashboard, Search, Share, Analytics, Settings and Help all opened from the sidebar. |
| Search palette | Pass | The visible Search control opened a modal, focused its input, returned matching notes and cards for `lesson`, and closed with Escape. |
| Course sidebar link and card | Pass | Both opened the seeded Welcome course. |
| Course tabs | Pass | Path, Question bank, Analytics and Settings rendered and cross-linked for the seeded course. |
| Seeded question bank | Pass | All 30 cards appeared grouped under the four seeded lessons with authoring actions. |
| Seeded analytics | Pass | Lesson breakdown and empty-history states rendered without a blank route. |
| Blank new-course name | Pass with UX defect | Pressing Create with an empty name did not create a course, but produced no visible validation message. |
| Create named course | Partial | `Walkthrough disposable` was created once. The dialog has no exam-date control, so the checklist's combined name-and-exam-date case cannot pass as written. |
| One-lesson course routing | Pass | The new course opened its sole lesson directly instead of showing a one-node path. |
| Note creation and rendering | Pass | A titled note containing a heading, list, inline maths and inline code previewed correctly, saved and expanded correctly. |
| Front/back card creation | Pass | A Markdown-backed front/back card saved, returned to the lesson and updated dashboard and sidebar counts to one new card. |
| Lesson notes before cards | Pass | Study opened on the lesson-note stage and Continue entered Simple learn. |
| Simple learn No/Yes loop | Pass with progress nitpicks | No returned the card to the queue; Yes then completed the lesson. The report showed two review attempts and 50% correct. |
| Simple learn versus FSRS state | Pass | After finishing, the card remained new/unmapped and ready for scheduled review; Simple learn did not write normal FSRS history. |
| Completion hand-off | Pass | The step-complete view offered Continue, Review due cards and Finish for now, and Finish for now returned to the lesson. |
| Theme persistence | Pass | Dark mode applied and survived a hard refresh. |
| Desktop sidebar persistence | Pass | Collapse survived a hard refresh and could be expanded again. |
| Mobile drawer | Fail | It opens as a Navigation dialog, initially focuses Close navigation and traps Tab focus. Closing it leaves focus on the hidden sidebar's New course control instead of returning focus to Open navigation. |
| Method page | Partial | The page, equations, charts, coefficient controls and benchmark tabs render. Pointer clicks change chart values and benchmark metrics. The chart sliders are not keyboard-operable. |
| Legacy `#/deck/<id>` and `#/study` routes | Pass | Both redirected to the dashboard. |
| Invalid route recovery | Fail | `#/definitely-not-a-route` renders React Router's generic `Unexpected Application Error! 404 Not Found` page with no Lacuna navigation, explanation or recovery link. |

### Confirmed defects

1. **Production console is not clean.** The CSP blocks an embedded `data:` WOFF2 font and an
   uncaught exception is logged on load. This is a checklist failure even though the visible app
   continues to render.
2. **Mobile drawer focus restoration is broken.** Closing Navigation moves focus to a hidden New
   course button, not the control that opened the drawer.
3. **Method chart sliders are mouse-only.** Elements expose `role="slider"`, `aria-valuenow` and
   `aria-valuetext`, but clicking one does not focus it and arrow keys do not change its value.
4. **Several Settings controls have no accessible name.** The primary-navigation visibility
   switches, Start Learn sessions in Focus Mode switch, practice-threshold inputs and Pomodoro
   duration inputs are exposed with empty names.
5. **The new-course flow does not match the release checklist.** The dialog accepts only a course
   name and silently assigns an exam date seven days away. There is no way to supply the "valid name
   and exam date" required by the documented case.
6. **Invalid routes have no useful recovery state.** They fall through to React Router's generic
   development-style error page instead of a branded not-found message and dashboard link.

### Additional visual, copy and accessibility nitpicks

1. Blank new-course submission fails silently. A disabled Create button or a short inline error
   would explain the constraint; doing nothing is ambiguous.
2. Lazy navigation changes the hash before the destination is visible. The previous route can
   remain on screen for roughly 0.7–1.2 seconds, including the new-course modal after the course URL
   has already appeared. No skeleton was observed during those transitions.
3. Saving one card exposed `Card added.` twice in the accessibility text. Even if only one toast is
   painted, two live-region announcements would be needless screen-reader noise.
4. Text-size controls have accessible names `ASmall`, `ADefault`, `ALarge` and `ALarger`. The
   decorative sample letter has been concatenated into the label without a separator.
5. The Method page's dark-theme chart labels are small and low-contrast. The monospace labels are
   substantially harder to scan than the surrounding body copy at a 1280-pixel desktop viewport.
6. The Settings page uses similarly low-contrast secondary text and sidebar counts in dark mode.
   The type is legible, but too much of the hierarchy relies on dim grey against near-black.
7. The selected accent swatch has a double pale ring that resembles keyboard focus even after a
   pointer action. Selected and focused states should not look interchangeable.
8. Method benchmark statistics repeat their explanatory labels in the accessibility text, making
   each number sound duplicated.
9. Date language is inconsistent for the disposable course: the dashboard says `EXAM IN 7 DAYS`
   while the course header settles on `8 days to go` for the same 16 August date on 9 August.
10. After one card is answered No and then Yes, the completion copy says `2 cards reviewed`. That is
    two attempts on one card, not two cards, so the noun is misleading.
11. After No on a one-card Simple learn queue, the progress strip still reads `0 wrong, 1 current`.
    The current state may intentionally take visual precedence, but it hides the fact that the card
    is in the wrong/retry state and makes the stated counters look false.

## Further continuation: remaining browser-accessible flows

The same T3 profile was reused. `Walkthrough disposable` was deliberately expanded to two lessons
and eight cards. The second recording is
`/Users/TJ7755/.t3/userdata/browser-artifacts/browser-recording-mslr9di7.mp4` (21,338,846 bytes).

### Authoring, sharing and storage results

| Case | Result | Observation |
| --- | --- | --- |
| Rename lesson | Pass | `Lesson 1` was renamed to `Foundations` with Enter. |
| Add a second lesson | Pass | `Applications` was created and opened directly. The old checklist note that creation returns to the course path is no longer true on this commit. |
| Cloze validation and save | Pass | Plain text was rejected with an explicit `{{c1::answer}}` example; a valid cloze saved. |
| Reversed card generation | Pass | One authoring action created exactly two independent cards and increased the course count by two. |
| Numeric exact validation | Pass | `x+1` was rejected as non-numeric; `3/4` was accepted and saved. |
| Working scheme compilation | Pass | Two criteria compiled to two marks, `2x = 8` then `x = 4` marked 2/2, and the result could be pinned as a passing fixture. |
| Procedure sequence | Pass with defects | Two labelled steps produced exactly two cards and returned to the lesson. See the badge, validation and naming defects below. |
| Sequence editing surface | Pass | Procedure-specific wording changed `Chunks` to `Phases` and `Items` to `Steps`; the live preview updated to two generated cards. |
| Batch-authoring prompt | Pass | Notes, topic and level were accepted; the review tab opened and rejected an incomplete response with the required sentinel-block wording. |
| Occlusion entry | Partial, environment-blocked | The editor, modes, region count and disabled zero-region save state rendered. T3 and Computer Use could focus `Upload diagram`, but neither opened a file chooser, so drawing, pairing and regeneration were not tested. |
| Share-code export | Pass | The disposable course produced a 1,436-character share code. The page states that schedules and media are excluded. |
| Share QR generation | Pass | A Base45 QR view was produced with copyable text. Camera scanning was not available. |
| Invalid share code | Pass with announcement defect | `not-a-lacuna-code` was safely rejected without changing courses. The error was announced twice. |
| Full backup export | Pass | A 52,083-byte JSON backup was saved as `/Users/TJ7755/Downloads/lacuna-backup-2026-08-09.json`. |
| Automatic restore point | Pass | `Back up now` added a 12:55 restore point reporting six lessons and 38 cards across both courses. Restore and deletion were not invoked. |
| Help content | Pass | Course, study, scheduling, card-type, sequence, diagram and best-practice sections rendered and remained readable at desktop and iPhone SE widths. |

### Study, responsive and resilience results

| Case | Result | Observation |
| --- | --- | --- |
| Standard due-card review | Pass | A due review opened, revealed the answer and exposed No/Yes grading. |
| Study card-action menu | Pass | Edit, Flag, Bury, Suspend and Keyboard shortcuts were available from the current card. Destructive or scheduling-changing actions were not selected. |
| Shortcut sheet | Pass | The sheet listed global and study shortcuts and closed with Escape. |
| Silent grading shortcut | Pass | `n` graded the revealed card wrong and advanced the session. |
| Undo shortcut | Pass | `u` restored the pre-review state and predicted score. |
| Focus Mode | Pass | `f` hid study controls and exposed `Show study controls`; a second `f` restored them. |
| iPhone SE dashboard | Pass with contrast nitpick | Content reflowed without document-level horizontal overflow. Inactive weekday labels are extremely dim in the dark theme. |
| iPhone SE lesson | Pass | Header statistics, notes and card list reflowed into a single column. The main pane, not the document, is the scroll container. |
| iPhone SE Settings | Fail, small visual defect | The `ALarger` text-size button ends at x=379.625 in a 375-pixel viewport and is clipped by about 4.6 pixels. Document overflow remains hidden, so horizontal-scroll checks alone miss it. |
| Offline hard reload | Pass | With both Vite servers stopped, `Cmd+R` restored the full course route, navigation and persisted data from the service worker. |
| Electron development launch | Partial, environment-blocked | The inherited `ELECTRON_RUN_AS_NODE=1` makes bare `bun run electron:dev` run Electron as Node. Removing that variable started Electron and its renderer, but Computer Use returned `cgWindowNotFound` for the frameless window, so native menus, updates, MCP boundaries and titlebar interactions were not manually verified. |

### Newly confirmed defects and nitpicks

7. **Working and sequence cards are visibly mislabelled.** The saved Working card and both generated
   sequence cards carry the `FRONT / BACK` type badge. The sequence cards also carry a secondary
   `Sequence` badge, but that does not excuse the primary type being wrong.
8. **Several authoring and sharing fields are unnamed in the accessibility tree.** The sequence
   name, description, cue-window value, label fields, numeric answer input and both Share textareas
   expose empty accessible names. Nearby printed labels do not create a programmatic association.
9. **Status and validation announcements are duplicated.** `Sequence added.`, `Restore point
   saved.` and invalid-share-code feedback each appeared twice in accessibility text, matching the
   earlier duplicate `Card added.` result. This looks systemic rather than confined to one form.
10. **The smallest supported mobile viewport clips a Settings control.** `ALarger` extends roughly
    4.6 CSS pixels beyond the 375-pixel iPhone SE viewport while the page suppresses horizontal
    overflow.
11. Blank sequence submission fails silently, just like blank course creation. The button accepts
    the action but provides neither inline validation nor an announcement.
12. The sequence preview's first generated prompt says `First item?` even after the type changes to
    Procedure/checklist and the rest of the editor switches to `step` terminology.
13. The backup export opened a native Save panel and gave no in-page acknowledgement. That is normal
    for a download, but it matters for automation because the panel blocks later file-picker actions
    until it is saved or cancelled.
14. The iPhone SE dashboard's inactive weekday labels are barely distinguishable from the near-black
    chart background. They are technically present and practically squintware.

### Still untested after the continuations

- physical touch gestures and long-press/drag behaviour;
- complete occlusion drawing, pairing, undo and image replacement;
- camera QR scanning and a genuinely separate clean-profile share import;
- publishing lineage updates between producer and recipient profiles;
- restore, course deletion, archive recovery and backup round-trip replacement;
- revision-plan editing, persistence across days and practice-milestone completion;
- reduced-motion, browser zoom and assistive-technology screen-reader output;
- Electron titlebar, updater, MCP consent/boundary and packaged-build cases;
- Windows smoke testing.

## Sign-off

- Release approved: No.
- Reason: confirmed release-gate and accessibility defects remain, and hardware, clean-profile and
  Electron cases are still untested.

## Agent runbook: T3 native preview

Use the T3 native preview for Lacuna's browser walkthrough. macOS Computer Use is useful for native
applications, but Helium exposed only browser chrome and a blank renderer during this run. That was a
controller limitation, not evidence that Lacuna had rendered a blank page.

1. Start the production preview and wait for the listening address before opening the browser:

   ```sh
   bun run preview --host 127.0.0.1
   ```

   This command rebuilds first. Do not try to diagnose a blank browser while Vite is still building.
   Confirm `http://127.0.0.1:4173/` responds if the page remains blank.

2. Call `preview_status`. An available preview with no `tabId` is not a failure; it means no tab is
   attached yet. Call `preview_open` with the production URL and retain the returned `tabId` for every
   later action.
3. Call `preview_snapshot` before each interaction. Use its current role/name locator where it is
   unique. If a role locator contains multiline text, matches more than one element or fails despite
   the element being visible, use the exact selector from that same snapshot. Do not reuse a selector
   after the route or layout changes.
4. A route's hash can update before its lazy content appears. In this run the old page sometimes
   remained visible for 0.7–1.2 seconds. Wait for destination-specific text or take another snapshot
   after the transition. Never record the immediately preceding page as the destination's result.
5. Off-screen controls did not reliably scroll into view when clicked by locator. Inspect the
   element's snapshot coordinates, scroll until its `y` position is inside the viewport, take a fresh
   snapshot, then click. Use a coordinate click only when the fresh semantic locator still fails.
   Lacuna uses a fixed-height shell, so on many application routes the document itself does not
   scroll. Target `main` (or the current route's actual scrolling pane) with `preview_scroll`; a
   successful viewport scroll call against `window` can otherwise move nothing at all.
6. `preview_snapshot` supplies the visible text, accessibility tree, screenshot, console entries,
   network failures and action timeline together. Use the screenshot for visual judgement and the
   accessibility data for names, roles, focus and state. Do not promote an accessibility-tree pass
   into a visual pass.
7. Use `preview_evaluate` only for read-only state that the snapshot does not make explicit, such as
   `document.activeElement`, `aria-selected` or `aria-valuenow`. Normal navigation and interaction
   should still use the focused preview controls.
8. Use `preview_resize` for responsive checks. The iPhone preset screenshot may be returned in
   physical pixels because of device pixel ratio; judge layout using the emulated CSS viewport, not
   the PNG's raw dimensions.
9. Start `preview_recording_start` before the walkthrough and call `preview_recording_stop` at the
   end. The stop result gives the local MP4 path. Record important failures in Markdown as well; a
   video is evidence, not a searchable test report.
10. If snapshots time out, first confirm the preview server is alive, then call `preview_status` and
    open a fresh T3 tab. The initial T3 tab failed in this run, but a new tab worked after the
    production preview was restarted. Do not fall back to Helium merely because the first T3 call
    failed.
11. T3 preview storage persists within its browser profile. Name all created data as disposable and
    record what was left behind. Do not run destructive checklist cases without the required backup.
12. Downloads can open a native macOS Save panel over T3 Code. T3 preview actions may still report
    success while that panel blocks the next native file-picker request. Use Computer Use against
    `T3 Code (Nightly)` to inspect the active sheet and save or cancel it before continuing. The full
    backup in this run appeared first as a hidden `.com.t3tools.t3code.*` temporary file, then became
    the requested JSON after the Save button was pressed.
13. The current preview API has no file-upload operation. Clicking the occlusion upload button through
    both preview automation and macOS accessibility focused it but did not open a chooser. Do not use
    DOM injection or a standalone browser and call that a manual pass; record the flow as blocked
    unless T3 exposes the chooser or a future upload tool.
14. `bun run electron:dev` inherits T3 Code's `ELECTRON_RUN_AS_NODE=1` in this environment and fails
    with a misleading missing `BrowserWindow` export. Launch it with that variable removed. This run
    reached the Electron renderer, but Computer Use could not acquire its frameless window and
    returned `cgWindowNotFound`.
15. For the offline gate, stop the preview server only after all ordinary cases are complete, then
    reload the existing T3 tab. A successful service-worker reload should retain the full route and
    IndexedDB-backed content. Do not infer offline support merely from service-worker build output.
16. Stop every preview and Electron development server when the walkthrough is finished.
