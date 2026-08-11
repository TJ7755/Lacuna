# Lacuna website manual test checklist

Use this checklist for a release candidate in a real browser. It covers every user-facing web
surface currently implemented. Electron-only MCP and auto-update behaviour is identified
separately; deferred roadmap work is not presented as though it exists.

## Automation boundary

Programmatic scenarios may create disposable data, exercise domain transitions and verify persisted
state through Lacuna's MCP and test-only application services. GUI automation may supply repeatable
evidence for navigation, focus, input and responsive behaviour. Human inspection remains required
for typography, visual hierarchy, animation quality, native platform feel and any case whose result
depends on physical touch, operating-system integration or subjective judgement.

Record the evidence source for each automated result. A passing MCP call proves domain behaviour; it
does not prove that the corresponding control is visible or usable. Do not add raw database writes,
review recording or other human-only operations to the normal MCP surface just to make this checklist
easier. Run the implemented canonical slice with
`bun run release:scenario -- --scenario canonical`; the remaining architecture is specified in
`docs/archive/roadmap-2026-08-11.md` §2.13.

### Programmatic automation notes (2026-08-10 opencode continuation)

Friction observed while driving the production build without vision. Human clicks behaved normally;
these notes exist so the §2.13 runner and future verification sessions start ahead of them.

- **Route settling.** After a hard page load, the first DOM read can catch the previous route's
  exit-transition frame (AnimatePresence) or the slow boot before `appState` finishes loading. Wait
  for target-route content (for example `Study` on a course) rather than sampling `innerText`
  once. A click to the route already shown is a no-op with React Router; navigate two hops
  (dashboard, then target) to clear a stuck transition during rapid programmatic navigation.
- **Non-anchor navigation controls.** Dashboard course cards and sidebar course rows are
  `div[role=link]`-style elements driven by React `onClick`; a bare `.click()` did not always
  navigate, while dispatching `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click` on the
  innermost content element did. Verify by URL hash change plus rendered content, not by the event
  being accepted.
- **Controlled inputs.** Assigning `textarea`/`input` `.value` directly is ignored by React.
  Set the value through the native prototype setter and dispatch a bubbling `input` event.
- **File inputs.** A JSON backup import cannot be primed by URL alone; construct a `File` from the
  captured export, attach it through a `DataTransfer`, and dispatch a bubbling `change` event.
- **Backup downloads.** There is no clipboard alternative for the full backup; intercept
  `URL.createObjectURL` beforehand to capture the export `Blob` and inspect or reuse it.
- **Targeting controls.** Button `innerText` includes helper descriptions (for example
  `Full backup` plus its caption); match with `startsWith` rather than exact equality where a
  description follows, and prefer `aria-label` over visible text when the control has one.
  Destruction confirmations use `Yes`/`Cancel` (lesson management) but `Delete` elsewhere; resolve
  labels per surface rather than assuming one wording.

### Semantic browser trial (2026-08-11)

The public `https://lacuna-beta-one.vercel.app/` deployment was operated in a background in-app
browser using DOM text, roles, labels and native events only. No screenshots, image interpretation
or coordinate clicks were used. The pass entered `#/`, loaded the seeded database, opened the
`Welcome to Lacuna` course, opened the New Course dialog and created `Headless automation trial`,
which reached its generated first lesson successfully.

This proves that non-vision browser agents can perform meaningful Lacuna workflows through the
public deployment. It does not prove access to another browser's data: IndexedDB belongs to the
exact origin and browser profile under automation. A fresh agent browser therefore receives a fresh
Lacuna installation.

Observed friction:

- The Welcome page's `Create your first course` button scrolled the product demonstration rather
  than entering the real `#/` application, so the pass navigated to that hash directly.
- The automation client's ordinary semantic typing action failed and dismissed the New Course
  dialog. Reopening it and using the native `HTMLInputElement.value` setter followed by a bubbling
  `input` event succeeded. Reproduce this with another automation client before reporting it as an
  application defect.
- The dashboard's `div[role=link]` course card responded to a semantic role click in this pass, but
  real anchors remain the more reliable navigation contract and earlier automation needed a full
  pointer-event sequence.

Semantic browser automation is valid GUI evidence and a useful zero-install operating path. It does
not replace MCP or test-only application services for deterministic data setup and domain-state
assertions, and it does not replace human inspection for visual judgement.

### Why browser automation cannot always operate Lacuna without vision

The 11 August close-out pass deliberately used semantic browser controls wherever possible, then
used visual inspection only where the DOM could not establish the result. These are practical
limits, not excuses to give up on accessibility. Better names, real links and explicit state make
far more of the application operable by an LLM, but HTML semantics cannot describe every rendered
pixel or every operating-system surface.

#### Rendered geometry and visual meaning

- The accessibility tree can say that an occlusion has three regions, their types and their answer
  text. It cannot prove that a rectangle covers the intended printed label, that two masks do not
  overlap, or that a feature ring points at the right pixels. Those assertions require an image,
  OCR/computer vision, or a separate machine-readable mapping supplied by the author.
- Canvas and free-form pointer editors expose coordinates rather than meaningful targets. A
  no-vision agent can draw a box only by inferring image bounds and sending pointer coordinates; it
  cannot know whether those coordinates enclose a vein, label or empty background.
