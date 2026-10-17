# Documentation

Start with the [project overview](../README.md) and [contributor guide](../CONTRIBUTING.md).
Keep current contracts and operating procedures here. Completed plans, audits and
superseded screenshots are available in Git history; they are not an implementation queue.

## Current references

| Document | Purpose |
| --- | --- |
| [Specification](SPEC.md) | Delivered behaviour at the development head. |
| [Domain language](domain-language.md) | Canonical terminology for Cards, Questions and Concepts. |
| [Changes](CHANGES.md) | Release history and unreleased changes. |
| [Browser checklist](WEBSITE_TEST_CHECKLIST.md) | Manual browser release verification. |
| [Performance](PERFORMANCE.md) | Measurement procedures and budgets. |
| [FSRS time semantics](architecture/fsrs-time-semantics.md) | Scheduling time boundaries. |
| [Storage compatibility](storage-v22-compatibility.md) | Supported imports and historical migration boundaries. |
| [Scientific assessment](scientific-assessment.md) | Evidence, assumptions and limits of learning claims. |
| [Desktop and AI setup](desktop.md) | Packages, updates and companion registration. |

## Maintenance

- [Release maintenance](maintenance/release.md): packaging, provenance, signing and device checks.
- [Security maintenance](maintenance/security.md): dependency audits and static analysis.
- [Repository governance](maintenance/governance.md): dated verification of GitHub controls.
- [Security reporting](../SECURITY.md): vulnerability reporting policy.
- [Engineering notes](maintenance/engineering-notes.md): specialist implementation pitfalls.

## Work and evidence

[GitHub issues](https://github.com/TJ7755/Lacuna/issues) and
[pull requests](https://github.com/TJ7755/Lacuna/pulls) track active work. A historical task list
does not authorise implementation. Release and rollout gates live in
[release maintenance](maintenance/release.md).

[Performance measurements](performance/) retain dated baselines and their reproduction steps.
[Change history through v0.2.7](archive/changes-through-0.2.7.md) remains part of the release record.
Date verification claims and record test results against the commit actually tested.

When changing behaviour, update the relevant `spec/` section and the recent changelog; keep
`SPEC.md` as the index. Update the relevant operating procedure when a release or rollout
decision changes.
