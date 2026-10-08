# Direction C: next-session brief

Written 6 October 2026 after the visual audit on `redesign/direction-c`, checkpoint
`e0dfb147`. This records the prompter's requested follow-up; it does not authorise
implementation of every proposed interaction. The current work queue remains
[the roadmap](../next_plan.md).

## 1. Fix the expanded lesson toolbar first

The supplied screenshot shows the open lesson-name form beside enormous oval
Add practice, Add Practice Qs and Add checkpoint buttons. This remains unresolved.
`LessonView.tsx` places these controls in a flex row with default cross-axis
stretching; `Button` has a minimum height, so the taller form stretches its neighbours.

Keep closed actions at their normal height. Use a compact Add menu for the four
creation choices, then show the selected form in its own bounded area. Reuse the
existing `Menu`, `AddLessonControl`, editors and physical spring; do not create
another expansion system. Check the single-lesson and multi-lesson course views.
Use clear sentence-case labels; resolve the distinction between Practice and
Practice questions before changing names across the application.

Acceptance: sibling buttons retain their closed height throughout opening and
closing; text never scales; no clipping or horizontal page overflow at mobile
widths or enlarged text; Escape cancels and restores focus; reduced motion works.
Add a browser regression that fails on the current stretched layout and checks
intermediate animation frames as well as the settled form.

## 2. Make lesson management discoverable

Individual lesson rename, reorder and deletion already exist in
`pages/settings/LessonManagementSection.tsx`. Reuse `lessonRepository` rather
than implementing a second deletion path. Current deletion removes notes and
unassigns cards; it must not silently become card deletion.

Proposed next surface: a visible lesson actions menu on lesson headings and Path
rows, with Rename, Move up/down and Delete lesson. Right-click and the keyboard
context-menu key / Shift+F10 should open those same actions for the targeted lesson.
Keep the visible trigger available on touch devices and for discoverability.
Respect shared-course authoring locks and archived-course restrictions.

Acceptance: confirmation states the actual consequences; cancellation returns
focus; deleting the current lesson navigates to a valid course location and moves
focus deliberately; ordering, cards, notes and persistence retain existing coverage.
Investigate the existing snapshot/restore helpers before deciding whether to add Undo.

## 3. Consolidate menus and empty lesson screens

Electron already has `electron/applicationMenu.ts`; extend it only where an
existing application action belongs there. Audit visible toolbars, overflow menus
and desktop commands for consistent labels, shortcuts and enabled states. Decide
whether any web menu bar is needed after that inventory; do not add one automatically.
Custom right-click menus must not replace ordinary text/input editing menus.

Review the empty lesson shown in the screenshot: large empty Notes and Cards
panels, Manage (0), and study/practice availability. Prioritise adding the first
card, retain useful notes actions, and hide management controls that have no applicable
content. Verify existing behaviour before changing study availability.

## 4. Finish the verification left open

The previous session passed production build, project type checks, scoped lint and
targeted browser/regression checks, including 7/30/90-day activity ranges. It did
not complete the full test suite because the disk filled. The offline media-sharing
test timed out waiting for `serviceWorker.ready` before reaching sharing controls.
Free storage, rerun that test against a fresh production preview, and then finish
the relevant suite. Keep parallel browser output directories separate.

Preserve the existing uncommitted Mermaid work and unknown `debug.log`. Follow
[visual design](../spec/visual-design.md) and [accessibility](../spec/accessibility.md).
Commit tested checkpoints and push to Direction C throughout the next session.

## Outcome (6 October 2026)

Decisions from the prompter: path practice kinds are named **Card practice** and **Practice
questions** everywhere; lesson deletion confirms with its consequences and then offers Undo;
"ready for review" includes green CI.

1. The single-lesson toolbar uses the shared Add menu, and the new-lesson form opens in its own
   bounded disclosure. `tests/e2e/lesson-add-toolbar.spec.ts` samples button heights through
   opening and closing at 1280 and 390 px, under reduced motion and with enlarged text.
2. `LessonActionsMenu` serves path rows and the lesson heading, opening from right-click, the
   context-menu key or Shift+F10 except over text fields and selections. It reuses `deleteLesson`,
   `snapshotLesson` and `restoreLesson`; `tests/e2e/lesson-actions.spec.ts` covers it.
