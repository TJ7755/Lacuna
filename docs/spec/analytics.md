# Search, forecasts and evidence

[search](../../src/db/search.ts) owns matching and result selection; [stats](../../src/fsrs/stats.ts)
and [analytics components](../../src/components/analytics/) own calculations and presentation.

Search is a read operation. Tagging, difficulty filters and contextual navigation must not change
scheduling as a side effect. Preserve explicit scope and distinguish linked membership from ownership.

Session work done, predicted recall, historical activity and examination marks are different
quantities. The [forecast](../../src/fsrs/courseForecast.ts) assumes no further reviews; objective
readiness uses the [active objective](exam-objective.md). Annotations and chart snapshots are not
scheduler inputs.

Historical charts use evidence available at that time. Daily trajectory projections retain the
last sample for a day without discarding the underlying rows. Missing/sparse data is not a zero
measurement. Global averages must explain changing contributors rather than implying the same
population was observed every day.

Question analytics derive from eligible Attempt evidence and remain separate from Card FSRS data.
Disputed or undetermined results are exclusions, not automatic failures or successes. Retain raw
observations and immutable first submissions when aggregating corrections.

Graphs need an understandable text/table equivalent, non-colour identification and useful empty
states. Tooltips must work on touch and keyboard without changing selection unexpectedly.

[Specification index](../SPEC.md)
