# 4. App layout & navigation

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
| > Today  |  animate here                              |
| > Search |                                            |
| > Share  |                                            |
| > Progr..|                                            |
| > Setting|                                            |
| > Help   |                                            |
|          |                                            |
| COURSES  |                                            |
| - Organ..|                                            |
| - French |                                            |
| Archived |                                            |
|          |                                            |
| [v] coll |                                            |
+----------+--------------------------------------------+
```

- **Sidebar** (`Sidebar`): brand; navigation destinations (Today, Search, Share,
  Progress, Settings, Help — each independently hideable); a fixed **Archived** destination below
  the **Courses** heading, with its text aligned to course names; the live course list
  contains countdown and forecast glyphs and prevents horizontal overflow. Its overflow
  has no visible scrollbar, whilst keyboard focus can still reveal long course lists.
  The footer contains a theme toggle and a
  collapse toggle. Collapsing animates the width to 72 px and hides labels. Active state is a
  white pill within its row. State (`collapsed`), compact mode, due-count visibility, and
  per-nav-item visibility are all persisted to `localStorage` via `useSidebarSettings`
  (configured in Settings → Sidebar) and take effect immediately. Its height follows the shell
  body rather than the viewport so the footer remains visible below the Electron titlebar.
- **Search navigation:** the sidebar always opens `/search`, consistently with the other
  navigation destinations. Quick search remains available through `Ctrl/Cmd+K`.
  Study actions live on Today and course pages rather than appearing as a different kind
  of sidebar entry. Stored navigation preferences retain order and visibility whilst
  retiring the old Review today entry and refreshing destination names.
- **Mobile:** the sidebar becomes a drawer opened from a top bar burger or a deliberate
  left-edge rightward swipe; the scrim closes it; it auto-closes on navigation. The edge
  gesture rejects vertical movement and starts on non-interactive content only, so ordinary
  scrolling and controls retain their native behaviour. Supported browsers suppress horizontal
  history overscroll while the application shell is mounted; iOS Safari may still reserve its
  native screen-edge back gesture. On desktop the sidebar is always visible.
- **Global keyboard shortcuts** (within the shell): `Ctrl/Cmd+K` toggles **Quick search**;
  `/` opens **Search content**; `?` toggles the keyboard-hints overlay. Single-key
  shortcuts are inert while typing in an input/textarea. Quick search focuses its search field on
  opening; Escape closes it and restores focus to the control that opened it.
  Opening quick search from the mobile drawer replaces the drawer and returns focus
  to the navigation opener when search closes.
- **Error boundaries:** one wraps the whole app, one wraps each page, and one wraps the
  Learn session.

### 4.2 Route map

| Path                                                    | Screen                                                                  | In shell? | Loading |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------- | ------- |
| `/`                                                     | Dashboard (course grid)                                                 | yes       | eager   |
| `/course/:courseId`                                     | Course path (or the single lesson directly, if the course has only one) | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId`                    | Lesson view (notes / cards)                                             | yes       | lazy    |
| `/course/:courseId/bank`                                | Compatibility redirect to the course Cards page                         | yes       | lazy    |
| `/course/:courseId/cards`                               | Cards (all direct-recall Cards in the course)                           | yes       | lazy    |
| `/course/:courseId/questions`                           | Questions (separate post-instruction application practice)              | yes       | lazy    |
| `/course/:courseId/questions/new`                       | Question editor (create)                                                | yes       | lazy    |
| `/course/:courseId/questions/:questionId/edit`          | Question editor (edit)                                                  | yes       | lazy    |
| `/course/:courseId/settings`                            | Course settings                                                         | yes       | lazy    |
| `/course/:courseId/analytics`                           | Course analytics                                                        | yes       | lazy    |
| `/course/:courseId/updates`                             | Shared-course update review                                             | yes       | lazy    |
| `/course/:courseId/cards/new`                           | Card editor (create, course-scoped)                                     | yes       | lazy    |
| `/course/:courseId/cards/:cardId/edit`                  | Card editor (edit, course-scoped)                                       | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/cards/new`          | Card editor (create, lesson-scoped)                                     | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/cards/:cardId/edit` | Card editor (edit, lesson-scoped)                                       | yes       | lazy    |
| `/course/:courseId/sequence/new`                        | Sequence editor (course-scoped)                                         | yes       | lazy    |
| `/course/:courseId/sequence/:sequenceId/edit`           | Sequence editor (edit)                                                  | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/sequence/new`       | Sequence editor (lesson-scoped)                                         | yes       | lazy    |
| `/course/:courseId/occlusion/new`                       | Occlusion editor (course-scoped)                                        | yes       | lazy    |
| `/course/:courseId/occlusion/:occlusionId/edit`         | Occlusion editor (edit)                                                 | yes       | lazy    |
| `/course/:courseId/lesson/:lessonId/occlusion/new`      | Occlusion editor (lesson-scoped)                                        | yes       | lazy    |
| `/settings`                                             | Settings                                                                | yes       | lazy    |
| `/search`                                               | Search                                                                  | yes       | lazy    |
| `/share`                                                | Share (send a course: link by default, other ways folded)               | yes       | lazy    |
| `/analytics`                                            | Global (cross-course) analytics                                         | yes       | lazy    |
| `/help`                                                 | Help                                                                    | yes       | lazy    |
| `/course/:courseId/study`                               | Persistent course study conductor                                       | **no**    | lazy    |
| `/course/:courseId/questions/learn`                     | Separate Question-practice session                                      | **no**    | lazy    |
| `/course/:courseId/learn`                               | Learn session (practice over every due card in the course)              | **no**    | lazy    |
| `/lesson/:lessonId/learn`                               | Learn session (new cards for one lesson)                                | **no**    | lazy    |
| `/learn`                                                | Review today session across every course                                | **no**    | lazy    |
| `/welcome`                                              | Cinematic first-run landing page                                        | **no**    | lazy    |
| `/landing`                                              | Alias of the main cinematic landing                                     | **no**    | lazy    |
| `/download`                                             | OS-aware desktop beta download page                                     | **no**    | lazy    |
| `/method`                                               | Technical method page                                                   | **no**    | lazy    |
| `/deck/:deckId`                                         | Redirects to `/`                                                        | yes       | eager   |
| `/study`                                                | Redirects to `/`                                                        | yes       | eager   |

The public landing opens with one headline, direct app entry and the existing illustration.
Supporting copy is distributed across the scroll so each scene has only one or two focal points. Its
walkthrough leads with assessment coverage and session time limits; the exam projection and
course journey precede the shorter familiarity-and-recall story. The illustrative recall curve
remains explicitly a prediction assuming successful reviews, not a promised learner outcome.
Recall and Practice example cards accept click, touch, Enter and Space to toggle their answer.
Their existing scroll reveal applies until the first activation; subsequent scrolling does not
override that card's manual state. Reduced motion shows only the selected face without rotation.

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
new-course composer which expands from its Today trigger; the sidebar shortcut opens that same
composer. It uses ordinary keyboard navigation, focuses Course name on opening, and returns focus
to its trigger after Escape or Cancel. It defaults to **Steady retention**; choosing **Exam date** shows the
date picker with a seven-day suggestion; a course grid ordered
by a configurable **sort** (recent, ready to study,
mastery, exam date, name, or created — Settings → Sidebar has no sort control; the sort lives on
the dashboard itself and persists to `localStorage`); and a review-activity heatmap for anyone
arriving from Anki. Cross-course due review is opened from the sidebar's **Review today** item,
not a separate Dashboard "Study all" button. Empty state invites creating the first course. All
transitions between these regions are coordinated by `LayoutGroup` so adding or reordering
courses does not stutter. Archived courses are excluded from the active grid and normal sidebar
course list. The sidebar's fixed **Archived** destination (`/archived`) sits beneath the
**Courses** heading outside the active-course scroll region. Its cards open the existing course
path in an explicit read-only state; every lesson and course analytics remain inspectable, while
a central route guard returns direct study, authoring or mutation URLs to that overview. A separate
**Unarchive** action restores study and authoring controls. A course card's context menu (right-click,
keyboard Context Menu key or Shift+F10) offers a confirmed **Archive** action which retains every
lesson, card and review; the completion toast offers Undo by clearing the same `archived` flag.
The dashboard menu and archive confirmation load on demand and are precached with their
static dependencies, so their first use also works offline. Closing confirmations become
inert immediately while their exit animation finishes.

Dashboard and navigation share one shell-owned live query, also supplying the final-exam
controller. Desktop and mobile navigation consume the same derived result. Dashboard alone
retains hydrated cards and observes lesson progress and course calibration; leaving it removes
those extra subscriptions after the navigation query resolves. Full-screen Learn navigation
owns its query only while its drawer is mounted. Course Path derives its header summary from
the same course records used to build its path, using the study conductor's shared reader.

**Course path** (`/course/:courseId`):

```
< All courses                     ( Path | Cards | Questions | Analytics | Settings )
                                                         ( Study | Author )
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
and practice nodes, built by `src/course/path.ts` and shown by `CourseOverview` as a list in
path order. The course row pairs the course's name (a link back to its Path) with
the shared `CourseTabs` component (`src/components/course/CourseTabs.tsx`: Path · Cards ·
Questions · Progress · Settings, active tab derived from the route), rendered on the five course
surfaces and every normal or single-lesson view, so any section is one click from any other.
Progress is the course analytics page; the forecast figure in the course header is plain text.
Study lives on Path alone, the course's landing page, so it is the one default action. Lesson URLs keep
Path active because a lesson belongs to the path; the phone `CourseSectionBar` shares the same
rule (`isCourseSectionCurrent`). The course-owned `LessonViewModeToggle` appears
beside that navigation on CoursePath and every Lesson view, so the same View/Edit decision
follows the user through the workspace. Beside the lesson list, an Assessments panel lists the
course's assessments with their dates, so exam dates are visible without opening Course
Settings; each opens the same `AssessmentDetailSheet`. Practice gathers cards from lessons
reached so far whose predicted retrievability remains below the mastery threshold at each
card's applicable exam horizon; this is not the narrower `card.due` timestamp concept. Questions
do not enter this pool or the Path conductor in v1; they are reached deliberately from the separate
Questions tab. There each question set shows its question and mark counts, when it was last tried,
its latest self-marked score and, after two or more finished attempts, the last five scores as bars.
In View mode **Attempt** starts a Practice attempt at once (Paper mode is chosen on the set's own
page) and **Continue** replaces it while an attempt is unfinished; Edit mode keeps the authoring
links. An attempt that cannot be read leaves its set unscored instead of hiding the list.