- Coordinates are relative to the current viewport, scroll position, zoom, CSS transform and image
  fit. In this pass an automatic scroll made previously calculated occlusion coordinates stale and
  produced a visibly misplaced region. The DOM reported a valid new region because, structurally,
  it was valid.
- Responsive reflow, sticky controls, browser chrome, font loading and animation can move a target
  between measurement and click. Coordinate actions therefore need a fresh measurement immediately
  before use and still cannot establish visual correctness afterwards.
- CSS 3D card faces are a poor source of semantic ground truth. Depending on `aria-hidden`, DOM
  order and transform state, automation may read the hidden question face while the answer is
  visible, or omit the visually rendered back face. A successful Reveal click is not proof that the
  expected face is on screen.
- Alt text describes the source image, not its current legibility after resizing or compression.
  Printed labels, mask opacity, ring contrast, clipping, dark-theme treatment and 200% zoom remain
  visual checks.
- Typography, hierarchy, animation quality, colour contrast in context and whether a control feels
  native are inherently rendered or subjective outcomes. Browser automation can detect CSS values
  and overflow, but those are proxies rather than the result a person perceives.

#### Browser and application state

- IndexedDB, storage, permissions and service workers are isolated by exact origin and browser
  profile. Two tabs on one origin are not two installations. This pass used `127.0.0.1` and
  `localhost` against one server to obtain isolated recipient and source stores.
- An agent-controlled browser cannot see the user's ordinary browser profile unless that profile is
  explicitly exposed. A fresh automation session therefore cannot operate courses that exist only
  in another profile, even when both windows display the same URL.
- Starting two Vite servers from one checkout is not a safe substitute for two installations. Both
  processes can rewrite the shared dependency cache; this pass produced mixed React chunks, failed
  HMR sockets and a manufactured invalid-hook error. One server with distinct origins avoided that
  false application failure.
- A valid share code does not reveal its product meaning. A code generated before Publish was a
  one-off copy, while a post-publish code carried revision lineage. Automation must assert the
  authoritative preview (`revision 1 → 2`) and the recipient's shared-course settings, not merely
  that decoding and import succeeded.
- Async boot, lazy modules, route exit animations and HMR can leave the first DOM snapshot empty or
  describing the previous route. Wait for a route-specific heading or state and confirm the URL;
  arbitrary delays alone are brittle.
- HMR invalidates element handles and can preserve application data while replacing the document.
  Reload after code changes and resolve semantic locators again.
- Browser-page evaluation may run in an isolated world without the page's IndexedDB or module
  loader. It is not a universal escape hatch for reading hidden application state, and database
  writes from it would bypass the very UI contract under test anyway.

#### Controls, events and browser policy

- React-controlled fields may ignore direct `.value` assignment. Native setters plus bubbling
  `input`/`change` events are sometimes necessary, but this exercises framework plumbing rather
  than the exact keyboard path a user takes.
- Accessible names can concatenate every descendant label, count and helper paragraph. Exact text
  selectors then become brittle, and duplicate visible names such as two `New occlusion` actions
  require scope or context. Stable labels and actual links are the clean solution.
- Hidden file inputs may reject or time out on a synthetic click even when their visible Upload
  button works. The native chooser is browser-mediated, cannot be pre-filled by ordinary typing and
  may reset an automation session while it waits.
- Selecting a file proves only that a `File` reached the input. It does not prove image fidelity,
  decoded orientation, compression quality, audio content or that the chosen file was meaningful
  without inspecting the resulting media.
- Clipboard reads, downloads, autoplay, camera, microphone, full-screen and folder access are
  governed by browser policy and user activation. A semantic control may exist while the browser
  still requires a real gesture, permission prompt or explicit hand-off.
- Native menus, permission sheets and file/folder choosers are outside the page DOM. Browser
  automation cannot inspect them; desktop computer control or a user must take over.
- A semantic click being accepted is not proof of navigation or mutation. Confirm the resulting
  URL, heading, count, toast and persisted state. Conversely, a locator timeout can be an automation
  defect when the same visible control works normally.

#### Product boundaries and fail-closed behaviour

- Electron MCP connection, grant and consent UI is not part of the browser page surface. It required
  desktop application control in this pass; a browser-only LLM could neither see the native window
  nor approve its prompts.
- MCP consent is deliberately bounded. The first manual attempt took too long to inspect and the
  request timed out; clicking Allow afterwards could not resurrect the failed operation. Agents must
  recognise and answer a current prompt within its window, then retry cleanly if it has expired.
- Permission prompts can disappear when the requesting client disconnects, and grants are
  connection-scoped. Cached locators and assumptions about retained access are therefore wrong by
  design.
- Physical touch quality, operating-system integration, PWA installation, offline recovery after
  an actual network loss and hardware-backed camera/microphone behaviour cannot be fully established
  by a desktop Chromium DOM session.

The useful design target is not “make every visual judgement available as text”. It is to expose
every consequential action and state through stable semantics, keep canvas/media work paired with
machine-readable region data, and state honestly where pixel, hardware or operating-system evidence
is still required.

## Test record

