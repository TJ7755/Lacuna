# Lacuna — Specification (v0.1.0)

Lacuna is a local-only, exam-driven spaced-revision application built on FSRS-6. Material is
organised into **courses**, each made of an ordered path of **lessons** holding **notes** and
**cards**. Every card is scheduled to peak in recall on its course's exam day, and a single
"objective" setting binds the scheduler and the progress bar to the same goal so they can
never disagree. All data lives on-device (IndexedDB); there is no server or account requirement.
Core study works without a network connection after the application assets are available,
although the web build may request the linked fonts and optional Vercel analytics. The application
runs as a web SPA and packages as an Electron desktop app.

**Course architecture.** The product was originally built around a flatter `Folder -> Deck ->
Card` model. A staged migration (tracked in `docs/archive/roadmap-2026-08-11.md`, Arc 0) introduced `Course ->
Lesson -> Note + Card` alongside it, then removed every Deck/Folder-facing UI surface once the
new model covered the same ground. The Deck/Folder tables and the deck-shaped scheduling
primitives (`Deck`, `SchedulerConfig`) still exist in storage — a lesson is, mechanically, a
hidden single-lesson deck under a course, which is how the FSRS engine, cooldown, and objective
modules keep working unchanged — but no route, page or sidebar entry exposes a deck or folder
directly any more. Where this document says "deck" it means that internal backing structure,
not a user-facing concept.

**Version 0.1.0** completes the Course Architecture Plan (Arc 0): the product is organised
around **courses, lessons, notes and cards** end to end, with no user-facing deck or folder
surfaces. v0.0.3 added Simple learn mode, formal card types and touch-first polish (see §20);
that work ships inside 0.1.0 on this branch.

British English throughout. No emojis anywhere in the product or its copy.

---

## 1. Guiding principles

1. **Exam-day, not interval-day.** Classic spaced repetition asks "when is this card next due?".
   Lacuna instead asks "what will this card's retrievability be on the exam date, and how much
   does reviewing it now improve that?". Scheduling is a forward simulation to a fixed deadline,
   not an open-ended interval ladder.
2. **One objective, one source of truth.** A deck's `examObjective` drives both the order in
   which cards are served and the number the progress bar shows. They are derived from the
   same module (`src/fsrs/objective.ts`) so they are guaranteed consistent — the core invariant
   of the app.
3. **Invisible grading (with an opt-out).** By default the learner only ever presses "Yes" or
   "No"; the four-point FSRS grade is inferred from correctness plus response time, using the
   active scheduling context's performance profile. Course-scoped review uses a course-keyed
   profile at the review boundary, while legacy/deck-shaped analytics and allocator paths still
   consume deck-keyed rows during the staged migration. The inference is measurable, not
   assumed — a calibration metric scores predicted vs actual recall (§14). A Settings toggle
   switches to manual four-point grading (Again/Hard/Good/Easy with keyboard shortcuts) for
   users who prefer to grade themselves.
4. **Local and private.** Everything is stored on-device. Export, import, automatic restore
   points and optional folder mirroring are the backup story. The Electron MCP surface can
   expose authorised data to a local client process, but Lacuna itself has no remote server
   or account and grants expire with the desktop process.
5. **Touch-first, keyboard-equivalent.** Every interaction is designed for touch from the
   ground up (44px minimum targets, swipe gestures, bottom sheets, active states) and is
   mirrored by keyboard shortcuts so the app is fast on either input mode.
6. **Quiet, tactile craft.** A restrained "quiet laboratory" aesthetic with one warm accent,
   paper grain, and motion used to confirm and delight rather than decorate.

---

## 2. Technology stack

- **Build / framework:** Vite 6 + React 18 + TypeScript (strict). SWC React plugin.
- **Styling:** Tailwind CSS v4 (class-based dark mode via `@custom-variant dark`), CSS custom
  properties for the palette, surfaced to Tailwind through `@theme inline`.
- **Routing:** React Router v6, **hash** history (`createHashRouter`) so the app deploys as
  plain static files with no server rewrites.
- **Persistence:** Dexie (IndexedDB) with `dexie-react-hooks` (`useLiveQuery`) for reactive
  reads.
- **Scheduling maths:** the official `ts-fsrs` package (FSRS-6). No hand-rolled memory maths.
- **Parameter training:** `@open-spaced-repetition/binding` (fsrs-rs via WASM in a Web Worker)
  for fitting FSRS weights to review history.
- **Motion:** the `motion` library (`motion/react`).
- **Markdown / maths / code:** `react-markdown` + `remark-gfm` + `remark-math` +
  `rehype-katex` + `rehype-highlight` + `rehype-raw`. KaTeX and highlight.js styles imported
  globally; the restricted expression parser uses the number-only `mathjs/number` entry point.
- **Charts:** Recharts.
- **Fonts (loaded via `<link>` in `index.html`):** Fraunces (display), Geist (body),
  JetBrains Mono (code and the timer/tabular figures).
- **Testing:** Vitest with `fake-indexeddb` for the data and FSRS layers, `@testing-library/react`
  and `happy-dom` for UI component and hook tests.

Scripts: `dev`/`start` (Vite), `build` (`bun run typecheck && vite build`), `preview`, `typecheck`,
`test`, `test:coverage`, `test:e2e:web`, `test:watch`, and `lint`. The Dashboard is the only eager page;
settings, search, share, analytics, help, course pages, editors, the course conductor and
full-screen routes are lazy-loaded on demand.

---

## 3. Visual design system

### 3.1 Palette ("quiet laboratory")

Defined as raw HSL triples in `:root` and overridden under `.dark`, then exposed as Tailwind
colours (`bg-surface`, `text-ink`, `border-line`, `text-accent`, ...).

- **Light:** warm off-white paper (`--paper`), near-white surfaces, dark warm ink. Subtle.
- **Dark (default):** near-black charcoal paper, charcoal surfaces, warm off-white ink.
- **Accent triad:** `--accent`, `--accent-soft`, `--accent-ink`, `--accent-fg`. The default
  is amber; the user may pick **red, rose, pink, violet, blue, teal or green**. Selecting one
  sets `data-accent` on the root and overrides just the accent triad, with separate light and
  dark recipes so each accent reads correctly in both themes.
- **Semantic:** `--positive` (green) and `--negative` (red) for success/failure states.
- **Atmosphere:** the body carries a faint radial-dot paper grain (`--grain-opacity`,
  stronger in dark mode) rather than a flat fill; theme-aware thin scrollbars; accent-tinted
  text selection.

### 3.2 Typography

- **Display (`font-display`, Fraunces):** all headings (`h1`–`h4`), weight 500, slight
  negative letter-spacing. Page titles are `text-4xl`/`text-5xl`.
- **Body (`font-body`, Geist):** all running text, weight 400.
- **Mono (`font-mono`, JetBrains Mono):** code, and `.tabular` numerals (progress %, stats,
  streak, timers) via `font-variant-numeric: tabular-nums`.
- Eyebrow labels are small uppercase with wide tracking (`tracking-[0.18em]`,
  `text-ink-faint`).
- A global font-scale control multiplies all text (see §15).

### 3.3 Motion language

Motion is consistently used to **confirm actions and orient the user**, never gratuitously.
A `prefers-reduced-motion: reduce` media query collapses all animation and transition
durations to ~0 globally, so every effect below degrades gracefully. A per-user
**motion-speed** setting (Settings) scales every duration in the app by a single multiplier,
so the app can be as snappy or as gentle as the user prefers.

Shared conventions:

- Standard easing curve `[0.16, 1, 0.3, 1]` (a soft "ease-out-quint") for entrances.
- Springs for tactile controls and shared-layout indicators.
- Staggered list/grid reveals with a small per-item delay, capped so long lists do not crawl.
- `LayoutGroup` coordinates reflow animations across sibling elements (e.g. Settings' and
  Help's active-tab underline).

Specific motion (current state of the app):

- **Page transitions:** shell pages crossfade in place through `AppShell` (`popLayout`, so
  the outgoing page is taken out of flow and the two never stack). A fade writes opacity
  only — never a transform — so `position: fixed` descendants stay viewport-fixed.
  Moving between a course's sections still slides sideways in the direction of travel.
  Full-screen landing, method, conductor and Learn routes use the outer `RouteTransition`
  boundary, also a crossfade, with `AnimatePresence mode="wait"`. Both boundaries skip
  enter/exit when `prefers-reduced-motion` is on. The main scroll area resets to the top
  on every navigation. Incoming page content sits still inside that fade — settings
  sections, dashboard cards, editor shells, Help and Share no longer hop up after the
  route has already arrived.
- **Buttons (`Button`):** spring `whileHover` scale 1.02 and `whileTap` scale 0.96; every
  variant enforces a 44px minimum touch height.
- **Progress bar (`ProgressBar`):** the fill animates to its new width on a spring; a slow,
  looping sheen sweeps across any non-empty bar for a sense of depth.
- **Sidebar:** width animates on collapse/expand (spring); the active-item marker is a
  shared-layout element (`layoutId="nav-active"`) that slides between items; items nudge
  right slightly on hover. Expanding a course's lesson list fades in place rather than
  tweening height. A collapsible drawer on mobile (§4.1); the drawer overlay and panel
  skip enter/exit when the motion multiplier is 0.
- **Course cards** (dashboard grid): no arrival stagger (that competed with the shell
  fade). A `whileHover` lift (`y: -4`) with a smooth shadow/border transition; a
  `whileTap` scale-down confirms the press. They do not carry swipe gestures — that
  affordance lives on card-list rows instead (below). Hover detail still grows the
  card by height so the grid can follow the pointer.
- **Card list rows** (`CardList`): in touch mode, each row supports a horizontal **swipe
  gesture** — drag left past a threshold to spring open a per-card action tray, drag right
  to quick-toggle the flag — backed by a `useSpring`-driven `useMotionValue` with a springy
  snap-back below the threshold.
- **Learn answer feedback:** the instant a card is graded, a soft full-width glow rises from
  the foot of the screen — green for correct, muted red for incorrect — for ~0.5 s. It is
  purely decorative (`pointer-events-none`), fired independently of the async write so the
  reward always lands on the keypress, and never delays the next card. A radial ring
  pulses outward from centre as a secondary cue.
- **Flip card:** the question/answer faces swap with a 3-D `rotateX` flip (perspective 1600).
  Swipe gestures (right = Yes, left = No) share the same spring physics as the card-list row
  swipes; the flip card is the only place in the app that combines rotation with translation.
- **In-place steps:** picker-to-options sheets, Learn reveal-to-grade, and other same-surface
  steps keep their chrome still and crossfade the step (`StepSwap`). Forward and back take a
  short sideways step; phase changes fade in place.
- **Touch bottom sheets:** in touch mode, the Learn grading controls live in a fixed
  bottom sheet that springs in once; reveal and grade swap inside that sheet rather than
  replacing it. The card-actions menu is a similar bottom sheet rather than a dropdown,
  with a drag handle that closes it when dragged down past a threshold or flicked quickly.
- **Session report:** the whole panel rises in; reaching the goal springs in a tick badge and fires a confetti burst; the four stat tiles reveal in sequence with count-up numbers; the progress bar animates from before to after with a delta badge; a grade-distribution bar chart shows the rating breakdown.
- **Tabs / chips:** active-tab underlines are shared-layout elements, e.g. Settings'
  (`layoutId="activePill"`/`"activeBar"`) and Help's (`layoutId="helpActivePill"`/
  `"helpActiveBar"`).
- **Toasts:** slide in from the right with a slight scale.
- **Dashboard streak:** the flame icon gently pulses/rotates while a streak is alight; the
  streak number springs when it changes.
- **Pomodoro timer:** the compact face in the Learn header is a 36px SVG ring with a
  progress arc; the expanded popup is a 160px circular timer with a smooth 1Hz tick.
- **Mobile drawer:** scrim fade plus a spring slide-in of the sidebar.
- **Splash / route fallback:** the initial "Lacuna" wordmark fades up and breathes while the
  database opens; lazy routes show a pulsing "Loading…".

### 3.4 Touch-first design system

Added in v0.0.2. Every interactive element meets a 44px minimum target size (per
WCAG 2.5.5 / Apple HIG), and the app supports two input modes (`auto`, `touch`, `keyboard`)
chosen in Settings (§15). The mode drives which affordances are visible (hover-only on
desktop vs. always-visible on touch) and which gestures are enabled (swipe-to-act on touch,
keyboard shortcuts on keyboard).

- **44px targets.** `Button` enforces `min-h-11` (44px) on every size variant. All
  icon-only buttons, tabs, chips, filter controls, breadcrumb links and menu items inherit
  the same minimum.
- **Active states.** Touch-interactive elements carry an explicit `active:bg-ink/10` or
  variant-specific `active` colour so the press is visible without relying on a `:hover`
  that never fires on touch.
- **Swipe gestures** (touch mode only, gated on the resolved input mode). Card-list rows
  (`CardList`) drag left past a threshold to open a per-card action tray and right to
  quick-toggle the flag; the Learn flip card swipes right for Yes and left for No. Swipes
  are springy (a `useSpring`-backed `useMotionValue`), with a directional glow that follows
  the finger on the flip card, a threshold past which the action commits, and a snap-back
  below the threshold. The first successful Learn swipe hides the persistent swipe hints
  via a `localStorage` flag (`lacuna.learnHints`).
- **Bottom sheets** (touch mode). The Learn grading controls and the per-card actions menu
  render as bottom sheets with a drag handle, a scrim backdrop and a focus-trapped dialog
  role. On keyboard, the same actions live in a dropdown menu.
- **Bulk selection.** `CardList` enters multi-select through an explicit **Select** action.
  Ordinary cards can then be selected for bulk operations; generated sequence and occlusion
  cards are excluded because they are edited through their owning authoring entity. There is
  no long-press bulk-selection path in the current release.
- **Touch-visible utility.** A `touch-visible` class forces hover-only affordances to stay
  visible on `(hover: none)` devices (no-hover media query), so they cannot be hidden
  from touch users.
- **Input-mode awareness.** The `useIsTouchMode` hook (`src/state/inputMode.ts`) reads the
  user's setting and resolves `auto` to `touch` or `keyboard` based on the device's touch
  capability. Components use it to switch between bottom sheets and dropdowns, show or
  hide swipe hints, and swap hover-only styles for always-visible ones.

### 3.5 Layout grid & surfaces

- Content is centred in a max-width column per page (dashboard `max-w-6xl`, course path/course
  settings `max-w-2xl`, lesson view `max-w-3xl`, editor `max-w-4xl`, learn/report/search
  `max-w-3xl`) with responsive horizontal padding (`px-6 md:px-10`).
- Cards/sections: `rounded-2xl border border-line bg-surface p-5/6`, soft black shadows on
  hover.
- Pills/chips: `rounded-full border` with accent-soft active state.
- Sticky action bars (editor, course settings) pin to the bottom of the content column; the
  editor's bar fades up from the paper via a gradient so it never sits on a hard slab.

---

## 4. App layout & navigation

### 4.1 Shell

Routes are nested under `AppShell` (`/`), except the full-screen landing, method, course-conductor
and Learn experiences, which live outside the shell. The shell is a flex row:

```
+----------+--------------------------------------------+
| SIDEBAR  | (mobile only) top bar: Lacuna              |
| (desktop)|--------------------------------------------|
|          |                                            |
| Lacuna   |  <main> -- routed page, scrolls            |
|          |  independently; page transitions           |
| > Dash.. |  animate here                              |
| > Review |                                            |
| > Search |  (^K)                                      |
| > Share  |                                            |
| > Analyt.|                                            |
| > Setting|                                            |
| > Help   |                                            |
|          |                                            |
| COURSES  |                                            |
| - Organ..|                                            |
| - French |                                            |
|          |                                            |
| [v] coll |                                            |
+----------+--------------------------------------------+
```

- **Sidebar** (`Sidebar`): brand; primary nav (Dashboard, Review today, Search, Share,
  Analytics, Settings, Help — each independently hideable); a live course list (each with an
  accent dot when active and an optional due-count badge); a **streak badge** on the Dashboard
  item that springs in when a streak is active; footer with a theme toggle and a
  collapse toggle. Collapsing animates the width to 72 px and hides labels. Active state is a
  sliding shared-layout marker. State (`collapsed`), compact mode, due-count visibility, and
  per-nav-item visibility are all persisted to `localStorage` via `useSidebarSettings`
  (configured in Settings → Sidebar) and take effect immediately.