"Due" has one definition (`courseDueReviewCards`), shared by the course and lesson
headers, path lesson rows, the study sheet and the **Review due cards** session: cards
introduced in reached lessons whose scheduled review has passed and which remain below
Practice's mastery threshold. New cards are never due. A review already secured for an
exam later today is omitted even if its saved due timestamp has passed. Counts use the
same per-card exam horizons as Practice; after an exam passes, the existing maintenance
horizon applies. Future-scheduled cards can still be offered by curricular Practice
without being counted as due. The dashboard's **ready** figure is a separate measure:
due reviews plus new cards admitted by the daily cap.

Primary and explicitly linked cards count as lesson members, deduplicated by card id. A
course with exactly one lesson skips the path entirely and renders that lesson directly
(no one-node path). The header is the shared `CourseHeader` cockpit
(`src/components/course/CourseHeader.tsx`, with stat primitives in `CourseHeaderStat.tsx`
and `MasteryRing.tsx`): exam eyebrow (pulses when the exam is within three days, via the
`exam-pulse` animation), display title, and a row of stat blocks each carrying a plain-language
one-line descriptor so distinct metrics can't be conflated. Course position ("Lesson X of
N") is a pacing metric, kept visually and semantically separate from mastery (mean predicted
FSRS retention, shown as a ring rather than a bar) and from due-today (a live count of cards a
session would serve right now), computed via `src/course/path.ts`'s `nearestExamDate` and the
same `fsrs/eligibility.ts` due-card logic the path itself uses.