- Release/commit: `d038641ee6ef118e8077b99b9e25a330c322d7b8`
- Tester: `Codex and opencode in-app browser verification`
- Date: `2026-08-10`
- Browser and version: `Codex in-app browser (Chromium; version not exposed)`
- Operating system: `macOS 26.6`
- Desktop viewport: `1280 × 720`
- Mobile viewport/device: `375 × 667 (iPhone SE portrait)`
- Production URL or local command: `http://127.0.0.1:4173/ via bunx vite preview --host 127.0.0.1 --port 4173`

Mark each item `[x]` when it passes. Add the issue number after a failed item and leave it
unchecked. Run destructive cases only against disposable courses and export a full backup first.

### 11 August Arc 14 automated release evidence

- The focused Arc 14 regression run passed 123 tests across 14 files without stderr output.
- The critical-domain coverage gate passed 88 tests with 92.27% statements/lines, 85.34%
  branches, and 100% functions across course path, unlock, study session, and lineage diff logic.
- The one-worker Chromium production suite passed first run, course creation, lesson-level course
  navigation, a real study interaction, and full-backup download.
- Vitest and Playwright are capped at one worker. CI repeats the full unit suite, targeted coverage,
  production build, release scenario, and Chromium smoke paths.
- Camera, PWA installation, folder permission, two-install merge, and Electron MCP visuals remain
  permission/platform-dependent manual checks; this record does not counterfeit those results.

### 11 August Arc 14 close-out verification

- Lines mode split a real three-line *Julius Caesar* exchange, generated exactly the two Brutus
  learner cards, retained Cassius as cue context, rendered first-letter and first-word hints, and
  completed both cards. The preset introduction now follows the selected mode instead of retaining
  ordered-list copy.
- Image occlusion used a real labelled leaf diagram. Two label targets and one paired feature
  generated three cards; deleting and redrawing a bad region updated the count; question faces
  masked both labels; the feature revealed only its paired label; and fractional masks stayed
  aligned at a 390 × 844 viewport. Visual inspection was necessary to establish pixel alignment.
- A published course moved from revision one to revision two across storage-isolated source and
  recipient installations. First import now preserves distribution lineage, additive notes applied
  immediately, the conflicting lesson rename queued for review, the dashboard opened that review,
  and accepting it left the recipient up to date.
- Electron exposed the connected `lacuna-smoke` client, global and per-course grants, and separate
  write and destructive consent prompts. The 45-tool smoke run created a disposable course, proved
  duplicate import idempotence, deleted it, exited successfully, and left no connected client or
  retained grant.

### 10 August verification evidence (opencode continuation)

The automated evidence below was produced with DOM and IndexedDB inspection with the release
candidate `d038641` instead of screenshots or a human click-by-click pass; visual quality claims
are beyond its scope, as stated in the automation boundary above.

- Fresh deep links render correctly: a hard-loaded `#/course/<id>` opened the course page directly,
  and no console errors or unhandled rejections were captured on dashboard, course, Settings or
  Share navigation.
- Share-code previews now report the note count on both import surfaces. The `Welcome to Lacuna`
  course exported as a 7,060-character `LAC1` code; on the storage-isolated `127.0.0.1:4174` origin,
  the Share page preview read “Welcome to Lacuna — 4 lessons, 2 notes and 30 cards, shared on
  10 August 2026”, and the New Course → Import share code surface on `4173` rendered the identical
  copy. IndexedDB ground truth for that course was four lessons, two notes and 30 cards.
- The full-backup import preview reports course lessons. The profile contained six lessons and six
  internal backing decks (38 cards); after adding an empty seventh lesson through the course
  Settings UI, a full JSON backup exported with seven lessons, six decks and 38 cards, and the
  import preview read “This backup contains 7 lessons and 38 cards, exported on 10 August 2026” —
  the old internal-deck count of six would have appeared without the `7f92f8e` fix. The empty
  lesson was then deleted, restoring the six-lesson state.

- The clean profile opened `#/welcome`; the landing exam slider responded to ArrowRight and the
  Yes/No grading demonstration advanced without a console error. The primary call to action created
  one seeded Welcome course, and a hard reload left exactly one dashboard card and one sidebar link.
- The `Arc 13 disposable` course contains three lessons, one Markdown note, classic, numeric and
  working authored items, a three-item sequence, a lesson-filtered randomised manual practice node
  and two assessments. It opens from both its dashboard card and sidebar link.
- The desktop navigation sweep reached Dashboard, Search, Share, Analytics, Settings and Help. The
  course Path, Question bank, Analytics and Settings tabs cross-linked to the expected routes.
- Hard-loaded `#/deck/legacy-id` and `#/study` redirected to the dashboard. An invalid route and a
  missing course id rendered the branded recovery page with a dashboard link.
- At 375 × 667, the dashboard and Settings document widths stayed at 375 pixels. The formerly
  clipped `ALarger` control ended at x=326, the mobile drawer focused its close control when opened
  and restored focus to `Open navigation` when closed, and both light and dark presentations
  rendered. These are supporting observations only: the broader mobile/theme matrix remains
  unchecked until every routed surface has been swept.
- No browser console errors were captured during this continuation. The overall console checkbox
  remains unchecked until the complete route sweep finishes.
