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
