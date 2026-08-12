# Lacuna — Scientific assessment

**Status:** Informational assessment, not an implementation specification

**Reviewed:** 11 August 2026

This document records the current scientific judgement about what Lacuna is trying to
optimise, which parts are well supported, which are plausible but unvalidated, and where
previous literature summaries overstated the evidence. It should be read alongside
[`SPEC.md`](SPEC.md), which defines the behaviour the application currently implements.

The purpose is not to claim that Lacuna has established a new learning algorithm. Its more
defensible contribution is the integration of exam-date-aware scheduling, structured
assessment items, response-time-informed grading, and local-first revision workflows into a
single product.

## 1. Short conclusion

Lacuna is targeting a legitimate problem: a learner preparing for a known assessment has a
different objective from a lifelong learner seeking indefinite retention. Research on spacing
shows that the useful interval depends on the delay until testing, so incorporating an
assessment date is scientifically defensible.

The strongest claims should nevertheless be limited:

- Lacuna is **scientifically informed**, not scientifically validated as a complete system.
- Its product integration is more distinctive than its underlying memory model. FSRS-6,
  retrieval practice, image occlusion, and local-first storage each have substantial precedent.
- The main exam scheduler is a **greedy model-based heuristic**, not a proven globally optimal
  exam scheduler.
- The current objective is predicted card retrievability, not measured exam marks. The name
  **Expected marks** is therefore a product-level interpretation, not a validated claim that
  the score equals expected marks on a real paper.
- The appropriate next step is empirical calibration against future recall and exam-relevant
  outcomes, not an immediate wholesale replacement of FSRS with a research prototype.

## 2. What Lacuna currently does

### 2.1 Ordinary exam-objective scheduling

The main exam objective is implemented in:

- `src/fsrs/forwardSim.ts`
- `src/fsrs/objective.ts`
- `src/fsrs/progress.ts`

For an ordinary scheduled session, Lacuna:

1. uses the official `ts-fsrs` implementation for memory-state updates;
2. projects current stability to an applicable exam date using the FSRS-6 power-law curve;
3. estimates the post-review stability for an assumed **Good** review;
4. computes the marginal exam-day improvement, Delta-R; and
5. greedily serves the highest-scoring available card.

The two objectives are:

- **Expected marks:** mean predicted exam-day retrievability, with cards ordered by Delta-R;
- **Secure topics:** the fraction of cards at or above `0.90` predicted retrievability, with
  cards that can cross the threshold ranked ahead of cards that cannot.

The `0.90` value is a chosen mastery threshold and is not, by itself, evidence that a learner
has a 90% chance of earning the corresponding exam marks.

### 2.2 Assessment revision planning

Named assessment revision plans are a separate layer. They use:

- `src/course/revisionPlan.ts`
- `src/fsrs/cramAllocator.ts`
- `src/fsrs/halfLifeLogisticModel.ts`
- `tooling/short-term-memory/BENCHMARK.md`

When the frozen short-term model and its inputs validate, the allocator simulates possible
success and failure outcomes, estimates expected gain per unit time, and accounts for future
revision windows. If the model cannot run safely, it records an explicit FSRS ordinary-Practice
fallback rather than inventing confidence.

This distinction matters: it is inaccurate to describe every part of Lacuna's assessment
planning as only the basic FSRS forward-simulation heuristic.

### 2.3 Response-time-informed grading

The invisible grader is implemented in `src/fsrs/grading.ts`.

- Incorrect answers map to Again.
- During the first 20 correct reviews, fixed response-time thresholds are used:
  - under 3 seconds: Easy;
  - 3–8 seconds: Good;
  - over 8 seconds: Hard.
- Thereafter, thresholds use the running mean and standard deviation of correct response
  times, with a `0.75` standard-deviation boundary.

This is not percentile calibration. Response time is a useful but noisy signal: card
complexity, reading time, typing, distraction, interface latency, and fatigue can all affect
it. The implementation also intentionally updates the timing profile from correct reviews,
which should remain an explicit limitation when interpreting the calibration. The current
storage shape remains transitional: the performance row and grader are still keyed through the
backing deck identity in parts of the repository, even though the product boundary is moving
towards course-scoped calibration. This should not be presented as a settled per-course
scientific result.

### 2.4 FSRS parameter optimisation