- A full JSON backup downloaded as `lacuna-backup-2026-08-10.json`. Direct inspection found two
  courses, seven lessons, three notes, 36 cards, one sequence, one manual practice node, three
  assessments and both referenced seeded assets. After adding a seventh disposable card, Replace
  restored the exported six-card state and removed only the post-export mutation; the note,
  sequence, classic, numeric and working items remained.
- The backup import preview incorrectly labelled its five internal backing decks as lessons rather
  than reporting the seven course lessons. This release defect is fixed with regression coverage in
  `7f92f8e`; production verification is recorded in the opencode continuation above.
- The disposable course exported as a 1,272-character `LAC1` code. QR and plain-text variants
  rendered, and the Copy control reported success. On the storage-isolated `127.0.0.1:4174` origin,
  the preview named the course and reported three lessons and six cards, but omitted its note count.
  Both import surfaces now report notes with regression coverage; production verification is
  recorded in the opencode continuation above. Import created one course with all six cards in New
  state and no review history. A malformed code produced explicit error feedback and left the two
  existing courses unchanged.

## 1. Release gate and test data

- [x] `bun install --frozen-lockfile` succeeds with the checked-in `bun.lock`.
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run test` passes.
- [x] `bun run build` produces a production build without an error.
- [x] The production preview loads directly and after a hard refresh.
- [ ] Browser console contains no uncaught error during the route sweep below.
- [x] Create a disposable course with at least three lessons, notes, classic cards, a numeric
      item, a working item, a sequence, a manual practice node and two assessments.
- [ ] Keep a second clean browser profile for first-run, import and shared-course tests.
- [ ] Repeat the visual route sweep at desktop and mobile widths, in light and dark themes.
- [ ] Repeat motion-sensitive flows with animation speed set to Slow, Normal and Fast.
- [ ] Repeat one study flow with the operating system's reduced-motion preference enabled.

## 2. First run, landing page and technical account

- [x] A genuinely empty profile opens `#/welcome`; an existing profile opens the dashboard.
- [ ] The landing page scroll navigation, exam-date demonstration and interactive grading
      demonstration all respond without trapping scroll or keyboard focus.
- [x] The landing call to action enters the application and creates the seeded Welcome course once.
- [x] Reloading does not duplicate the Welcome course.
- [ ] Both seeded SVG illustrations render; no broken-image icon appears.
- [ ] Deleting the Welcome course and reloading does not recreate it.
- [ ] `#/method` opens from the landing page and all interactive charts respond to their controls.
- [ ] Back/forward navigation between Welcome, Method and the application animates without a flash.

## 3. Application shell and navigation

- [x] Dashboard, Search, Share, Analytics, Settings and Help are reachable from visible navigation.
- [x] Course links in the sidebar open the correct course.
- [ ] Collapsing and expanding the desktop sidebar preserves the chosen state after reload.
- [ ] The mobile navigation drawer opens, traps focus, closes by its explicit control and returns focus.
- [ ] Sidebar compact mode, ready counts, archived-course visibility and item ordering match Settings.
- [ ] `Ctrl/Cmd+K` opens the command palette; Escape closes it and restores focus.
- [ ] Browser Back and Forward restore the expected route without stale modal or editor state.
- [x] Legacy `#/deck/<id>` and `#/study` routes redirect to the dashboard.
- [ ] Lazy-loaded routes show a skeleton rather than a blank page on first visit.
- [x] An invalid route or simulated render failure reaches a useful recovery state, not a white screen.

## 4. Dashboard and course lifecycle

- [ ] The dashboard empty state offers course creation.
- [x] New course validation rejects a blank name and accepts a valid name and exam date.
- [x] Created courses appear once and open from both the card and sidebar.
- [ ] Course cards show the configured progress metric: completed lessons, reviewed coverage or
      today's workload.
- [ ] Dashboard sort choices produce the documented ordering and persist after reload.
- [ ] Card hover detail switches between next review, state breakdown and recent activity.
- [ ] Ready counts exclude reviews scheduled in the future.
- [ ] Right-click and keyboard context-menu invocation both open course actions.
- [ ] Archiving removes the course from the active dashboard and Undo restores it reliably.
- [ ] Archived courses appear only when the corresponding sidebar preference is enabled.
- [ ] The study streak and review heatmap update after a completed review.
- [ ] Storage quota warnings, when forced near the threshold, are visible and actionable.

## 5. Course path and shared course tabs

- [x] Path, Question bank, Analytics and Settings tabs are visible and cross-link correctly.
- [ ] The path header shows the course name, exam date and live progress without overflow.
- [ ] Study opens the persistent course study flow and exposes progression, starting the next lesson, due
      review and relevant named revision as distinct choices.
- [ ] Review today in the default sidebar opens the cross-course review session.
- [ ] Study mode renders the curriculum without authoring controls.
- [ ] Edit mode exposes lesson and practice-node authoring controls.
- [ ] Add a lesson at the beginning, middle and end; each appears in the intended order.
- [ ] Rename, reorder and delete a disposable lesson; cancellation and Undo behave as labelled.
- [ ] Semi-linear unlocking exposes the next lesson only after the current lesson is taught and any
      gating manual practice node is complete.