3. Menu inventory: the native menu gained only existing actions (Settings on Cmd/Ctrl+comma,
   Keyboard Shortcuts in Help) through one whitelisted command channel. Quick search stays a
   renderer shortcut, because a menu accelerator would consume Cmd/Ctrl+K. No web menu bar is
   needed: every application action is already reachable from the sidebar, the course tabs or
   the shortcuts sheet. The Today dashboard's course context menu remains a separate,
   pointer-positioned menu with a single Archive action.
4. An empty lesson leads with New card; the management section offers only the other ways to add
   cards; a one-lesson course with nothing to study disables Study. The offline media-sharing test
   passes against a fresh production preview after the stale route selectors were updated.

## Review pass (7 October 2026)

Merged master (unified due counts: Practise freely and Practice Now are now Review due cards),
then audited every page at 1440 and 390 px, light and dark, with seeded data up to 13 courses,
2,205 cards and 6,248 reviews. Fixed: Today leads with the study queue; forecast axis, legend and
Progress charts fit their data and a phone; a long course name no longer runs under the section
tabs; card-row hover no longer shows the swipe tray; the sidebar marks a clipped course list;
noteless lessons start on their first card; Skip to content; question-writing toolbar in plain
words with Ctrl/Cmd+B and I and a live maths preview; Help's terms; empty-state routes.

Decided by the prompter afterwards: MathLive stays out of this pull request; new courses
default to Steady retention; the single-lesson Add menu joins the lesson header.

## Detail pass (7 October 2026, second session)

Applied the three decisions above, then audited hover, press, focus and hit areas with seeded
data, following *Nudge* choice architecture: a reversible default, consistent mappings, and the
next action offered where a panel is empty. Fixed: counts pluralise ("1 card"); study time keeps
seconds, so a short session no longer reads as 0 minutes; sidebar course names wrap to two lines;
card kinds share one set of labels; the course-settings Assessments card has a heading; Card
practice and practice are named consistently; rename fields are capitalised; an empty notes panel
offers Switch to Edit like the cards panel; the study sheet is a bounded panel on desktop; and every control on the phone pages tested reaches
the 44 px target, checked by a hit-area probe in `tests/e2e/direction-c-audit.spec.ts`.

## Redesign round (7 October 2026, third session)

The prompter judged the branch not yet ready and chose, from published mockups, a session plan for
the study sheet, a slim card list with image-occlusion previews, and scored question sets. Done:

- **Study sheet:** "Today's session" lists the planner's next step with card counts and an
  estimate, then the due reviews offered after it, under one **Start session**; other ways sit
  below. `src/course/studySessionPlan.ts` holds the estimate rules.
- **Cards:** one panel for the course with lesson headings that stay in view; slim rows with the
  answer and when each card next comes up; occlusion cards show their diagram and the region's
  answer, in region order. The lesson page's card list uses the same rows. On phones the row
  actions move to the expanded row and the swipe tray, so the question has the width.
- **Questions:** each set shows when it was last tried, its latest score and a short history,
  with **Attempt** (Practice mode) or **Continue**. One unreadable attempt no longer blanks the list.
