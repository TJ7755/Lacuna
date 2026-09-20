# 1. Guiding principles

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
   expose authorised data to a local client process; grants expire with that process.
   No account is required. Optional device sync and browser AI use an encrypted relay.
5. **Touch-first, keyboard-equivalent.** Every interaction is designed for touch from the
   ground up (44px minimum targets, swipe gestures, bottom sheets, active states) and is
   mirrored by keyboard shortcuts so the app is fast on either input mode.
6. **Quiet, tactile craft.** A restrained "quiet laboratory" aesthetic with one warm accent,
   paper grain, and motion used to confirm and delight rather than decorate.


[Specification index](../SPEC.md)