- **Search nav item as command-palette affordance:** the Search entry is a button, not a
  plain link — it opens the `Ctrl/Cmd+K` command palette directly and shows the shortcut
  hint inline (collapsed sidebar: as a title tooltip), so the palette has a visible
  entry point instead of relying on the user already knowing the shortcut. Surfaces
  without palette wiring (e.g. LearnMode's own nav drawer) fall back to a plain `/search`
  link.
- **Mobile:** the sidebar becomes a drawer opened from a top bar burger; the scrim closes
  it; it auto-closes on navigation. On desktop the sidebar is always visible; on touch
  viewports the burger is the only way to reach it.
- **Global keyboard shortcuts** (within the shell): `Ctrl/Cmd+K` toggles the command
  palette; `/` opens full search; `?` toggles the keyboard-hints overlay. Single-key
  shortcuts are inert while typing in an input/textarea.
- **Error boundaries:** one wraps the whole app, one wraps each page, and one wraps the
  Learn session.

### 4.2 Route map

| Path                                                    | Screen                                                                  | In shell? | Loading |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------- | ------- |
| `/`                                                     | Dashboard (course grid)                                                 | yes       | eager   |
| `/course/:courseId`                                     | Course path (or the single lesson directly, if the course has only one) | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId`                    | Lesson view (notes / cards)                                             | yes       | lazy    |
| `/course/:courseId/bank`                                | Question bank (all cards in the course)                                 | yes       | lazy    |
| `/course/:courseId/settings`                            | Course settings                                                         | yes       | lazy    |
| `/course/:courseId/analytics`                           | Course analytics                                                        | yes       | lazy    |
| `/course/:courseId/updates`                             | Shared-course update review                                            | yes       | lazy    |
| `/course/:courseId/cards/new`                           | Card editor (create, course-scoped)                                     | yes       | lazy    |
| `/course/:courseId/cards/:cardId/edit`                  | Card editor (edit, course-scoped)                                       | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/cards/new`          | Card editor (create, lesson-scoped)                                     | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/cards/:cardId/edit` | Card editor (edit, lesson-scoped)                                       | yes       | lazy    |
| `/course/:courseId/sequence/new`                        | Sequence editor (course-scoped)                                        | yes       | lazy    |
| `/course/:courseId/sequence/:sequenceId/edit`           | Sequence editor (edit)                                                 | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/sequence/new`       | Sequence editor (lesson-scoped)                                        | yes       | lazy    |
| `/course/:courseId/occlusion/new`                       | Occlusion editor (course-scoped)                                       | yes       | lazy    |
| `/course/:courseId/occlusion/:occlusionId/edit`         | Occlusion editor (edit)                                                | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/occlusion/new`      | Occlusion editor (lesson-scoped)                                       | yes       | lazy    |
| `/settings`                                             | Settings                                                                | yes       | lazy    |
| `/search`                                               | Search                                                                  | yes       | lazy    |
| `/share`                                                | Share (export/import via codes)                                         | yes       | lazy    |
| `/analytics`                                            | Global (cross-course) analytics                                         | yes       | lazy    |
| `/help`                                                 | Help                                                                    | yes       | lazy    |
| `/course/:courseId/study`                               | Persistent course study conductor                                      | **no**    | lazy    |
| `/course/:courseId/learn`                               | Learn session (practice over every due card in the course)              | **no**    | lazy    |
| `/lesson/:lessonId/learn`                               | Learn session (new cards for one lesson)                                | **no**    | lazy    |
| `/learn`                                                | Review today session across every course                                | **no**    | lazy    |
| `/welcome`                                              | First-run landing page                                                  | **no**    | lazy    |
| `/method`                                               | Technical method page                                                   | **no**    | lazy    |
| `/deck/:deckId`                                         | Redirects to `/`                                                        | yes       | eager   |
| `/study`                                                | Redirects to `/`                                                        | yes       | eager   |

There is no user-facing route for a bare deck or folder; `/deck/:deckId` is kept only as a
redirect so old bookmarks and share-code links do not dead-end. `/study` — the former
standalone Study Today page, folded into the Dashboard in Arc 10 §10.1 — is the same
shim pattern, for the same reason.

### 4.3 Screen wireframes

**Dashboard** (`/`):

```
Your revision
Courses                                              [ + New course ]

+ streak ------+ reviewed today + next 7 days mini-spark ----+
+--------------+---------------+--------------------------------+

+ Course card + + Course card + + Course card +
| Exam in 6d| | ...        | | ...        |  (responsive grid)
| Name      | |            | |            |
| N lessons | |            | |            |
| bar 68%   | |            | |            |
+-----------+ +------------+ +------------+
```

Header with title and New-course button; a motivation strip (`StudySignals`); an inline
new-course composer; a course grid ordered by a configurable **sort** (recent, ready to study,
mastery, exam date, name, or created — Settings → Sidebar has no sort control; the sort lives on
the dashboard itself and persists to `localStorage`); and a review-activity heatmap for anyone
arriving from Anki. Cross-course due review is opened from the sidebar's **Review today** item,
not a separate Dashboard "Study all" button. Empty state invites creating the first course. All
transitions between these regions are coordinated by `LayoutGroup` so adding or reordering
courses does not stutter. Archived courses are excluded from the active grid and shown in a separate
**Archived courses** section with an explicit **Unarchive** action. A course card's context menu (right-click,
keyboard Context Menu key or Shift+F10) offers a confirmed **Archive** action which retains every
lesson, card and review; the completion toast offers Undo by clearing the same `archived` flag.

**Course path** (`/course/:courseId`):

```
< All courses                     ( Path | Question bank | Analytics | Settings )
                                                          ( Read | Edit )
Exam 14 Jun 2026, 23:59
Organic Chemistry                                          [Study]
[path] Lesson 4 of 9   [ring] Mastery 68%   [clock] Due today 12 cards

  (o) Lesson 1 -- completed
   |
  (o) Lesson 2 -- completed
   |
  [!] Checkpoint -- assessment marker
   |
  (o) Practice -- unsecured cards from lessons reached so far
   |
  (*) Lesson 4 -- available
   |
  ( ) Lesson 5 -- locked
```

An ordered path of lesson nodes, checkpoint assessments (informational, never block progress)
and practice nodes, built by `src/course/path.ts`. The breadcrumb row pairs the "All
courses" link with the shared `CourseTabs` component (`src/components/course/CourseTabs.tsx`:
Path · Question bank · Analytics · Settings, active tab derived from the route), rendered
on all four course surfaces and every normal or single-lesson view, so any section is one click
from any other. Lesson URLs keep Path active because a lesson belongs to the path;
`LessonViewModeToggle`
stays CoursePath-only (it configures the path view, not the course) and sits in its own row
above the header, right-aligned. That row also carries the `UpcomingAssessmentsStrip`
(`src/components/course/UpcomingAssessmentsStrip.tsx`), left-aligned: compact date/name pills
for the nearest few future-dated assessments (checkpoints and the final alike), reusing the
same `assessments` array the path itself renders checkpoint nodes from, so exam dates are
visible without opening Course Settings. Clicking a pill opens the same `AssessmentDetailSheet`
a checkpoint node opens. Omitted entirely when no assessment is still ahead of `now`. Practice gathers cards from lessons
reached so far whose predicted retrievability remains below the mastery threshold at each
card's applicable exam horizon; this is not the narrower `card.due` timestamp concept.
Primary and explicitly linked cards count as lesson members, deduplicated by card id. A
course with exactly one lesson skips the path entirely and renders that lesson directly
(no one-node path). The header is the shared `CourseHeader` cockpit
(`src/components/course/CourseHeader.tsx`, with stat primitives in `CourseHeaderStat.tsx`
and `MasteryRing.tsx`): exam eyebrow (pulses when the exam is within three days, via the
`exam-pulse` animation), serif title, and a row of stat blocks each carrying a plain-language
one-line descriptor so distinct metrics can't be conflated. Curriculum position ("Lesson X of
N") is a pacing metric, kept visually and semantically separate from mastery (mean predicted
FSRS retention, shown as a ring rather than a bar) and from due-today (a live count of cards a
session would serve right now), computed via `src/course/path.ts`'s `nearestExamDate` and the
same `fsrs/eligibility.ts` due-card logic the path itself uses.

Curriculum locking controls study progression, not authoring. In Read mode, locked lesson
nodes remain inert; in Edit mode, they retain their locked appearance and status but open the
ordinary lesson authoring view. Edit mode also enables direct path reordering: hold a lesson
node for 350 ms, then drag it to a lesson boundary and release. Moving before the hold cancels
the gesture, as do Escape and pointer cancellation. `Alt+ArrowUp`/`Alt+ArrowDown` provides the
keyboard equivalent with live announcements. Reordering persists through the same
`reorderLessons` repository operation used by Course Settings; checkpoint placement remains
attached to its stable lesson anchor, while manual and automatic Practice positions and
one-way lesson unlock ratchets are deliberately left unchanged.

Assessment placement and coverage are independent. Prefix coverage includes every ordered
lesson through the placement anchor; custom coverage is an explicit, non-contiguous lesson
set that cannot extend past that anchor. An unanchored (`afterLessonId: null`) checkpoint sits
before every lesson, covering none of them; an unanchored final assessment — the state every
newly created course starts in — instead sits after the last ordered lesson, covering
everything taught so far, matching its "everything taught so far" authoring copy. Both modes
resolve primary and linked card membership, deduplicate cards and then apply exclusions.
Deleting an anchor retargets to the nearest surviving predecessor and requires author
confirmation; deleting a custom-covered lesson removes that reference and requires the same
confirmation.
Checkpoint nodes open a detail sheet showing the assessment date, resolved lessons and cards,
exclusions and validation state. Revision starts with that assessment's stable id; the final
assessment uses the same authoring and resolution rules, and each course retains exactly one.

The course header has one **Study** action. It launches the persistent course study
conductor at `/course/:courseId/study`. The conductor rebuilds its next-step decision from the
authoritative course state after every completed lesson or Practice step; it never stores a
fixed queue. Lesson notes, Simple recall, curricular Practice, recurring Practice, transition
reports and Pomodoro breaks therefore form one continuous study period rather than unrelated
routes. Generic entry names the next curriculum step, labels a lesson ready to begin **Start**
when no due review competes with it, and otherwise offers due review separately. When an imminent
assessment overlaps reached, exposed material and has useful work, the conductor also offers each
applicable named assessment, ordered by date. Choosing a branch is temporary and is not retained
as a preference. Selecting a visible manual Practice node or assessment on the path bypasses the
generic choice and enters that exact scope.
Manual-practice insertion controls are persistently labelled at each path boundary. Path nodes
show **Manual** or **Automatic** explicitly. The path is the sole manual-node editor; Course
Settings explains the distinction, lists manual nodes, states that stored custom card filters are
not authorable in the current UI, and links back to the path instead of duplicating the form.
The learner leaves only through an explicit finish action. The step union reserves an
`exam-questions` member for a future engine, but this version creates no placeholder questions
or empty exam UI. A completed lesson enters its transition report through a motion-speed-aware
staged animation: the panel settles, the completion state lands, and the summary and next-step
controls follow. Disabling motion removes the delays rather than trapping the learner behind a
decorative transition.

Curricular Practice keeps a fixed lesson prefix only for its milestone denominator, so later
lessons cannot rewrite or revive that historical milestone. A current automatic or recurring
Practice session uses all reached and exposed material; a manual Practice node may narrow its
live session through its authored lesson selection. Manual checkpoints are conditional. In
Study mode they appear and gate progression only when they have eligible work whose estimated
review time crosses the course's near/far threshold, or when they are the last relevant
opportunity for an urgent assessment intersecting that exact Practice context. An unrelated
assessment never tightens the threshold. Zero-eligible and low-workload nodes remain latent
and non-gating; they remain visible in Edit mode. Completed manual checkpoints remain visible
as curriculum history. Automatic Practice is conductor scheduling machinery and is not
rendered as a separate path diamond.

Assessment revision uses the selected short-term model when its frozen coefficients and card
features validate, otherwise it explicitly uses ordinary Practice. It never completes a curricular milestone.
Selecting an assessment expands from the scope that triggered the offer to the assessment's
full resolved coverage, intersected with reached lessons and exposed cards, then removes
assessment exclusions and unavailable cards. Its eligibility and session objective use the
chosen assessment date alone; overlapping assessment horizons are never blended.

Starting multi-day revision creates or resumes one IndexedDB plan keyed uniquely to that
assessment. The plan freezes its resolved coverage and exclusions, deadline and time zone,
reached/exposed/available membership, per-card lifecycle state, daily budget windows and
completed window/session history. Today's budget initially supplies every remaining local
calendar day through the deadline; individual scheduled days can then be edited or removed.
The plan persists windows rather than card queues, so later allocation can rebuild priorities
from current evidence. Coverage, deadline, time-zone, model-version, reached/exposed/available
scope and review-evidence changes produce deterministic, explained replans. An active window
keeps its captured revision; triggers wait until it closes. `half-life-logistic-v1` passed the
offline benchmark gate and owns short-horizon allocation through the model boundary. The persisted
projection records its coefficient-derived version; invalid model data records the typed FSRS-6
ordinary-Practice fallback instead of invented confidence.

**Review due cards** is a separate ad-hoc course-wide choice inside the conductor. It creates no
path node or milestone, may be launched whenever eligible, and returns to the same conductor
afterwards. The default sidebar exposes the existing cross-course `/learn` session as **Review
today**; it does not replace the course conductor or alter course progression.

Lessons are intentionally authored as short teaching passes. Practice is correspondingly
more frequent, using the existing `practiceMaxGap`, `practiceThresholdMinutesFar` and
`practiceThresholdMinutesNear` insertion controls rather than another cadence mechanism.
The fixture-tested defaults are 8 minutes far from the exam, 4 minutes near it and a maximum
gap of 2 lessons. Existing courses retain their saved values when defaults change.

**Lesson view** (`/course/:courseId/lesson/:lessonId`, `src/pages/LessonView.tsx`):

```
< Course path
Exam 14 Jun 2026, 23:59
Lesson name
[ring] Mastery 71%   [clock] Due today 3 cards   3 cards due today.
──────────────────────────────────────────
Notes                                      [+ Add note]
<collapsible note list, add/reorder/edit>
Cards (12)
<card list with editor>
```

The lesson header adopts the same `CourseHeader` cockpit, scoped to the lesson's own cards
(mastery and due-today only — no curriculum-position stat, since a single lesson has no
pacing sequence of its own). Study dispatch is course-level rather than duplicated here.
Notes and cards sit below a divider as a visually quieter section (smaller
headings, subtle entrance animation respecting `useMotionSpeed`), which renders in one of two
modes resolved by `src/course/lessonViewMode.ts`:

- **Study** (the default): notes render read-only via `LessonNotesStudyView`
  (`src/components/notes/`, reusing `MarkdownView` for each note's body), and cards show a
  summary — count, due count, mastery % — via `LessonCardsSummary` (`src/components/cards/`)
  rather than an editable table.
- **Edit**: the full notes/cards CRUD, extracted into `LessonNotesSection`
  (`src/components/notes/`) and `LessonCardsSection` (`src/components/cards/`) so the page
  component stays a thin layout/data shell. Path authoring chrome — Add lesson, Manual
  practice, the practice-node pencil, and inline course/lesson rename — is also gated on
  `isLessonAuthoringMode` and is absent in Read mode. Settings, the Question Bank,
  Analytics and the command palette are not.

Every course carries its own explicit `Course.lessonViewMode` (`src/db/types.ts`) — no more
site-wide default. It is set directly via a compact Read/Edit segmented control
(`LessonViewModeToggle`, `src/components/course/`) in the CoursePath (its own row above the
course header) and inline LessonView headers, and via a plain Read/Edit choice on Course Settings
(`LessonViewModeSection`, `src/pages/settings/`). `resolveLessonViewMode(course)`
(`src/course/lessonViewMode.ts`) falls back to `'study'` only for courses that predate the
mandatory field (e.g. an old backup restored later); a one-shot startup migration in `App.tsx`
(`stampMissingLessonViewModes`, `src/db/repository.ts`) stamps any such course with the retired
global default's last value so existing users see no behaviour change. A single
`canEditLessons(course)` gate (currently always `true`, since there is no locked-course concept
yet) is the one place that will later decide whether edit mode is available at all — every call
site goes through it rather than reading the mode field directly. When CoursePath renders this
page inline for a single-lesson course, it gets the same full header/CTA treatment, including
exam context via `nearestExamDate`.

**Learn session** (full screen, outside the shell):

```
+ shared header (hidden in Focus Mode) ----------------+
| [=] ORGANIC CHEMISTRY · MODE progress...  68% (o)  |
|                 (Pomodoro) [...] [Focus] [Full] Exit |
+----------------------------------------------------+
|                                                    |
|     +-- flip card (rotateX flip on reveal) --+     |
|     |   QUESTION / ANSWER                     |     |
|     +-----------------------------------------+    |
|                                                    |
|        [   Show answer   ]                          |
|     (after reveal)  [ X No ]  [ OK Yes ]           |
|                  <-> Undo last answer              |
+----------------------------------------------------+
   (green/red glow rises from the bottom on grading)
```

See §3.4 for the full touch-first design system that backs these affordances. In touch mode the bottom controls become a **bottom sheet** that springs up from the
foot of the screen with a drag handle, and the flip card accepts left/right swipes as a
Yes/No equivalent. In keyboard mode, `Y`/`N` (silent) or `1`–`4` (manual) are the grading
keys, and the bottom controls are still rendered for discoverability.

**Card editor**, **Course settings**, **Settings**, **Search** follow the same
centred-column pattern with an eyebrow + display title and `rounded-2xl` sections; the
editor and course settings add a sticky bottom action bar.

---

## 5. Data model (Dexie, `src/db/`)

All tables are keyed by string `id` unless noted. Types live in `src/db/types.ts`.

### Course architecture (the user-facing model)

Schema **v9** introduced the `Course -> Lesson -> Note + Card` model. This is the only model
the UI exposes: every route, sidebar entry and page works in terms of courses, lessons, notes
and cards. Core stores are `courses, lessons, notes, lessonCards, practiceNodes,
lessonCardExposures, lessonCompletions, noteAnnotations, practiceMilestones` and
`courseAssessments` (shapes in `src/db/types.ts`). The old `courseExamDates` store is a
legacy migration/import boundary and is not present in the current schema. Sequences,
occlusions and revision plans are separate current stores. The v9 upgrade folded each
pre-existing standalone deck into
one single-lesson course (scheduling fields copied verbatim) and each folder into one course
whose decks became lessons ordered by `createdAt`; a deck whose exam date differed from the
course kept it as a per-lesson override. Migration mapping lives in
`src/db/courseMigration.ts` (pure, with an injected id generator). Cards gained
`courseId?`/`primaryLessonId?`, and `SessionHistoryEntry`/`UserPerformance` gained
`courseId?`, all stamped during the upgrade.

A course's static metadata includes `name`, `description`, and optional `examBoard` and
`specification` plain strings. The provenance fields are unindexed, additive metadata edited in
Course Settings and included in batch-generation prompt context only when present; they do not
create a first-class exam-board or specification entity.

`src/db/repository.ts` and the React-free read module `src/db/read.ts` expose the course
operations — `createCourse`/`updateCourse`/`deleteCourse` with `listCourses`/`getCourse`,
`createLesson`/`updateLesson`/`deleteLesson`/`reorderLessons` with `listLessons`,
`createNote`/`updateNote`/`deleteNote`/`listNotes`/`reorderNotes`,
`linkCardToLesson`/`linkCardsToLesson`/`unlinkCardFromLesson` with course/lesson card reads,
`createPracticeNode`/`updatePracticeNode`/`deletePracticeNode` with `listPracticeNodes`,
and `createCourseAssessment`/`updateCourseAssessment`/`deleteCourseAssessment` with
`listCourseAssessments`. The current assessment API replaces the old course-exam-date API.
Batch linking validates lesson/card existence, same-course membership and non-primary
membership in one `lessonCards` write transaction; IndexedDB serialises overlapping writes
to that store, making the idempotent duplicate check safe without another schema index.
All functions are independently callable with no UI or React dependency, so future AI
authoring agents and button handlers can share the same layer without duplication.

`PracticeNode.type` is `'auto'` or `'manual'`. Auto nodes are never persisted — they are
computed fresh on every path render from the live due-card backlog (§4.3's path diagram).
Manual nodes are teacher-authored and persisted: in Edit mode, a Manual practice control
between lesson nodes on `CoursePath` inserts one at a specific gap (`position`), and an
edit badge on existing manual nodes lets a teacher reposition, rename or delete them
(`PracticeNodeEditor`, `src/components/course/`). Both are absent in Read mode.
`PracticeNodesSection` in course settings mirrors the same create/edit/delete flow as a
list (§15's Course settings section). Both surfaces share
`practiceNodeDraft.ts`'s draft helpers. Filters (`CardFilter[]`) are supported in storage
but intentionally left out of both forms — there is no existing filter-builder UI to reuse.

`LessonCardExposure { lessonId, cardId, taughtAt }` records that one card has been
introduced successfully in one lesson. The `(lessonId, cardId)` pair is unique. This is
separate from FSRS memory state because Simple mode is teaching, not a scheduled review, and
because a linked card may be introduced independently in several lessons. Lesson completion
and semi-linear unlocking require exposure records for every primary and linked card currently
included in the lesson. Exposure rows are included in backups and restore points, excluded
from course share codes, and cascade with their lesson, card or link.

`LessonCompletion { lessonId, completedAt }` records explicit completion of a cardless
lesson when the learner presses **Continue** after its notes. It is learner progress, so it
is included in backups and restore points but excluded from course share codes.

`NoteAnnotation { id, noteId, startOffset, endOffset, selectedText, body?, createdAt,
updatedAt }` stores a text highlight and its optional free-text annotation. Offsets address
the note's Markdown source; `selectedText` validates the anchor after edits so a stale anchor
is shown as detached rather than applied to unrelated text. Annotations are deliberately
device-local: they are excluded from manual exports, automatic restore points, backups and
course share codes, and are deleted with their note. The first version accepts a selection
only within one ordinary text block; code, maths, embeds and cross-block selections are
rejected.

`PracticeMilestone { nodeKey, courseId, scopeVersion, securedCardCount, totalCardCount,
updatedAt, completedAt? }` stores resumable progress and persistent completion for a manual
or deterministically keyed automatic Practice node. `scopeVersion` prevents stale completion
from being applied to a changed card scope. Milestones are included in backups and restore
points, excluded from course share codes, and are separate from the live readiness value.

Schema **v12** adds `lessonCardExposures`, `lessonCompletions`, `noteAnnotations` and
`practiceMilestones`. Existing reviewed cards are backfilled only for their primary lesson.
Linked rows are not backfilled because the old display-only link proves nothing about where
the card was taught.

### Review history (schema v20)

Schema **v20** adds the canonical `reviewHistory` store, indexed by
`id, cardId, deckId, courseId, primaryLessonId` and `timestamp`. A `ReviewHistoryEntry`
extends `ReviewLog` with its stable store id and card/course ownership. The migration copies
every existing `Card.history` row, including legacy entries without an `eventId`, using a
deterministic id with collision handling; it does not prune or discard history.

New review writes, undo, snapshots, import and course/sequence/occlusion restore paths keep
the canonical store in sync while retaining `Card.history` as a compatibility projection.
Readers hydrate cards from the canonical rows and preserve legacy-only projection rows during
compatibility reads. When a caller supplies an explicit canonical result, including an empty one,
that result is authoritative and stale projection rows are not resurrected. Full backups carry
`reviewHistory` explicitly as well as the card projection, so review history remains recoverable
across export, restore and merge.

### Sequences — overlapping-cloze sequence learning (schema v11)

Schema **v11** adds `sequences: 'id, courseId, primaryLessonId, createdAt'` (additive; no
`upgrade()` needed) and one optional indexed field on `cards`: `sequenceItemId`. A `Sequence`
is an **authoring-time entity only** — it is never itself studied — that generates ordinary
`front_back` `Card` rows via **overlapping cloze**: for items `i₀ … iₙ` and a configurable
`cueWindow` (default 2), each generated card's front shows the preceding `min(cueWindow,
position)` item values (plus the sequence name and, if chunked, the chunk label) and its back
is the item's own value. The first item is cued by the sequence/chunk name alone. This
directly targets the serial-position effect (mid-sequence recall is weakest) by giving every
element a turn as the recall target with local context as the cue.

- `Sequence { id, courseId, primaryLessonId: string | null, name, description?, mode?,
items: SequenceItem[], cueWindow, chunkLabels?, generateLabelCards?, mySpeaker?, presetId?,
createdAt }` — `items` is ordered and stored inline (sequences are small); `primaryLessonId`
  follows the same semantics as `Card.primaryLessonId`. `generateLabelCards` (default off)
  additionally generates an unordered label -> value card per item that carries a `label`
  (e.g. "Atomic number 11 -> ?"), alongside the positional card. These are additive optional
  fields — no schema/index change was needed to add lines mode or presets.
- `SequenceItem { id, value, label?, chunkIndex?, speaker? }` — `id` is stable across edits
  and anchors the generated card(s); `value` is Markdown. `speaker` is optional even in lines
  mode: a speakerless item is always "mine" (see below).
- **Lines mode** (`mode: 'lines'`; `mode` undefined/`'list'` is the original ordered-list
  skin and is unaffected). Items are lines, optionally speaker-tagged
  (`SequenceItem.speaker`) for a scripted scene; `Sequence.mySpeaker` names the one speaker
  whose lines are the recall target — a sequence-level flag (like `cueWindow`/`chunkLabels`)
  rather than a per-item one, since one speaker is "mine" for the whole scene. An item with a
  `speaker` generates a card only if it matches `mySpeaker`; a **speakerless item always
  generates a card**, since there is no other speaker to disambiguate it from — this is what
  lets poetry/verse and a solo speech reuse lines mode with no speaker configuration at all
  (`isMyLine` in `src/db/sequenceGeneration.ts`). Non-mine speaker-tagged lines never get
  their own card but still count towards the cue window, so a generated front reads like a
  script: cue paragraphs render as `NAME: line` (`cueText`) when the cue item has a speaker,
  or a bare value otherwise, and the first-in-scene prompt reads "First line?" instead of
  "First item?". Regeneration (`diffRegeneration`) needs no lines-specific logic beyond
  `generateCards` already filtering by `isMyLine`: switching `mySpeaker` diffs like any other
  content change — deletes the old speaker's cards, creates the new speaker's.
- **Presets** (`src/db/sequencePresets.ts`): a thin, data-only layer over the two modes above
  — no separate generation path. `SEQUENCE_PRESETS` bundles, per named scenario, a `mode`, a
  `defaultCueWindow`, whether the editor should offer speaker tagging (`usesSpeakers`), and
  editor terminology (item/chunk nouns). The sequence editor's picker renders this table
  directly; picking a preset just seeds `mode`/`cueWindow` and relabels the editor. Six
  presets ship: **Ordered list** (`list` mode, the plain default), **Poetry / verse** and
  **Speech / presentation** (`lines` mode, no speakers — mechanically identical once
  speakerless lines are always "mine", kept as two rows purely for name/description since the
  table makes that free), **Script / dialogue** (`lines` mode, `usesSpeakers: true` — the
  original lines-mode behaviour), and **Procedure / checklist** and **Timeline** (`list`
  mode, step/era terminology). `Sequence.presetId` persists which preset was picked, purely
  so editing later redisplays the same terminology; `presetForSequence` falls back to
  inferring a preset from `mode`/`mySpeaker` for sequences created before presets existed (or
  if a preset id no longer resolves), defaulting speakerless `lines` mode to poetry.
- **Lines-mode study flow** (Learn mode): cards generated from a `lines`-mode sequence get
  an optional two-step **hint ladder** between question and reveal — a Hint button on the
  card front (keyboard: `h`) that advances no hint -> first letters -> first words:
  - Step 1, first letters: the answer reduced to each word's initial letter
    (`firstLetterHint` in `src/utils/firstLetterHint.ts`, e.g. "To be, or not to be" ->
    "T b, o n t b"; punctuation kept in place, whitespace normalised).
  - Step 2, first words: the answer reduced to the first word of each clause/sentence
    chunk (`firstWordsHint` in `src/utils/firstWordsHint.ts`, e.g. "To be, or not to be,
    that is the question" -> "To…, or…, that…"; boundary punctuation kept in place).
    The button label reflects the next step ("Hint" then "More hint"); both steps are
    rendered by `LineHintButton`/`LineHintDisplay` (`src/components/learn/LineHint.tsx`).
    The ladder is ungraded and resets per card; full reveal remains the existing, separate
    flip action. LearnMode resolves which pool cards are lines-mode once per session via
    `linesModeSequencesByCard` (`src/db/linesModeCards.ts`), which batches one
    `listSequences` per distinct courseId among the pool's generated cards. Strict grading
    reuses the global typed-answer mode: with the typing setting on 'type', a lines-mode card
    is typed against verbatim and diffed word-by-word via `compareAnswer`
    (`src/utils/answerComparison.ts`) — feedback only; Yes/No self-grading remains the grade.
    Using any hint step is recorded as `ReviewLog.hintUsed` and nudges the invisible
    silent-mode grade (see "The invisible timer & grading" below); manual grading is
    unaffected.
- **Script paste import** (`src/db/scriptSplitter.ts`, `splitScript`): a pure parser for the
  lines-mode editor's paste + auto-split flow. A line matching `NAME: dialogue` starts a new
  item for that speaker; a following non-matching line is folded in as a wrapped continuation
  of the same speech; blank lines are separators only and never break a continuing speech.
  `src/components/sequences/ScriptPasteImport.tsx` wraps it in a paste → preview → correct →
  confirm modal (mirroring `LinkCardsDialog`'s shell) so the author can fix a misattributed
  speaker or line before it replaces the editor's item list.
- `Card.sequenceItemId?: string` is present iff the card was generated from a sequence item:
  the positional card carries the item's own id; the label card (when generated) carries
  `${item.id}::label` (`LABEL_CARD_SUFFIX`), so the two never collide and `isLabelCardId`/
  `baseItemId` (`src/db/sequenceGeneration.ts`) can recover the relationship without a
  second field.
- **Generation and regeneration** (`src/db/sequenceGeneration.ts`) is a pure, Dexie-free
  module — deliberately so its correctness (the risk centre of this feature) is covered by
  exhaustive unit tests ahead of any UI or repository code. `diffRegeneration` compares a
  previous and edited `Sequence` and produces create/update/delete instructions per card: an
  edited item updates its card's content in place (memory state kept); an inserted/reordered
  item regenerates only the affected cue-window fronts (memory state kept, since the recall
  target is unchanged); a deleted item deletes its card. `sequenceForItemId` resolves which
  `Sequence` (if any) owns a generated card's `sequenceItemId`, for grouping/badging.
- **Repository** (`src/db/sequenceRepository.ts`, re-exported from `src/db/repository.ts`):
  `createSequence`/`updateSequence`/`deleteSequence`/`listSequences`, plus
  `snapshotSequence`/`restoreSequence` for the standard undo pattern (a `SequenceSnapshot`
  captures the sequence and its generated cards together). `createSequence` and
  `updateSequence` generate/regenerate cards in the same transaction as the sequence write.
- **Portability**: sequences ride through backup export/import (replace and merge, by the
  same per-table semantics as the other course-architecture tables), diagnostics bundles
  (`sequences` count), and course share codes as an **additive v2 field** (§13) — older v2
  codes without it still parse. `presetId` travels as share code field `pr`, but only when it
  can't be re-derived from `m`/`ms` alone (i.e. only to distinguish poetry from speech, or
  procedure/timeline from a plain list) — `presetForSequence` on both ends keeps the common
  case free of payload cost.
- Generated cards are **read-only** in the card editor (edit the sequence instead) and
  carry a `GeneratedCardBadge` (`src/components/cards/GeneratedCardBadge.tsx`) wherever cards are
  listed, searched or shown in the command palette; `CardList` additionally groups
  generated cards under their owning sequence (`GeneratedCardGroup`, shared with occlusions)
  rather than listing them loose (§12). This is enforced below the UI too: `deleteCards`/`moveCards` (the
  generic bulk mutations) run an `assertNoGeneratedCards` check and throw if any targeted
  card has a `sequenceItemId`, while sequence-internal paths (`updateSequence`'s diffing,
  `deleteSequence`) mutate `db.cards` directly and bypass the guard.
- **Quick entry:** the add control follows the item list, so it remains beside the current
  working position, while each row also offers an add-below control. Adding an item focuses
  it and scrolls it into view without overriding reduced-motion preferences.
  `Ctrl/Cmd+Enter` from a non-empty item's value editor inserts and focuses the next item
  directly after it; an empty item is marked invalid instead of creating blank chains. The
  shortcut is scoped to item content and does not fire from sequence metadata fields.

### Occlusions — image occlusion (schema v19)

Schema **v19** adds `occlusions: 'id, courseId, primaryLessonId, createdAt'` (additive) and one
optional indexed field on `cards`: `occlusionRegionId`. An `Occlusion` follows the Sequence
precedent exactly: an **authoring-time entity only**, never itself studied, that generates
ordinary `front_back` `Card` rows — one per region — anchored by a stable region id, so editing
a region regenerates that card's presentation while preserving its FSRS memory state. It is
deliberately *not* an Arc 11 `payload`: a payload has no owner to regenerate from.

- `Occlusion { id, courseId, primaryLessonId: string | null, name, assetHash, regions:
  OcclusionRegion[], createdAt }` — `regions` is stored inline (occlusions are small);
  `primaryLessonId` follows the same semantics as `Card.primaryLessonId`. `assetHash` names
  the diagram in the `assets` store.
- `OcclusionRegion { id, role, shape, x, y, w, h, answerText?, pairedRegionId?, backNote? }` —
  `id` is stable across edits and anchors the generated card. **Coordinates are fractions of
  the image (0..1), never pixels**, so masks hold their position under `FlipCard`'s responsive
  sizing and at any zoom. `shape` is `'rectangle'` in this version but is persisted explicitly
  so later geometry never has to guess what an old record meant.
- **A region's role decides which of two card kinds it produces**, from one annotated image:
  - A **label** region covers text already printed on the diagram. Revealing it uncovers the
    diagram's own pixels, so the author types nothing.
  - A **feature** region points at part of the drawing. Its answer is the *paired* label
    region (`pairedRegionId`), uncovered on the back; an unpaired feature falls back to its
    own `answerText`.
- **Masking rules** (`resolveOcclusionFace`): both kinds mask **every** label region on the
  front, without exception — a feature card that left labels visible would be answerable by
  reading the picture, and a label card that left its siblings visible by elimination. The
  card's own region is always ringed as the target. The back lifts exactly one mask.
  `backNote` renders below the image where present.
- `Card.occlusionRegionId?: string` is present iff the card was generated from a region.
  Region geometry is **never** copied onto the card: the study renderer resolves masking live
  from the owning `Occlusion`, which is what keeps `diffRegeneration`'s front/back-only update
  contract intact. The card's `front`/`back` carry a plain-text fallback only
  (`"Label 3 of 6 — Plant cell"`), so search, the card-list preview and any client that cannot
  render an occlusion degrade to something legible rather than blank.
- **Generation and regeneration** (`src/db/occlusionGeneration.ts`) is a pure, Dexie-free
  module tested exhaustively ahead of any UI, and routes through the same `diffRegeneration`
  contract as sequences: moving or resizing a region, changing its role, or re-pairing it
  rewrites that card's content and keeps its memory state; deleting a region deletes its card;
  adding one creates a card; replacing the image regenerates every card in the occlusion (the
  editor warns first). FSRS/scheduling fields are never written.
- **Repository** (`src/db/occlusionRepository.ts`): `createOcclusion`/`updateOcclusion`/
  `deleteOcclusion`/`listOcclusions`, plus `snapshotOcclusion`/`restoreOcclusion` for the
  standard undo pattern. Creates and regenerations happen in the same transaction as the
  occlusion write. `updateOcclusion` clears a `pairedRegionId` left dangling by a removed
  label region, so the surviving feature card regenerates against its own `answerText` rather
  than pointing at a region that no longer exists.
- **Diagram upload** (`src/db/occlusionImage.ts`) uses its own 2560px longest-edge ceiling
  rather than `compressImage.ts`'s 1280px default, so small printed labels survive
  compression legibly. Otherwise identical to the ordinary image path.
- **Study** (`src/components/occlusion/OcclusionStudyFace.tsx`): masked labels, ringed target,
  ordinary reveal and grade row. `occlusionDataByCard` (`src/db/occlusionStudy.ts`) resolves
  each pool card's owning occlusion once per session, batching one `listOcclusions` per
  distinct courseId — the same approach `linesModeCards.ts` uses. Typed mode is offered only
  where the target region resolves an `answerText`. **A missing asset degrades to the card's
  plain-text fallback rather than a broken image**, which is what makes §13's share-code
  behaviour merely disappointing rather than unusable.
- **Editor** (`src/pages/OcclusionEditor.tsx`, routes `/course/:courseId/occlusion/new`,
  `/course/:courseId/lesson/:lessonId/occlusion/new` and `…/occlusion/:occlusionId/edit`): two
  draw tools (label box, feature), a region list with role chips and inline pairing, a detail
  pane, and a live generated-card count in the footer, following the sequence editor's
  precedent. Regions default to `Box 1…n` so the list is navigable with no typing. Authoring
  is deliberately desktop-first: drawing with a finger works but is not separately optimised.
- **Portability**: occlusions ride backup export/import (replace and merge) and diagnostics
  bundles (`occlusions` count) by the same per-table semantics as sequences. A diagram is
  referenced *only* by `Occlusion.assetHash` — never by card Markdown — so both
  `exportDatabase` and the asset GC gather occlusion hashes explicitly; without that a backup
  would restore occlusions with no image. Share codes carry occlusions as an additive v2
  field, but **not** the diagram (§13).
- Generated cards are **read-only** in the card editor and carry a `GeneratedCardBadge`
  wherever cards are listed, searched or shown in the command palette; `CardList` groups them
  under their owning occlusion (`GeneratedCardGroup`, shared with sequences) rather than
  listing them loose. Enforced below the UI by the same `assertNoGeneratedCards` guard on
  `deleteCards`/`moveCards`.

### Deck and Folder (legacy backing structures, no UI)

`Deck` (`id, name, examDate, createdAt, examDatePromptDismissed?, fsrsVersion,
fsrsParameters, examObjective, newCardsPerDay?, archived?, autoOptimise?, folderId?,
colour?, timeZone?`) and `Folder` (`id, name, parentId?, createdAt`) are the tables the
original Folder/Deck model was built on. They are **not deleted and not dead** — a course is,
mechanically, a hidden deck-shaped `SchedulerConfig` (see §5's course section and §8), and
every lesson is backed by one real `Deck` row so the FSRS engine, cooldown module and
scheduling optimiser keep working exactly as before against a stable per-lesson scheduling
context. The Question Bank's course-wide view is similarly backed by a lazily created
per-course bank deck. No page, route or sidebar entry lets a user see, name or manage a deck
or folder directly; `fsrsVersion`, `fsrsParameters`, `examObjective`, `newCardsPerDay`,
`autoOptimise` and `colour` are the fields a lesson/course still reads and writes through this
backing structure. Dropping these tables and folding the backing mechanism into the course
tables outright is a deferred, later migration (`docs/archive/roadmap-2026-08-11.md` §0.3) — not attempted while the
course UI is still soaking.

### Card

`id, deckId, courseId?, primaryLessonId?, type, front, back, payload?, stability|null, difficulty|null,
lastReviewed|null, reps, lapses, state, tags?, suspended?, flagged?, buriedUntil?,
reverseCardId?, sequenceItemId?, occlusionRegionId?, due|null, scheduledDays, learningSteps,
history[], createdAt`

- `front`/`back` are Markdown source. **Cloze** source lives entirely in `front`
  (`{{cN::...}}`); `back` is empty.
- `payload` carries versioned structured practice-item data independently of the classic
  presentation `type`. A v1 `numeric` payload stores an exact, tolerance or one-of answer
  specification; a v1 `working` payload stores compiled scheme lines and optional fixtures.
  Its `back` remains empty because the checker, not a revealed answer, grades it. The
  `scaffold` discriminant is reserved for a later payload version but has no authoring, study or
  verification surface in this release.
- `tags` remain free-form strings. Specification-point provenance uses the manual `spec:3.4.1`
  convention; there is no separate specification-point model or batch-generation field.
- `stability` (days; the interval at which R = 0.90), `difficulty` (in [1,10]),
  `lastReviewed`, `due` are all `null` until the first review.
- `reps, lapses, state, scheduledDays, learningSteps, due` mirror ts-fsrs's card fields.
  `state in {0 New, 1 Learning, 2 Review, 3 Relearning}`.
- `history[]` is the compatibility projection of the canonical schema-v20 `reviewHistory`
  rows. It contains `ReviewLog` entries (timestamp, grade, responseTimeSec, distracted,
  stability/difficulty before+after, retrievabilityAtReview|null, session/revision provenance,
  and optional machine-awarded `marksEarned`/`marksAvailable`, line verdicts and checker
  disputes for structured items).
- Teaching state is intentionally absent from `Card`; it is lesson-specific and lives in
  `LessonCardExposure`.

### SessionHistoryEntry

`{ id?, eventId?, sessionId?, revisionPlanId?, revisionWindowId?, timestamp, deckId, courseId?,
averagePredictedRetrievability }` — written **per answered card**; analytics aggregate to the
last snapshot per calendar day to plot the trajectory. The event/session and revision fields
preserve provenance for ordinary and assessment-revision sessions.

### UserPerformance (transitional calibration profile)

`{ deckId, courseId?, runningMeanResponseTime, runningStdDevResponseTime, m2,
totalCorrectReviews }` — a Welford running mean/variance over **correct (Yes) reviews only**,
used to calibrate the invisible grader. Course-scoped review writes the course identity;
legacy/deck-shaped reads remain during the staged Course/Deck migration, so the storage shape
must not yet be treated as a settled scientific claim about the right calibration scope.

### MediaAsset / BackupAsset

- `MediaAsset { hash, blob, mimeType, kind?, width?, height?, createdAt }` — a card image or
  audio clip stored
  as a **`Uint8Array`** in the `assets` table, keyed by the SHA-256 of its bytes so
  identical media is stored once. `kind` is absent on pre-Arc-6 records and therefore means
  image; audio records use `kind: 'audio'` and omit dimensions. (`Blob | Uint8Array` in the type for backward
  compatibility, but the implementation always stores `Uint8Array` for cross-environment
  consistency, including `fake-indexeddb`.) Card Markdown carries only a
  `lacuna-asset://<hash>` reference, resolved to an object URL at render time via
  `toBlob()` and held in a bounded 200-entry LRU cache. Eviction revokes the old URL, and
  app teardown revokes all remaining URLs. This keeps reactive card reads small, stops base64
  inflating exports and quota, and avoids the create/revoke churn on every card flip during a
  fast Learn session.
- `BackupAsset { hash, data(base64), mimeType, kind?, width?, height?, createdAt }` — the
  JSON-safe form of a `MediaAsset` carried in backup/export files.

### BackupSnapshot / BackupFile / AppStateEntry

- `BackupSnapshot { id?, createdAt, tag?, deckCount, cardCount, payload }` — a stored
  automatic restore point (denormalised counts so the list renders without parsing the
  payload). `tag = 'pre-migration'` marks a snapshot taken automatically before a schema
  upgrade; these are **exempt from daily-snapshot pruning** so a botched migration always
  has a fallback (§13).
- `BackupFile { app:'lacuna', version, exportedAt, decks, cards, reviewHistory?, assets,
sessionHistory, userPerformance, folders?, courses?, lessons?, notes?, lessonCards?,
lessonCardExposures?, lessonCompletions?, practiceNodes?, practiceMilestones?,
courseAssessments?, revisionPlans?, sequences?, occlusions?, courseExamDates? }` — the
shape of both manual exports and snapshot payloads. Current exports include canonical
`reviewHistory`, `courseAssessments`, `revisionPlans`, `sequences` and `occlusions`; the
legacy `courseExamDates` field is accepted for old imports but is never emitted. `noteAnnotations`
and lineage merge state are deliberately absent. `version` is the portability format version
(currently 10), not the Dexie schema version. The optional arrays let older backups import cleanly.
- `AppStateEntry { key, value }` — small persistent app state (e.g. the backup folder
  handle, sidebar settings, input mode, motion speed).

---

## 6. FSRS-6 engine wrapper (`src/fsrs/fsrs.ts`)

A thin, pure translation layer over `ts-fsrs`. **No memory maths is implemented by hand.**

- `makeEngine(params)` builds an FSRS-6 scheduler: `fsrs({ w, request_retention,
enable_short_term: true })`.
- `decayOf(params) = -params.w[20]` — the (always negative) forgetting-curve decay exponent.
- `toTsCard(card, now)` / `fromTsCard(ts, now)` map between Lacuna's persisted card shape
  and ts-fsrs's; a never-reviewed card becomes a fresh `createEmptyCard` so ts-fsrs applies
  the correct initial-stability/difficulty path.
- `applyReview(engine, card, grade, now)` returns the new memory state plus the
  retrievability at the instant of review (`get_retrievability`, `null` on a first review),
  via `engine.next`.

Constants (`src/fsrs/params.ts`): `FSRS_VERSION = 6`; default weights and request retention
from ts-fsrs; target retention is user-clampable to **[0.80, 0.97]** (default = ts-fsrs
default); difficulty bounds `[1, 10]`; `MASTERY_R = 0.90`; `MS_PER_DAY = 86_400_000`.

**On the algorithm version (honesty note).** Lacuna uses FSRS-6 because that is what
`ts-fsrs` exposes — not because it is the newest FSRS in existence (FSRS-7 exists). Copy
and comments are pinned to "the version ts-fsrs ships", not to "the newest". Also, FSRS
has **no short-term memory model** of its own. Lacuna composes the benchmark-selected
`half-life-logistic-v1` predictor with FSRS-6 for assessment revision (§10); FSRS still owns every
real long-term state transition. Invalid model data falls back explicitly to ordinary Practice and
the UI makes no short-horizon confidence claim in fallback.

---

## 7. Forward simulation & core formulae (`src/fsrs/forwardSim.ts`)

This is Lacuna's own pure layer that projects a card to the **exam date** rather than to
its next due date. It touches neither IndexedDB nor React, so every function is
unit-tested.

**Forgetting curve (FSRS-6 power law).** With `decay = -w20` (negative) and `t`, `S` in
days:

```
factor   = 0.9^(1/decay) - 1
R(t, S)  = (1 + factor . t / S)^decay
```

By construction `R = 0.90` exactly when `t = S`, for any decay. With `decay = -0.5` (the
fixed FSRS-4.5 decay), `factor = 19/81`, so the curve reduces exactly to FSRS-4.5. A card
with `S <= 0` has `R = 0`; elapsed time is clamped at 0.

**Predicted exam-day retrievability with no further review** (`rAtExam`):

```
days = max(examDate - lastReviewed, 0) / MS_PER_DAY
R_no = forgettingCurve(days, stability, decay)
```

A never-reviewed card (no stability/lastReviewed) -> `R_no = 0`.

**Predicted exam-day retrievability if reviewed now** (`rAtExamIfReviewedNow`):

```
daysRemaining = max(examDate - now, 0) / MS_PER_DAY
if daysRemaining == 0 -> 1.0                     (a review on exam day leaves R = 1)
S'   = ts-fsrs.next(card, now, expectedGrade).stability
R_yes = forgettingCurve(daysRemaining, S', decay)
```

The assumed `expectedGrade` is **Good** (deterministic, dependency-free).

**Delta-R — the marginal value of reviewing now** (`deltaR`):

```
DR = R_yes - R_no
```

For a new card `R_no = 0`, so `DR = R_yes`. As a card's exam-day R approaches 1, `DR -> 0`.

---

## 8. The exam objective — the core invariant (`src/fsrs/objective.ts`)

A deck's `examObjective` is the single value from which **both** the scheduler's sort key
and the progress-bar value are derived, so they can never disagree.

### Progress-bar value (`progressValue`, via `src/fsrs/progress.ts`)

- `expectedMarks` -> **mean predicted exam-day R** across the cards:
  `averagePredictedRetrievability = (Σ rAtExam) / n`.
- `securedTopics` -> **fraction of cards with predicted exam-day R >= 0.90**:
  `masteryFraction = |{ c : rAtExam(c) >= 0.90 }| / n`.
- An empty set is treated as `1` for mastery and `0` for the mean.

### Scheduler sort key (`scoreCard`; higher = serve sooner)

- `expectedMarks`: greedy maximisation of Σ R, so the score **is** `DR`.
- `securedTopics`, evaluating each card:
  - if already secured (`R_no >= 0.90`) -> score `-1` (nothing to gain, lowest priority);
  - else if a single review secures it (`R_yes >= 0.90`) -> score `1 + R_no` (a higher
    current R means it is closer to the line and cheaper to secure, so rank those first;
    the `+1` keeps every securable card above every not-yet-securable one);
  - else -> score `R_yes` (make the most progress available toward the line).

### Objective complete? (`isObjectiveComplete`)

- `securedTopics`: every card is at or above 0.90 (`masteryFraction >= 1`).
- `expectedMarks`: no card offers a meaningful further gain —
  `max(DR) < EXPECTED_MARKS_EPSILON (1e-3)`.

Helper copy (`progressNoun`, `progressHeading`) phrases the same
number appropriately ("predicted score" vs "secured").

### The scheduling horizon (`src/fsrs/horizon.ts`, `src/fsrs/examDate.ts`)

A card's horizon is resolved **per card**, not shared uniformly across a whole unit,
because a course can carry several `CourseAssessment` records (each explicitly placed and scoped)
to a subset of lessons) as well as a per-lesson `Lesson.examDate` override.
`resolveCardExamDate` (`src/fsrs/examDate.ts`) picks the effective exam date for one
card in strict order:

1. **Lesson override** — if the card's primary lesson has an `examDate`, use it
   outright, even if it is in the past and even if a sooner checkpoint exists.
2. **Nearest applicable future assessment** — among the course's `CourseAssessment` rows
   that apply to the card (respecting resolved coverage and `excludedCardIds`), the
   soonest one still `>= now`. A passed checkpoint is ignored, so the next-nearest
   checkpoint (or the course default) naturally takes over.
3. **Course default** — the course's own `examDate`.

`cardSchedulingHorizon` then applies the same "keep revising" fallback
`schedulingHorizon` has always had: once the resolved date is in the past, the horizon
rolls forward to `now + MAINTENANCE_HORIZON_DAYS` (7 days) rather than letting
`daysRemaining` clamp to 0 (which would read every card as R = 1 and pin the bar to a
bogus 100%).

Per-card resolution is used wherever a specific card is being scored or counted:
`scoreCard`/`isObjectiveComplete` (`objective.ts`), `masteryFraction`/
`averagePredictedRetrievability` (`progress.ts`), and assessment revision eligibility.
`ObjectiveContext` carries the resolution context (`examDateCtx`) when
built for a Course unit (its lessons and `courseAssessments` loaded alongside it); it is
absent for legacy Deck-scoped/global sessions, which keep resolving against the single
`deck.examDate` exactly as before, via the plain `schedulingHorizon`.

