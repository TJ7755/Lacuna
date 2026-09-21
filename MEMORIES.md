# Lacuna memories

Read [AGENTS.md](AGENTS.md) for working rules. Keep this file to facts an agent would
otherwise get wrong; specialist detail belongs in [engineering notes](docs/maintenance/engineering-notes.md).

## Live users and rollout

Real beta users depend on Lacuna (confirmed 13 September 2026). Preserve their study data
and upgrade paths. Limited beta releases may be unsigned; wider school rollout requires
Windows signing and macOS signing/notarisation. See [release policy](docs/maintenance/release.md).

Release tags must be pushed with maintainer credentials: a tag created using Actions'
`GITHUB_TOKEN` does not trigger the tag build. Use the release helper and exact-commit push
workflow evidence; successful PR checks alone do not prove the merged release commit.

## Protect unrelated work

Use a disposable worktree for baseline tests rather than stashing unrelated work.
Start it at the intended revision. Component tests need their own physical
`node_modules` (a hardlink copy is suitable); symlinks can create two Vitest instances.

## Windows dependency installation

Missing package entry points can be Bun cache corruption, not incompatible dependencies.
A fresh `BUN_INSTALL_CACHE_DIR` with `--force --backend copyfile` has repaired this checkout.
Do not regenerate lockfiles to compensate for an incomplete local installation.

## Database history and transactions

Current Dexie hooks run during old upgrades: preserve inline Card history until the canonical
migration copies it. Runtime Cards hydrate `reviewHistory`; an explicitly supplied empty
history is authoritative. Legacy Deck/Folder types still serve historical upgrades even though
the live stores are gone. Do not collapse the migration chain.

Nested projection helpers inherit the caller's transaction: include every table they touch.
Parallel reads in a live query do not share a snapshot unless enclosed in one transaction.

## Recovery is not peer sync

Replace-import deliberately preserves `db.backups`; exports deliberately omit it, so a
pre-replacement restore point survives. Recovery merge and peer merge use different conflict
rules: do not promise that recovery selects the latest `updatedAt`. Replacement exclusion
must cover candidate snapshotting and merging as well as import.

## Browser evidence matters

Playwright's relative JSON report path resolves beneath the configuration directory here.
Use an absolute `PLAYWRIGHT_JSON_OUTPUT_NAME` to keep measurement reports in root artefacts.

Use `expect.poll(() => page.evaluate(...))` for asynchronous IndexedDB assertions.
Keep accelerated relay fixtures on a real wall clock. Browser fetch references must be
bound to `globalThis`; Node and ordinary mocks cannot catch a detached-fetch invocation.

Happy DOM animation cleanup can reject unfinished animations. Prefer reduced motion unless
motion is under test; otherwise finish transitions before teardown. Measure readable study
content from the input event, excluding retained outgoing nodes and zero-opacity faces.

Customisable native select pickers can bubble Escape to an enclosing sheet. Stop propagation
while the picker is open, and test the expanded menu rather than only the closed field.

## AI authority and deployment

Electron loading-spinner events can accompany hash navigation. Use main-frame,
cross-document navigation to invalidate AI readiness; a hash route retains its listener.

Vercel can retain an npm install override despite the Bun manifest and lockfile. Keep the
install command explicit in `vercel.json`; repository configuration overrides dashboard settings.

AI and data MCP companions share transport but have different grants. Preserve every generated
profile argument and verify the client's active tools, not just saved registration. A transport
harness does not prove model-authored chat. Web AI currently has no cross-tab ownership lease.

Managed-device redirects to `https://localhost:6543/block?...` are network filtering, not a
Lacuna endpoint: never add that origin to CSP. Device sync still needs the relay even when
desktop AI uses local IPC. See [engineering notes](docs/maintenance/engineering-notes.md).

## Bundle changes can break offline use

Hash routing needs no server catch-all: missing hashed assets must remain 404. Derive the
app-shell precache from emitted imports and rerun cold offline Cards reload after bundle changes.
Workers must use the ID and share-codec utilities without importing database initialisation.

## Product restraint

Keep cards around related content; fewer nested boxes does not mean flat pages. Landing scenes
should have one or two focal points, brief copy, flat bright illustrations and concrete calendar
examples. Historical plans are evidence of past intent, not an active implementation queue.
