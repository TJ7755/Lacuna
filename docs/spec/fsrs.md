# 6. FSRS-6 engine wrapper (`src/fsrs/fsrs.ts`)

A thin, pure translation layer over `ts-fsrs`. **No memory maths is implemented by hand.**

- `makeEngine(params)` builds an FSRS-6 scheduler: `fsrs({ w, request_retention,
enable_short_term: true })`.
- `decayOf(params) = -params.w[20]` — the (always negative) forgetting-curve decay exponent.
- `toTsCard(card, now)` / `fromTsCard(ts, now)` map between Lacuna's persisted card shape
  and ts-fsrs's; a never-reviewed card becomes a fresh `createEmptyCard` so ts-fsrs applies
  the correct initial-stability/difficulty path.
- `applyReview(engine, card, grade, now)` returns the new memory state plus the
  retrievability at the instant of review (`get_retrievability`, `null` on a first review),
  via `engine.next`.

Constants (`src/fsrs/params.ts`): `FSRS_VERSION = 6`; default weights and request retention
from ts-fsrs; target retention is user-clampable to **[0.80, 0.97]** (default = ts-fsrs
default); difficulty bounds `[1, 10]`; `MASTERY_R = 0.90`; `MS_PER_DAY = 86_400_000`.

**On the algorithm version (honesty note).** Lacuna uses FSRS-6 because that is what
`ts-fsrs` exposes — not because it is the newest FSRS in existence (FSRS-7 exists). Copy
and comments are pinned to "the version ts-fsrs ships", not to "the newest". Also, FSRS
has **no short-term memory model** of its own. Lacuna composes the benchmark-selected
`half-life-logistic-v3-routed` predictor (routed handover: success/no-outcome/first-review
21,600→86,400 s [6 h→24 h], failure 345,600→432,000 s [96 h→120 h], FSRS-6 only from 604,800 s
[7 days]; frozen coefficients unchanged from v1, which failed multi-day transfer and was
conservatively retreated — no-regression gate passes only against the fractional-day FSRS-6 the
runtime uses) with FSRS-6 for assessment revision (§10); FSRS still owns every
real long-term state transition. Invalid model data falls back explicitly to ordinary Practice and
the UI makes no short-horizon confidence claim in fallback.


[Specification index](../SPEC.md)