A few consumers deliberately stay unit-level rather than per-card, because they weight
or gate a whole unit rather than score one card: `urgency` (multi-deck blending, §10)
and the auto-practice insertion threshold (`shouldInsertPractice`, `src/fsrs/
practice.ts`) both still read the coarser `schedulingHorizon`, so a passed exam no
longer reads as permanently maximally urgent — without claiming the per-lesson
precision they don't need. The live Course session, path and progress callers supply
`ExamDateContext`; legacy Deck callers continue to use the unit-level fallback.

### 8.1 Parameter optimisation (`src/fsrs/optimise.ts`, Web Worker)

The default weights are a starting point; most of FSRS's efficiency comes from fitting
them to a user's own history. Lacuna uses the **official gradient-based trainer** from
the ts-fsrs authors (`@open-spaced-repetition/binding`, fsrs-rs compiled to WASM):

- each card's `history[]` is converted to the binding's review-item format (grade 1–4,
  `deltaT` in days since the previous review, with `0` on the first review);
- `computeParameters()` fits the 21 weights with `enableShortTerm: true`, consistent with
  the scheduler (`makeEngine`);
- fitted weights are **validated against the FSRS clamp ranges** (`CLAMP_PARAMETERS` /
  the same bounds as `clipParameters`) before they can ever be applied; out-of-range
  results are rejected;