Course locking controls study progression, not authoring. In View mode, locked lesson
nodes remain inert; in Edit mode, they retain their locked appearance and status but open the
ordinary lesson authoring view. Edit mode also enables direct path reordering: mouse and pen
drags start after 8 px of movement; touch requires a 350 ms hold, leaving early movement free
for scrolling. The lesson follows the pointer and neighbouring lessons make room. Escape and
pointer cancellation abandon the move. `Alt+ArrowUp`/`Alt+ArrowDown` provides the
keyboard equivalent with live announcements. Reordering persists through the same
`reorderLessons` repository operation used by Course Settings; checkpoint placement remains
attached to its stable lesson anchor, while manual and automatic Practice positions and
one-way lesson unlock ratchets are deliberately left unchanged.

In Edit mode each path row and the lesson heading carry a visible **Lesson actions** menu
(`LessonActionsMenu`) with Rename, Move up, Move down and Delete lesson. Right-click, the
context-menu key and Shift+F10 on the row or title open the same menu, except over text
fields or a text selection, which keep the browser's menu. Deletion confirms with the actual
consequence (notes deleted, cards kept without a lesson), uses `deleteLesson`, and offers Undo
from `snapshotLesson`/`restoreLesson`. Focus then moves to the next lesson row, or to the
course page heading when the open lesson was deleted. Shared locked copies and archived
courses never show the menu.

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
In Edit mode, **Add checkpoint** creates one at the end of the visible path and selecting an
existing checkpoint opens the same assessment editor used by Course Settings. View mode retains
the read-only detail and revision behaviour. Inline single-lesson courses expose the same creation
action through an **Add** menu in the lesson header, beside Study; the chosen form opens beneath
the header.

