# Documentation

Start with the [project overview](../README.md) and [contributor guide](../CONTRIBUTING.md).
The documents below separate current contracts from dated evidence and proposals.

## Current references

| Document | Purpose |
| --- | --- |
| [Specification](SPEC.md) | Delivered behaviour at the development head. |
| [Domain language](../CONTEXT.md) | Canonical terminology for Cards, Questions and Concepts. |
| [Maintenance roadmap](next_plan.md) | The sole active work queue and rollout gates. |
| [Changes](CHANGES.md) | Release history and unreleased changes. |
| [Browser checklist](WEBSITE_TEST_CHECKLIST.md) | Manual browser release verification. |
| [Performance](PERFORMANCE.md) | Measurement procedures and budgets. |
| [FSRS time semantics](architecture/fsrs-time-semantics.md) | Scheduling time boundaries. |
| [Storage compatibility](storage-v22-compatibility.md) | Supported imports and historical migration boundaries. |
| [Scientific assessment](scientific-assessment.md) | Evidence, assumptions and limits of learning claims. |
| [Frontend design](frontend-design.md) | UI design guidance. |

## Maintenance

- [Release maintenance](maintenance/release.md): packaging, provenance, signing and device checks.
- [Security maintenance](maintenance/security.md): dependency audits and static analysis.
- [Repository governance](maintenance/governance.md): dated verification of GitHub controls.
- [Security reporting](../SECURITY.md): vulnerability reporting policy.

## Historical records and proposals

[Planning records](plans/README.md) and the [archived roadmap](archive/roadmap-2026-08-11.md)
preserve previous decisions. The dated walkthroughs, audits, findings, caller inventories and
screenshots alongside them are evidence from their recorded revisions, not current acceptance
results or instructions to implement their outstanding lists.

[Feature ideas](new_features_list.md), [UI polish notes](ui-polish-points.md) and deferred plan
sections require a fresh product decision under the current roadmap. Keep historical records at
their existing paths so incoming links remain valid; link deleted sources to their Git revision.

When changing behaviour, update the specification and changelog. Update the roadmap only when
work status or a rollout decision changes, and date claims about live releases or repository
settings. Record test results against the commit actually tested.