- before/after **log loss** is computed on a **held-out validation portion** (the last
  20% of each deck's review history by time) so the metric is out-of-sample, not
  training-set overfitting. The confirmation step only offers to apply the fitted
  weights when they beat the defaults out of sample;
- it is **gated** on `MIN_OPTIMISE_REVIEWS` (1,000) so the train/validation split is
  meaningful;
- it runs in a **Web Worker** (`src/workers/optimise.worker.ts`, initialised via
  `initOptimizer` with Vite `?url` / `?worker` imports; driven by `useOptimiser`) so the
  UI never blocks, reporting trainer progress and the before/after summary. The
  dev/preview server sets cross-origin isolation headers required by the WASM worker;
- new weights are applied only on explicit confirmation, after an automatic pre-change
  restore point; a "Reset to defaults" path is always available. A global default
  (on) and a per-course `autoOptimise` override govern whether the action is offered
  (§15).

### 8.2 Post-exam state

A course whose `examDate` has passed is detected (`examHasPassed`) and surfaced clearly
rather than silently stopping: the course card on the dashboard reads "Exam date passed".
Course Settings lets the exam date be changed (**set a new exam date**), and with no further
action the course simply keeps revising against the rolling maintenance horizon above. The
underlying `archived` flag withdraws the course from active study and dashboard totals while
retaining its data. The dashboard course-card context menu exposes this through a confirmation
dialog, with a reversible Undo toast. Archived courses appear in the dashboard's **Archived
courses** group with an **Unarchive** action. Course Settings does not expose the archive action;
its scheduling controls only change the exam date or leave the course revising.

---

## 9. Eligibility & study pool (`src/fsrs/eligibility.ts`)

The single rule set that keeps the scheduler and the progress denominator in agreement
when cards are withheld.

- `isAvailable(card)` — not `suspended` and not currently `buried` (`buriedUntil > now`).
  Suspended/buried cards are excluded **entirely**: from the study pool _and_ from the
  progress/objective denominator while excluded.
- `newCardsIntroducedToday` — cards whose first-ever review timestamp is today.
- `studyPool(cards, deck)` — returns **empty for an archived deck** (withdrawn from
  study while its cards are retained in the progress denominator), otherwise available
  cards with brand-new (`state 0`) cards rationed by the deck's `newCardsPerDay` cap:
  ```
  budget    = max(cap - newCardsIntroducedToday, 0)
  newAllowed = oldest-first new cards, sliced to budget
  pool       = available cards where state != 0 OR id in newAllowed
  ```
  An undefined/zero cap means unlimited. The cap only rations **today's** study pool;
  it does **not** change the dashboard denominator, so the deck's exam-day trajectory
  stays honest while a session paces new material.

Course-path study applies two additional, explicit pools:

- **Lesson pool:** cards included in that lesson through either `primaryLessonId` or
  `LessonCardLink`, deduplicated by card id, for which no `(lessonId, cardId)` exposure
  exists. FSRS `state` is irrelevant here: a card may be scheduled elsewhere but still be
  unseen in this lesson.
- **Practice pool:** available cards belonging to at least one reached (`available` or
  `completed`) lesson, again including links and deduplicating by card id, which have been
  exposed in at least one lesson and whose predicted retrievability at their per-card
  scheduling horizon is below `MASTERY_R`. The exposure requirement prevents Practice from
  leaking unseen material. A link affects reachability but not horizon resolution, which
  remains anchored to the card's primary lesson and single shared FSRS memory state.

The existing `isDue`/`dueCards` helpers retain their narrower timestamp-based job for
"due today" display counts. They do not define Practice eligibility.

---

## 10. Learn mode (`src/pages/LearnMode.tsx`, `src/fsrs/session.ts`, `cooldown.ts`)

A Learn session may study a lesson, a course Practice node, a **single deck**, or **every
deck at once** (the legacy global review session). FSRS-backed sessions run through one engine
so ordering and progress stay objective-derived; lesson teaching uses the Simple-mode loop.
Course-guided sessions run inside the persistent conductor, while direct legacy routes remain
available for standalone entry.

### Session lifecycle

1. **Load** a static snapshot of the deck(s) and their cards (an optional `?tag=`
   filter narrows a single-deck session). Build a `SessionContext` (one objective
   context per deck) and per-deck `UserPerformance`. Capture `progressBefore`.
2. If there is nothing to study or the objective is already met, go straight to the
   **report**.
3. Otherwise **serve** cards one at a time until the objective is met or the user exits.

For a lesson selected by the course conductor, the lifecycle starts with its notes in order. The
learner may highlight source text and attach optional free-text annotations before moving to
the card loop. Highlights and annotations persist on this device but are excluded from every
portability format. The card loop then contains only lesson members without an exposure for
that lesson, including both primary and explicitly linked cards.
If the lesson has no cards, **Continue** records `LessonCompletion` and advances the path.
Lesson authoring should favour fewer cards per pass and more lesson units where necessary;
the aim is lower working-memory load, not less course content.

### Card selection (`selectNext`)

- **Single deck:** exactly the per-deck objective order (`sortByObjective`) with
  cooldown skipping (`selectNextCard`).
- **Multiple decks:** each card is scored by _its own_ deck's objective; scores are
  **min-max normalised within each deck** to 0..1 and weighted by an exam-proximity
  urgency, so figures are comparable across decks with different objectives and
  deadlines:
  ```
  urgency(deck)   = 1 / (1 + daysUntil(schedulingHorizon(deck)))
  priority(card)  = urgency(deck) . (score - min_deck) / (max_deck - min_deck)
  ```
  The highest-priority card not on cooldown is served; if all are on cooldown, the
  soonest-eligible (then highest priority) is served so the session never stalls.
  **Degenerate-range guard:** when a deck's scores are all equal
  (`max_deck - min_deck ≈ 0`, e.g. a single-card or uniform deck) the normalised term
  is treated as `1` instead of dividing by zero, so such decks are still served and
  never produce `NaN`.

### Named assessment revision (`src/course/revisionPlan.ts`, `src/fsrs/cramAllocator.ts`)

Assessment revision is entered only with an explicit assessment id. Starting it creates or
resumes that assessment's persisted plan, then starts one explicit plan/window pair in the
existing Practice player. Scope is frozen from the assessment's resolved coverage intersected
with reached lessons and exposed cards, minus authored exclusions and unavailable cards; no
untaught material leaks into revision. Completed windows record reviewed, improved and parked
card ids plus review-event provenance, never a curricular Practice milestone.

The planner stores daily time budgets rather than a fixed queue. Edits to assessment coverage,
deadline or time zone, reached/exposed/available scope, review evidence or the selected model
produce deterministic, explained replans. An active window retains its captured revision until
completion. Passed assessments archive their plan read-only and ordinary per-card horizon
resolution moves on to the next applicable assessment.

The runtime uses the frozen `half-life-logistic-v1-lag64-count8` global fit for exact-second
prediction through six days, then smoothsteps its probability into ordinary FSRS-6 through day
seven. The probabilities are blended rather than added, and every simulated outcome receives
exactly one normal FSRS transition. Successful branches currently use the scheduler's established
deterministic Good convention. Personal terms remain global below 500 scored examples; supported
local intercept and preceding-outcome fits use weight `n / (n + 1000)`. Missing, corrupt or
unsupported coefficients or card features persist the typed ordinary-Practice fallback and hide
readiness. Valid plans may report mean predicted assessment-day readiness with outcome uncertainty;
these are predictions, not promised marks. The retired `?mode=cram` query has no caller or product
behaviour.

### Cooldown (`src/fsrs/cooldown.ts`)

In-memory, per session, to stop a just-failed card being shown again immediately:

```
maxCooldown(deckSize) = deckSize >= 6 ? 5 : max(deckSize - 1, 0)
```

A failed card (grade 1) is given that cooldown; after every answer, all _other_
cards' cooldowns decrement by one (skip-and-decrement).

### Grading modes (`src/state/gradingMode.ts`)

Two modes, chosen in Settings (default **silent**):

- **Silent (default):** the learner presses only Yes/No and the four-point grade is
  inferred (below). This is the product's core UX bet.
- **Manual:** the four FSRS buttons (Again/Hard/Good/Easy) are shown and the user
  grades directly; no inference is applied.

### Typing setting (`src/state/typingSetting.ts`)

Two modes, chosen in Settings (default **reveal**), mirroring the grading-mode toggle above:

- **Reveal (default):** the ordinary flip-card flow — tap/press to reveal the answer.
- **Type:** before reveal, an eligible card (front_back, basic_reversed, or cloze) shows a
  text input; on reveal, the typed answer is compared against the expected answer
  (`src/utils/answerComparison.ts`, front_back/basic_reversed use `back`, cloze uses the
  joined deletion text via `clozeAnswerText`) and shown word-by-word with match/mismatch
  highlighting. This was previously a dedicated `typing` card type; it is now a global
  presentation mode that applies to any eligible card, so a course does not need
  typing-specific cards to use it. Self-grading (Yes/No or the four FSRS buttons) is
  unchanged — the comparison is feedback only, never an automatic grade. How strictly the
  comparison matches is a separate per-user setting, **grading strictness**
  (`src/state/answerStrictness.ts`, chosen in Settings next to the typing toggle, default
  **lenient**): lenient ignores case and punctuation (the original behaviour), standard
  ignores case only, and exact requires both to match. `answerComparisonOptions` maps the
  level to `AnswerComparisonOptions` for `compareAnswer`.

### Structured-item verification

`src/items/verify.ts` is a pure, offline boundary over the number-only mathjs entry point.
It accepts ordinary notation such as `2x+6=14`, `3/4`, `sqrt(16)` and `x^2`, rejects assignments,
collections and unapproved functions, and renders the validated tree as KaTeX for preview.
Equivalence is checked by evaluating both expressions over the same deterministic random draws.
Each variable draws its own sign, so every sign combination is reachable rather than only the
alternating pattern an index-derived sign allows, and the sample magnitude widens as draws fail so
that expressions defined only away from the origin (`sqrt(x - 100)`) are still sampled inside their
domain. The seed travels through each line verdict and review log, so a disputed result can be
replayed exactly; random evaluation is deliberately not presented as symbolic proof.

Comparison returns three outcomes, not two: `equivalent`, `different`, and `undetermined` for the
case where too few sample points leave both expressions finite. `undetermined` is never reported as
a wrong answer. A working line that reaches no verdict — including one whose scheme expression no
longer parses or whose predicate arguments are unusable — is flagged `undetermined` on its
`LineVerdict`, counted in `WorkingVerificationResult.undeterminedLines`, and shown in the study face
as unchecked rather than as a zero, with the existing dispute control alongside it. It earns no
marks, so the marks total still reflects only what the checker could actually award. Numeric answer
specifications share this parser for exact, tolerance and one-of checks.

A value predicate (`equals`, `within`, `matches-one-of`) accepts an answer written as
`<variable> = value` as well as the bare value, since students and authoring models alike end their
working with `y = 3` rather than `3`. The line as written is tried first, so nothing that matched
before stops matching, and only a bare variable on the left is reduced — an equation carrying real
content, such as `2y = 6` or `6+4=10`, keeps its meaning. Waypoints are excluded entirely: there the
equation is the content.

A payload with an unrecognised version, or a recognised-but-unsupported `kind` (currently
`scaffold`), renders `UnknownItemFace`: the readable `front` fallback and a plain notice that this
version can't study it, with no submit, reveal, self-grading or keyboard grading path. The central
`answer()` boundary rejects it as well, so future or stale callers cannot create a review.

The production build measured on 28 July 2026 places the verifier in the main application chunk
(648,459 bytes minified; 187,658 bytes gzip for the whole chunk). A standalone Bun bundle of
`src/items/verify.ts`, including its `mathjs/number` dependency, is 153.75 KB minified and 43,571
bytes gzip. The latter is an upper bound for mathjs rather than a dishonest claim that every byte
belongs to it; it also includes Lacuna's parser, verifier and renderer helpers.

### Numeric item face

A card with a v1 `numeric` payload bypasses the reveal and self-grading controls. Its study
face renders the Markdown question and the same maths-expression input used by authoring;
submitting a valid expression runs `checkNumeric` against the payload's exact, tolerance or
one-of specification. The result is one mark or zero marks out of one. In FSRS-backed sessions,
`gradeFromMarks` maps those marks and the measured question-to-submit time to Easy/Good or
Again, then the ordinary answer pipeline persists both marks on `ReviewLog`, updates scheduling,
supports undo and advances the session. Lesson Simple mode uses the same automatic correctness
result for its exposure/retry loop and retains Simple mode's rule that it writes no review log.
Typing-mode comparison and Yes/No or manual grading never apply to numeric payloads.

### Working-item authoring

Working items use a line-oriented mark-scheme source in the card editor. Each nonblank line
starts with a positive mark value and optional label, followed by `::` and either an expression
waypoint or one of the `equals`, `within`, `matches-one-of` and `contains` predicates. The editor
compiles every line independently: valid neighbours retain their plain-English preview and count
towards the running mark total when another line is malformed. The malformed source range is
shown with its compiler message, and mark/predicate autocomplete inserts grammar-valid snippets
without adding another parser or UI dependency. A card can be saved only when every nonblank line
compiles; the resulting `MarkSchemeLine[]`, not the editor source, is persisted in its v1 `working`
payload. Drafts retain the uncompiled source so an interrupted invalid edit is not discarded.
The same editor includes a test-answer harness backed directly by `verifyWorkingLines`. Tutors can
pin a sample answer with its current expected score; those fixtures travel in the item payload and
rerun automatically on every scheme edit, exposing any score mismatch before the card is saved.
The repository, share-code decoder/importer and backup reader repeat the known-payload validation at
their storage boundaries, so an import cannot bypass the authoring checks. Unknown versions and
kinds are preserved for the read-only fallback described in §11.2 rather than rejected as corrupt.

The v1 grammar is data, never executable code:

```text
[1] substitution :: 2x = 8
[1] answer :: equals :: 4
[1] check :: within 0.01 :: 4.0
[1] choice :: matches-one-of :: 3 :: 4 :: 5
[1] method :: contains :: substitution
```

Working-item authors can copy a “Draft mark scheme” prompt containing the current question and the
compiler-owned v1 syntax specification. The Question bank also provides a course-level batch prompt
builder for one lesson/topic at a time: notes, topic and level produce a clipboard-only prompt for
numeric and working items. By default the model chooses both the number of atomic concepts per item
and the number of items needed for useful coverage. Tutors can instead expose independent optional
constraints for concepts per item and maximum item count; only populated constraints enter the
prompt. The optional maximum is tutor-controlled; Lacuna imposes no separate item-count cap.
Generated items are durable scheduled concept checks, not disposable worksheet questions. Working
items must test a reusable method, relationship or derivation; algebra prompts prefer symbolic
general forms such as completing the square from `ax^2 + bx + c = 0` rather than inventing custom
coefficients for another one-off exercise. Parameterised numerical practice remains deferred until
generated variants can share one stable scheduled identity.
The prompt's item-type contract reserves `numeric` for constant scalar answers with no variables or
equals sign. Formula recall, symbolic relationships and other variable-bearing answers must use a
working item with a passing fixture, or be omitted when they cannot be checked meaningfully.
Every path must use the versioned `LACUNA_ITEMS_V1` JSON delimiters so the staging review can parse it
without guessing. The prompt also fixes the answer shape: a numeric answer and an `equals` criterion
each take one constant expression, so a multi-variable solution is written as one criterion per
variable rather than as `x=6,y=4`. Lacuna sends no data to a model and stores no API key; the
conversation remains in the tutor's chosen chatbot.

The entry action is labelled **Build external batch prompt**, since Lacuna does not call a model.
Closing after entering source text, pasting a reply, or staging candidates requires an explicit
**Discard batch** confirmation. The batch dialog's review step parses the versioned delimiter block and validates each
item independently. A block closed by a mirrored `<<<LACUNA_ITEMS_V1>>>` instead of
`<<<END_LACUNA_ITEMS_V1>>>` is accepted, since the block is already open by that point and the
closing delimiter does not contain the opening one as a substring; a correct closing delimiter still
wins when both appear. Numeric answers use the shared numeric-spec validator; working schemes use the
same compiler as the card editor, and their fixtures run through the study verifier. A malformed item
does not block valid neighbours. Duplicate classification reuses `diffImport` against the selected
lesson and is a warning: bulk “Accept all clean” skips likely duplicates, while the tutor can still
accept one explicitly. Each staged item can be accepted, rejected or edited through the same numeric-
answer and mark-scheme controls used by ordinary card authoring, then revalidated by the batch
parser. Working-item fixtures expose separate sample-answer, expected-marks and note fields; authors
never need to edit the interchange JSON directly.
Staged and accepted items can also copy a revision prompt containing the current item, mark scheme,
first failing fixture, validation feedback and a tutor-written complaint. The model is instructed to
return one revised item in the ordinary batch delimiters, so the result goes back through the same
staging validation rather than bypassing it. Revision prompts repeat the same item-type contract so a
repair cannot turn a symbolic answer into an invalid numeric item. The reply is pasted back beside
the prompt control and replaces only that item, leaving every other item and every accept/reject
decision alone. A batch-level control does the same for all failing items at once: one prompt
carries each of them with its validation errors, and the reply is matched back by position, which is
what the prompt asks for and all a bare item carries. A count mismatch applies nothing rather than
pairing the wrong items. Revision replies are read more leniently than a first batch — a bare item,
a bare array, a missing wrapper or a missing closing delimiter are all accepted, because the tutor
already knows how many items they asked about — but every item still passes through the unchanged
staging validation.
Acceptance calls the ordinary `createLessonCard` path with the compiled structured payload; staging
has no separate database write path.
The MCP `lacuna.create_card` and `lacuna.update_card` tools accept the same numeric and working
payload inputs. Working scheme source is compiled by the shared mark-scheme compiler and fixtures
are run before the repository write; numeric answers use the shared numeric-spec validator. Invalid
payloads therefore return the same validation messages as authoring and staging.

In study, a working item replaces reveal and self-grading controls with a multi-line answer surface.
Each nonblank line is checked against the persisted scheme, with each criterion awarded at most
once. The ordinary machine-marked pipeline maps the total through `gradeFromMarks`; FSRS sessions
persist the marks and per-line verdicts on `ReviewLog`, while lesson Simple mode uses full marks for
mastery and requeues partial or zero-mark attempts without writing review history.
Numeric and working faces show the automatic verdict before the learner continues. In FSRS-backed
sessions, a learner can flag an answer or individual working line when the checker got it wrong;
review logs retain the question, submitted line, verdict, report time and every deterministic seed, so
the disputed result can be reproduced exactly and later promoted to a fixture in Arc 12. Backups
preserve this optional history data verbatim, while share codes continue to omit all personal review
history.

The pure marks-analysis helpers `aggregateMarkPerformance` and
`aggregateCriterionPerformance` aggregate machine-marked attempts into earned/available totals and
group working performance by the labels in each card's current mark scheme. Criterion summaries
count full and missed attempts as well as marks. These are intentionally uncalled production seams
reporting retrospective `ReviewLog` attainment only. Forward-looking marks-denominated readiness is
deferred until an exam-realistic practice mode supplies a sample worth forecasting; ordinary
learn-mode marks do not.

The Arc 11 slice-1 manual pass on 28 July 2026 used a dedicated two-lesson course. It authored one
numeric and one working item by hand, pinned and reran a 2/2 working fixture, studied both faces,
recorded a numeric checker dispute in an FSRS-backed review, generated a share code and re-imported
all four structured items. The clipboard pipeline copied a note-grounded batch prompt, staged one
numeric and one working item from a deterministic delimited response, verified the working fixture,
copied a revise-with-AI prompt and accepted both items into the target lesson. No external chatbot
was contacted during this pass, so it verifies Lacuna's complete copy/paste boundary and validation
path, not a particular model's output quality or latency.

### Study mode (`src/state/studyMode.ts`)

Two modes reach Learn mode (ordinary sessions default to **FSRS**; lesson sessions always use
Simple mode):

- **FSRS (default):** the full spaced-repetition scheduler with all memory-state tracking,
  review logging, and objective-driven ordering.
- **Simple:** an algorithm-free study loop with no FSRS scheduling or memory-state write,
  and only YES/NO grading. Wrong cards are re-queued at the end of the pool; the session
  loops until every card has been marked correct. In a lesson-scoped session, the first
  correct answer upserts that lesson's `LessonCardExposure`; it writes no `ReviewLog`,
  `SessionHistoryEntry`, stability, difficulty, due date or FSRS state. A live pill UI
  (Wrong / Remaining / Right) updates on every answer. The SessionReport omits the
  grade-distribution chart since grades are not meaningful in this mode.

### The invisible timer & grading (`src/fsrs/grading.ts`, silent mode)

- The response timer **starts on reveal** ("Show answer") and **stops when the answer
  is graded**; it runs continuously and never pauses. (Opening the in-session editor
  rebases the timer so editing time is excluded.)
- "No" -> grade **1 (Again)**. "Yes" maps to Easy/Good/Hard by speed:
  - **Calibration** (`totalCorrectReviews < 20`): `< 3 s -> Easy(4)`,
    `> 8 s -> Hard(2)`, else `Good(3)`.
  - **Adaptive** (>= 20 correct): `< μ - 0.75σ -> Easy(4)`,
    `> μ + 0.75σ -> Hard(2)`, else `Good(3)`, where μ and σ are the deck's
    running mean/stddev of correct response times.
- After a correct review, `UserPerformance` is updated by **Welford's online
  algorithm**:
  ```
  n     = totalCorrectReviews + 1
  δ     = t - mean ;  mean += δ / n
  δ2    = t - mean ;  m2   += δ . δ2
  σ     = sqrt(m2 / n)      (0 while n <= 1)
  ```
  Note: calibrating on **correct reviews only** is a biased sample on high-failure
  decks; the prediction-accuracy metric (§14) exists partly to surface when that
  bias is hurting scheduling.
- **Hint time penalty** (`HINT_TIME_PENALTY_SEC`, 1.5s): when the current card used a
  lines-mode hint (see the hint ladder above), the silent-mode grade is computed from
  `responseTimeSec + HINT_TIME_PENALTY_SEC` instead of the raw time — a hint-assisted
  answer should grade slightly worse than the same speed unaided. This is a Lacuna-layer
  adjustment, not an FSRS one: ts-fsrs's weights model grades and resulting intervals and
  never see response time at all, so there is nowhere inside FSRS for a "used a hint"
  signal to live; it is applied only in `src/pages/LearnMode.tsx`'s `answer()` callback,
  purely to the value passed into `gradeFromResponse`. The **true, unpenalised**
  `responseTimeSec` is still what is written to `ReviewLog` and folded into
  `updatePerformance`'s Welford calibration — the penalty never distorts the deck's speed
  baseline. `ReviewLog.hintUsed` (optional, additive field; no Dexie schema bump needed —
  `history` is an embedded array, not an indexed column) is logged alongside the true
  time specifically so the constant can later be replaced with a value fitted from real
  review history rather than a guess. Manual grading mode is unaffected — the penalty only
  ever feeds `gradeFromResponse`, which manual mode bypasses entirely.

### Per-card actions & state

- **Edit**: opens an in-session overlay (`CardEditOverlay`) that pauses/rebases the
  timer; saving updates the live card without leaving the session.
- **Flag** (toggle), **Bury until tomorrow** (`buriedUntil = startOfDay(now) + 1 day`),
  **Suspend** — all drop the card from the live pool (and the denominator) and move
  on.
- **Undo**: single-step reversal of the last answer — restores the card's prior
  memory state, the `UserPerformance`, the cooldown map, the progress value and the
  events list, and deletes the written `SessionHistory` row.
- **Focus Mode** (F): hides the shared Learn header without moving the card. Reaching the
  top edge reveals the controls temporarily; on touch, the top-edge affordance can be tapped.
  `Esc` leaves Focus Mode. Settings can make new Learn sessions start focused without changing
  the per-session `F`/`Esc` behaviour.
- **Full screen**: the expand-corners control uses the browser Fullscreen API. It is separate
  from Focus Mode, whose target-style icon describes hiding distractions rather than changing
  the browser window.
- **Keyboard shortcuts**: accessible via the "Keyboard shortcuts" item in the 3-dot
  action menu, which opens a modal listing all available shortcuts. The `?` key
  still toggles this overlay from anywhere.
- **Distraction** (Page Visibility + window blur) is recorded per card for the report
  only; it never affects the grade.

### Touch-mode affordances (v0.0.2)

- The **grading controls live in a bottom sheet** with a drag handle (down-drag past
  a threshold or a fast flick closes the sheet), a scrim backdrop, and a focus
  trap. The "Show answer" / "Hide answer" sheet and the "Yes/No" / "Again…Easy" sheet
  share the same chrome.
- The **card-actions menu** is also a bottom sheet in touch mode (a dropdown on
  keyboard). Both are wired to `useFocusTrap(true)`.
- The **flip card accepts swipes**: a left swipe (past 60px) commits "No"; a right
  swipe commits "Yes". The first successful swipe hides the persistent swipe hints
  via a `localStorage` flag (`lacuna.learnHints`).
- **Mode-aware card accents:** each card's border and shadow shift to match the study
  mode (amber for assessment revision, green for simple, red for leech filter, etc.), and a label
  pill (Question / Answer / Fill the gap / Type the answer) animates in with the card
  face to orient the user.
- **Mode-aware session progress:** Simple Learn uses a segmented strip because its stopping rule is
  rigid: each card is green after a correct result, red after an incorrect result, accent-outlined
  while current, and muted while unseen. FSRS, assessment-revision and filtered sessions instead show the live
  objective value from `sessionProgress`, labelled as predicted score or secured progress, so the
  header and scheduler cannot disagree.
- **Continuous practice chrome:** Yes and No replace only the card surface; the Learn header and
  accumulated session state stay mounted. The next card enters through a short motion-speed-aware
  hand-off, while the objective track and ring interpolate from their previous values.

### Pomodoro timer (v0.0.2, `src/hooks/usePomodoro.ts`,

`src/components/learn/PomodoroTimer.tsx`)
A built-in Pomodoro timer (configurable in §15 Settings → Pomodoro) that sits in the Learn header. It runs independently of
the review scheduler — the app does not grade the user on whether they actually
studied — but it provides a tactile, visible session for focus.

- **Settings (per-user, persisted to `localStorage`):** work minutes (1–120,
  default 25), short break minutes (1–60, default 5), long break minutes (1–60,
  default 15), and `autoStartBreaks` (default off).
- **State machine:** `idle -> focus -> shortBreak (every 4th: longBreak) -> idle`.
  Crossing zero auto-advances the phase and (optionally) auto-starts the break.
- **Visuals:** the header face is a 36px SVG ring with a 1Hz progress arc; the
  expanded popup (click the face) is a 160px circular timer with the same arc and a
  centre read-out in display type. Phase colours: focus = accent, short break =
  positive, long break = ink. The popup is closed by `Escape` or outside click and
  uses a focus trap.
- **Input validation:** the load-and-save helpers clamp each minute field to its
  allowed range and fall back to the default if a stored value is `NaN`, so a
  corrupted `localStorage` entry can never crash the timer.

### Recording a review

Each answer calls `recordReview` which applies the FSRS update, appends a
`ReviewLog`, and writes a per-card `SessionHistory` snapshot
(`averagePredictedRetrievability` of the served pool). The progress value is
recomputed and, if the objective is met, the session finishes. Every persisted
attempt has a stable event id, a flow-level session id, explicit correctness and
its deck, lesson, Practice, assessment-revision or revision-plan provenance.
Revision-plan and window ids are additive. The event id also links the aggregate
snapshot to its review log and is unique, so replaying a submission cannot apply
FSRS or calibration twice. Legacy history without provenance remains readable.

### Completion & the report (`SessionReport`)

The session **auto-ends** when the objective is met (all cards secured, or no card
offers a meaningful gain in Σ R), or on manual exit. The report shows: progress
before -> after (with the objective label), and stat tiles for **cards reviewed,
accuracy, mean correct time, focus %**, plus a grade-distribution bar chart and a
focus note when distractions occurred. Reaching the goal shows a celebratory tick
badge; otherwise "Keep studying" is offered.

### Keyboard

`Space`/`Up` reveal; after reveal `Y`/`Right` = Yes, `N`/`Left` = No; `E` edit,
`U` undo, `F` focus mode, `?` help (also accessible from the 3-dot menu as
"Keyboard shortcuts"), `Esc` closes overlays/drawer.

### Exam date

Course creation creates a mandatory final `CourseAssessment`. The blank-course form defaults to
23:59 local time seven calendar days after creation and rejects invalid or nonexistent local
date-times. The date and time are editable in Course Settings' scheduling fields, while
additional checkpoints live in its Assessments section. The legacy `Deck.examDatePromptDismissed`
field remains only for migration compatibility; the current Course UI has no `ExamDateBanner`.

---

## 11. Cards, cloze & the editor

### Cloze (`src/components/markdown/cloze.ts`)

- Notation: `{{c1::hidden answer}}` and `{{c1::hidden answer::optional hint}}`.
- A single card hides **all** `cN` spans at once. On the **front** each span renders
  as a styled blank — `[...]`, or `[hint]` if a hint is given. On the **back** every
  hidden span is revealed and highlighted inline within the full sentence
  (`.cloze-reveal`).
- `nextClozeIndex` powers the editor's auto-indexing Cloze button; `hasCloze` gates
  cloze validity and import.

### Card rendering (`CardContent` -> `MarkdownView`)

Front/back Markdown is rendered with GFM, maths (KaTeX), syntax highlighting, and
raw HTML (for the cloze spans), inside `.prose-lacuna` styling. Memoised per card.

The `MarkdownView` component is backed by a bounded LRU parse cache (parsed HTML
cached by source string, with five-minute stale eviction and an LRU fallback), so
re-renders and remounts are O(1) lookups while an entry remains cached; an evicted source
is parsed again when needed.

The `MarkdownView` effect tracks the last source it resolved for via a
`useRef` and bails out when the prop is unchanged, so a parent re-render that passes
the same source string does not re-assign `dangerouslySetInnerHTML` and wipe the
user's text selection.

### Cloze highlight (v0.0.2 fix)

The revealed cloze span is rendered with `text-decoration: underline` (and a
faint accent ink shadow) rather than a `background-color` fill, with an explicit
`.cloze-reveal::selection { background-color: hsl(var(--accent) / 0.45); color:
inherit; }` override. The previous `background-color` highlight stacked under
the global `::selection` rule (both painted translucent amber), producing a muddy
double-highlight on selected text inside a revealed cloze. With no element
background, `::selection` paints cleanly across the cloze mark.

### Sequence-generated cards in Learn mode

When a card was generated from a Sequence (§5), `CardContent`'s `sequenceCue` prop (set in
`LearnMode`) parses the front's header/cue-items structure (`parseSequenceFront`) and styles
the preceding cue items as muted context above the recall prompt, rather than rendering the
whole front as one undifferentiated block. Label cards (`isLabelCardId`) are excluded, since
they have no cue window to style. No FSRS or session-flow changes: generated cards are
ordinary `front_back` cards to the scheduler.

### Editor (`src/pages/CardEditor.tsx`, full page)

- Mode is decided by the route (`/cards/new` vs `/cards/:id/edit`).
- **Card type** selector: Basic (front/back), Reversed, Cloze, Numeric answer, Working or Audio.
  - **Basic:** standard front/back flashcard.
  - **Reversed:** creates an independent card that tests the back as the prompt.
  - **Cloze:** front contains `{{c1::hidden answer}}` deletions; back is empty.
  - **Audio:** a structured file/recording slot, optional prompt and required answer write an
    ordinary `front_back` card whose front contains `![audio](lacuna-asset://<hash>)`. Supported
    files are MP3, M4A/MP4, Ogg, WAV and WebM up to 25 MB. Playback autoplay and speed are global
    device settings. In Learn mode, “Hear it again” or R returns to the front presentation while
    the answer phase, captured response time and grading controls remain intact.
- One or two **Markdown editors** with a live preview; a formatting toolbar (bold,
  italic, heading, lists, code, link, image, cloze auto-index, inline/block maths);
  a cloze editor can preview the revealed answer.
- **Tags** input with deck-wide suggestions.
- **Images** are downscaled to <= 1280 px, re-encoded (~0.8 quality), stored as a
  `Uint8Array` in the `assets` table (deduplicated by SHA-256 hash), and referenced
  from the Markdown as `lacuna-asset://<hash>` — **not** base64 data URIs. The render
  path resolves references to object URLs through the shared bounded LRU cache; cache
  eviction and app teardown revoke those URLs. This keeps card rows small (base64 inflates
  payloads ~1/3 and drags full image data through every reactive read) and keeps exports lean.
