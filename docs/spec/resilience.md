# Recovery boundaries

[Schema](../../src/db/schema.ts), [pre-migration snapshots](../../src/db/preMigrationSnapshots.ts)
and [backups](../../src/db/backups.ts) own durability. Database upgrades take their safety snapshot
before rewriting data; failure to save it blocks the upgrade. See the
[historical compatibility boundary](../storage-v22-compatibility.md).

Reads remain reactive to repository writes. A failed page or study session must offer useful
retry/return actions while retaining recoverable work, rather than blanking the app or erasing a
draft. Quota/startup errors must make backup recovery reachable.

Diagnostic bundles are local and exclude Card content by default. Including sample content is a
separate opt-in; copying or downloading diagnostics does not authorise transmission.

[Route loading](../../src/routes/) and [PWA recovery](../../src/pwa/) own bounded stale-module
recovery. A first failed route import requests a guarded reload; a recurring failure can escalate
through the shared probe/cache-clear path. Vite preload events and route failures share the recovery
cooldown. Confirm network availability before clearing offline assets. Speculative loads and
repeated failures must not create an unbounded reload loop. Packaged `app://` operation has no
browser service worker; do not assume web cache recovery proves native behaviour.

Use [current tests](../../tests/e2e/) to establish retry, offline and recovery sequences on the
actual candidate. Historical successful runs cannot establish a newer candidate's durability.

[Specification index](../SPEC.md)
