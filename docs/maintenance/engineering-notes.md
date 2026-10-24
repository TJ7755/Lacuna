# Engineering notes

Read the relevant section when working in that area. Source and tests establish current behaviour.

## Build and desktop packaging

- Updater tests need a matching historical installer and published block map: a saved v0.2.8
  installer differed from the hosted checksum despite sharing its version. Test both a verified
  matching cache and empty-cache full-download fallback.
- The Windows installed-upgrade CI probe holds the v0.2.7 AI companion's stdio open while
  installing the current package. It covers NSIS replacement of a live companion, but does not
  reproduce Codex's process ownership or explain the intermittent v0.2.8 failure in #205.
- On Windows, run JavaScript tool entry points through `process.execPath`; spawning `.cmd`
  with `shell: false` fails. Resolve `require('electron')` for the lazily installed runtime.
- A custom NSIS `customCheckAppRunning` replaces the default prerequisite initialisation.
  Initialise `IS_POWERSHELL_AVAILABLE` before delegating to `_CHECK_APP_RUNNING`.
- AppImage block maps are embedded. Require the AppImage, DEB and `latest-linux.yml`, not a
  nonexistent sidecar. Windows artefact names must already be URL-safe to match updater metadata.
## Relay and sync

- Enforce body limits while streaming even when `Content-Length` is absent. In the 18 August
  2026 deployment, 4,490,000-byte PUTs passed and 4,495,000-byte PUTs failed without readable
  CORS errors. Keep the platform limit below that measured boundary and remeasure if it changes.
- The 25 first-write race trials on 15 August 2026 found one winner per round with Blob's
  `allowOverwrite: false`; this is deployment evidence, not a general atomicity guarantee.
- This relay is not a Next.js application: rewrite nested routes to `api/index.ts`, not
  `api/[...path].ts`. Keep NodeNext ESM `.js` import specifiers; Vitest alone misses this issue.
- Verification previews must use the relay branch alias so successive pushes test matching
  revisions. Production retains its normal relay URL.
- Pairing QR codes disclose bearer capability: reveal only on demand, hide on blur/visibility
  loss, and never include the relay mint secret. Remembered plaintext sync credentials are an
  accepted trusted-device convenience; Lock removes them. Do not silently change that policy.
- To force a sync collision in tests, fence state pulls before editing both devices. Automatic
  sync can otherwise consume an edit and leave an upload barrier waiting for a write that is no
  longer needed.

## AI session correctness

- Registration does not prove that a client loaded its tools. Preserve the generated command,
  arguments and environment, then check active connect/wait tools. Keep the model task alive;
  MCP cannot wake a task that has ended.

## Persistence and scheduling

- The short-term-memory Python harness uses an external Anki corpus, not Lacuna study data.
  It is not an architectural precedent for analysing a learner's backup.
- Dexie compound-index `.keys()` still scans a cursor. Measure large histories rather than
  equating smaller payloads with constant-time reads, and preserve duplicate timestamps.

## Browser rendering and tests

- Exiting route outlets retain old parameters while location changes. Redirect guards must check
  `useIsPresent`; `AnimatePresence` pop-layout children must forward their DOM ref. Set discrete
  pointer-event state directly rather than trying to animate it.
- StrictMode replays effect setup: reset entrance guards in cleanup. Reduced motion must omit
  `animate`, not merely set zero duration. Happy DOM may need two frames before newly scheduled
  Web Animations exist and can be collected, finished and settled.
- Frozen `performance.now()` stalls JavaScript Motion transitions. Use reduced motion for tests
  that freeze it. Native WAAPI does not guarantee compositor-only rendering: animated `clipPath`
  still rasterises, whereas explicit `transform` keyframes use Motion's native path.
- Motion's `onDragStart` is not native `dragstart`. Disable native link dragging inside pointer
  sliders so the browser does not steal pointer moves and release events.
- Safari may intercept the native edge-back gesture before page code receives it. Do not claim
  the web app can reliably override the operating-system gesture.
- Video frames cross both CSP and COEP boundaries. Hermetic fixtures need compatible COEP/CORP;
  Electron's renderer header repair must never overwrite the provider document's policies.