- **Audio** is stored without transcoding in the same content-addressed asset table. Anki
  `[sound:filename]` references are rewritten to the same audio marker during APKG import rather
  than being silently discarded.
- **Validation:** front required; back required for front/back; at least one cloze
  for cloze.
- **Quick capture:** "Save & add another" keeps the page open, clears content,
  retains type and tags, refocuses the first field, tallies a per-sitting count,
  and flashes a "Saved" confirmation. A seamless Tab order runs Front -> Back ->
  Save-and-add -> Save. `Ctrl/Cmd+Enter` saves (and, for new cards, keeps going).
- **Reverse cards:** for a new basic card, an "Also create reverse" toggle
  additionally creates an independent card testing the back.
- **Touch targets:** the toolbar buttons and type-selector are 44px tall with
  active-state colours; on narrow viewports the toolbar scrolls horizontally with
  a hidden scrollbar.
- **Return-to-origin back-link:** Cancel, post-save navigation and the breadcrumb
  "back" link normally follow the route (the lesson if the URL encodes one, otherwise
  the course's Question bank), but two entry points need to say otherwise — editing a
  lesson-owned card from the Question bank, and editing a sequence (which has no
  lesson-scoped edit route) from within a lesson. Callers that know they're not the
  route's default surface pass an `{ origin: { path, label } }` router-state override
  (`src/utils/editorOrigin.ts`), which both `CardEditor` and `SequenceEditor` prefer
  over their route-derived default. A hard refresh drops router state, so the
  route-derived fallback always applies in that case.

---

## 12. Navigation, courses & card management

- **Dashboard** lists courses in a responsive grid, each showing exam proximity, lesson
  count and the objective progress bar; the sidebar's **Review today** entry opens the
  cross-course due session. Course order is a configurable dashboard setting
  (recent, ready to study, mastery, exam date, name, or created; §4.3). Each course card
  carries a secondary **Study** action, launching that course's conductor directly
  (`/course/:courseId/study`) alongside the card's own click-through to its course path.
  If a conductor was interrupted mid-flow, a resume banner sits above the course grid; an
  interrupted conductor stores only its course identity and timestamps, so resume always
  recalculates the next step from current course state rather than trusting stale session
  data (Arc 10 §10.1 folded the former standalone Study Today page into this dashboard).
- **Course path** (`/course/:courseId`) is the primary navigation surface within a course:
  an ordered sequence of lesson nodes, checkpoints and practice nodes (§4.3, §14).
- **Lesson view** (`/course/:courseId/lesson/:lessonId`) presents the lesson's notes and
  cards. The course-level conductor owns guided session entry and embeds this lesson's
  notes-first teaching flow when it is the next available path step. In edit mode,
  **Link existing cards** opens a searchable course-card picker and adds selected ordinary
  cards (sequence-generated cards are excluded) as
  `LessonCardLink` memberships without moving their primary lesson or duplicating their FSRS
  state. Linked rows are labelled, excluded from destructive bulk selection, and use
  **Remove from lesson** instead of deleting the underlying shared card; removal also clears
  that lesson's exposure record.
- **Question bank** (`/course/:courseId/bank`) lists every card in a course in one flat list
  regardless of lesson, sharing `CardList` with the lesson view's card section.
- **Card list** (`CardList`) supports per-card edit, suspend/flag, and an explicit **Select**
  action for bulk selection; a tag-filter row scopes both the list and the study session.
  In multi-select mode the bulk toolbar offers **delete** (with an Undo toast that restores
  a snapshot), **move** to another lesson within the same course context, and
  **"Assign to lesson…"** (reassigns selected cards' `primaryLessonId`, only offered where
  the list is passed a `courseId`). Clicking a card row expands it in-place to show a
  **per-card forgetting curve** and **vital statistics** (see §14, Per-card analysis).
- Course creation can **start blank** or **import** material immediately (see §13). The blank
  path collects the course name and visible **Exam date** in one modal. The date defaults to
  seven days after creation at 23:59 in the learner's current IANA time zone; changing it preserves
  that wall-clock choice when the course and its mandatory **Final exam** assessment are created.
  Invalid or nonexistent local date-times block creation. The course still opens with an initial
  **Lesson 1**, while the import tab remains independent of these creation-only fields.
- **Sequences** (§5) have their own editor (`/course/:courseId/sequence/new`,
  `/course/:courseId/sequence/:sequenceId/edit`, and a lesson-scoped
  `/course/:courseId/lesson/:lessonId/sequence/new`), reached via "New sequence" entry
  points alongside "Add card" in both Lesson View (`LessonCardsSection`) and the Question
  Bank. `CardList` groups a sequence's generated cards under its name (`GeneratedCardGroup`)
  and excludes them from bulk-select, since they can only be edited or deleted through the
  sequence.

---

## 13. Import, export & backups (`src/db/importEngine.ts`,

`src/db/portability.ts`, `src/db/import.ts`, `src/db/export.ts`,
`src/db/backups.ts`, `src/sync/mergeSnapshots.ts`, `src/sync/manualMerge.ts`)

### Unified import engine (`src/db/importEngine.ts`)

A single, format-detecting import engine that powers all import locations in the
app:

- **Auto-detection** (`detectFormat`): examines input text and returns a
  `DetectedFormat` (confidence-scored) choosing from: `share-code`, `csv`, `tsv`,
  `markdown-table`, `markdown-list`, `json`, `plain-text`, or `unknown`. Detection
  short-circuits at 100K characters to keep large files responsive.
- **Supported formats:**
  - **CSV/TSV** — quote-aware delimited parser (`parseImport` from `import.ts`).
    Defaults: tab field separator, newline row separator; both customisable.
  - **Markdown table** — GFM tables with `|` separators. Column header mapping:
    `front`/`question`/`term`/`q` -> front; `back`/`answer`/`definition`/`a` -> back;
    `tags`/`tag`/`label` -> tags. Pipes in cell content are escaped on export.
  - **Markdown list** — three patterns: (1) definition-list style
    (`**Term:** Definition`), (2) ordered pairs (even-numbered items paired as
    Q/A), (3) blank-line separated blocks (first non-empty line = front, rest =
    back).
  - **JSON** — array of objects, or object with a `cards`/`data`/`items`/
    `entries`/`notes` key containing an array. Each object maps
    `front`/`question`/`term`/`q` -> front, `back`/`answer`/`definition`/`a` -> back.
  - **Plain text Q/A** — tab, pipe, em-dash, or en-dash separated Q/A pairs. A
    leading `Q:`/`Q.`/`Question:` prefix is stripped.
  - **Share codes** — `LAC0`/`LAC1` prefixed base64 or `LAC2`/`LAC3` prefixed Base45
    codes, decoded via `decodeShareCode`.
- **`parseImportAuto(text, fieldSep?, rowSep?)`** — the main entry point. Detects
  the format and delegates to the appropriate parser. Returns
  `{ cards, skipped, format }`.
- **Legacy parser** (`parseImport` in `src/db/import.ts`): the quote-aware
  delimited parser continues to exist for backward compatibility and is used as
  the CSV/TSV backend. Defaults: **tab** field separator, **newline** row
  separator. Windows/old-Mac line endings are normalised first. Per row: field 1
  = front, field 2 = back, optional field 3 of space-separated tags. A row with a
  back is a front/back card; a single column containing cloze notation becomes a
  cloze card; otherwise the row is skipped.

### Unified export panel (`src/components/import/UnifiedExportPanel.tsx`)

A single, reusable export UI offering multiple output formats:

- **Full backup (JSON)** — complete database snapshot including all decks, cards,
  review history and media assets (`downloadBackup`).
- **CSV** — comma-separated values with all card fields.
- **TSV** — tab-separated values, compatible with Anki import.
- **Markdown table** (`exportCardsMarkdownTable`) — GFM table with Deck, Front,
  Back, and Tags columns. Pipes in cell content are escaped.
- **JSON array** (`exportCardsJson`) — array of objects with front, back, tags,
  deck, and type keys. Re-importable into Lacuna.
- **Plain text** — human-readable Q:/A: format with course, lesson, and tag metadata.
- **Course share code** — compact, copy-pasteable course material generated from the dedicated
  Share page via `buildCourseShareCode`; it is not part of this full-backup/card-export panel.

### Backup file import/export

- **Export:** versioned JSON portable snapshot (`BackupFile`: decks, cards, canonical
  `reviewHistory` plus the compatibility card projection, referenced image/audio assets,
  session history, user performance, folders, courses, lessons, notes, lesson-card links and
  progress, `courseAssessments`, `revisionPlans`, `sequences` and `occlusions`). Backups are
  the route that carries media between machines (share codes deliberately do not, §13); an
  occlusion's diagram is gathered explicitly from `Occlusion.assetHash`, since it is referenced
  by no card Markdown. Older backups that pre-date the newer course tables still import cleanly:
  the arrays are optional, and legacy `courseExamDates` is an import-only compatibility field.
- **Import modes:**
  - **Replace** — wipe the tables represented by the backup, then restore exactly. The UI
    calls this **Replace local data**, explains that there is no account or cloud copy, and
    requires a second explicit confirmation. `noteAnnotations` is also cleared but is not
    restored because it is device-local. Lineage mappings and pending merge-review queues are
    not represented by `BackupFile` and are not currently exported or cleared.
  - **Add from backup** — fold in by id (`importBackup(..., 'merge')`). The Settings recover
    flow shows the backup's lesson/card counts and applies immediately when **Add from backup**
    is pressed; it does not currently show a full add/change/overwrite diff or ask for a second
    confirmation. Incoming rows are added when absent; conflicting decks/cards and course records
    use their table-specific recency rules, review-history rows are deduplicated, and local rows
    absent from the backup are never deleted. The course tables, `sequences`, `occlusions` and
    `revisionPlans` follow the same additive per-table merge boundary. Old backups keep this
    behaviour; only the Settings label changed.
  - **Another device** — a separate Settings action that does not call
    `importBackup(..., 'merge')`. `manualMerge` takes a forced restore point
    (`takeAutoBackup(true)`), reuses that snapshot, runs `mergeSnapshots(local, remote)`,
    then applies the result with `importBackup(merged, 'replace')`. The resting copy states
    that cards and reviews from either side are kept and that a deletion on either is removed;
    confirmation is the existing inline prompt naming the file's date and card count. The toast
    reports cards kept, added and removed, plus reviews when those counts change, and that a
    restore point was saved. A file that fails `validateBackup` is rejected before any write; a
    failed safety backup aborts without applying.

### Automatic restore points & migration safety

- Up to the **ten most recent** snapshots are kept on-device; one is taken
  automatically on open, **at most once a day** (`autoBackupIfStale`), and never
  blocks the UI.
- **Pre-migration snapshot:** before a schema upgrade rewrites data, a
  `pre-migration`-tagged snapshot is captured in a **separate committed
  transaction** (via a dedicated `lacuna-pre-migration` IndexedDB) so a failed
  upgrade on the main database never rolls the snapshot back with it. The
  snapshot is also mirrored to the configured folder if the File System Access
  API is available. Tagged snapshots are **exempt from the ten-snapshot
  pruning**. The v4 image migration is also idempotent and
  reads-transforms-writes explicitly rather than mutating inside an async Dexie
  `.modify()` callback (which Dexie does not reliably persist).
- Restoring replaces all current data with the snapshot.
- **Folder mirror** (where the File System Access API is supported): each backup
  can also be written to a chosen folder so it survives clearing browser data.
  Where unsupported, the UI explains this and points to manual export.

### Course sharing — share codes (`src/db/share.ts`, `SharePage`, `/share`)

A dedicated **Share** tab in the sidebar turns a whole course into a single, compact,
copy-and-paste (or scannable) **code** and rebuilds a course from one. It is distinct from
backup export: a share code carries only the **material** needed to recreate the course,
never one person's scheduling progress or review history.

- **What a code contains (current, v2 payload):** course metadata (name, exam objective,
  date created, date due, target retention, new-card cap), its ordered lessons each with
  their notes and cards (type, front, back, tags), and current `CourseAssessment`
  checkpoints. **Sequences**
  (§5) ride along as an additive optional field: each `Sequence` and its `SequenceItem`s
  travel inline, and on import every sequence/item id is remapped fresh alongside its
  generated cards' `sequenceItemId` (including the `::label` suffix for label cards), so a
  shared sequence never collides with one already present locally. Older v2 codes without
  a `sequences` field still parse. Lines mode's `mode`/`mySpeaker` (sequence) and `speaker`
  (item) travel as further additive optional keys on the same schema.
  **Occlusions** (§5) ride along the same way, as an additive `occlusions` field with an `oc`
  reference on each generated card, region ids remapped fresh on import and a pairing whose
  target region did not travel dropped rather than left dangling. Bank-scoped sequences and
  occlusions are excluded from both, since their generated cards are never packed.
  `LessonCardLink` (display-only cross-lesson linking) travels with the material so linked bank
  cards remain linked after import. `PracticeNode`, lesson exposures, cardless-lesson
  completions and Practice milestones are deliberately out of scope — a shared course carries
  material structure, not one learner's practice-path state.
- **What it omits — media, deliberately and loudly.** `stripAssetMedia` replaces every asset
  reference in card and note Markdown with placeholder text (`[Image omitted from share
  code]`, `[Audio omitted…]`), so images and audio do not travel. An occlusion's diagram is
  not a Markdown reference at all and likewise never travels: its `assetHash` will not resolve
  for the recipient, and the study face falls back to each card's plain-text content. Solving
  asset transport properly needs either a companion asset file or the Arc 12 relay, so the
  chosen behaviour is **local and backup only, with the failure made loud**: the Share page
  counts affected cards — asset-bearing *and* occlusion-generated — names them, and says what
  the recipient will actually receive. Backups carry assets properly (`BackupFile.assets`), so
  this is a share-code and published-lineage limitation only.
- **What it omits:** FSRS memory state, review history, and suspended/buried/flag state.
  Imported cards always start with clean scheduling for their new owner. Lesson exposures,
  cardless-lesson completions and Practice milestones are learner progress and are likewise
  omitted. Note annotations are device-local and are excluded from share codes as well as
  every other portability format. Older payloads may still contain the legacy compact `sf`
  lesson-filter field; it is accepted for import compatibility but does not configure live
  lesson study.
- **Legacy v1 payload:** the original shape — a flat list of decks, each becoming its own
  single-lesson course on import — is still read for backward compatibility with codes
  generated before the course model shipped (`docs/archive/roadmap-2026-08-11.md` §0.3 keeps this support in
  scope).
- **Compression**, in order of impact:
  1. **Reverse-pair folding** — a front/back card and its exact mirror (one's front = the
     other's back and vice versa) are detected and stored **once** as a single "reversible"
     entry (`k:2`), then expanded back into two independent cards on import (the same shape
     `createCardWithReverse` produces).
  2. Compact single-letter JSON keys.
  3. **DEFLATE** via the native `CompressionStream('deflate-raw')` when available.
- **Format:** a short scheme tag followed by the encoded payload — `LAC1` (DEFLATE + base64,
  the default for copy-paste text), `LAC0` (plain base64, legacy uncompressed fallback),
  `LAC2` (DEFLATE + Base45, densest for QR codes), `LAC3` (plain Base45, legacy uncompressed
  fallback). Base45 (RFC 9285) maps directly to the QR Alphanumeric mode for ~30% more
  capacity than Base64. A payload version field (`v1`/`v2`, distinct from the `LACn` prefix)
  guards forward compatibility; an unknown or corrupted code yields a readable error.
- **Export UI:** select one course, then "Generate share code" — the code is shown in a
  read-only monospace box with a one-click **Copy**, a character count, and (where the
  payload fits a single QR symbol, up to `MAX_QR_ALPHANUMERIC_CHARS`) a scannable **QR code**.
- **Import UI:** a styled paste box, or a camera-driven **QR scanner** (`html5-qrcode`);
  "Read code" decodes and shows an inline confirmation preview (lesson/card counts, the share
  date, lesson names as chips) before committing. Importing always **creates a new course**
  — it never overwrites existing data.
- Round-trip behaviour (content, cloze, reverse-pair expansion, v1 legacy decks becoming
  single-lesson courses, date-due preservation, clean scheduling state, and rejection of
  non-codes) is covered by `src/db/share.test.ts`.

### Classroom distribution — versioned courses and re-import merge (schema v18)

Share codes are one-shot by default (above): re-importing an updated code always creates a
second course. Schema **v18** adds an opt-in **Publish** flow so a teacher's revisions can
instead **merge** into a student's already-imported copy, preserving the student's FSRS
memory, exposure history and any local edits. No content hashing is used anywhere in this
feature — versioning is a teacher-initiated counter, not a derived value.

- **Teacher side — `Course.distribution?: { lineageId: string; revision: number;
publishedAt: number }`.** Absent until the teacher clicks **Publish** at least once.
  `publishCourse(courseId)` (`src/db/repository.ts`) generates a fresh `lineageId`
  (`makeId()`) on first publish and increments `revision` by exactly 1 on every
  subsequent call, stamping `publishedAt` with the current time; the teacher's own course
  is never locked and remains freely editable and re-publishable. When
  `Course.distribution` is present, the share-code export path packs `li` (lineage id) and
  `rv` (revision) onto the `SharePayloadV2` root, plus each lesson/note/card's originating
  id (see below) — a course that has never been published exports exactly as it always has,
  with no lineage fields at all.
- **Originating-id payload fields.** `ShareLesson` gains `i?: string`. `ShareNote` gains
  `oi?: string` rather than `i`, because `ShareNote.i` was already the pre-existing
  historical "media omitted" boolean flag (named for images before audio existed); reusing that
  letter would have collided. `ShareCard`
  needs no new field at all: its existing (already-optional) `id` — packed on every course
  export to resolve in-payload `links`/exam `x` references — doubles as the originating
  card id once a lineage is present, so cards are the one entity type with nothing added.
  All three are populated only when `li` is present.
- **Student side — `Course.distributedCopy?: CourseDistributedCopy`
  (`{ lineageId, revision, locked, autoAcceptUpdates, sourceLabel? }`).** Set on first
  import of a published course (`importLineageFirstTime`, `src/db/mergeImport.ts`), which
  diverges from the ordinary import path in exactly one way: every lesson/note/card
  **adopts its incoming originating id directly as its local id** instead of remapping
  through `makeId()`. This is safe because `makeId()` ids are globally unique regardless of
  which install generated them, and the merge path only ever writes ids that originated
  from `makeId()` on the teacher's own database — there is no mapping table, only a
  membership registry (below) recording which ids a course has already adopted.
  `locked` starts `true`; `autoAcceptUpdates` starts `false` (opt-in per course, not
  global — set via `setCourseAutoAcceptUpdates`).
- **`LineageIdMapping` table (`lineageIdMappings: 'id, courseId'`)** — one row per
  distributed course (keyed by `lineageId`), holding `lessonIds`/`noteIds`/`cardIds`/
  `sequenceIds`/`occlusionIds` arrays of adopted local ids (`occlusionIds` is optional —
  mappings written before image occlusion existed have no such field) plus a **last-merged content snapshot** for
  every adopted lesson/note/card (`lessonSnapshots`/`noteSnapshots`/`cardSnapshots`,
  keyed by id — name/description/isExtension/dates/sessionFilter/orderIndex for lessons,
  name/content/orderIndex for notes, type/front/back/tags for cards, deliberately excluding
  FSRS/scheduling fields). A re-import compares an entity's _current_ local content against
  its snapshot to detect a student edit since the last merge, rather than a separate dirty
  flag that could drift out of sync.
- **`pendingMergeReviews` table (`id, courseId`)** — queued merge decisions awaiting
  student review: one row per course, holding `updates`/`removals`/`conflicts` for the
  latest outstanding diff. A new merge for the same course **supersedes** rather than
  appends to the previous row, so the table never accumulates history. `creates` are never
  queued here — they apply immediately and unconditionally (below).
- **Merge apply (`mergeLineageUpdate`, `src/db/mergeImport.ts`), run against the pure
  diff module `src/db/lineageDiff.ts` (id-keyed, never positional or content-matched,
  generalising `diffRegeneration`'s shape from one sequence to a whole lineage):**
  1. **Creates** (incoming-only ids) are written immediately, adopting the incoming id as
     the local id — purely additive, nothing to review.
  2. **Updates and removals** where the local entity has not been edited since the last
     merge apply immediately if `distributedCopy.autoAcceptUpdates` is true; otherwise they
     are written to `pendingMergeReviews` and nothing changes locally until the student
     resolves them.
  3. **Conflicts** — an entity changed on both sides since the last merge, or a teacher
     removal of an entity the student has edited — are **always queued**, regardless of
     `autoAcceptUpdates`: the student's local version is left untouched either way, and the
     incoming version sits in the queue for visibility. This is the **student-wins**
     policy: a student's own edit is never silently overwritten or discarded by an
     incoming teacher change.
  4. Card updates are a strict content subset (`type`/`front`/`back`/`tags`) that never
     touches FSRS/scheduling fields (`state`, `stability`, `difficulty`, `due`, `reps`,
     history), mirroring `diffRegeneration`.
  5. Sequence- and occlusion-shaped payload items are **not** diffed by `lineageDiff.ts` at
     all — they are handed unconditionally to their existing regeneration path
     (`updateSequence`/`updateOcclusion`), which already encodes "update content only, never
     FSRS fields" keyed by the stable `sequenceItemId`/`occlusionRegionId`; this is never
     gated by `autoAcceptUpdates`. Their **generated cards are correspondingly skipped on
     both sides of the diff** — incoming cards carrying `si`/`oc`, and local cards carrying
     `sequenceItemId`/`occlusionRegionId`. Without that skip the merge both adopted the
     packed copy under its originating id and regenerated the same card, leaving two cards
     per item with the adopted one frozen at the publishing revision.
  6. On completion, `distributedCopy.revision` is set to the incoming revision and
     `lineageIdMappings` is updated with any newly adopted ids and refreshed content
     snapshots for every entity actually applied (auto-accepted updates and creates); an
     entity left queued or in conflict keeps its old snapshot, since nothing changed for it
     locally yet.
  7. **Decode-time routing:** a decoded payload carrying `li` is matched against the
     student's own `distributedCopy.lineageId` values (never the teacher's); a match routes
     to the merge path, otherwise it falls through to the ordinary
     `importCourseSharePayload` exactly as today — this covers both genuinely new courses
     and any course whose local copy predates schema v18 and so has no `distributedCopy` to
     match against.
- **Lock enforcement — `canEditLessons(course)` (`src/course/lessonViewMode.ts`).** Returns
  `false` iff `course.distributedCopy?.locked === true`; an absent `distributedCopy` (every
  ordinary course, including all pre-v18 courses) or a detached copy (`locked: false`) both
  remain editable. This is the single gate every lesson/note/card-CRUD call site already
  routes through (`resolveLessonViewMode`, `isLessonAuthoringMode`), so locking a
  distributed copy needed no new call sites — only this function's body changed.
- **Detach (`detachCourse`, `src/db/repository.ts`)** — a one-way, student-initiated escape
  hatch (confirm dialog via `ConfirmInline`, destructive framing) that clears
  `Course.distributedCopy` entirely, unlocking the course and severing lineage tracking in
  the same step: it deletes the course's `LineageIdMapping` row and any pending merge
  review, but never touches lesson/note/card content. A later re-import of the same share
  code no longer matches this course and instead imports as an independent copy — the same
  "no lineage, treat as new" fallback a pre-v18 course already takes on import.
- **Review panel (`MergeReviewPanel`, `src/components/import/MergeReviewPanel.tsx`)** — a
  course-scoped `/course/:courseId/updates` route reached from a quiet accent **"Update
  available"** badge on the dashboard course card (`CourseCard.tsx`) and a **"Review
  updates"** entry point in the `CoursePath` header, both shown iff a `pendingMergeReviews`
  row exists for the course. Renders three sections — Updates, Removals, Conflicts — each
  row offering the accept/reject action pair, plus a bottom bar with a bulk **Accept all**.
  Conflict rows flip the emphasis: **"Keep mine"** (reject) is the emphasised default
  action and **"Take theirs"** (accept) the secondary one, matching the student-wins policy
  above.
- **Resolution functions (`src/db/mergeImport.ts`)** — `acceptMergeReviewItems`/
  `rejectMergeReviewItems(reviewId, refs)` resolve a specific set of items; `acceptAllMergeReview`/
  `rejectAllMergeReview(reviewId)` resolve everything outstanding. All four route through the
  same content-only apply helpers `mergeLineageUpdate`'s auto-accept branch uses (never a
  second apply implementation) inside one `db.transaction`, then either delete the
  `pendingMergeReviews` row (nothing left outstanding) or `put` it back with the resolved
  items spliced out. Accepting an update or a "take theirs" conflict **refreshes that
  entity's `lineageIdMappings` snapshot** immediately, so the next merge's student-edit
  detection compares against what is now on disk instead of re-flagging an update the
  student has already taken; accepting a removal deletes the entity and drops it from the
  mapping's id lists and snapshots. Rejecting an item is a pure drop from the queue — the
  student's current content is never touched. **`acceptAllMergeReview` excludes
  conflicts** from its bulk accept (only updates and removals), so a student-edited
  conflict is never silently resolved by "Accept all" — it stays queued for an explicit
  per-row decision; `rejectAllMergeReview` clears everything, including conflicts.