The course header has one **Study** action. It launches the persistent course study
conductor at `/course/:courseId/study`. The conductor rebuilds its next-step decision from the
authoritative course state after every completed lesson or Practice step; it never stores a
fixed queue. Lesson notes, Simple recall, curricular Practice, due review, transition
reports and Pomodoro breaks therefore form one continuous study period rather than unrelated
routes. Study opens the study sheet (a bottom sheet on a phone, whose handle swipes it away; the
shared centred dialogue from 768px), which previews today's session before **Start session**:
the planner's next step (a lesson with its card and new-card counts, a Card practice or due review
with its card count), then **Review due cards** when due reviews remain, marked as offered next
because the between-steps screen offers them beside Continue. Each step and the session carry an
"about N min" estimate from the course's mean review time, counting a new card as three reviews;
a step with no cards has no estimate and the session total is then omitted. The sheet never shows
steps beyond those two, since the planner decides one step at a time. Opened from Today, the
plan is followed by **Other ways**: due review on its own, each applicable named assessment and
Practise until all correct. Opened from a course page, which has its own Other ways menu beside
Study, the sheet leaves that section out. When an imminent
assessment overlaps reached, exposed material and has useful work, the conductor also offers each
applicable named assessment, ordered by date. Choosing a branch is temporary and is not retained
as a preference. Selecting a visible manual Practice node or assessment on the path bypasses the
generic choice and enters that exact scope. Before **Study**, a ring shows the course's reviews
due today, filling as the day's are done and completing with a tick once none are due; the course's
exam-day recall, card and lesson counts sit in one card beneath its lessons. Beside **Study**, an
**Other ways** menu offers
**Only review due cards** (course-wide due review, directly) and each upcoming assessment. Every
course entry point is the same `CourseStudyActions` pair, a one-lesson course included, and
Today's **Study** on a course row (and the S shortcut there) opens the same study sheet, so Study
always previews the session before it starts. Once the curriculum is finished, the
conductor's next step is that same due review, under the same name. It creates no
path node or milestone. Path nodes show **Manual** or **Automatic** explicitly. Existing manual
nodes remain editable on the path, and Edit mode exposes one **Add** menu (Lesson, Card practice,
Practice questions, Checkpoint) rather than repeating insertion controls at every gap; the chosen
form opens in its own bounded area beneath the menu, on single- and multi-lesson courses alike. Course Settings
explains the distinction, lists existing manual nodes and links back to the path instead of
duplicating the editor.
The learner leaves only through an explicit finish action. The step union reserves an
`exam-questions` member for a future engine, but this version creates no placeholder questions
or empty exam UI. A completed lesson enters its transition report through a motion-speed-aware
staged animation: the completed topic settles back, a vertical connector draws down, and the
next activity appears as the main destination. Completion is conveyed by the tick rather than
“Step complete” and “Up next” subtitles. Actions align beneath the destination, stacking at narrow
widths; Continue reserves space for the landing-style arrow reveal on hover or keyboard focus.
Entering controls remain inert until visible; reduced motion makes them immediately available.
While the conductor recalculates the authoritative next step, Continue
remains visible but disabled as **Planning next step…**; it never accepts a click that cannot yet
advance.

