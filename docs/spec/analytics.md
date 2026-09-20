# 14. Search & analytics

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
  (courses/lessons/notes), Card results and Question results. Questions search authored names,
  prompts, worked explanations, tags and generated-family metadata and link to the Question editor.
- **Structured filters** (AND-combined, usable without a query, cards only): **due, new,
  leech, flagged, suspended**. These turn search into course-wide card management ("show
  me all leeches").
- The full-page **Search content** surface and the `Ctrl/Cmd+K` **Quick search** overlay share the
  same core. Card and Question results are visibly distinct and link to their respective editors,
  while course/lesson/note results link to their page.
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

Each Card in a course's Card list (lesson view or Cards page) can be expanded in-place
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

The same page has a separate **Questions** section. It does not feed the Card charts or Course
objective. It shows due/unseen/suspended counts; fixed first-presentation versus repeat performance;
generated novel-variant versus repeated-variant performance and repeat rate; marks and full-credit
accuracy; versioned criterion evidence; and explicit shown, abandoned, undone, checker-withheld and
unscored exclusions. A disputed or undetermined Attempt is excluded rather than counted as a
failure. No Question result changes predicted exam-day Card score, stability or Card calibration.

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


[Specification index](../SPEC.md)
