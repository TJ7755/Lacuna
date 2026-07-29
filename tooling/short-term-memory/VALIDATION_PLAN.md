# Short-term memory model — post-review validation plan

Status: phases 1–4 complete. Follows the external peer review of `half-life-logistic-v1-lag64-count8`
(July 2026). The review was checked against the code before this plan was written; its factual
claims hold, with the corrections noted in the appendix. Phases 3–4's results, the predeclared
routing decision and the v3 shipping decision are recorded in `BENCHMARK.md`.

## Motivating conclusion

The benchmark demonstrates that the logistic model is a substantially better *sub-day* predictor
than the current FSRS-6 runtime, whose whole-day flooring makes it useless inside 24 hours. It
does **not** demonstrate that the logistic model should have exclusive control through six days.
In the 1–7-day bucket, FSRS-6 beats the selected model on log loss (0.454 vs 0.466) and Brier
(0.143 vs 0.149), and wins all three metrics on first predictive reviews in that range. The
pre-declared selection gate only checked ECE regressions in major buckets, so this regression
passed the gate. The handover boundary (`TRANSITION_START_SECONDS = 518_400`) is therefore
unsupported by the evidence.

The lag × previous-outcome intersections also show the crossover is not a single boundary: at
1–7 days *after a failure* the logistic model still wins (0.601 vs 0.672 log loss), while after
a success FSRS-6 wins. Routing should consider recent outcome, not lag alone.

Ordering below is strict priority. Phases 1–4 are load-bearing; phase 5 is polish. Do not begin
a later phase before the earlier phases' decisions are recorded.

---

## Phase 1 — Locate the crossover (finer lag buckets)

**Goal.** Establish, out of sample, where FSRS-6 becomes competitive with the logistic model,
overall and conditioned on previous outcome.

**Work.**

1. Extend `LAG_BUCKETS` in `stm_harness/metrics.py`, replacing the single `1-7d` bucket with:
   `24-36h`, `36-48h`, `2-3d`, `3-4d`, `4-5d`, `5-6d`, `6-7d`. Keep the sub-day buckets
   unchanged so existing report comparisons remain valid.
2. Update `test_metrics.py` and any bucket-name assumptions in `selection.py` and its tests.
   The "major bucket" definition (≥ 5% of scored hold-out events) is share-based and needs no
   change, but re-derive which buckets are major after the split.
3. Re-run the three evaluations (recorded timings were 95–150 s each; this is cheap):
   `fsrs6`, `half_life`, `actr` against the existing `data/examples`.
4. Record, per new bucket, the log loss / Brier / ECE for each candidate, split by
   `lag × previous_outcome`. Identify the earliest bucket in which FSRS-6 wins log loss and
   Brier (a) overall, (b) after success, (c) after failure.

**Exit criterion.** A written table naming the empirical crossover point(s), committed to
`BENCHMARK.md`.

## Phase 2 — Re-route the handover

**Goal.** Place the logistic-to-FSRS handover at the measured crossover instead of day six,
and decide whether routing should condition on previous outcome.

**Work.**

1. Using phase 1 results, choose either:
   - a single earlier boundary (simplest; acceptable if the success/failure crossovers are
     close); or
   - outcome-conditional boundaries (e.g. earlier handover after success, later after failure),
     if the phase 1 gap justifies the added contract complexity.
2. Evaluate the re-routed predictor as a **new harness candidate** on the same hold-out before
   touching the runtime. The routed blend is what ships, so the routed blend is what gets
   benchmarked. Apply the original gate plus one addition: no log-loss or Brier regression
   against FSRS-6 in any major bucket, closing the loophole the six-day boundary slipped
   through.
3. On acceptance, update in lockstep:
   - `TRANSITION_START_SECONDS` in `stm_harness/candidates/common.py`;
   - `SHORT_TERM_ONLY_SECONDS` in `src/fsrs/halfLifeLogisticModel.ts`;
   - `probability_composition.short_term_only_through_seconds` (and any new routing fields)
     in `coefficients/half-life-logistic-v1.json`. The TS loader validates these fields and
     will refuse a mismatched artefact, so a partial update fails closed.
   - Version the artefact (`-v2`) rather than mutating `-v1` in place.
4. Fix the two train/serve discrepancies found during review while the files are open:
   - document (or eliminate) the bin-centre-versus-exact-lag fitting mismatch in
     `half_life.py`;
   - the runtime FSRS component uses fractional days while the benchmarked baseline floors;
     either add a fractional-day FSRS candidate to the harness so the shipped blend is the
     benchmarked blend, or note the deviation explicitly in `BENCHMARK.md`.

