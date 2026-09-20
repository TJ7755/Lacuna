# 10. Learn mode (`src/pages/LearnMode.tsx`, `src/fsrs/session.ts`, `cooldown.ts`)

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

While a Card or Question presentation is outstanding, explicit Exit, application navigation and
browser back open one modal decision. **Stay** is focused by default and preserves the mounted
answer. Confirmed departure states the unique answered count, retains already committed evidence
and abandons only the current presentation. Reload and window close use the browser's native unload
decision. Loading, lesson notes, empty, failed-start and completed states do not manufacture a
warning when no work can be lost.

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

`src/db/revisionPlanRepository.ts` owns the six persistence operations for creating, refreshing,
editing and completing those plans. UI and session callers import that module directly; the broad
repository is not a compatibility barrel for this interface.

The planner stores daily time budgets rather than a fixed queue. Edits to assessment coverage,
deadline or time zone, reached/exposed/available scope, review evidence or the selected model
produce deterministic, explained replans. An active window retains its captured revision until
completion. Passed assessments archive their plan read-only and ordinary per-card horizon
resolution moves on to the next applicable assessment.

The runtime uses the frozen `half-life-logistic-v3-routed` global fit (coefficients unchanged from
v1; `tooling/short-term-memory/coefficients/half-life-logistic-v3.json`) for exact-second prediction
with a routed smoothstep handover — success/no-outcome/first-review 21,600→86,400 s [6 h→24 h],
failure 345,600→432,000 s [96 h→120 h], FSRS-6 only from 604,800 s [7 days] — the probabilities are
blended (not added) and v1 (`half-life-logistic-v1` / `half-life-logistic-v1-lag64-count8`) was
retreated after failing multi-day transfer; the no-regression gate passes only against the
fractional-day FSRS-6 the runtime uses (floored FSRS-6 is ~0.001–0.003 stronger at 2–7 d). Every
simulated outcome receives
exactly one normal FSRS transition. Successful branches currently use the scheduler's established
deterministic Good convention. Personal terms remain global below 500 scored examples; supported
local intercept and preceding-outcome fits use weight `n / (n + 1000)`. Missing, corrupt or
unsupported coefficients or card features persist the typed ordinary-Practice fallback and hide
readiness. Valid plans may report mean predicted assessment-day readiness with outcome uncertainty;
these are predictions, not promised marks. The retired `?mode=cram` query has no caller or product
behaviour.

### Cooldown (`src/fsrs/cooldown.ts`)

Recurring and ad-hoc **Review due cards** requests use the existing `due` filter, as do
explicit due-filtered sessions. In FSRS mode their session context uses due-review
eligibility: selection rechecks the updated due dates after every answer, including
learning and relearning steps. Once no cards in the captured scope are due, the session
finishes even if predicted exam readiness remains below target. Future-due cards and new
cards without a due date cannot enter that queue. Exam-objective ordering and readiness
reporting remain in use; ordinary curricular Practice and planned assessment revision
retain their existing completion rules.

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
domain. The seed travels through each line verdict and Question Attempt, so a disputed result can be
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

A legacy Card payload with an unrecognised version, or a recognised-but-unsupported `kind`
(`scaffold`), renders `UnknownItemFace`: the readable `front` fallback and a plain notice that this
version cannot study it, with no submit, reveal, self-grading or keyboard grading path. The central
Card `answer()` boundary rejects it as well, so future or stale callers cannot create a review.

The production build measured on 28 July 2026 places the verifier in the main application chunk
(648,459 bytes minified; 187,658 bytes gzip for the whole chunk). A standalone Bun bundle of
`src/items/verify.ts`, including its `mathjs/number` dependency, is 153.75 KB minified and 43,571
bytes gzip. The latter is an upper bound for mathjs rather than a dishonest claim that every byte
belongs to it; it also includes Lacuna's parser, verifier and renderer helpers.

### Numeric Question face

A fixed Question with a v1 `numeric` payload renders its Markdown prompt and the same
maths-expression input used by authoring. Submitting a valid expression runs `checkNumeric` against
the payload's exact, tolerance or one-of specification and awards one mark or zero out of one. The
Question pipeline stores the immutable first submission on its Attempt, shows the mandatory worked
explanation, and permits a separately stored correction. Full marks map to Good; zero maps to Again;
a disputed verdict withholds scheduling. Card typing, Yes/No and manual grading do not apply.

### Working-Question authoring

