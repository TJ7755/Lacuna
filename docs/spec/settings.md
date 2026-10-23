# Settings, sync and AI authority

[Settings](../../src/pages/Settings.tsx) and [its sections](../../src/pages/settings/) own the current
controls and labels. [CourseSettings](../../src/pages/CourseSettings.tsx) owns Course overrides.
Use source and tests for defaults, field ranges and disclosure contents.

Device preferences must not silently change unrelated behaviour: input mode does not change text
size or disable ordinary keyboard/pointer operation. A bounded numeric draft can be cleared and
retyped without persisting a transient invalid value. Saving on blur preserves the newly chosen
focus target. Hidden disclosures retain unfinished values without leaving controls interactive.

## Sync

The [cycle](../../src/sync/cycle.ts), [merge](../../src/sync/mergeSnapshots.ts) and
[replacement lifecycle](../../src/sync/manualMerge.ts) own state application. Peer/recovery apply
serialises snapshot, merge and import while preserving the local AI session. Full replacement
invalidates the session before draining writes; persisted session/transcript state is cleared only
after replacement succeeds.

A safety restore point is required before peer application unless consistent current-format state,
import projections and the merged result prove it unchanged. Unknown or failed comparisons keep
the snapshot. Compare-and-swap rejection does not prove whether an unreadable write committed;
use bounded authenticated receipt recovery rather than blindly repeating a PUT.

Pairing reveals bearer capability only on demand. Remembering plaintext credentials is a deliberate
trusted-device convenience; Lock removes them without destroying the wrapped recovery keybag.
A relay generation provides no authenticated freshness or rollback protection. See
[engineering notes](../maintenance/engineering-notes.md) for transport pitfalls.

Device and shared-channel removal share one full-width confirmation beneath the encryption
disclosure. Only one consequence is actionable at a time; opening or cancelling a prompt changes
no sync data. Cancellation and Escape return focus to the selected action.

## AI

[AI runtime](../../src/ai/) owns session identity, Stop, leases, call receipts and approvals.
Setup and service operation belong in [desktop and AI setup](../desktop.md).
A registered client is not proof it loaded tools, and MCP cannot wake a completed model task.

Reads are implicit within an active AI run. Writes require approval; Course creation and destructive
operations require exact one-shot approval. Retries use stable call identity and committed receipts
so an ambiguous acknowledgement does not duplicate a write. Stop prevents later calls/replies;
lease renewal cannot revive a stopped or expired run. Quiet polling is not proof of disconnection.

Learner memory is an explicit product feature with inspectable global or Course scope. It follows
its own backup/sync deletion rules and is separate from coding-agent harness memory.
AI transcript, live authority, provider credentials and device-local state must not leak into
Course sharing. The data MCP server has a separate connection-scoped permission model.

[Specification index](../SPEC.md)