**Exit criterion.** Re-routed candidate passes the strengthened gate; runtime constants,
coefficient artefact and documentation agree; `BENCHMARK.md` updated.

## Phase 3 — Cohort transfer test

**Goal.** Test whether the frozen coefficients transfer to users whose data never touched the
fit. This is the difference between "works for users 1–100" and "works".

**Work.**

1. Add a frozen-coefficient candidate to the harness: loads
   `coefficients/half-life-logistic-v1.json` (or `-v2`), implements `fit`/`fit_batches` as a
   no-op returning the frozen coefficients. No refitting.
2. Acquire users 101–200 (`stm-harness acquire data/source-101-200 --users 101-200`), build
   examples with identical settings, evaluate the frozen candidate and the FSRS-6 baseline.
3. Repeat on at least two further disjoint cohorts (201–300, 301–400) if the first transfer
   result is ambiguous; one clean confirmation may suffice if margins match the original.
4. Compare against the users 1–100 hold-out results. Expected drift, per the review: intercept,
   the prior-failure coefficient, and post-outcome calibration. A material transfer failure
   sends the project back to phase 2 with refitting on a larger training cohort.

**Exit criterion.** Frozen-coefficient results on ≥ 1 unseen cohort recorded in
`BENCHMARK.md`, with an explicit transfer verdict.

## Phase 4 — User-level reporting

**Goal.** Stop letting a handful of heavy reviewers carry an event-weighted aggregate.

**Work.**

1. Extend `evaluate.py` to accumulate per-user metrics alongside the existing slices (the
   per-partition loop already isolates users, so this is an accumulator keyed by user).
2. Report, per candidate pair: per-user log loss, median per-user improvement, proportion of
   users for whom each model wins, and an equal-user-weight aggregate.
3. Add user-cluster bootstrap confidence intervals (resample users, not events; events within
   a user are correlated and row-level intervals would be misleadingly tight).
4. Update `selection.py` output and `BENCHMARK.md` to include these alongside event-weighted
   figures.

**Exit criterion.** Reports state both weightings and the per-user win rate; conclusions in
`BENCHMARK.md` cite the user-level numbers.

## Phase 5 — Robustness and product validation (after 1–4)

Lower priority; none blocks the re-routed model shipping behind Cram, but all block claiming
the planner itself is validated.

1. **Ablations.** Fit and evaluate nested feature sets (elapsed only; + previous outcome;
   + counts; + FSRS state; − failure count) to establish whether performance is broad-based or
   dominated by the failure-count feature.
2. **Failure-history monitoring.** Track calibration and ranking on high-prior-failure cards,
   the review's predicted production failure mode (historically hard cards treated as
   permanently risky). Add equal-count calibration bins and reliability summaries to the
   report, not just ten-bin equal-width ECE.
3. **State-4 sensitivity.** Compare current event-level exclusion against whole-card exclusion.
   If rankings and coefficients are stable, close the issue as minor.
4. **New-card and sparse-history slices.** Evaluate performance split by prior review depth.
5. **Prediction versus intervention.** The benchmark validates next-review recall prediction,
   not review value. Before the planner's utility claims are treated as proven: make the
   planner's review-gain assumption explicit (what a success or failure does to future recall),
   run the model in shadow mode against the existing scheduler, and only then consider
   randomised scheduling comparisons. Predicted weakness must not be silently equated with
   highest review value.

---

## Out of scope

- Further ACT-R work. It lost on this data and the dataset lacks the signals a richer trace
  model needs.
- Full per-user coefficient fitting. The frozen contract's intercept-and-offset personalisation
  (≥ 500 local examples, 1,000-example shrinkage) stands; revisit only with Lacuna-native data.
- Fitting on all 10,000 users. Transfer testing (phase 3) comes first; a bigger fit without a
  transfer result would just launder the same uncertainty through more data.

## Appendix — corrections to the review

Recorded so future readers do not chase ghosts:

1. The review asks for the "combined routed predictor" to be evaluated. It already was: the
   harness `HalfLifeLogisticPredictor` blends with the FSRS-6 baseline internally, so the
   benchmarked candidate is the routed predictor across the scored 0–7-day window. The valid
   residual point is bucket resolution (phase 1), not evaluation methodology.
2. The review missed the bin-centre-versus-exact-lag train/serve mismatch and the
   fractional-day FSRS component in the runtime blend. Both are addressed in phase 2, item 4.
