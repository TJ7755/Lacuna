# Working in Lacuna

Read [CONTRIBUTING](../CONTRIBUTING.md) for validation and independent review requirements.
Inspect source, callers and tests before changing behaviour.

Operational procedures:

- [Automatic marking operations](desktop.md)
- [Workspace deployment migration](maintenance/workspaces.md) and
  [return to Vercel checklist](maintenance/vercel-return.md)
- [Release](maintenance/release.md), [repository controls](maintenance/governance.md),
  [TLS maintenance](maintenance/tls-trust.md) and [security reporting](../SECURITY.md)
- [Library publication](library.md)
- [Gaps trial operations](gaps-trial-operations.md)
- [Feedback setup](feedback.md) and [landing media](landing-media.md)
- [Performance measurement](PERFORMANCE.md) and [upgrade procedure](storage-v22-compatibility.md)

For short local feedback, install dependencies first, stage new files, then run
`bun run verify -- --quick --base origin/master`. Use `--plan` to inspect selection.
Evidence and command timings are written under `artifacts/local-checks/`.
Exit 2 means validation remains outstanding, including after successful quick checks.
Run `bun run verify -- --base origin/master` and the checks required by CONTRIBUTING
before submitting; quick feedback does not replace required CI or platform evidence.