Curricular Practice keeps a fixed lesson prefix only for its milestone denominator, so later
lessons cannot rewrite or revive that historical milestone. A session persists its milestone
identity and progress against that same prefix, never the wider live pool; a completed
milestone saved before this rule, carrying the live-scope fingerprint, counts as complete only
while that exact scope still holds. A current automatic or recurring
Practice session uses all reached and exposed material; a manual Practice node may narrow its
live session through its authored lesson selection. Manual checkpoints are conditional. In
View mode they appear and gate progression only when they have eligible work whose estimated
review time crosses the course's near/far threshold, or when they are the last relevant
opportunity for an urgent assessment intersecting that exact Practice context. An unrelated
assessment never tightens the threshold. Zero-eligible and low-workload nodes remain latent
and non-gating; they remain visible in Edit mode. Completed manual checkpoints remain visible
as course history. Automatic Practice is conductor scheduling machinery and is not
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
keeps its captured revision; triggers wait until it closes. `half-life-logistic-v3-routed` (frozen
coefficients unchanged from v1; routed handover: success/no-outcome/first-review 21,600→86,400 s
[6 h→24 h], failure 345,600→432,000 s [96 h→120 h], FSRS-6 only from 604,800 s [7 days]) owns
short-horizon allocation through the model boundary — v1 (`half-life-logistic-v1` /
`half-life-logistic-v1-lag64-count8`) passed the initial gate but failed multi-day transfer on two
independent cohorts and was conservatively retreated per `ROUTING_DECISION_RULE.md` and
`tooling/short-term-memory/BENCHMARK.md`; the no-regression gate passes only against the fractional-day
FSRS-6 reference the runtime actually uses (the floored FSRS-6 reference is stronger by ~0.001–0.003
at 2–7 d). The persisted projection records its coefficient-derived version; invalid model data
records the typed FSRS-6 ordinary-Practice fallback instead of invented confidence.

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
(mastery and due-today only — no course-position stat, since a single lesson has no
pacing sequence of its own). Study dispatch is course-level rather than duplicated here.
Notes and cards sit below a divider as a visually quieter section (smaller
headings, subtle entrance animation respecting `useMotionSpeed`), which renders in one of two
modes resolved by `src/course/lessonViewMode.ts`:

- **Study** (the default): notes render read-only via `LessonNotesStudyView`
  (`src/components/notes/`, reusing `MarkdownView` for each note's body), and cards show a
  summary — count, due count, mastery % — via `LessonCardsSummary` (`src/components/cards/`)
  rather than an editable table. A lesson without notes shows no notes panel in this mode, so
  its card list takes the width. That list's rows match the Cards page: the front (up to two
  lines), the card's kind, when it next comes up, and an occlusion card's diagram, with each
  occlusion's cards kept together in region order.
- **Author**: the full notes/cards CRUD, extracted into `LessonNotesSection`
  (`src/components/notes/`) and `LessonCardsSection` (`src/components/cards/`) so the page
  component stays a thin layout/data shell. Path authoring chrome — Add lesson, Manual
  practice, the practice-node pencil, and inline course/lesson rename — is also gated on
  `isLessonAuthoringMode` and is absent in View mode. Settings, Cards, Questions, Analytics and
  Quick search are not.

Embed-aware note Markdown recognises bare YouTube watch/short URLs and Vimeo URLs only, then emits
iframes on `https://www.youtube-nocookie.com` and `https://player.vimeo.com`. The sanitiser accepts
no other iframe source. The web CSP lists exactly those two remote `frame-src` origins; the packaged
Electron policy lists the same origins alongside its local `'self'`, `app:` and `file:` sources.
Notes imported through course sharing use this same strictly sanitised path.