- **`autoAcceptUpdates` toggle** — `setCourseAutoAcceptUpdates(courseId, value)`
  (`src/db/repository.ts`) persists the per-course preference read by the merge-apply
  decision above; surfaced as an instant-commit `Toggle` in the existing "Shared course"
  settings section (`DetachCourseSection.tsx`, above the detach control), labelled "Apply
  updates automatically". The toggle only changes future merge behaviour — it does not
  touch any already-queued `pendingMergeReviews` row.
- **Decode-time merge routing (`SharePage.tsx`, `UnifiedImportPanel.tsx`)** — decoding a
  share code now checks `isLineagePayload(payload)` and, if `li` is present, calls
  `findCourseForLineage(payload.li)` to see whether the payload's lineage matches a course
  already imported locally (matched only against a local course's own
  `distributedCopy.lineageId`, never a teacher's `distribution.lineageId` — so a teacher
  scanning their own published code, or anyone with no local copy of that lineage, falls
  straight through to the ordinary `importCourseSharePayload` path unchanged). On a match:
  - **Revision guard.** If the payload's `rv` is not newer than the local copy's
    `distributedCopy.revision`, the preview reports the course is already up to date and
    the confirm action becomes **Close** rather than calling the merge importer at all —
    a stale or duplicate scan is a no-op, not a rejected merge.
  - Otherwise the preview reads **"This updates `<course name>` (revision N → M)"** and
    confirming calls `mergeLineageUpdate(course.id, payload)` instead of
    `importSharePayload`. The result notice/toast summarises what applied immediately
    (creates/updates/removals) and, if anything was queued, adds "N changes are waiting
    for your review."

**MCP tools** (`src/mcp/tools/lineage.ts`, additive — no `MCP_TOOL_SURFACE_VERSION`
bump): `lacuna.diff_lineage_update` (read-tier) previews a re-published payload's
classification against a tracked course without writing, reusing the exported
`detectStudentEdits` and pure `diffLineage` so the preview cannot drift from
`mergeLineageUpdate`'s behaviour; `lacuna.apply_lineage_update` (write-tier,
consent-gated) calls `mergeLineageUpdate` directly and may pre-resolve queued items via
the same `acceptMergeReviewItems`/`rejectMergeReviewItems` functions the review panel
uses.

---

## 14. Search & analytics

### Search (`src/db/search.ts`, `SearchPage`, `CommandPalette`)

- **Card search** (`searchCards`) is a pure, offline, case- and diacritic-insensitive
  substring search over a card's front, back, its (backing-deck) name and its tags.
  **Ranking:** front matches rank above back/deck/tag matches; earlier match positions
  rank first.
- **Course content search** (`searchCourseContent`) separately searches course names,
  lesson names, and note names/content, returning ranked `CourseContentHit`s
  (`kind: 'course' | 'lesson' | 'note'`) that deep-link to `/course/:courseId`,
  `/course/:courseId/lesson/:lessonId`, or the same lesson route for a note. The two
  search cores run side by side so a single query surfaces both structural results
  (courses/lessons/notes) and card results.
- **Structured filters** (AND-combined, usable without a query, cards only): **due, new,
  leech, flagged, suspended**. These turn search into course-wide card management ("show
  me all leeches").
- The full-page Search and the `Ctrl/Cmd+K` command palette share the same core; card
  results link straight to the card editor, course/lesson/note results to their page.
  `plainPreview` strips Markdown/cloze/images for previews.
- **Leech** = a card with `lapses >= 8` (`src/fsrs/leech.ts`); surfaced via a badge and
  the search filter, but scheduling is never changed automatically.

### Dashboard signals (`src/fsrs/stats.ts`, `StudySignals`)

Pure aggregates over stored history, in local time:

- **Streak:** consecutive studied days counting back from today (a not-yet-studied
  today does not break a streak that includes yesterday).
- **Reviewed today:** count of review logs dated today.
- **Seven-day forecast:** each scheduled card is bucketed by its effective due
  day (overdue folds into today, beyond the window is ignored) and weighted by
  its deck's **mean review seconds** (fallback 8 s) to estimate **minutes of
  study per day**, shown as a small bar sparkline with a "minutes to clear"
  total.
- **Review heatmap** (`src/fsrs/heatmap.ts`, `ReviewHeatmap`): a
  contribution-style calendar of reviews per **local** calendar day (a 26-week
  grid), built from review logs and theme-aware via accent-opacity bands.
  Expected by anyone arriving from Anki. The header carries the count and the
  week range; a **month-name row** above the cells shows a short month label on
  the first column of each new month so the calendar is readable without a
  separate legend. Weekday labels (Mon/Wed/Fri) line up exactly with their
  cells.

### Per-card analysis (`CardAnalytics`)

Each card in a course's card list (lesson view or question bank) can be expanded in-place
to reveal a **forgetting curve** and **vital statistics** for that individual card:

- **Forgetting curve** — an `AreaChart` projecting retrievability from the
  card's most recent review forward to `examDate + 14 days`, with historical
  review moments overlaid as grade-coloured dots. Vertical reference lines mark
  the current time (`Now`) and the exam date (`Exam`). Never-reviewed cards show
  an inviting empty state.
- **Vital statistics** — a grid of tiles showing: stability, difficulty, current
  retrievability, predicted exam-day retrievability, total reviews, lapses, due
  date, days since last review, mean response time and accuracy.
- **Grade distribution** — animated mini-bars for Again / Hard / Good / Easy
  counts.
- Expansion is toggled by clicking the card row; only one card may be expanded
  at a time. Hover still reveals the card back (desktop), while the expanded
  panel captures click events so interacting with the chart does not collapse
  the view. The row is keyboard-accessible (`Enter`/`Space` toggles expansion).

### Course analytics (`/course/:courseId/analytics`, `src/components/analytics/CourseAnalytics.tsx`)

Theme-aware Recharts panels scoped to one course's **deduplicated card set** — the same
pool `progressValue` and the course path's mastery figure use (a card shared across
lessons is counted once):

- **Predicted exam-day score** over time (area chart of the daily `SessionHistory`
  trajectory).
- **Lesson breakdown** — a bar chart of mastery and completion percentage per lesson, with
  card count overlaid as a line.
- **Card stability profile** (histogram of cards by stability range; new cards distinct).
- **Review volume** (reviews per day over the last 30 days).

Prediction accuracy calibration (`src/fsrs/calibration.ts`) — comparing predicted
retrievability at review against actual recall outcome via a Brier/log-loss metric, plus
the developer-facing `gradeQualitySummary` — remains available at the global level below;
it has not yet been added to the course-scoped view.

### Global analytics (`/analytics`)

A cross-course view, sharing the same Recharts primitives as course analytics but
aggregating across every course:

- **Course comparison** — select any two courses and see their statistics side by
  side (cards, predicted score, mastery fraction, cards reviewed, total reviews,
  reviews today, leeches, mean stability, mean difficulty). Each metric renders
  as **two stacked rows** — one per course — with a colour swatch, a percentage
  bar, and a right-aligned value, so the values can never overlap or fight the
  winner badge. Each compared course's name links to its own `/course/:id/analytics`
  (Arc 10 §10.4), so the global and per-course analytics views cross-link both ways —
  `CourseAnalytics` links back out via the shared `CourseTabs` (§12).
- **Forecast** — cards due and new cards scheduled per day for the next 30
  days.
- **Predicted exam-day score** — average predicted retrievability across all
  courses over time.
- **Prediction accuracy** — Brier score for predicted vs actual recall.
- **Review volume** and **Study time** — daily counts and minutes over the past
  30 days.
- **Observed recall by card age** — every review is grouped by the time elapsed
  since that card's first review. The chart reports the observed recall rate for
  each age bucket and exposes its sample count (`n`) in the tooltip; it is not a
  current-state retention estimate or forecast.
- **Leech count by course** — horizontal bar chart of leeches per course.
- **Stability profile** — distribution of cards by stability range.

Charts are wrapped in `ChartCard` (a consistent titled frame with an empty
state), in a `lg:grid-cols-2` grid. `FadeInView` triggers the entrance
animation on approach (`viewport amount: 0` with a 100px bottom margin) so
charts below the fold are never invisible. Each chart container is `h-64` with
`min-w-0` so a chart cannot push its grid track wider than its share.

---

## 15. Settings (`src/pages/Settings.tsx`)

`Settings.tsx` is a thin page composition; the ten web setting groups live under
`src/pages/settings/` (with an additional Electron-only MCP group). Section ids and ordering remain centralised in the page so the
scrollspy and its navigation cannot drift from the rendered sections.

- **Shared scrollspy rail** (`src/components/ui/SectionRail.tsx`): `useSectionRail`
  (the IntersectionObserver hook), `SectionRail` (the desktop right-hand nav) and
  `SectionRailMobileJumper` (a compact sticky `<select>`-style jumper) were extracted
  from `Settings.tsx` so `CourseSettings` (below) can reuse the same wayfinding over a
  different section list. `useMediaQuery('(min-width: 1280px)')`
  (`src/hooks/useMediaQuery.ts`) is the single breakpoint source both components read,
  so exactly one of the desktop rail or the mobile jumper mounts at a time — never
  both, never neither. Below `xl`, where the rail was previously simply hidden with no
  replacement, the mobile jumper now gives wayfinding to every viewport size.

- **Appearance:** theme toggle (defaults to **dark**); **accent colour** swatches
  (8 choices: Amber plus seven alternatives); **text size** steps that scale all text. All three persist to
  `localStorage` (via `ThemeContext`, `AccentContext`, `FontScaleContext`).
- **Motion:** a **motion-speed** setting with three steps (**Slow**, **Normal** and
  **Fast**) that multiplies animation and transition durations in the app by a single value.
  It is persisted to `localStorage`; the separate `prefers-reduced-motion` preference disables
  motion regardless of this setting. Overlay dialogs (new course, card edit, archive,
  the mobile drawer, the Learn touch sheet) skip enter/exit when the multiplier is 0
  rather than playing a zero-duration keyframe. Expanding panels (share codes, import
  previews, card-list choosers) fade; they do not animate `height` or `margin`.
- **Input mode** (v0.0.2): `auto` (default — `touch` on touch devices,
  `keyboard` otherwise), `touch`, or `keyboard`. The choice drives whether the
  app renders bottom sheets vs. dropdowns, shows or hides swipe hints, and swaps
  hover-only affordances for always-visible ones. Persisted to `localStorage`.
  Switching to touch mode from the default font scale automatically sets the font
  scale to Large (1.15); switching back to keyboard never clobbers an explicit choice.
- **Pomodoro** (v0.0.2): work / short break / long break minutes and
  `autoStartBreaks`. The Pomodoro timer is otherwise fully usable from the Learn
  header.
- **Study & scheduling:** **Manual four-point grading** toggle (off by default ->
  silent grader, §10), **Type your answer** toggle (off by default -> flip-to-reveal;
  see "Typing setting" above), **Start Learn sessions in Focus Mode** (off by default),
  and the global **Optimise scheduling** default (on -> fit
  FSRS weights to your own history, §8.1; gated at `MIN_OPTIMISE_REVIEWS`,
  overridable per course, applied only on confirmation).
- **Sidebar:** show due counts (on by default), show archived courses (on by default;
  courses can be archived from the dashboard card context menu), compact
  mode (off by default), and per-nav-item visibility toggles for every primary nav
  entry (Dashboard, Review today, Search, Share, Analytics, Settings, Help). Persisted
  to `localStorage` and applied immediately (`src/state/sidebarSettings.ts`). The
  dashboard's own course-ordering control (recent / ready to study / mastery / exam
  date / name / created) is a separate, dashboard-local setting
  (`src/state/dashboardSort.ts`; §4.3), not part of this section.
- **Full backup & recovery:** export the entire local database; **Another device** combines this
  installation with a backup from a second device; **Recover this installation** offers the
  explicit **Add from backup** / **Replace local data** chooser described in §13. Course sharing
  and text/CSV/JSON/APKG card import remain separate flows.
- **Persistent storage:** the app requests `navigator.storage.persist()` on
  first run so the browser does not silently evict IndexedDB data under storage
  pressure. The result (persisted, denied, or unsupported) is surfaced honestly
  in the backup area of Settings, with a clear warning when persistence is
  denied and a pointer to regular exports or folder mirroring as the safeguard.
  A `useStorageQuotaWarning` hook (§16) also surfaces a non-blocking toast when
  the browser reports the database is approaching its quota.
- **Automatic backups:** "Back up now"; folder-mirror controls (where
  supported); a list of restore points (timestamp + deck/card counts) each with
  Delete and a two-step Restore confirmation.
- **Install** (where supported): a panel of platform-specific install
  instructions (PWA, Windows installer, etc.), driven by `useInstallPrompt`.
- **MCP server** (Electron only): live stdio-server status, tool-surface version and tool
  count, followed by process-scoped read/write/destructive grants for the whole database
  and each course. Grants can be raised, lowered or revoked and are discarded when Lacuna
  closes.

### Course settings (`src/pages/CourseSettings.tsx`)