- [ ] Open mode exposes all lessons; linear mode follows its anchor date and cadence.
- [ ] Auto-practice nodes appear only when the configured thresholds require them.
- [ ] Add, edit, reposition and remove a manual practice node.
- [ ] Manual practice filters and randomisation are reflected when its session starts.
- [ ] Checkpoints appear at their configured lesson position and open the correct assessment detail.
- [ ] Upcoming assessments show useful dates and do not cover excluded or future material.
- [ ] A one-lesson course opens the lesson directly rather than showing a pointless one-node path.
- [ ] A missing course id shows a not-found message and a working dashboard link.

## 6. Lesson notes, annotations and membership

- [ ] A lesson opens in the course's configured default Study or Edit view.
- [ ] The view toggle changes mode without losing unsaved editor content unexpectedly.
- [ ] Add, rename, edit, preview, reorder and delete a note.
- [ ] Cancel note editing restores the persisted content.
- [ ] Markdown headings, lists, tables, links, code highlighting, inline/display maths and line breaks
      render correctly.
- [ ] Collapsible note sections and supported YouTube/Vimeo links render only in trusted note views.
- [ ] Paste and drag an image into a note; it renders after save and reload.
- [ ] Selecting note text can create, edit and delete a local annotation.
- [ ] A note annotation survives reload but is absent from share/export formats that deliberately
      exclude device-local annotations.
- [ ] Add a lesson-owned card, link an existing course card and unlink a linked card.
- [ ] Linked cards display in each lesson but retain one scheduling identity.
- [ ] Empty note, card and link-existing states explain the available action.
- [ ] A missing lesson id shows a not-found message and a working course link.

## 7. Question bank and bulk authoring

- [ ] The bank groups cards by lesson and includes course-level cards.
- [ ] Text search, tag selection and due/new/leech/flagged/suspended filters narrow the list correctly.
- [ ] Clearing search and filters restores the complete bank.
- [ ] Card edit, delete, suspend, flag and bulk-management actions update the list without reload.
- [ ] Create-card and create-sequence entry points return to the bank when launched there.
- [ ] Build external batch prompt cannot discard entered or staged work without explicit
      confirmation.
- [ ] Batch generation defaults to model-chosen concept density and item count.
- [ ] Enabling constraints allows concepts-per-item and maximum-item count independently; blank
      constraints are omitted from the copied prompt and no hidden item cap is imposed.
- [ ] The dialog explains that working items are durable concept checks, not arbitrary-number
      worksheets.
- [ ] Copy batch prompt includes notes, topic, level, clarification rules and delimiters.
- [ ] With exam board and specification set on the course, the copied prompt includes both.
- [ ] With exam board and specification cleared, the copied prompt omits them entirely rather than
      leaving a blank or placeholder line.
- [ ] Pasting a valid delimited batch produces staged item cards rather than a raw-JSON-only editor.
- [ ] Invalid JSON, an invalid numeric answer, a malformed scheme and a failing fixture are each
      isolated to the affected staged item.
- [ ] Edit a staged numeric and working item through the visual editor and revalidate it.
- [ ] Reject one item, accept one clean item and use Accept all clean for the remainder.
- [ ] Duplicate detection warns before acceptance into the selected lesson.
- [ ] Revise with AI copies the item, failure, fixture and tutor complaint into a new prompt.
- [ ] Closing and reopening the batch modal does not retain an unintended stale response.

## 8. Classic card editor

- [ ] Create and edit Front/Back, Cloze and Basic (reversed) cards.
- [ ] The reversed option creates exactly one independent reverse card with swapped faces.
- [ ] Cloze insertion produces valid `{{cN::answer::hint}}` notation and preview.
- [ ] Invalid or missing cloze syntax blocks saving with a useful message.
- [ ] Markdown toolbar actions insert formatting at the selection/cursor and update preview.
- [ ] Inline and display maths, code, tables, links and ordinary line breaks preview correctly.
- [ ] Paste, choose and drag images; large images are compressed, identical images deduplicate and
      saved images survive reload.
- [ ] Tags add, remove and autocomplete without duplication.
- [ ] Save, Save and add another, Cancel and `Ctrl/Cmd+Enter` use the correct return route.
- [ ] Navigating away with a recoverable draft offers restoration rather than silently discarding it.
- [ ] The mobile sticky action bar remains visible without covering fields.

## 9. Numeric and working item editor

- [ ] Numeric Exact accepts a valid constant expression and rejects variables or invalid syntax.
- [ ] Tolerance accepts a non-negative tolerance and previews the expected value.
- [ ] One of adds and removes alternatives without losing the remaining values.
- [ ] The maths palette inserts power, fraction, multiplication, division and bracket templates at
      the current cursor position.
- [ ] The rendered preview matches ordinary notation such as `3/4`, `x^2` and `sqrt(16)`.
- [ ] Working-item schemes compile valid waypoint, equals, within, matches-one-of and contains lines.
- [ ] A malformed scheme line receives a local error while valid lines still preview.
- [ ] Autocomplete inserts grammar-valid mark and predicate snippets.
- [ ] The compiled preview states each criterion and running total in plain English.
- [ ] The live test answer awards the expected marks and explains unmatched lines.
- [ ] Add, edit and remove fixtures; changing the scheme reruns every fixture.
- [ ] Saving is blocked while a fixture's actual marks differ from expected marks.
- [ ] Draft mark scheme copies the question and the compiler-owned grammar to the clipboard.

