# 7. Forward simulation & core formulae (`src/fsrs/forwardSim.ts`)

This is Lacuna's own pure layer that projects a card to the **exam date** rather than to
its next due date. It touches neither IndexedDB nor React, so every function is
unit-tested.

**Forgetting curve (FSRS-6 power law).** With `decay = -w20` (negative) and `t`, `S` in
days:

```
factor   = 0.9^(1/decay) - 1
R(t, S)  = (1 + factor . t / S)^decay
```

By construction `R = 0.90` exactly when `t = S`, for any decay. With `decay = -0.5` (the
fixed FSRS-4.5 decay), `factor = 19/81`, so the curve reduces exactly to FSRS-4.5. A card
with `S <= 0` has `R = 0`; elapsed time is clamped at 0.

**Predicted exam-day retrievability with no further review** (`rAtExam`):

```
days = max(examDate - lastReviewed, 0) / MS_PER_DAY
R_no = forgettingCurve(days, stability, decay)
```

A never-reviewed card (no stability/lastReviewed) -> `R_no = 0`.

**Predicted exam-day retrievability if reviewed now** (`rAtExamIfReviewedNow`):

```
daysRemaining = max(examDate - now, 0) / MS_PER_DAY
if daysRemaining == 0 -> 1.0                     (a review on exam day leaves R = 1)
S'   = ts-fsrs.next(card, now, expectedGrade).stability
R_yes = forgettingCurve(daysRemaining, S', decay)
```

The assumed `expectedGrade` is **Good** (deterministic, dependency-free).

**Delta-R — the marginal value of reviewing now** (`deltaR`):

```
DR = R_yes - R_no
```

For a new card `R_no = 0`, so `DR = R_yes`. As a card's exam-day R approaches 1, `DR -> 0`.


[Specification index](../SPEC.md)