User-specific FSRS fitting is implemented separately in `src/fsrs/optimise.ts`. It uses the
official binding trainer, chronological train/validation splitting, a held-out log-loss
comparison, and a 1,000-review gate before optimisation is worthwhile. This is good defensive
practice, but it validates next-review prediction on the available review history; it does not
by itself validate long-range exam-day projections or prove that predicted retrievability maps
to marks on a real examination.

## 3. Evidence strength

### Strong support for the general learning mechanisms

The following are among the better-supported foundations of the product:

- retrieval practice is generally more effective for durable learning than restudy;
- distributed practice is generally better than massed cramming for later retention;
- the useful spacing interval depends on the delay until the final test;
- learners' immediate judgements about their own future retention are noisy; and
- response time can contain information about retrieval strength, although it is not a pure
  measure of memory.

These findings support using retrieval practice, spacing, an exam date, and some automation of
review decisions. They do not select one particular production algorithm for Lacuna.

### Plausible but not yet established for Lacuna

The following are reasonable hypotheses, not settled findings about this product:

- maximising predicted exam-day retrievability improves actual exam performance;
- greedy Delta-R is close enough to a globally planned schedule for realistic card pools;
- a 0.90 retrievability threshold is the right definition of a secure topic;
- response-time inference is better for this population than explicit four-button grading;
- a single course/deck timing distribution is adequate across card types; and
- the benchmark-selected short-term model will generalise to Lacuna users and structured
  assessment items.

### Important modelling assumptions

The current objective layer treats cards as effectively independent and equally weighted.
That is a useful first approximation, but real examinations have:

- unequal topic and mark weighting;
- dependencies between concepts;
- partial-credit relationships between steps; and
- differences between card recall and performance on an unseen exam question.

The product's structured working items improve the relationship between practice and marks for
some material, but the general scheduler does not yet weight all cards by their actual exam
contribution.

## 4. Correct framing of the literature

### Cepeda and the spacing–retention relationship

Cepeda et al. (2008), *Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention*,
showed empirically that the useful inter-study interval depends on the retention interval.
This supports the direction of Lacuna's design: knowing the test date can reasonably change
how practice should be distributed.

The study was not a complete multi-item SRS algorithm. It should be used to support the
principle that the test delay matters, not as a direct formula for Lacuna's card-selection
problem.

### Lindsey, Shroyer, Pashler and Mozer (2014)

Lindsey et al. (2014), *Improving Students' Long-Term Knowledge Retention Through Personalized
Review*, is relevant to personalised adaptive review and memory-strength estimation. It should
not be described without qualification as a fixed-exam-date scheduler or as a direct
prescription to replace Lacuna's objective with a particular multi-timescale weakest-first
algorithm. Related work on personalised review, memory models, and terminal-test scheduling
must be distinguished rather than collapsed into one result.

### Tabibian et al. (2019)

