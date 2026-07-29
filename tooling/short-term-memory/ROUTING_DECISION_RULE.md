# Predeclared routing decision rule for the users 201-300 transfer result

Status: declared 2026-07-17, before the `reports/frozen-201-300.json` and
`reports/fsrs6-201-300.json` results were examined. Follows the external reviewer's
instruction that the multi-day route must not be tuned to whichever cohort was examined most
recently: the decision rule is fixed here, first, and the third cohort result is then read
against it.

## Evidence of record

Frozen `half-life-logistic-v2-routed` versus FSRS-6 on users 201-300, log loss and Brier
(both must agree for a "win"), in every lag bucket at and above `24-36h`, overall and split
by previous outcome. Sub-day buckets are not at issue: the sub-day advantage transferred
essentially unchanged to users 101-200 and is treated as settled unless 201-300 contradicts
it outright.

## Outcomes and predeclared responses

1. **201-300 matches 101-200** (FSRS-6 wins both metrics in the majority of >= 24h buckets
   overall and after success). The 1-100 multi-day advantage is judged cohort-specific.
   Response: re-route conservatively in favour of FSRS-6 wherever the transfer cohorts
   disagree with the fitting cohort:
   - success/first-review path: transition moved earlier so the blend is fully FSRS-6 by
     86,400 s (start 21,600 s);
   - failure path: the logistic model is retained only through the last bucket in which it
     wins both metrics on **both** transfer cohorts (101-200 and 201-300), with the
     transition completing by the end of the following bucket; if there is no such bucket at
     or above `24-36h`, the failure path adopts the success-path boundaries.

2. **201-300 matches 1-100** (the routed model wins both metrics in the majority of >= 24h
   buckets overall). Population heterogeneity is the reading. Response: keep v2 routing
   unchanged; report pooled plus cohort-stratified results; no boundary movement.

3. **Mixed or unclear** (neither majority condition holds, or overall and previous-outcome
   splits disagree). The multi-day route is judged weakly identified. Response: same
   conservative construction as outcome 1 — default to FSRS-6 earlier, retaining the
   logistic model after failure only where both transfer cohorts support it.

## Constraints in all outcomes

- Coefficients stay frozen. Only routing boundaries may move, and only as prescribed above.
- Any re-routed variant is evaluated frozen on all three cohorts (1-100, 101-200, 201-300),
  pooled and stratified, and ships only if it shows no log-loss or Brier regression against
  FSRS-6 in any major bucket on the transfer cohorts (the fitting cohort's single recorded
  `24-36h` Brier exception does not extend to transfer cohorts).
- After this decision is applied, the routing policy is frozen. Further cohorts test it
  unchanged; they do not retune it.
