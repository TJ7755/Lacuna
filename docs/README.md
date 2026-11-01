# Working in Lacuna

Read [CONTRIBUTING](../CONTRIBUTING.md) for validation and independent review requirements.
Inspect source, callers and tests before changing behaviour.

Relay v2 uses one shared schema and route contract, with a hard cut from legacy routes;
see the [relay procedure](../apps/relay/README.md). Relay and web clients resume together,
with silent edge updates for desktop clients.

Operational procedures:

- [Desktop and AI setup](desktop.md)
- [Workspace deployment migration](maintenance/workspaces.md)
- [Release](maintenance/release.md), [repository controls](maintenance/governance.md),
  [TLS maintenance](maintenance/tls-trust.md) and [security reporting](../SECURITY.md)
- [Library publication](library.md)
- [Gaps trial operations](gaps-trial-operations.md)
- [Feedback setup](feedback.md) and [landing media](landing-media.md)
- [Performance measurement](PERFORMANCE.md) and [upgrade procedure](storage-v22-compatibility.md)

Graded recall: Practice full marks receive Good (3), at least 60% receive Hard (2),
with lower scores receiving Again (1). `PRACTICE_HARD_THRESHOLD` in
`apps/web/src/questions/grading.ts` owns the threshold. Invalid marks, undetermined
verdicts and unresolved disputes still withhold scheduling. Jev incorrect imprecise
or partial answers receive Hard only when strictly more than half the expected parts
are covered and none are unknown; wrong and blank answers remain Again. Learner
overrides and marking provenance retain their existing paths.
Question replay applies each persisted `scheduleEffect.grade`, including historical
binary grades, rather than recalculating marks under the current policy. This avoids
changing established schedules on undo or merge and requires no data migration.