Tabibian et al. (2019), *Enhancing Human Learning via Spaced Repetition Optimization*, PNAS,
116(10), 3988–3993, DOI [`10.1073/pnas.1815156116`](https://doi.org/10.1073/pnas.1815156116),
formulates spaced-repetition scheduling as an optimisation problem under a particular
stochastic memory model.

It is not safe to reduce the paper to the claim that it proves a universal rule of
“contracting spacing”, nor to claim that its solution is the globally optimal policy for
Lacuna's richer problem. Its conclusions depend on the model, objective, observations, and
review-budget assumptions. It is useful as evidence that planning and optimisation can be
studied formally, not as an off-the-shelf replacement algorithm for this application.

### Mettler, Massey and Kellman / ARTS

Mettler, Massey and Kellman's ARTS work is directly relevant to response-time-informed adaptive
spacing. Their 2016 paper, *A Comparison of Adaptive and Fixed Schedules of Practice*, found
advantages for adaptive schedules that use ongoing item- and learner-level performance,
including response time, over the fixed schedules tested in that study.

That supports treating response time as a potentially useful signal. It does not establish
that ARTS's exact priority formulation is superior to Lacuna's current timing-to-grade
heuristic in this population, with these card types and this exam objective.

## 5. What should be measured next

**Status, 12 August 2026:** this section describes the right next scientific step, but it is
deferred and not active work. There is currently no real review corpus to measure against, so a
harness would measure nothing. Deferring is free: `ReviewLog.retrievabilityAtReview` is already an
honest ex-ante prediction and is preserved in full backups, so reviews recorded now remain analysable
whenever a corpus exists. Two methodological questions below are also unsettled — see the deferral
note in [`next_plan.md`](next_plan.md).

The next scientific step should be a shadow-mode or offline comparison using real, consented
review data. It should measure both predictive quality and learner outcomes.

### Forecast calibration

Compare predicted and observed recall at several horizons, such as:

- approximately one day;
- one week;
- two weeks; and
- the assessment date where enough observations exist.

Report calibration error, log loss, Brier score, sample size, and uncertainty intervals. A
single point estimate such as “72% expected marks” should not be treated as established unless
its calibration has been demonstrated.

### Scheduler comparisons

Compare, without immediately changing the user-facing scheduler:

1. ordinary FSRS due scheduling;
2. greedy Delta-R;
3. weakest-first exam-day ranking;
4. the current assessment allocator; and
5. a simple rolling-horizon planner where review budget permits.

The comparison should control for review time and available study opportunities. A scheduler
that produces higher predicted recall by consuming substantially more time is not an even
comparison.

### Outcome measures

Track:

- delayed recall accuracy;
- marks earned on authored working/numeric items;
- performance on unseen or transfer questions where available;
- study time and review count;
- calibration error;
- subjective burden and grading friction; and
- post-assessment retention for learners who continue studying.

### Response-time analysis

Before changing the grader, analyse timing by card type and task complexity. A hierarchical
model or carefully regularised per-item/per-type baseline may be more informative than one
course-wide or deck-wide timing distribution. Any change should be evaluated against accuracy,
calibration, and user burden rather than response time alone.

## 6. Product language recommendations

Until outcome validation exists, prefer:

- “predicted exam-day retrievability” over “predicted marks” when describing the model output;
- “secure topics” as a chosen threshold objective, not as a guarantee of topic mastery;
- “response-time-informed grading” over “objective grading”; and
- “research-informed heuristic” over “optimal scheduling”.

The product can still use concise labels such as **Expected marks** where the user benefit is
clear, but explanatory copy should make clear that the number is a model-derived proxy.

## 7. Bottom line

Lacuna is targeting the right general problem and has a credible scientific foundation. Its
most defensible novelty is the product-level combination of deadline-aware revision, structured
mark-scheme items, and local-first workflows—not a claim to have invented a new memory law or
proved an optimal scheduler.

The current implementation is a reasonable first approximation. The highest-value work is to
measure how well its predictions calibrate to actual recall and marks, especially under tight
deadlines and heterogeneous card types. Research schedulers such as MACRO-related personalised
review work, formal optimisation models, and ARTS should be treated as comparison points and
sources of hypotheses until Lacuna-specific evidence shows that adopting one would improve real
outcomes.

## References

- Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). *Spacing Effects in
  Learning: A Temporal Ridgeline of Optimal Retention*. Psychological Science, 19(11),
  1095–1102. [`doi:10.1111/j.1467-9280.2008.02209.x`](https://doi.org/10.1111/j.1467-9280.2008.02209.x)
- Lindsey, R. V., Shroyer, J. D., Pashler, H., & Mozer, M. C. (2014). *Improving Students'
  Long-Term Knowledge Retention Through Personalized Review*. Psychological Science, 25(3),
  639–647. [`doi:10.1177/0956797613504302`](https://doi.org/10.1177/0956797613504302)
- Mettler, E., Massey, C. M., & Kellman, P. J. (2016). *A Comparison of Adaptive and Fixed
  Schedules of Practice*. Journal of Experimental Psychology: General, 145(7), 897–917.
  [`doi:10.1037/xge0000170`](https://doi.org/10.1037/xge0000170)
- Tabibian, B., Upadhyay, U., De, A., Zarezade, A., Schölkopf, B., & Gomez-Rodriguez, M. (2019).
  *Enhancing Human Learning via Spaced Repetition Optimization*. Proceedings of the National
  Academy of Sciences, 116(10), 3988–3993.
  [`doi:10.1073/pnas.1815156116`](https://doi.org/10.1073/pnas.1815156116)
- Roediger, H. L., & Karpicke, J. D. (2006). *Test-Enhanced Learning: Taking Memory Tests
  Improves Long-Term Retention*. Psychological Science, 17(3), 249–255.
  [`doi:10.1111/j.1467-9280.2006.01693.x`](https://doi.org/10.1111/j.1467-9280.2006.01693.x)
- Rowland, C. A. (2014). *The Effect of Testing Versus Restudy on Retention: A Meta-Analytic
  Review of the Testing Effect*. Psychological Bulletin, 140(6), 1432–1463.
  [`doi:10.1037/a0037559`](https://doi.org/10.1037/a0037559)