## 10. Sequence editor

- [ ] Create each offered preset and verify its terminology and defaults.
- [ ] Add, edit, reorder and delete sequence items and chunks/scenes.
- [ ] Cue-window changes update the generated-card preview.
- [ ] The label-card option adds/removes only its intended generated card.
- [x] Script paste detects/splits lines, supports speaker selection and confirms into editable items.
- [x] Lines mode correctly distinguishes the learner's lines from other speakers.
- [ ] Validation blocks an unusable name, empty sequence and invalid cue settings.
- [x] Saving generates the expected cards without duplicating them.
- [ ] Editing and regenerating a sequence preserves scheduling state for unchanged generated cards.
- [ ] Deleting a sequence uses explicit confirmation and removes its generated cards only.
- [ ] Cancel and keyboard shortcuts return to the originating lesson or bank.

## 10a. Occlusion (diagram) editor and study

- [x] Upload a real labelled diagram; small printed labels remain legible after compression.
- [ ] Draw, move, resize and delete both label and feature boxes; pair a feature to a label.
- [x] The generated-card count in the footer tracks the region list.
- [x] Saving generates one card per region without duplicating them.
- [x] Every label is masked on every question face; the card's own region is ringed.
- [x] A feature card reveals its paired label; an unpaired feature falls back to its answer text.
- [ ] Masks hold their position at every viewport width, at zoom, and in both themes.
- [ ] Moving or resizing a region preserves scheduling state for that card.
- [ ] Replacing the image warns before regenerating every card.
- [ ] Deleting a region removes its card with an undo; deleting the occlusion removes all of them.
- [ ] Generated cards are read-only and badged in the card editor, card list, question bank,
      search and command palette.
- [ ] Typed mode is offered only where the target region has answer text.
- [ ] Drawing works with a mouse and, at reduced fidelity, with touch.
- [ ] Verify the whole flow in both the web build and Electron.

## 11. Lesson study and Simple learn

- [ ] Starting a lesson presents its notes before any new card.
- [ ] Note sections expand/collapse and Continue enters the card queue.
- [ ] A cardless lesson can be completed explicitly and transitions to the next step.
- [ ] Simple learn writes lesson exposure but does not write FSRS review history.
- [ ] Yes marks a card correct; No marks it wrong and sends it to the end of the queue.
- [ ] The segmented strip shows current, unseen, wrong and correct states accurately.
- [ ] The lesson ends only after every member has been answered correctly.
- [ ] The completion hand-off animates into its report and next-step actions.
- [ ] Completing a lesson updates path status and the relevant unlock ratchet.

## 12. FSRS practice, filtered study and machine-marked study

- [ ] Global Practice and course Practice start with the correct eligible pool.
- [ ] Due, new, leech, flagged, suspended, tag and combined filters serve only matching cards.
- [ ] An empty filtered pool explains whether no cards match or none are currently eligible.
- [ ] Grading still succeeds for every card type: classic front/back, cloze, typing-mode and a
      machine-marked numeric or working item.
- [ ] An answer press always either advances the queue or shows feedback; no card silently
      registers nothing.
- [ ] Silent grading maps No to Again and maps Yes by response time without showing a four-button
      choice.
- [ ] Manual grading exposes Again, Hard, Good and Easy and records the selected grade.
- [ ] Pressing Yes and No advances only the card surface: the header stays mounted, the card hand-off
      is smooth and objective progress does not appear to reset.
- [ ] Grading works through each route: the on-screen grade buttons, the keyboard shortcuts and
      swipe-to-grade on a touch viewport.
- [ ] A failed card enters cooldown and is not immediately served again when alternatives exist.
- [ ] Type-before-reveal comparison gives feedback but leaves authoritative grading to the learner.
- [ ] Numeric study checks the expression, shows marks and bypasses self-grading.
- [ ] Working study accepts multiple lines, shows per-line verdicts and awards method marks.
- [ ] Report the whole numeric verdict and one working line as checker disputes; review history stores
      the question, line, verdict and deterministic seeds.
- [ ] Flag, unflag, bury, suspend and edit the current card from the action menu.
- [ ] Editing pauses/rebases timing and returns to the same session.
- [ ] Undo restores the prior card state, progress, performance calibration, cooldown and history row.
- [ ] Undo after a grade restores the card's due date, and regrading it afterwards behaves correctly.
- [ ] Focus mode, top-edge control reveal, full screen and Exit behave correctly.
- [ ] Keyboard controls work: reveal/hide, Yes/No or grades, edit, undo, focus and help.
- [ ] Touch controls work: tap reveal, left/right grading swipes, bottom sheet and action sheet.
- [ ] The Pomodoro can start, pause, reset and change phase without affecting grading.
- [ ] The session report shows reviews, accuracy, focus/distraction and objective movement.
- [ ] Daily review, new-card and time limits stop at the configured boundary and Continue anyway
      resumes intentionally.

## 13. Continuous course flow, practice milestones and revision plans