Every course carries its own explicit `Course.lessonViewMode` (`src/db/types.ts`) — no more
site-wide default. It is set directly via one compact Study/Author workspace control
(`LessonViewModeToggle`, `src/components/course/`) beside course navigation on the Course Path and
every Lesson view. Course Settings deliberately does not duplicate that decision.
`resolveLessonViewMode(course)`
(`src/course/lessonViewMode.ts`) falls back to `'study'` only for courses that predate the
mandatory field (e.g. an old backup restored later); a one-shot startup migration in `App.tsx`
(`stampMissingLessonViewModes`, `src/db/repository.ts`) stamps any such course with the retired
global default's last value so existing users see no behaviour change. A single
`canEditLessons(course)` gate returns `false` for a locked distributed copy and `true` for a course
authored locally or deliberately detached from its lineage. It is the one place that decides
whether Edit mode is available at all, and every call site goes through it rather than reading
the mode field directly. When CoursePath renders this
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

Before either side is displayed, the flip card measures its front and back at the current
responsive width and uses the larger height for both. Asset resolution and viewport-width changes
update that shared height, so Markdown, maths and media do not make the card shell jump on reveal.
The measurement render is hidden from accessibility and pointer interaction, and it never enables
audio autoplay. Generated sequence cards keep the current cue on the card's vertical centre line;
their sequence label and recall instruction sit above and below that shared cue/answer anchor.

**Card editor**, **Course settings**, **Settings** and **Search** use display titles
without decorative eyebrows and the shared surface-card language. Course settings,
Settings and Search align with the shared page frame; Search keeps a narrower reading
column on that frame’s left edge. The editor and course settings add a sticky bottom
action bar. Help’s footer presents its destination links directly, without a descriptive
caption that repeats them.
Sequence and diagram editors share the course page frame in loaded, loading and not-found states.
Their single 44px Back link names and retains the originating lesson or Cards destination,
without repeating a breadcrumb or the task title above the main heading.
Help and Settings topic links read the final fragment of the hash route, validate it
against their section IDs and follow later fragment changes through the same shared hook.


[Specification index](../SPEC.md)

### Course overview (Fieldnotes)

Multi-lesson courses use a compact winding path and selected lesson companion.
Selecting a lesson updates the companion; Open lesson enters its existing workspace.
Locked lessons explain the release condition and remain closed in View mode;
authors and archived inspection retain their existing access. Practice nodes select
an actionable companion, while checkpoint nodes and the assessment list open the
existing assessment editor or details sheet according to workspace mode.

Edit mode offers one Add control that expands in place into Lesson, Practice and
Checkpoint. Lesson creation and import reuse the existing form; practice and
checkpoint choices open their existing editors. Escape and outside presses collapse
Add, and cancelling an editor returns focus to it. Drag and Alt+Arrow reordering
remain available. The shared course navigation stays mounted across section changes.
All five course sections and their navigation share a 1190px frame with the same
responsive gutters. The overview uses two columns on desktop and stacks on narrow
screens; selecting a lesson there brings its companion into view. Single-lesson
courses continue to render their lesson directly.

The comparison prototypes are archived on `prototype/course-fieldnotes` at
`236b0b6cf8b438463d246d83f4e6e738e73e3348`; they are not shipped.

### Public pages

The homepage `/` serves prerendered landing markup inside the application shell
document so crawlers see the hero, product sections and links without JavaScript.
A first-visit browser hydrates that markup as a standalone landing entry without
initialising or seeding study data; any navigation into an in-app hash route
hands over to the full study app. Returning browsers (seeded storage), in-app
hash routes and the packaged desktop app boot the study app directly. The
homepage carries canonical, social and website structured-data metadata.

`/compare/quizlet/` is a separate public HTML entry with build-time React rendering,
canonical and social metadata, and client hydration. It does not initialise or seed
study data. Its interactive examples use component-local state and the real card
renderer, import parser and memory model. The landing footer links to it.

The public sitemap lists the homepage and comparison URL; robots.txt advertises the
sitemap. Study routes remain hash-based and are not sitemap entries. Direct sharing
and import links preserve their destination through first-run setup. The service
worker excludes public comparison paths from the app-shell navigation fallback.
