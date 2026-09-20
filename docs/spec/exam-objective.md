# 8. The exam objective — the core invariant (`src/fsrs/objective.ts`)

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
  `max(DR) < EXPECTED_MARKS_EPSILON (5e-3)`.

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
3. **Course default** — the course's own `examDate`, when its final assessment is dated.

`cardSchedulingHorizon` then applies the same "keep revising" fallback
`schedulingHorizon` has always had: once the resolved date is in the past, the horizon
rolls forward to `now + MAINTENANCE_HORIZON_DAYS` (7 days) rather than letting
`daysRemaining` clamp to 0 (which would read every card as R = 1 and pin the bar to a
bogus 100%). A Course whose final assessment has `schedulingMode: 'steady'` stores no exam date
and uses that rolling horizon from the start. Checkpoint and lesson dates still override it for
the cards they cover. Exam countdowns, urgency, cram mode and revision plans remain date-only;
Course headers and cards label the undated state as **Steady retention**.

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

### 8.2 Dated and steady-retention states

A Course's one final `CourseAssessment` is also its scheduling-target record. Existing dated rows
infer exam mode; new rows may explicitly store `schedulingMode: 'steady'` and omit both `examDate`
and `timeZone`. This additive representation requires no IndexedDB schema migration and survives
Course hydration, derived scheduling-unit synchronisation, full backup/restore and share import.

A course whose final assessment date has passed follows the device-local **After the final exam**
policy. **Ask me** is the default and never changes data silently: it offers **Archive course**,
**Set a new exam date**, and **Keep revising**. Choosing Keep revising records the exact handled
final-exam timestamp, so the decision does not reappear for that date; explicitly unarchiving a
passed course records the same override so automatic policy cannot immediately archive it again.
Replacing the final with a later date re-arms the lifecycle when the replacement passes. **Archive
automatically** sets the existing `archived` flag after an unhandled final timestamp passes.
**Keep revising** retains the rolling maintenance horizon. Checkpoints never trigger any of these
lifecycle actions.

Archiving withdraws the course from active study, the dashboard grid and totals, the normal sidebar
course list, Review today and future workload forecasts while retaining every lesson, card and
review. Historical activity still contributes to the review heatmap, reviewed-today count and
streak. The dashboard course-card context menu remains the manual archive entry point, with a
reversible Undo toast; `/archived` owns restoration. Course Settings remains the place to edit the
final assessment date.


[Specification index](../SPEC.md)
