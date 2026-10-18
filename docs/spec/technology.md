# Architecture constraints

The [package manifest](../../package.json), [build configuration](../../vite.config.ts) and
[CI workflow](../../.github/workflows/ci.yml) own dependencies, scripts and tool versions.

Hash routing allows static hosting and packaged navigation without server route rewrites.
[App](../../src/App.tsx) owns the route composition. Browser study data lives in IndexedDB;
the Electron renderer owns that same data boundary. Native companions transport requests to it
rather than importing executable database handlers into the main process.

Heavy parsing and training belong in workers. Anki parsing is independent of persistence;
[its build boundary test](../../src/build/apkgBoundary.test.ts) guards that separation.
Optional routes and renderers must remain usable on first offline access where the app promises
it; use the actual precache and browser tests rather than assuming a lazy import is available.

Sync is optional, encrypted transport of local state. The relay stores opaque bytes. Its generation
is compare-and-swap state, not proof of freshness or protection against replay. Remembered plaintext
sync credentials are a deliberate trusted-device convenience; Lock removes that capability copy.
See [sync implementation](../../src/sync/) and [relay operation](../../relay/README.md).

[Specification index](../SPEC.md)