- [ ] `#/course/<id>/study` chooses the next available lesson or Practice step correctly.
- [ ] The conductor remains mounted across lesson notes, card study, step transition and continuation.
- [ ] A manual practice milestone persists resumable progress and completes once.
- [ ] Completed manual practice remains visible on the path; auto-practice does not become a gating
      curriculum milestone.
- [ ] Assessment coverage respects prefix/custom lessons, exclusions and unavailable material.
- [ ] Create an assessment revision plan with a deadline and per-day budgets.
- [ ] A revision window serves model-ranked eligible cards within its time budget.
- [ ] Two failures or an unproductive due time park a card instead of wasting the window.
- [ ] Window summaries show covered, improved, parked and not-reached counts.
- [ ] Replanning explains material changes and preserves completed session history.
- [ ] Ordinary Practice fallback is explicit when the short-term model is unavailable.
- [ ] Cram/revision work never falsely completes a curricular Practice milestone.

## 14. Course settings

- [ ] Desktop section rail and mobile section jumper navigate Basics, Study, Content, Assessments and
      Danger zone and highlight the current section.
- [ ] Course name and time zone commit on blur and survive reload.
- [ ] Exam board and specification accept a value, commit on blur and survive reload.
- [ ] Clearing exam board or specification and leaving the field persists the cleared state through
      a reload rather than restoring the previous value.
- [ ] Switching Expected marks/Secure topics changes objective copy and study progress terminology.
- [ ] New cards/day, max reviews/day, daily goal and session time limit accept blank/unlimited and
      valid positive values without corrupting one another.
- [ ] Target retention presets/slider, fuzz, maximum interval, learning steps and relearning steps
      persist; invalid step notation shows an error and preserves the prior value.
- [ ] Leech threshold and Suspend/Tag/None action take effect after the configured lapse count.
- [ ] Scheduling optimisation reports insufficient data honestly, trains when eligible and applies
      weights only after a validated improvement.
- [ ] Open, semi-linear and linear unlock modes reveal only their relevant controls.
- [ ] Auto-practice toggle and far/near threshold, urgent-window and max-gap values alter path nodes.
- [ ] Default lesson view persists.
- [ ] Add, rename, reorder and delete assessments with prefix/custom coverage and card exclusions.
- [ ] Add, rename, reorder and delete lessons and manual practice nodes.
- [ ] Published/shared course controls show revision state; Detach preserves local content and enables
      local editing.
- [ ] Deleting a disposable course removes its dependent content and Undo restores it.

## 15. Global search and command palette

- [ ] Search matches course names, lesson names, note content and both card faces.
- [ ] Results identify their content type and navigate to the correct course/lesson/editor.
- [ ] Structured card filters combine with text and tags correctly.
- [ ] Clear returns to the search prompt state.
- [ ] Command-palette keyboard navigation moves through results, Enter opens one and Escape closes.
- [ ] Search and palette remain usable with no courses and with hundreds of results.

## 16. Analytics

- [ ] Global analytics handles zero, one and multiple courses without a chart crash.
- [ ] Forecast, predicted exam-day score, prediction accuracy, review volume, study time, retention by
      age and leech-count charts show correct empty and populated states.
- [ ] Course comparison colours/labels remain distinguishable in light and dark themes.
- [ ] Course analytics shows trajectory, stability, review volume and lesson breakdown.
- [ ] Machine-marked reviews contribute earned/available marks and criterion summaries correctly.
- [ ] Chart tooltips, legends and responsive resizing work by mouse, keyboard where applicable and
      narrow viewport.

## 17. Sharing, publishing and lineage updates

- [x] Exporting a course produces a valid `LAC0`–`LAC3` share code and QR/plain-text controls.
- [ ] Copy and download actions confirm success; QR fits desktop and mobile screens.
- [ ] Image-bearing content warns that share codes omit binary assets rather than silently promising
      otherwise.
- [ ] Import preview names the course and counts lessons, notes and cards before writing.
- [x] Importing in a clean profile creates one complete course with no review history.
- [x] Invalid/truncated codes fail safely and do not create partial data.
- [ ] Publishing assigns lineage/revision data and a later publish increments the revision.
- [ ] Importing an update to known lineage opens merge review instead of duplicating the course.
- [ ] Merge review distinguishes unchanged, local-only, incoming-only and conflicting fields.
- [ ] Accept incoming, keep local and per-conflict choices produce the previewed result.
- [ ] Applying an update preserves local FSRS history and scheduling state.
- [ ] Auto-accept applies only non-conflicting updates and leaves conflicts for review.

## 18. Import, export and backups

- [ ] Unified import detects and previews CSV, TSV, Anki text, Markdown table/list, JSON, share code,
      full Lacuna backup and APKG input.
- [ ] Field mapping, header detection, delimiter override and tag parsing produce the expected cards.
- [ ] APKG import handles supported basic/reversed/cloze notes, media and review history and reports
      skipped unsupported material.
