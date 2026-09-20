# Engineering notes

Non-obvious constraints extracted from repository memories. Read the relevant section when
working in that area; current contracts belong in the [specification](../SPEC.md).

## Build and desktop packaging

- Updater tests need a matching historical installer and published block map: a saved v0.2.8
  installer differed from the hosted checksum despite sharing its version. Test both a verified
  matching cache and empty-cache full-download fallback.
- Native TypeScript 7 and typescript-eslint need different compiler packages: keep the native
  compiler under `@typescript/native` and the compatibility API under `typescript`.
- Browser library declarations include ES2022, while emitted syntax targets ES2021; the target
  does not polyfill built-ins. Root checks do not replace the relay's separate checks.
- On Windows, run JavaScript tool entry points through `process.execPath`; spawning `.cmd`
  with `shell: false` fails. Resolve `require('electron')` for the lazily installed runtime.
- Packaging uses `electron/assets/icon.png`; do not revive a separately maintained ICO.
  Portable NSIS extraction precedes Electron and needs its own branded bitmap feedback.
- A custom NSIS `customCheckAppRunning` replaces the default prerequisite initialisation.
  Initialise `IS_POWERSHELL_AVAILABLE` before delegating to `_CHECK_APP_RUNNING`.
- AppImage block maps are embedded. Require the AppImage, DEB and `latest-linux.yml`, not a
  nonexistent sidecar. Windows artefact names must already be URL-safe to match updater metadata.
- During Windows upgrades, companion hosts may relaunch a killed executable. All companion
  entries must honour the live installer PID marker across profiles and ignore stale markers.
- Direct AI companions run `aiCompanionEntry.js` with `ELECTRON_RUN_AS_NODE=1`, preserving
  `--lacuna-host-user-data-dir`; launching another browser process can exit before serving stdio.

## Relay and sync

- Relay generations provide compare-and-swap, not authenticated freshness or rollback protection.
  Never treat a generation as a monotonic clock. Empty and quoted-empty ETags are invalid.
- Prefer the real generation from a successful JSON response or exposed header. Synthetic digest
  generations recover damaged or ambiguous acknowledgements; using them routinely can provoke
  false conflicts against stale Blob reads. A rejected or unreadable PUT may have committed:
  use bounded authenticated receipt reads, never repeat the PUT blindly.
- Enforce body limits while streaming even when `Content-Length` is absent. In the 18 August
  2026 deployment, 4,490,000-byte PUTs passed and 4,495,000-byte PUTs failed without readable
  CORS errors. Keep the platform limit below that measured boundary and remeasure if it changes.
- The 25 first-write race trials on 15 August 2026 found one winner per round with Blob's
  `allowOverwrite: false`; this is deployment evidence, not a general atomicity guarantee.
- This relay is not a Next.js application: rewrite nested routes to `api/index.ts`, not
  `api/[...path].ts`. Keep NodeNext ESM `.js` import specifiers; Vitest alone misses this issue.
- Verification previews must use the relay branch alias so successive pushes test matching
  revisions. Production retains its normal relay URL.
- HTTPS is mandatory outside loopback. Keybags use 32 lowercase-hex channel IDs and
  64 lowercase-hex write tokens: reject malformed lengths before PBKDF2.
- Pairing QR codes disclose bearer capability: reveal only on demand, hide on blur/visibility
  loss, and never include the relay mint secret. Remembered plaintext sync credentials are an
  accepted trusted-device convenience; Lock removes them. Do not silently change that policy.
- Web relay CSP is extended from Settings; Electron's static header permits the default relay.
  Keep those paths aligned. Any Electron CORS repair stays restricted to the exact relay and
  renderer origins; never disable `webSecurity`.
- To force a sync collision in tests, fence state pulls before editing both devices. Automatic
  sync can otherwise consume an edit and leave an upload barrier waiting for a write that is no
  longer needed.

## AI session correctness

- JSON-normalise tool results before validating/storing receipts: own `undefined` properties
  can otherwise report failure after a database write has already committed, inviting duplicates.
- Stable `callId` retries must wait until `terminalRevisionSeen` reaches the retry's mailbox
  revision; the old pre-approval response may still be present under the same call ID.
- Manual full replacement invalidates the AI session before draining writes. Peer/recovery
  application preserves it while holding the exclusive replacement lifecycle.
- Registration does not prove that a client loaded its tools. Preserve the generated command,
  arguments and environment, then check active connect/wait tools. Keep the model task alive;
  MCP cannot wake a task that has ended.

## Persistence and scheduling

- When converting inline history, copy canonical rows before writing Cards: hooks may clear the
  supplied array. Treat missing/non-array history as empty. Compatibility ownership fields must
  not distinguish duplicate copies of one review event during portability.
- Combine Welford summaries from duplicate legacy sources when rebuilding target pacing rows;
  preserve a legacy profile if the target projection is missing.
- Active Course/Lesson scheduling reads limits and goals from scheduling units, with a fallback
  for absent projections. Course rows still own path and assessment semantics.
- Review retrievability is already an ex-ante prediction. Weight fingerprints identify the
  parameter array, but do not store the vector; older/imported reviews may lack the fingerprint.
  Do not add a second capture mechanism merely to collect evidence already recorded.
- Trajectory aggregates are sampled after review commit, at most daily per unit. They are chart
  data, not scheduler/unlock inputs; keep them outside the grade transaction.
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
