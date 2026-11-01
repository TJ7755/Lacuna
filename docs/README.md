# Working in Lacuna

Read [CONTRIBUTING](../CONTRIBUTING.md) for validation and independent review requirements.
Inspect source, callers and tests before changing behaviour.

Scheduling contracts: [Technique practice scheduling](technique-scheduling.md).

Operational procedures:

- [Desktop and AI setup](desktop.md)
- [Workspace deployment migration](maintenance/workspaces.md) and
  [return to Vercel checklist](maintenance/vercel-return.md)
- [Release](maintenance/release.md), [repository controls](maintenance/governance.md),
  [TLS maintenance](maintenance/tls-trust.md) and [security reporting](../SECURITY.md)
- [Library publication](library.md)
- [Gaps trial operations](gaps-trial-operations.md)
- [Feedback setup](feedback.md) and [landing media](landing-media.md)
- [Performance measurement](PERFORMANCE.md) and [upgrade procedure](storage-v22-compatibility.md)

Graded recall: Practice full marks receive Good (3), at least 60% receive Hard (2),
with lower scores receiving Again (1). `PRACTICE_HARD_THRESHOLD` in
`apps/web/src/questions/grading.ts` owns the threshold. Invalid marks, undetermined
verdicts and unresolved disputes still withhold scheduling. Jev incorrect imprecise answers always receive Hard. Partial answers receive Hard
only when strictly more than half the expected parts are covered and none are unknown; wrong and blank answers remain Again. Learner
overrides and marking provenance retain their existing paths.
Question replay applies each persisted `scheduleEffect.grade`, including historical
binary grades, rather than recalculating marks under the current policy. This avoids
changing established schedules on undo or merge and requires no data migration.

Concept replay uses the persisted first-marking snapshot gradeMappingVersion: historical
full-good-otherwise-again-v1 evidence retains binary grades; new fractional-hard-v2
evidence uses the shared Practice mapping. Question scheduleEffect does not govern concept replay.
