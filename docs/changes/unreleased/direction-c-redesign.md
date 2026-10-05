- Redesign, "Direction C" (core loop). The app now uses a stone paper ground,
  white surfaces and navy ink, with Bricolage Grotesque for display type and
  Atkinson Hyperlegible Next for reading, both bundled for offline use (OFL).
  Buttons are pills, and the sidebar sits on a darker `--chrome` ground with a
  white active pill that glides between items. Amber stays the default accent,
  and the landing page keeps its own palette.
  - The dashboard is now "Today":
    - today's card and minute totals;
    - an exam-day forecast chart (`fsrs/courseForecast.ts`), with each course's
      outlook to its exam on a proportional date axis against the target;
    - the streak, this week's reviews and the days studied this week;
    - the courses ordered by urgency, each with Start and an archive menu.
  - The outlook is the exam-day forecast as it would stand on each day if the
    schedule is kept, simulating Good reviews whenever recall falls to the target.
    It never falls, so the chart has no sawtooth.
  - The week figures come from the compact review-activity timestamps, because
    the dashboard must not read full review records.
  - The course card grid, the review heatmap and the seven-day study-signals
    strip are no longer on the dashboard.
  - Study: the card keeps one quiet surface in every mode, with no outline or
    tinted halo. Every fifth correct answer in a row pops a "5 in a row" badge
    with a confetti burst.
  - The session report counts its figures up and bursts for a good session.
  - Course sections stick to the top as a frosted bar with pill tabs.
  - Every animation follows the motion-speed setting and is skipped when motion
    is off.
  - The workspace mode reads View / Edit (formerly Study / Author mode), so it no
    longer shares a word with the Study button beside it.
  - The sharing announcement appears on Today only, and drops its illustration on
    phones, so it no longer pushes each page's work below the first screen.
  - Every page shares one content frame and a stable scrollbar gutter, so titles
    start on the same edge everywhere; the home page is called Today in every
    link and message.
  - Removed on-screen repeats: the Import page's second title and close button,
    the Questions entry in Other ways (the Questions tab already opens it), the
    New question button above an empty list, the course name placeholder, and
    the "Scope is valid" line in assessment details (shown only when a scope
    needs review).
  - Empty states point to the next step: Questions in View mode offers to switch
    to Edit, and the sidebar says "No active courses" when some are archived.
  - Today's minute total never reads 0 while cards are due.
- Redesign, "Direction C": the rest of the app.
  - Settings and Your data:
    - borderless cards that rise in, and sliding pill segmented controls;
    - round accent swatches;
    - springing switches (`Toggle` is now the single pill-switch implementation);
    - a backup hero with a busy state and a tick, and restore points with a
      confirmation modal;
    - another device as one slim row that opens pairing in a modal.
    - Back up now no longer reports a save that the five-minute throttle
      skipped.
  - Lesson and card editor:
    - the lesson opens on its title, one meta line and a sliding View/Edit pill,
      with the note as a reading card beside its cards;
    - the editor pairs the form with a live flip preview and pops a tick on save;
    - `MarkdownEditor` gains `hidePreview`, so the editor shows one preview, not
      two.
  - Cards and course settings:
    - Cards: counted filter chips and a floating bulk-action bar.
    - Course settings: one readable column with a big target-recall figure and
      presets, beside the shared section rail (a jump menu on narrow screens).
  - Questions:
    - The Individual questions bank, now behind the question set library, is a
      card grid with the last five results, the record, and marks with typical
      time.
    - Practice has segmented progress, highlighted generated values, New numbers
      for generated families, and a result that pops or shakes.
  - Analytics:
    - a period switch and counting headline figures;
    - the review heatmap with a diagonal fade-in;
    - calm restyled charts that draw in when scrolled into view;
    - the course page opens with its own exam-day forecast.
    - `StudySignals` was removed.
  - The assistant is a draggable floating window that folds to its header or
    closes to a pill, so it no longer resizes the page.
  - The maths answer field is restyled.
  - Import and sharing:
    - Import has a stepper whose connector fills, and a review count that counts
      up.
    - Sharing has a Copy button that confirms with a tick.
  - Phone:
    - Today fits narrow screens.
    - Study has a round Exit, "n of N" over a springing progress bar, a round
      Undo and thumb-zone No/Yes buttons.
- Redesign, "Direction C": fidelity pass against the boards.
  - Sidebar:
    - reads Today, Search (with its shortcut) and Progress;
    - gives each course a ring glyph (days to the exam, forecast fill, today's
      load as dots, infinity without a date);
    - lists Archived after the courses, and moves Share, Settings and Help to
      its foot;
    - shrinks its rows to fit the window, tightening further on short windows
      with a fine pointer, so it never scrolls.
  - The keep-to-schedule forecast is computed once in the shared course data
    and cached per course (`state/dashboardForecasts.ts`). Today, the sidebar,
    the course header and the course bar therefore agree, and a review only
    recomputes its own course.
  - Course page:
    - opens on the course name, one line of facts, Study with today's count,
      and an animated Other ways menu;
    - shows a numbered lesson list with states and progress bars beside
      assessment date tiles;
    - Practice Qs stops sit in the lesson list as rows that open the set
      directly, with an Edit button in Author mode, replacing the side detail
      panel;
    - the course bar shows the course's status dot and name;
    - the Analytics tab is gone, because it duplicated Progress; course
      analytics opens from the forecast figure.
  - Study header: Exit pill first, the course with "n of N" over the bar, Undo
    at every width, and a round card-actions trigger.
  - Settings lays out with the title above and the section rail on the left;
    the shared rail uses the white pill.
  - The shared `Menu` fills its trigger, turns its chevron and staggers its
    items, and its items can carry a second line.
  - Card rows lead with the front, with a quiet meta line beneath.