The only exam/scheduling settings surface in the app — there is no deck-level settings
page any more. Carries the shared `CourseTabs` (§12) in its header row like the other
three course surfaces, and groups its five headed groups under the same shared `SectionRail`
scrollspy pattern global Settings uses (extracted into `src/components/ui/SectionRail.tsx`
in Arc 10 §10.3, see above), instead of one flat scroll:
**Basics** (rename, exam objective), **Study** (scheduling fields, unlock mode,
auto-practice, lesson view mode, optimisation), **Content** (lesson management, practice
nodes), **Assessments** (exam dates), **Danger zone**. Composed from extracted, reusable
section components (originally factored out of the now-deleted deck-settings page so the
same form primitives serve both models while the deck UI still existed; only the
course-facing composition remains): `SchedulingFieldsSection` (rename, exam date and
time, exam objective toggle — Expected marks <-> Secure topics with live explanatory
copy, new cards per day, target retention slider with Relaxed/Balanced/Thorough presets
and adaptive guidance copy, max reviews/interval, learning/relearning steps, leech
threshold/action, daily review goal, session time limit), `UnlockModeSection`
(semi-linear vs linear lesson unlocking, with linear cadence fields),
`PracticeSettingsSection` (auto-practice toggle and the four threshold/window/gap fields
feeding `shouldInsertPractice`, §-linked to `src/fsrs/practice.ts`), `ExamDatesSection`
(per-course exam-date list), `LessonManagementSection` (reorder/rename/delete lessons)
and `PracticeNodesSection` (list/create/edit/delete teacher-authored manual practice
nodes; see §5's Course architecture section), plus the `OptimisationPanel` (§8.1): a
per-course on/off override for scheduling optimisation, a review-count gate, and an
**Optimise now** action that runs in a Web Worker with a progress bar, then shows the
before/after log loss; applying takes a restore-point snapshot first and **Reset to
defaults** is always available.

- **One save model: instant commit everywhere** (Arc 10 §10.3). Every field commits
  through the existing `updateCourse` path as it's edited — there is no staged
  "Save changes" bar and no local draft state to lose. Text and numeric fields (rename,
  exam objective label, scheduling numbers) commit **on blur**, with the same
  clamping/validation they always had, so a half-typed value never commits mid-edit;
  toggles, radios and selects (unlock mode, auto-practice, lesson view mode) commit **on
  change**. The **target-retention slider** is the one exception with its own two-phase
  commit: dragging updates the displayed value locally on every tick but writes to the
  repository only once, on pointer/key release (the discrete preset buttons still commit
  immediately, since they're a single discrete action, not a drag). This replaced an
  earlier split model where ExamDates/LessonManagement/PracticeNodes already committed
  instantly while name/scheduling/unlock/practice/view-mode sat behind a sticky save
  button — the ambiguity of not knowing which edits were pending is why the whole page
  now shares one model. **Behaviour change for existing users:** there is no longer a
  way to edit a field and back out without saving — every edit is live immediately.
- **Legacy lesson session filter:** `Lesson.sessionFilter` is retained only so old imports
  remain readable. It has no settings control and does not alter live lesson study, which
  always serves unseen lesson members in Simple mode.
- Once the **exam date has passed** (§8.2), the course can be given a new date or simply
  kept on its rolling maintenance horizon. Archiving is a separate, dashboard-only action.
- **Danger zone:** course deletion uses a confirmation followed by the snapshot + undo-toast
  pattern (`DangerZoneSection`): deleting is performed after the inline confirmation, with an
  "Undo" toast that restores everything from a `CourseSnapshot`
  (`snapshotCourse`/`restoreCourse`, `src/db/repository.ts`): the course, its lessons,
  notes, lesson-card links, practice nodes, assessments, revision plans, cards, their hidden backing decks
  (§5, Deck and Folder), and the session history/calibration profiles keyed to either the
  course or those decks.
- **Not-found handling:** the course is resolved via a null-sentinel
  `useLiveQuery` (missing row mapped to `null`, matching `CoursePath`) so a
  stale or deleted `courseId` reaches a genuine not-found state instead of
  hanging on the loading skeleton.

---

## 16. Persistence, seeding & resilience

- UI reads use Dexie `useLiveQuery` hooks (`src/state/useData.ts` and course-specific hooks) so
  the interface reacts to writes automatically. Non-React callers use the plain async queries in
  `src/db/read.ts`.
- On first run a small, deletable **demo course** (with lessons, notes and cards) is
  seeded (`seedIfFirstRun`, `src/db/seed.ts`).
- A daily restore point is taken in the background after seeding.
- **Error boundaries** at the app, page and Learn-session levels keep a failure
  in one area from blanking the whole app. Their fallback offers a **local-only
  diagnostic bundle** (`src/db/diagnostics.ts`): "Copy diagnostic details" /
  "Download diagnostic bundle" assemble the error and stack, app version
  (`__APP_VERSION__`), browser/UA, and deck/card/review/backup counts, plus
  course/lesson/note/lessonCard/practiceNode/courseAssessment/sequence/occlusion/revisionPlan
  counts when the
  course tables contain data. Card content is **excluded by default**; including
  a small sample is a separate, explicit opt-in. Nothing is transmitted — the
  bundle is the user's to paste into a bug report.
- **Storage-quota warning** (v0.0.2, `src/hooks/useStorageQuotaWarning.ts`):
  polls the Storage API on a long interval and surfaces a non-blocking toast
  when the database is approaching its quota, with a "Back up now" action that
  jumps to the Settings backup area.
- Migrations live in `src/db/migrations.ts`; the schema is versioned in
  `src/db/schema.ts`, and every upgrade is fronted by a pre-migration restore
  point (§13).

---

## 17. Accessibility & internationalisation

- Honours `prefers-reduced-motion: reduce` (all animation/transition durations
  collapse) and the per-user **motion-speed** setting.
- Focus-visible rings on interactive controls; `aria-label`/`title` on icon
  buttons; `aria-pressed` on toggles and chips; `role="progressbar"` with value
  attributes on the bar.
- Tabular numerals for figures; balanced text wrapping for headings.
- Every interactive element meets a **44px minimum target** (per WCAG 2.5.5 /
  Apple HIG), and touch-interactive elements carry explicit **active states** so
  presses are visible without `:hover`.
- Copy is **British English** throughout; **no emojis** in product copy or UI.

---

## 18. Keyboard shortcuts (summary)

| Context                | Key                 | Action                                |
| ---------------------- | ------------------- | ------------------------------------- |
| Global (shell)         | `Ctrl/Cmd+K`        | Toggle command palette                |
| Global (shell)         | `/`                 | Open search                           |
| Global (shell)         | `?`                 | Toggle keyboard hints                 |
| Card editor            | `Ctrl/Cmd+Enter`    | Save (and add another, for new cards) |
| Card editor            | `Tab`               | Front -> Back -> Save-and-add -> Save |
| Sequence item editor   | `Ctrl/Cmd+Enter`    | Insert and focus the next item        |
| Learn                  | `Space` / `Up`      | Show answer                           |
| Learn                  | `Down`              | Hide answer                           |
| Learn (silent grading) | `Y` / `Right`      | Yes (correct)                         |
| Learn (silent grading) | `N` / `Left`        | No (incorrect)                        |
| Learn (manual grading) | `1`, `2`, `3`, `4`  | Again / Hard / Good / Easy            |
| Learn                  | `E`                 | Edit current card                     |
| Learn                  | `U`                 | Undo last answer                      |
| Learn                  | `F`                 | Toggle focus mode                     |
| Overlays               | `Esc`               | Close                                 |

Single-key shortcuts are inert while a text field is focused. The `?` overlay can
also be opened from the "Keyboard shortcuts" item in the Learn mode 3-dot action
menu.

---

## 19. Electron desktop build

Lacuna can be packaged as a standalone Windows desktop application via Electron.
The Electron layer lives in `electron/` and wraps the existing Vite SPA without
modifying the renderer source.

### Architecture

- **Main process** (`electron/main.ts`): creates a frameless `BrowserWindow`,
  injects Cross-Origin Isolation headers (COOP/COEP) required by the FSRS WASM
  trainer, registers a custom `app://` protocol for production builds, and
  manages window lifecycle (single-instance lock, close/minimise/maximise).
- **Preload** (`electron/preload.ts`): exposes a minimal `electronAPI` via
  `contextBridge` for platform detection, window controls and the narrow MCP IPC surface.
- **Titlebar** (`src/components/layout/Titlebar.tsx`): a custom React component
  that renders window controls (minimise, maximise/restore, close) when running
  inside Electron. Only mounts when `window.electronAPI.isElectron` is truthy,
  so the web version is completely unaffected.
- **Fonts** (`electron/assets/fonts/`): Fraunces, Geist and JetBrains Mono
  bundled as local TTF variable fonts. The main process injects
  `electron/fonts.css` via `webContents.insertCSS` so the app works fully
  offline.
- **Auto-updater** (`electron/updater.ts`): uses `electron-updater` with GitHub
  Releases; checks for updates shortly after launch and notifies the renderer.

### Model Context Protocol server

The Electron main process hosts the data-owning MCP bridge using the pinned official TypeScript
SDK. A client launches the installed Lacuna executable with `--mcp-companion`; that disposable
stdio companion attaches to the already-running application through a token-authenticated,
user-local Unix-domain socket (macOS/Linux) or named pipe (Windows). There is no TCP/HTTP endpoint
or browser MCP server. The normal renderer window must remain open because it owns IndexedDB.
Modern SDK v2 and legacy stdio negotiation are both accepted.

| Component | Pinned version | Compatibility |
| --- | --- | --- |
| `@modelcontextprotocol/core` | 2.0.0 | Shared protocol types and modern/legacy negotiation |
| `@modelcontextprotocol/server` | 2.0.0 | Companion and embedded stdio server |
| `@modelcontextprotocol/client` | 2.0.0 | Portable smoke client |
| Lacuna companion protocol | 1 | Authenticated native-IPC relay; independent of MCP protocol version |

The tool contract is transport-independent and versioned separately from the Dexie schema
(`MCP_TOOL_SURFACE_VERSION`, currently 2 — additive tools never bump it). It exposes:

- read/query tools for courses, lessons, cards, due and weak cards, statistics, sequences,
  occlusions, notes and diagnostics;
- content tools for course, lesson, note, card, sequence, occlusion and course-assessment
  creation/update;
- destructive or bulk tools for cards, lessons, courses, sequences and occlusions, plus
  suspension, flags and bounded rescheduling; and
- idempotent card-import preview/import tools that classify items as create, skip or
  update candidates before writing.

Tool definitions and handlers live under `src/mcp/` and reuse `src/db/read.ts` and the
existing repository functions. The main process owns the SDK transport and sends correlated
requests over the preload bridge to the renderer; a ten-second timeout turns a missing or
not-ready renderer into a normal tool error. Tool inputs are resolved to their owning course
before permission checks, and a call spanning more than one course is rejected.

Permissions are connection-scoped and ordinal: destructive implies write, which implies read.
The first read for a course is allowed with a non-blocking notice. The first write or
destructive call blocks on an in-app consent prompt and fails closed if no decision arrives.
Settings identifies each live client, shows its current grants and can grant or revoke them
manually. A client's grants are destroyed on disconnect. Destructive and bulk handlers capture
repository snapshots; their internal undo payload never reaches the
client, but drives an in-app undo toast after the action completes.

`create_occlusion` takes the hash of a diagram already stored in this install: there is no
asset-upload tool, deliberately, since binary transport is not a natural MCP shape. Region
ids, roles and fractional coordinates are the whole agent-facing contract, which makes an
agent-authored SVG diagram plus coordinates a text-only workflow.

The shipped surface deliberately excludes raw FSRS-state writes, review recording, backup/share
operations, note annotations and most curriculum-structure mutation. Streamable HTTP, a web
companion process, durable client identity and plugin extension points remain deferred.

These exclusions describe the shipped contract, not an instruction to bolt future operations onto
the renderer through generic UI automation. The attachable local companion and canonical
programmatic release scenario implement the first §§2.12–2.13 slices. The broader proposed
user-action surface — including the separate safety boundary for study-history writes — remains in
`docs/archive/roadmap-2026-08-11.md` §2.14.

### Scripts

- `bun run electron:dev` — runs Vite dev server and Electron in parallel.
- `bun run release:scenario -- --scenario canonical` — runs the isolated canonical domain and
  import-preview release checks and writes a machine-readable evidence report.
- `bun run electron:build:win` — compiles the Electron TypeScript, builds the
  Vite SPA with `--base ./`, and packages via electron-builder (NSIS
  installer).

### Build output

Packaged files land in `release/` (gitignored). The electron-builder
configuration is at `electron/electron-builder.yml`.

---

> **Historical release notes:** Sections 20 and 21 record the v0.0.3 and v0.0.2 releases as they
> existed at the time. Their then-current names such as `DeckView` and `DeckSettings`, and their
> old card/gesture claims, are historical records rather than live routes or current contracts.
> The preceding sections describe the current implementation.

## 20. v0.0.3 changelog

### New features

1. **Simple learn mode** — an algorithm-free YES/NO study loop with no FSRS scheduling,
   no DB writes, and a live pill UI (Wrong / Remaining / Right). Cards are re-queued at
   the end when marked wrong; the session loops until all cards are correct. The
   SessionReport skips the grade-distribution chart. Added `useStudyMode` hook
   (`src/state/studyMode.ts`) with `fsrs` and `simple` modes.
2. **Card types** — cards can now be Basic, Reversed, Cloze, or Typing-answer. The typing
   card shows a live input field during the question phase and compares the typed answer
   against the correct answer on reveal. The card editor and edit overlay both have a
   type selector and a conditional answer field. Repository functions updated to persist
   `cardType` and `answer`.
3. **Simple learn in study dropdown** — the existing DeckView study dropdown now includes
   Simple learn alongside Cram, Due, New, Leech, and Flagged options.
4. **Folder deletion** — folders can now be deleted from the dashboard with a
   confirmation dialog that shows affected deck counts.
5. **Gesture settings** — swipe actions on dashboard deck cards are configurable in
   Settings (study / archive).

### Visual polish

1. **Learn mode redesign** — mode-aware progress, header controls, and card accents
   (amber for cram, green for simple, red for leech filter, etc.). A label pill animates
   in with each card face to orient the user (Question / Answer / Fill the gap /
   Type the answer). Swipe hints are styled as directional badges.
2. **Simple mode progress** — a segmented card strip and circular completion ring track
   Wrong / Current / Correct state without conflating that loop with FSRS readiness.
3. **Session report redesign** — confetti burst on goal reached, animated count-up
   stat tiles with icons, a progress bar that animates from before to after with a delta
   badge, and a staggered entrance for all elements.
4. **Flip card label pills** — each card face shows a mode-aware label pill with an
   icon (e.g. "Question" with a help icon, "Answer" with a check icon, "Fill the gap"
   with an edit icon, "Type the answer" with a keyboard icon) that fades in with a spring
   animation.
5. **Global atmosphere** — a subtle dot-grid background pattern (`bg-dot-grid`) added to
   key page headers (Dashboard, DeckView, Settings, DeckSettings, CardEditor, Analytics,
   HelpPage, SearchPage, SharePage) and empty states, creating a cohesive "drafting table"
   feel across the app without gratuitous gradients.
6. **Page headers** — all major pages now use a consistent `rounded-2xl border border-line
bg-surface` header with a dot-grid background, a large display-type title, and an
   eyebrow label in small uppercase with wide tracking.
7. **Cards and surfaces** — elevated cards with `shadow-sm shadow-black/[0.02]` and a
   `hover:shadow-lg hover:shadow-black/[0.04]` transition, plus a `hover:-translate-y-1`
   lift on deck cards and interactive tiles for tactile feedback.
8. **Section icons** — Settings and DeckSettings sections now each have a matching icon
   (Keyboard, Moon, Menu, Clock, Flame, etc.) in accent colour next to the section title
   for quicker visual scanning.
9. **Import/export panels** — rounded-2xl containers with overflow-hidden and subtle
   shadow for a cleaner, more contained appearance.
10. **Overlays** — `CardEditOverlay` and `DeckSearchOverlay` both use the dot-grid
    background and rounded-2xl styling for consistency with the rest of the app.
11. **Empty states** — all empty states (Dashboard, DeckView card list, SearchPage)
    use the dot-grid background, a centred icon in an accent-soft badge, and a clear
    call-to-action button for a more polished first-run experience.

### Bug fixes

1. **Text selection focus ring** — removed the internal `box-shadow` ring on
   `input:focus-visible` so only the external `:focus-visible` ring applies.
2. **Share code importing** — Base45 whitespace stripping corrupted share codes because
   the Base45 alphabet includes space as a valid character. Now only legacy base64
   (LAC0/LAC1) formats strip whitespace.
3. **Touch font scale** — auto-set font scale to Large (1.15) when switching to touch
   mode from the default (1.0); never clobber explicit choices when switching to keyboard.
4. **Font scale sync** — wired a `lacuna:font-scale` custom event so the Settings page
   reflects font scale changes immediately after input mode switches.
5. **ESLint errors** — fixed 10 ESLint errors across Dashboard, DeckSettings, and LearnMode.

### Quality

- TypeScript is clean (`tsc --noEmit`).
- 332 tests pass across the full suite.
- All UI changes follow the touch-first design system (44px targets, active states,
  bottom sheets on touch, keyboard shortcuts on desktop).

---

## 21. v0.0.2 changelog

This release is a **touch-first redesign** layered on top of v0.0.1, plus five
bug fixes uncovered during the redesign and a storage-layer change for
cross-environment consistency.

### Touch-first redesign (Stages 1–14)

- **Input mode setting.** A new `InputMode` (`auto` / `touch` / `keyboard`)
  drives the entire app. `auto` resolves to `touch` on touch devices and
  `keyboard` otherwise; explicit choices persist to `localStorage`. The
  `useIsTouchMode` hook is the single read point for components.
- **Pomodoro timer** in the Learn header. A 36px SVG ring face expands into a
  160px circular timer with phase colours (focus / short break / long break)
  and a 1Hz progress arc. Work / short break / long break minutes and
  `autoStartBreaks` are configurable in Settings. The timer is fully usable
  with one hand in touch mode.
- **44px minimum touch targets** across `Button` (every variant and size),
  tabs, chips, icon buttons, filter controls, breadcrumb links, and menu items.
- **Swipe gestures** on the dashboard deck cards (right = study, left =
  archive) and on the Learn flip card (right = Yes, left = No), with a
  directional glow that follows the finger, a 50–60px commit threshold, a
  springy snap-back below the threshold, and a `localStorage` flag
  (`lacuna.learnHints`) that hides the persistent hints after the first
  successful swipe.
- **Bottom sheets** (touch mode) for the Learn grading controls and the
  per-card actions menu, with a drag handle, scrim backdrop, focus trap, and
  a down-drag or fast-flick-to-close. The keyboard equivalent is a dropdown.
- **Long-press to bulk-select** in the card list (touch mode), powered by
  `useLongPress`.
- **Active states** on every touch-interactive element (e.g.
  `active:bg-ink/10`) so presses are visible without `:hover`.
- **Folder support.** Decks can belong to a `Folder`; folders are collapsible
  groups in the sidebar and the dashboard grid.
- **Sidebar polish.** Due-count badges, an "Archived" chip, a streak badge on
  the Study-today item, and configurable compact mode / per-nav-item visibility.
- **Settings motion-speed and input-mode controls.**
- **Motion-speed-aware animations.** Every duration in the app is multiplied
  by a single user-configurable value, so the app can be as snappy or as
  gentle as the user prefers.
- **LayoutGroup reflows** on the dashboard so adding, removing, archiving or
  reordering decks does not stutter.
- **Storage-quota warning** (`useStorageQuotaWarning`) surfaces a non-blocking
  toast when the database is approaching its quota.
- **Install-prompt panel** in Settings (PWA / Windows installer links where
  supported).
- **PWA service worker** for offline use, registered at the application root.

### Storage layer

- Image assets are now stored as **`Uint8Array`** in the `assets` table rather
  than as `Blob`, because `fake-indexeddb` (and some browser IndexedDB
  implementations) does not reliably preserve `Blob` objects through
  structuredClone. DOM APIs that need a `Blob` receive one via `toBlob()`.
  This is invisible to the user but eliminates a class of test/environment
  flakiness.
- The asset render cache is LRU-bounded with TTL-based stale eviction, so the
  live editor preview (a new source string per keystroke) cannot grow it
  without limit.

### Bug fixes (5)

1. **Deck comparison overlapping layout** — the comparison bars were in a
   single side-by-side track with a 0.5px separator and a winner badge at
   `right-0`. The badge could be clipped by `overflow-hidden` and the right
   bar could overflow on narrow widths. Restructured to two stacked rows (one
   per deck), each with a colour swatch, a bar track, and a right-aligned
   value; the winner badge moved to the metric label row.
2. **Double text selection on revealed cloze spans** — the
   `.cloze-reveal` `background-color` highlight stacked under the global
   `::selection` rule (both painted translucent amber), producing a muddy
   double-highlight on selected text inside a revealed cloze. Switched to
   `text-decoration: underline` and added a `.cloze-reveal::selection`
   override using a stronger accent fill. Also fixed an unrelated selection-
   flicker in `MarkdownView` by tracking the last resolved source with a
   `useRef` and bailing out of the effect when the prop is unchanged.
3. **Dashboard reflow stutter** — the deck cards had **both** a delayed
   initial mount animation and a layout reflow animation, so the two fought
   each other when a deck was added, removed, archived, or moved. Wrapped the
   deck grid in motion/react's `LayoutGroup` so the reflows are coordinated,
   and removed the per-card mount-stagger `delay`.
4. **Review heatmap alignment** — the weekday labels sat 2px lower than the
   cells they were labelling because the labels container had a `pt-[2px]`
   that the cell grid did not. Removed the offset so Mon/Wed/Fri line up with
   their rows. Also added a month-name row above the grid.
5. **Analytics charts invisible below the fold** — `FadeInView` required
   `amount: 0.1` of the element to be visible before animating, so charts
   below the fold on shorter viewports stayed at `opacity: 0`. Lowered the
   threshold to `amount: 0` with a 100px bottom margin so the animation fires
   as soon as the chart approaches the viewport. Also grew `ChartCard` from
   `h-56` to `h-64` and added `min-w-0` so charts cannot push their grid
   track wider than their share.

### Quality

- The test suite now covers UI components, hooks, and state-management
  modules in addition to the data and FSRS layers (Vitest with
  `fake-indexeddb` for the database, `@testing-library/react` and
  `happy-dom` for the UI).
- 328 tests across 52 files, all green.