Working Questions use a line-oriented mark-scheme source in the Question editor. Each nonblank line
starts with a positive mark value and optional label, followed by `::` and either an expression
waypoint or one of the `equals`, `within`, `matches-one-of` and `contains` predicates. The editor
compiles every line independently: valid neighbours retain their plain-English preview and count
towards the running mark total when another line is malformed. The malformed source range is
shown with its compiler message, and mark/predicate autocomplete inserts grammar-valid snippets
without adding another parser or UI dependency. A Question can be saved only when every nonblank line
compiles; the resulting `MarkSchemeLine[]`, not the editor source, is persisted in its v1 `working`
Question payload. Drafts retain the uncompiled source so an interrupted invalid edit is not discarded.
The same editor includes a test-answer harness backed directly by `verifyWorkingLines`. Tutors can
pin a sample answer with its current expected score; those fixtures travel in the Question payload
and rerun automatically on every scheme edit, exposing any score mismatch before the Question is saved.
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

Working-Question authors can copy a “Draft mark scheme” prompt containing the current Question and
the compiler-owned v1 syntax specification. The Questions tab also provides a course-level batch
prompt builder for one lesson/topic at a time: notes, topic and level produce a clipboard-only prompt
for numeric and working Questions. Every proposed Question names exactly one primary target Concept
and may name prerequisite Concepts. The model chooses the number of Questions needed for useful
coverage; any populated tutor maximum enters the prompt. Fixed Questions are durable scheduled
application problems, not disposable worksheet questions. Working Questions must test a reusable
method, relationship or derivation; algebra prompts prefer symbolic general forms such as completing
the square from `ax^2 + bx + c = 0` rather than inventing custom coefficients for another one-off
exercise. Parameterised practice uses only built-in, versioned Question families whose generated
variants share one stable scheduled identity.
The prompt's item-type contract reserves `numeric` for constant scalar answers with no variables or
equals sign. Formula recall, symbolic relationships and other variable-bearing answers must use a
working item with a passing fixture, or be omitted when they cannot be checked meaningfully.
Every path uses the `LACUNA_ITEMS_V1` delimiters and v2 Question schema so the staging review can parse it
without guessing. The prompt also fixes the answer shape: a numeric answer and an `equals` criterion
each take one constant expression, so a multi-variable solution is written as one criterion per
variable rather than as `x=6,y=4`. Lacuna sends no data to a model and stores no API key; the
conversation remains in the tutor's chosen chatbot.

The entry action is labelled **Build batch prompt**. The dialog explains that Lacuna does not call a
model and that the conversation remains in the tutor's chosen external chatbot.
Closing after entering source text, pasting a reply, or staging candidates requires an explicit
**Discard batch** confirmation. The batch dialog's review step parses the versioned delimiter block and validates each
item independently. A block closed by a mirrored `<<<LACUNA_ITEMS_V1>>>` instead of
`<<<END_LACUNA_ITEMS_V1>>>` is accepted, since the block is already open by that point and the
closing delimiter does not contain the opening one as a substring; a correct closing delimiter still
wins when both appear. Numeric answers use the shared numeric-spec validator; working schemes use the
same compiler as the Question editor, and their fixtures run through the study verifier. A malformed item
does not block valid neighbours. Duplicate classification reuses `diffImport` against the selected
lesson and is a warning: bulk “Accept all clean” skips likely duplicates, while the tutor can still
accept one explicitly. Each staged item can be accepted, rejected or edited through the same numeric-
answer and mark-scheme controls used by ordinary Question authoring, then revalidated by the batch
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
staging validation. Focus returns to the batch revision trigger when it remains available; if
successful revisions remove every failure and therefore remove that trigger, focus moves to
**Accept all clean** instead.
Acceptance calls `createBatchFixedQuestion`, which resolves the named Concept graph and delegates to
the ordinary Question repository transaction; staging has no second persistence model. The MCP
`lacuna.create_fixed_question` and `lacuna.update_fixed_question` tools accept the same numeric and
working inputs. Working scheme source is compiled by the shared mark-scheme compiler and fixtures
run before the repository write; numeric answers use the shared numeric-spec validator. Invalid
payloads therefore return the same validation messages as authoring and staging.

In Question practice, a working Question uses a multi-line answer surface. Each nonblank line is
checked against the persisted scheme, with each criterion awarded at most once. The Attempt persists
the marks and per-line verdicts. Any incomplete result maps to Again; full marks map to Good. An
undetermined line or learner-reported checker dispute preserves the raw result but withholds
scheduling. After checking, **Edit answer** returns to the same response so the learner can correct
and deterministically re-check it before submitting. Feedback always shows the worked explanation
before the learner continues, and an optional correction is stored separately from the immutable
first submission. If attempt creation fails, the practice route replaces its loading skeleton with
an inline error containing Retry and Exit actions.