- **Elsewhere:** the course bar now really sticks; View mode drops an empty notes panel; Edit mode
  has one New card; the study sheet is bounded on desktop; Today's queue leads the sharing
  announcement; the Import and Share titles align with every page; the Pomodoro timer keeps its
  place between Learn and the between-steps screen (Learn's Undo is always laid out); the leech
  options are proper radios.

Left for the prompter to decide:

- **Sharing announcement size.** It now sits below the queue but keeps its chosen copy and
  illustration; the mockup's one-line version would drop the illustration.
- **Tag chips.** Chip remove buttons and tag suggestions are smaller than 44 px; making them
  44 px would make the tag editor much taller. Backspace removes the last tag.
- **Card question text for occlusions.** Rows read "Label 1 of 4 — Label the plant cell", the
  stored fallback text; a shorter generated title would need a data change.

## Polish pass (8 October 2026, fourth session)

Decisions from the prompter: push to this branch; the sharing announcement becomes the one-line
version; tag chips stay compact; local Playwright screenshots are allowed; the pull request is
not to be merged by an agent.

Fixed, each with a test that fails on the previous head:

- **CI:** the smoke and sync specs used the study sheet's old route buttons.
- **Today:** the announcement is one line, measured by its own width (`@container`), so it never
  wraps beside the desktop sidebar or on a phone; the forecast legend starts on its title edge.
- **Course surfaces:** View/Edit matches the section tabs' 44px track; the Cards overflow menus
  are the shared 44px round control; Lessons and Assessments headings share a line; the phone
  section bar keeps Path current on a lesson, as the spec and the tab bar do.
- **Cards and lessons:** row previews clamp by line, so a fraction is shown whole; cloze answers
  lose padding that read as a space before punctuation; a lesson's card list renders maths.
- **Study:** the header shares the card's column on notes, cards and between steps, so the timer
  stays put; the Pomodoro timer, its panel and buttons are Direction C; images centre under
  centred text; a wholly new lesson reads "5 new cards"; focus mode's exit is named as its menu
  item is.
- **Surfaces and controls:** about thirty squared buttons became pills, with a `hit-target`
  utility for 44px targets on compact controls; Quick search (now with inset rows), the sidebar
  hover card, Today's course menu, the 404, the empty Archived page, course analytics' Questions
  section and several panels moved to the card, popover or well surfaces; Markdown fields show focus on the whole
  frame; settings rows share one label style and switches sit centred; the Lesson breakdown's
  axis labels no longer clip. Design rules now catch squared buttons and stray uses of Fraunces.
- **Motion:** layout animation never ran (`domAnimation` omits it), so every sliding pill jumped.
  `domMax` now loads asynchronously, at no first-load cost, and text-bearing layouts animate
  position only.

Left for the prompter:

- **Seeded welcome diagrams** are hard-coded dark panels in the old stone palette. A repair
  migration already rewrites them in existing data, so changing them needs another migration.
- **Lesson breakdown** plots card counts against the percentage axis (on a hidden second axis);
  bars for counts, or a separate small chart, would read more honestly.
- **Workload ahead** draws day counts as a line, so a course of all-new cards spikes against the
  axis; bars would suit daily counts.
- **Field labels** above inputs (Pomodoro lengths) stay small and regular, while course settings'
  are semibold; one rule for field labels across Settings would finish that consistency.
- **Dialogs** keep `DialogPanel`'s outlined paper surface; it could move to the borderless card
  surface in one place if wanted.

## Fifth pass (8 October 2026, fifth session)

Decisions from the prompter: push to this branch; implement all four open items and restyle the
seeded diagrams with a repair migration, following the theme; performance work may be
structural if justified; mark the pull request ready for review but do not merge it. Mid-session:
buttons must behave and look the same everywhere, following *Nudge*, because some find Lacuna
hard to navigate.

Done, each with a test that fails on the previous head:

- **Open items:** Workload ahead draws stacked daily bars; Lesson breakdown plots mastery and
  completion only, with each lesson's card count in its tooltip; one field-label rule
  (`fieldLabelClassName`) across Settings, course settings, the assessment editor and the new-course
  form, with selects and row inputs sharing the input frame (`inputFrameClassName`); dialogs use
  Quick search's borderless card surface; the Welcome diagrams follow the theme through
  `color-scheme` and a v4 repair replaces both earlier versions in existing data.
- **Study, one action:** Today's rows say Study and open the same session plan as the course page;
  a one-lesson course uses the course page's Study and Other ways (`CourseStudyActions`) instead of
  its own Review due cards button; a lesson page's direct action is named **Study lesson**, so
  Study always means the plan; Other ways names the due-only session as the plan does. Large
  buttons are 48px, level with a full-size menu. Link-styled buttons share `buttonClassName`.
- **Bugs found on the way:** "Exploresharing" lost its space; the forecast title sank as its legend
  wrapped; 100+ day exam counts overflowed the sidebar ring; card rows showed the swipe tray's red
  tint at their corners; course settings' unlocking radios rendered as full-width text fields (also
  on master); every course offered to detach from an author (the redesign dropped the guard); an
  eyebrow label sat above Scheduling optimisation; Course comparison's pickers wrapped unevenly;
  phone path rows broke lesson names mid-word in Edit mode; the storage error's Reload named a
  colour that does not exist; the sidebar said Search where everything else says Search content.

Left for the prompter:

- **Google Fonts on the web build.** `webBootstrap.ts` still fetches Fraunces (the wordmark) and
  JetBrains Mono from Google; both could be bundled like the other faces, which would remove the
  only third-party font request for school users.
- **Forecast colours.** Exam-day forecast lines are coloured by status, so four on-track courses
  draw four identical green lines; course colours (with status in the legend) would tell them apart.
