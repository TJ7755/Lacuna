# Scheduling model boundaries

The [FSRS wrapper](../../src/fsrs/fsrs.ts) delegates real long-term memory-state transitions to
`ts-fsrs`. [Parameters](../../src/fsrs/params.ts) own defaults, bounds and model constants.
Keep package/model version claims tied to those sources.

Exam-day projections and named assessment revision are additional layers, not replacements for
the real review transition. The short-term predictor's validity and transfer limits belong to its
[benchmark](../../tooling/short-term-memory/BENCHMARK.md); an invalid or unsupported prediction
uses the explicit ordinary-Practice fallback instead of inventing confidence.

Primed answers still update FSRS but do not establish an independent spaced retest. Preserve the
primed marker and its legacy interpretation when changing review conversion or portability.
See [primedReview](../../src/fsrs/primedReview.ts) and the [study contract](learn-mode.md).

Time semantics must be established from the current wrapper, horizon and training code. The
previous proposal for a configurable global study-day clock was deferred, not delivered.

[Specification index](../SPEC.md)