- [ ] Cancelling an import writes nothing; accepting writes only the previewed records.
- [x] Full JSON export contains courses, scheduling state, review logs and referenced image assets.
- [ ] Markdown, CSV and Anki-text exports clearly warn that they are not complete backups.
- [x] Full-backup Replace restores the exact exported state in a disposable profile.
- [ ] Full-backup Merge adds/merges content without overwriting newer local progress.
- [ ] Daily automatic restore points are created, listed, restored and deleted correctly.
- [ ] Pre-migration snapshots are available after a schema upgrade.
- [ ] Persistent-storage status reports granted, denied and unavailable browser states honestly.
- [ ] Folder mirroring appears only where the File System Access API exists; selecting and revoking a
      folder behave correctly.

## 19. Global settings

- [ ] Section rail/mobile jumper reaches every visible settings section.
- [ ] Light/dark/system theme, seven accent colours, font scale and animation speed apply immediately
      and persist.
- [ ] Keyboard/touch/automatic input mode changes the intended controls.
- [ ] Sidebar ready counts, archived courses, compact mode, visibility and ordering persist.
- [ ] Dashboard sorting, progress metric and hover-detail preferences persist.
- [ ] Silent/manual grading, type-before-reveal, comparison strictness, study mode, Focus-mode default,
      optimisation preference and practice defaults persist.
- [ ] Shortcut reassignment captures valid keys, reports conflicts and Reset restores defaults.
- [ ] Pomodoro focus/short/long durations and automatic-break settings persist.
- [ ] Install shows the browser's install action only when the PWA install prompt is available.
- [ ] Import/export and automatic-backup controls pass the cases in §18.
- [ ] The MCP section is absent on the web build rather than offering a control that cannot work.

## 20. Help, copy and discoverability

- [ ] Help section navigation tracks Courses & lessons, Study modes, Filtered study, How to study,
      Keyboard shortcuts, Touch gestures, Progress, Card types, Sequences, Diagrams and Tips.
- [ ] Help deep links scroll to the intended section.
- [ ] Help descriptions match the controls and terminology currently visible in the application.
- [ ] Every primary feature above is reachable through visible navigation, Help or contextual copy;
      none requires guessing a URL.
- [ ] User-facing copy uses British English and contains no emoji.

## 21. Responsive, accessibility and resilience pass

- [ ] No tested route has horizontal overflow at 390 px, 768 px, 1440 px or 200% browser zoom.
- [ ] Sticky headers/footers and on-screen keyboards do not obscure the active field or action.
- [ ] Every interactive control is keyboard reachable with a visible focus indication.
- [ ] Dialogs and sheets trap focus, close only through intended Escape/close controls and restore
      focus to their trigger.
- [ ] Accidental backdrop clicks do not discard authoring work in destructive/high-effort modals.
- [ ] Icon-only buttons, toggles, progress indicators and charts expose useful accessible names.
- [ ] Status, validation and toast messages are announced without moving focus unexpectedly.
- [ ] Colour is not the sole indicator for correctness, progress, conflict or error.
- [ ] Touch targets are at least 44 px and swipe-only actions have button alternatives.
- [ ] Reduced motion removes non-essential movement while preserving state changes.
- [ ] Refresh during normal routes preserves IndexedDB data and returns to a coherent screen.
- [ ] Offline reload after one online visit serves the application shell and previously loaded assets.
- [ ] A failed database open, quota exhaustion and unavailable browser API show actionable errors.
- [ ] No course content, notes or answers are sent over the network by ordinary web-app use.

## 22. Explicit non-web and deferred boundaries

- [ ] Confirm the web build does **not** expose Electron MCP, process grants or auto-update controls.
- [x] If testing Electron separately, use the MCP smoke scripts and consent/grant tests documented in
      `README.md`; do not record them as website failures.
- [ ] Scaffold item authoring/study is reserved but not implemented.
- [ ] The read-only face for an unsupported item payload is covered by unit tests only; no authoring
      path in the browser can create one to exercise directly.
- [ ] Batch source ingestion for DOCX, PPTX and image files is planned but not implemented.
- [ ] Parameterised generated practice instances and shared skill/template identities are planned but
      not implemented.
- [ ] A structure-aware equation editor and LLM-graded scheduling are deliberately not implemented.

## Sign-off

- [ ] All failures have linked issues with reproduction steps, expected result, actual result,
      browser, viewport and screenshot/video evidence.
- [ ] No release-blocking failure remains open.
- [ ] Full backup from the test profile restores successfully in a clean profile.
- [ ] Tester approves the release candidate: `____________________`

## Notes:
- It would be nice to be able to select the cards and have an option to 'create reverse'.
- It would also be nice to be able to edit reversed cards together - so they're like one card but with two options, rather than physically two cards.
- There is no way to edit the name of 'Lesson 1'. Followup lessons *can* be named for some reason. Similarly, editing the name of courses is more painful than it should be. It should be like a file system where you can double click and have a typebox appear.
- After creating a new lesson the view goes to the course view rather than the lesson view.
- After adding an item to a sequence you must manually scroll down to be able to see it - it should auto-scroll. The keyboard shortcuts are perfect, though.
- For numeric answers the 'accept one of' UI editor is sooo clunky - it repeats the preview, the accepted answer and the other things in one page. I need to brainstorm on how to improve this.
- Resolved: the production preview appeared to load forever because Wrangler blocked before
  starting its server on an interactive Cloudflare skills prompt. The obsolete Cloudflare tooling
  has been removed and `bun run preview` now starts Vite's production preview directly.
