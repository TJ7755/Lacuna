# ADR: FSRS and study-day time semantics

- Status: Proposed (implementation deferred)
- Date: 30 July 2026
- Decision owner: Product review required before implementation
- Deferral: the accompanying implementation (global study clock, study-day
  scheduling, bounded backlog sessions) was archived at
  `archive/fsrs-validation` on 10 August 2026. Master uses per-deck workload
  caps and calendar-day limits instead. Revisit this ADR before any further
  study-day scheduling work.
- Scope: study-day rollover, FSRS elapsed days, due timestamps, daily limits,
  burying, analytics and revision windows

## Decision

Lacuna should use one global study clock with:

- a default rollover of 04:00;
- a learner-configured IANA time zone, initially set from the device's current
  zone;
- no automatic zone change when the device travels; and
- exact instants, stored as epoch milliseconds, for reviews, exams and due
  timestamps.

The study clock belongs to the learner, not a deck, course or assessment.
Per-course clocks would make a global session belong to several different
"todays" at once. Assessment time zones continue to own assessment display and
the exact deadline, but not daily study accounting.

The [Anki manual](https://docs.ankiweb.net/preferences.html#scheduler) uses 04:00
by default for the same late-night-study reason. Lacuna should adopt the useful
boundary, not copy Anki's entire scheduler.

## Three distinct measures of time

The current code treats every use of "days" as elapsed milliseconds divided by
86,400,000 or as local midnight. Those are different concepts wearing the same
coat.

### 1. Exact elapsed duration

Use exact elapsed milliseconds for:

- short-term memory features;
- response and session timers;
- exam-deadline comparisons; and
- fractional retrievability projected at an exact exam timestamp.

Lacuna's exam projection should continue to evaluate:

```text
elapsedDays = max(examAt - lastReviewedAt, 0) / 86_400_000
```

That deliberate fractional projection answers "what is recall probability at
this instant?" It therefore need not equal `ts-fsrs.get_retrievability()`,
which floors elapsed time.

### 2. Study-day index

Use an integer study-day difference for FSRS memory transitions, parameter
training and long-term FSRS calibration:

```text
elapsedDays =
  max(studyDayOrdinal(reviewedAt) - studyDayOrdinal(lastReviewedAt), 0)
```

This must always be derived from the two actual review timestamps. It must never
use `scheduledDays`. A card scheduled for five days and reviewed on study day
12 passes 12.

This matches the FSRS data contract: the Rust reference represents review
history with date differences and integer `delta_t` values. The installed
binding's own CSV converter also requires both `nextDayStartsAt` and an IANA
time zone. Lacuna currently bypasses that semantic layer.

### 3. Study-day boundary

Use the boundary instant for:

- interday review due dates;
- learning or relearning steps that cross the current study-day boundary;
- bury-until-next-day;
- new-card and review limits;
- daily goals;
- streaks, "reviewed today" and daily analytics; and
- revision-plan daily windows.

Sub-day learning steps that remain inside the current study day keep their exact
minute delay. If a step crosses the next boundary, convert it to an interday
step and make it eligible at the target study-day boundary. This is the
distinction Anki documents for intraday and interday learning steps in its
[deck options](https://docs.ankiweb.net/deck-options.html#day-boundaries).

## Study-day functions

The implementation should introduce one pure, zone-aware study-clock module.
Callers must not emulate rollover by subtracting four hours or adding
`MS_PER_DAY`.

Conceptually:

```text
studyDayKey(instant, clock) -> YYYY-MM-DD
studyDayOrdinal(instant, clock) -> integer
studyDayBoundary(dayKey, clock) -> epoch milliseconds
addStudyDays(dayKey, count) -> YYYY-MM-DD
nextStudyDayBoundary(instant, clock) -> epoch milliseconds
```

For an interday FSRS result, the wrapper computes the next due instant as:

```text
due =
  studyDayBoundary(
    addStudyDays(studyDayKey(reviewedAt, clock), scheduledDays),
    clock
  )
```

This expression replaces the dependency's current
`review timestamp + scheduledDays × 24 hours` result. Lacuna should still use
`ts-fsrs` for the memory transition and interval; the wrapper owns calendar
placement because that is product policy.

## Time-zone and travel policy

The global study zone is stable until the learner explicitly changes it.
Silently following the device zone would allow a flight or a misconfigured
clock to reset daily limits, repeat a study day or skip one. Exam time zones are
not suitable substitutes: they describe deadlines, not where the learner's
day starts.

Changing the study zone or rollover is prospective and explicit:

- existing exact review timestamps remain unchanged;
- existing due timestamps remain unchanged;
- history and daily counters are re-bucketed under the newly selected study
  clock; and
- subsequent reviews use the new clock.

The settings screen must warn that changing the clock can alter today's counts.
There is no automatic bulk reschedule.

## DST policy

Calendar arithmetic happens on local dates in the configured IANA zone, then
the target wall-clock boundary is resolved to an instant.

- If the configured boundary falls in a spring-forward gap, use the first valid
  instant after the gap.
- If it is repeated during fall-back, use the later occurrence. Choosing the
  earlier occurrence can make the study-day key move backwards when the clock
  repeats the hour. That would be an impressive way to make a daily limit
  negotiable, but not a useful one.
- The default 04:00 boundary is unambiguous in `Europe/London` transition rules.

Explicit `Europe/London` examples:

| Study-day boundary | UTC instant | Time to next boundary |
| --- | --- | ---: |
| 28 March 2026 04:00 GMT | `2026-03-28T04:00:00Z` | 23 hours |
| 29 March 2026 04:00 BST | `2026-03-29T03:00:00Z` | — |
| 24 October 2026 04:00 BST | `2026-10-24T03:00:00Z` | 25 hours |
| 25 October 2026 04:00 GMT | `2026-10-25T04:00:00Z` | — |

The target remains 04:00 local. A fixed 86,400,000-millisecond addition does
not.

## Daily workload semantics

`newCardsPerDay`, `maxReviewsPerDay` and `dailyReviewGoal` must count persisted
review history within the current global study day.

- A new card consumes the new-card budget on its first recorded review.
- Every recorded review, including a re-review, consumes the review limit and
  daily goal.
- Undo removes the corresponding consumption because it removes the persisted
  review event.
- Reopening a session must not reset any daily counter.
- `sessionTimeLimitMinutes` remains an exact-duration, per-session limit and is
  unaffected by rollover.

Undefined or zero limits remain unlimited. Changing defaults is a separate P4
decision.

## Revision windows

Revision windows currently use the assessment time zone to form calendar-day
keys. That is wrong once the study clock exists. A window's daily budget belongs
to the learner's study day; the assessment zone owns only the exact deadline.

A revision plan input snapshot should record the study-clock configuration (or
its stable version) used to allocate its windows. An explicit clock change
should trigger a replan when no window is active, using the existing deferred
replan path while a window is active.

## Migration

The first release using this policy should:

1. create the global study clock with 04:00 and the device's current IANA zone;
2. leave every persisted `due`, `lastReviewed`, exam and review-log timestamp
   untouched;
3. apply boundary-based due placement only after the next review of a card;
4. derive daily counters from existing review logs under the new clock; and
5. expose the chosen zone and rollover before allowing either to change.

No database-wide due-date rewrite is justified. It would silently change every
card without a new memory observation and would make rollback needlessly ugly.

## Current code affected

| Concern | Current location | Current behaviour |
| --- | --- | --- |
| FSRS elapsed days | `src/fsrs/fsrs.ts:50-69` | Floors exact 24-hour duration; `ts-fsrs` recalculates the same value from `last_review`. |
| Next due timestamp | `src/fsrs/fsrs.ts:86-92` and installed `ts-fsrs` | Accepts dependency result: review instant plus interval × 24 hours. |
| Due eligibility | `src/fsrs/eligibility.ts:28-35` | Exact `card.due <= now`; this can remain once due placement is corrected. |
| New-card daily cap | `src/fsrs/eligibility.ts:38-48` | Rolling 24-hour window, not a study day. |
| Review limit and goal | `src/pages/learn/useLearnSession.ts:1144,1485-1521` | Session-local map reset on session load. The “daily” names are false. |
| Bury until tomorrow | `src/pages/learn/useLearnSession.ts:1658-1664` | Local midnight plus 24 hours; wrong around rollover and DST. |
| Parameter training delta | `src/fsrs/optimise.ts:64-70` | Exact duration divided by 24 hours, then silently truncated by the binding. |
| Parameter evaluation | `src/fsrs/optimise.ts:192-220` | Replays `ts-fsrs` with exact timestamps and its 24-hour floor. |
| Generic day grouping | `src/utils/datetime.ts:226-274` | Midnight helper exists and is zone-aware, but has no rollover concept. |
| Revision windows | `src/course/revisionPlan.ts:209-253` | Calendar days in the assessment zone, starting at midnight. |
| Dashboard statistics | `src/fsrs/stats.ts:95-162` | Device-local midnight; some day offsets divide DST-shifted instants by 24 hours. |
| Course “reviewed today” | `src/state/useCourseData.ts:341-357` | Uses the course assessment's time zone. |

The wider `startOfDay()` call-site inventory in analytics, heatmaps,
calibration and course cards must move to the study-clock helper where the
meaning is a study day. Calendar display utilities may continue to use
midnight.

## Required tests before implementation

### Study-clock unit tests

- 03:59 and 04:00 on an ordinary day.
- One-day addition from a review before and after rollover.
- `Europe/London` spring-forward boundaries separated by 23 hours.
- `Europe/London` fall-back boundaries separated by 25 hours.
- A configured boundary inside a missing hour.
- A configured boundary inside a repeated hour, choosing the later instant.
- A non-hour offset zone and a zone whose offset changes at midnight.

### FSRS wrapper tests

- A five-day interval reviewed 12 study days later passes 12.
- Two reviews on opposite calendar dates but the same study day pass zero.
- Two reviews less than 24 hours apart but on adjacent study days pass one.
- Every interday answer's due timestamp equals the target boundary.
- Intraday steps remain exact; crossing steps become interday.
- Exam projection remains fractional and retains the committed P0 divergence.
- Parameter-training deltas and live transition deltas agree for the same
  timestamp history.

### Workflow tests

- New-card and review limits survive session close and reopen.
- A 01:00 session and a 03:59 session share the previous study day's budget.
- The budget resets at 04:00.
- Undo restores budget.
- Bury at 01:00 and 23:00 both unbury at the next study boundary.
- Global sessions count each unit independently without changing the global
  study-day key.
- Revision windows survive midnight and advance at rollover.
- Changing the study clock requests a revision-plan replan.

## Implementation order after approval

1. Add the pure study-clock module and its DST tests.
2. Persist global study-clock settings and expose them in settings.
3. Route FSRS transition, due placement, training and evaluation through the
   same integer day calculation.
4. Replace rolling/session-local daily counters with persisted-history counts.
5. Route burying, analytics and revision windows through the study clock.
6. Run the Rust differential suite, the full repository suite and explicit
   migration tests.

Each step should be a separate commit. Behavioural changes must not be mixed
with mechanical call-site migration.

## Consequences

The policy removes systematic one-day drift, makes “daily” limits genuinely
daily and keeps exam projection at exact-time resolution. It also means some
one-day intervals reviewed shortly before rollover become due only a few hours
later. That is not an arithmetic bug; it is the direct consequence of
day-index scheduling and must be explained in answer-button previews.

The change is broader than replacing one timestamp expression. It touches every
place that currently invents its own version of “today”, which is precisely why
patching only `fsrs.ts` would make the code less coherent.
