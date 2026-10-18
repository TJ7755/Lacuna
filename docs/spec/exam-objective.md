# Exam objectives and horizons

[objective](../../src/fsrs/objective.ts) and [progress](../../src/fsrs/progress.ts) must agree about
the active objective. Session work completion remains separate from predicted readiness.
Expected marks is a model-derived recall proxy; Secure topics uses a chosen threshold, not a
validated guarantee of examination performance. See [scientific limits](../scientific-assessment.md).

## Per-Card scheduling horizon

[examDate](../../src/fsrs/examDate.ts) owns resolution: the primary Lesson's explicit override,
then the nearest applicable future assessment, then the Course default. A Lesson link affects
reachability without changing that primary-Lesson resolution. Assessment exclusions and scope
must be applied consistently across selection and progress calculations.

[horizon](../../src/fsrs/horizon.ts) supplies a rolling maintenance horizon after a deadline or
for steady retention. A past date must not turn every forecast into perfect recall. Unit-level
urgency and practice insertion are intentionally coarser than per-Card scoring.

Checkpoints do not trigger the final-exam lifecycle. The default Ask me policy does not archive
silently. Keep revising and explicit unarchive acknowledge the exact handled final timestamp;
a later final date can re-arm the decision. Archiving retains study material and historical
activity while withdrawing it from active study and future workload.

## Parameter optimisation

[optimise](../../src/fsrs/optimise.ts) owns fitting and validation. Candidate parameters must be
bounded and compared on held-out chronological evidence, not just training fit. Applying them
requires explicit confirmation and a pre-change restore point. Training belongs off the UI thread.
An improved next-review fit is not evidence that long-range marks predictions are calibrated.

[Specification index](../SPEC.md)