Question analytics aggregate earned/available marks and criterion evidence from Attempts, retaining
the content version, criterion index and label so a later mark-scheme edit cannot merge unlike
criteria. Fixed Questions report first-presentation and repeat performance separately; generated
families report novel and repeated fingerprints separately. Shown, abandoned, undone,
checker-withheld and unscored Attempts are explicit exclusions rather than fabricated failures.

### Study mode (`src/state/studyMode.ts`)

Two modes reach Learn mode (ordinary sessions default to **FSRS**; lessons default to
Simple mode). Course settings expose **Learn first**, enabled by default. Turning it off admits new cards from unlocked lessons directly into FSRS, with daily new-card pacing and no fabricated exposure or review records:

- **FSRS (default):** the full spaced-repetition scheduler with all memory-state tracking,
  review logging, and objective-driven ordering.
- **Anytime Simple Learn:** the Study sheet has a collapsed Simple Learn option for the whole
  course or a chosen lesson; lesson pages preselect their own lesson. Explicit `?mode=simple`
  sessions include all cards in that scope regardless of introduction, due date, lesson lock,
  readiness or daily limits. Suspended and buried cards remain excluded; archived courses
  remain read-only. These optional passes record FSRS reviews but do not write lesson exposures,
  completions or unlocks. Their resumable queues are separate from curricular introductions.
  The collapsed options do not subscribe to lesson data. Optional course passes skip curricular
  practice-node, membership and exposure queries while retaining review scheduling context.
  The scope picker uses native keyboard handling with theme colours where customisable selects
  are supported (including Electron); other browsers retain their platform picker.
- **Simple:** a first-pass study loop with YES/NO controls and the same timing-based grading,
  calibration and hint handling as Practice. Wrong cards are re-queued at the end of the pool; the session
  loops until every card has been marked correct. In a lesson-scoped session, the first
  correct answer upserts that lesson's `LessonCardExposure`. Every answer uses the normal
  review repository to persist review history and update FSRS memory state and due dates;
  repeated attempts use the updated card state. Existing exposures are not converted into
  invented reviews. A live pill UI
  (Wrong / Remaining / Right) updates on every answer. The SessionReport omits the
  grade-distribution chart to keep attention on first-pass progress. A versioned local recovery
  record stores only the scoped Card-id queue, mastered ids, outcomes and small session events. On
  restart it discards ineligible ids and appends newly eligible Cards. Completion or a deliberate
  confirmed exit clears the record; an unexpected refresh or termination leaves it resumable.

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
- After a recorded FSRS answer, the existing Undo notification states the grade Lacuna stored and
  the card's projected exam-day retention in plain language (`Good · 82% recall at exam`), using
  the same forward projection as the progress bar. Where no genuine future exam date applies to
  the card, it falls back to the resulting interval (`Good · again in 4 days`). Settings and Help explain
  response-time grading; that generic explanation is deliberately not repeated inside every card's
  grading controls. Simple-mode answers and rejected or replayed writes do not claim a new interval.
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
  ever feeds `gradeFromResponse`, which manual mode bypasses entirely. Once a lines-mode hint is
  visible in silent grading, the card states this 1.5-second adjustment beside the hint.

### Per-card actions & state

- **Edit**: opens an in-session overlay (`CardEditOverlay`) that pauses/rebases the
  timer; saving updates the live card without leaving the session.
- **Flag** (toggle), **Bury until tomorrow** (`buriedUntil = startOfDay(now) + 1 day`),
  **Suspend** — all drop the card from the live pool (and the denominator) and move
  on.
- **Undo**: single-step reversal of the last answer — restores the card's prior
  memory state, the `UserPerformance`, the cooldown map, the progress value and the
  events list, and deletes the written `SessionHistory` row. Every recorded FSRS answer exposes
  this through a short-lived grade-and-interval notification with an **Undo** action as well as the
  `U` shortcut while the session remains active. An answer that finalises the session exposes no
  stale Undo action: completion has already closed the single-answer reversal boundary while
  committing milestone, revision-window and unlock state. No notification is shown when the write
  was skipped or rejected either.
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
- **Screen-reader progress:** the polite live region announces only **Card X of Y** (or
  **Session complete**) after navigation; it does not repeat the full correct/wrong/unseen tally
  over the card content.

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


[Specification index](../SPEC.md)
