# Lacuna — next beta

## First-interaction performance baseline

- Added a production-preview Playwright probe that measures real pointer-down to first visible
  acknowledgement and to usable route content separately, retaining normal motion rather than
  disguising deleted animation as a performance win.
- Added cold-versus-warm median and p95 reporting with overlapping Long Task counts. Reports are
  attached as stable JSON; timing remains comparative evidence instead of a flaky hosted-CI gate.
- Recorded the first Path-to-Cards baseline in `docs/PERFORMANCE.md`.

**Checks:** focused production-preview Playwright run with five cold and five warm samples; direct
TypeScript and Prettier checks; diff check.

## Complete exact-release workspace verification

- Extended the exact-release verifier to run the relay typecheck, lint and tests and the standalone
  AI MCP typecheck, lint, tests and build before any native packaging job starts. The ordinary CI
  jobs remain separate rather than gaining another aggregate that overstates what it represents.
- Kept exactly the root and relay frozen installations. The standalone AI MCP tool uses the root
  dependency tree, while its in-process end-to-end test imports the relay store and therefore also
  needs the relay dependency tree.
- Preserved the three native gates, their strict artefact allowlists, least-privilege attestation
  permissions and all four provenance attestations.

**Checks:** red-to-green release-workflow configuration regression; relay typecheck, lint and tests;
standalone AI MCP typecheck, lint, tests and build; root typecheck and lint; YAML parse and diff check.

## Recovery-risk coverage gate

- Added a separate `test:coverage:recovery` gate for persistence, manual merge, storage-quota
  warnings, automatic backups, portability and media assets. It uses per-file thresholds so the
  recovery modules cannot hide behind a healthy global average. Pull-request CI and exact-release
  verification both require it.
- Added regressions for unsupported persistence, merge conflicts, failed quota estimates, stale
  backup scheduling, best-effort folder mirroring, invalid asset data and orphan collection.
- Added the recovery coverage command to the contributor check matrix; the documented release-risk
  procedure now matches the gates enforced by CI and exact-release verification.

**Checks:** 98 focused tests; recovery coverage at 100/100/100/100 for persistence,
100/92.68/100/100 for manual merge, 96.22/83.33/100/96.22 for quota warnings,
79.27/86.84/69.23/79.27 for backups, 87.38/78.43/90/87.38 for portability and
71.70/71.64/86.36/71.70 for assets (statements/branches/functions/lines); existing coverage gate
unchanged.

## Compatibility and documentation truth correction

- Corrected the specification's release boundary: it describes the development head after v0.2.3,
  not exclusively the already-published v0.2.3 artefacts.
- Corrected the storage note and current specification to match the retired v22 import boundary:
  backups carrying Deck or Folder rows and v1 flat-Deck share payloads are rejected, rather than
  converted. `LAC0`–`LAC3` remain encoding prefixes only; they are not support-version promises.
- Moved the live PWA service-worker contract out of the historical v0.0.2 notes and corrected the
  roadmap, CODEOWNERS wording and maintainer memory so GitHub settings, not repository text alone,
  determine enforcement.
- Corrected two further roadmap overclaims found in independent review: the new provenance workflow
  cannot retrofit attestations onto the published v0.2.3 assets, and historical migration fixtures
  still lack the required post-migration export proof.

## Controlled offline browser reload

- Added a production-build Chromium journey that installs and waits for control by the service
  worker, authors a Card, visits the Cards library, clears Chromium's ordinary HTTP cache, then
  reloads offline. The check proves the shell, persisted Card and in-page search remain usable and
  that both the Cards JavaScript and lazy Markdown stylesheet have successful Cache Storage entries
  before and after the reload.
- Added a bounded Cache First rule for content-hashed lazy styles. The install shell now also
  includes only the named shared modules needed by the Cards spine but loaded before a newly
  installed worker gains control; unrelated lazy pages remain visit-cached.
- Stale-chunk recovery now requires a successful no-store origin probe before it unregisters the
  worker, clears caches or reloads. Offline preload failures continue to their existing callers, so
  an unreliable early `navigator.onLine` signal cannot destroy the usable cached shell.

**Checks:** red-to-green PWA configuration and stale-chunk unit tests; production build; hermetic
Chromium offline reload with its HTTP cache cleared; performance budget; root typecheck and lint.

## Data-recovery guidance

- Retained the database-open failure reason so quota failures show recovery guidance that tells
  users not to clear Lacuna site data, to free browser or operating-system space, and to leave
  private browsing before reloading. The failure screen does not offer an export because the
  database was never opened.
- Added direct **Open backups** and **Export backup** actions to the storage-quota and denied
  persistent-storage warnings respectively, using the existing Settings anchors.
- Added a clean Chromium-context recovery journey that authors an image-bearing Card, exports a
  full backup, replaces a second context containing target-only data, and verifies the Card and
  image return while the target-only Card disappears.
- Made that recovery journey wait for card creation to finish navigating before it leaves for
  Settings. Without that boundary, the editor's late return navigation could detach the backup
  button and leave the test waiting for a download that had never been requested.

**Checks:** focused initialisation, quota-hook and persistence unit tests; clean-context Chromium
backup round-trip; root typecheck, lint and web build.

## School-use browser spine and editor accessibility

- Gave every Markdown editor textarea an accessible name. The visible field label is now the
  default name, while an explicit `ariaLabel` continues to override it for specialised editors.
- Added a fresh-profile Chromium journey covering course creation, Front/Back authoring through
  accessible textbox roles, IndexedDB persistence across reload, the visible course Study entry,
  Space-to-reveal and Y-to-grade.
- Added keyboard coverage for Quick search focus and Escape focus restoration, plus explicit
  reduced-motion route-navigation coverage. Ordinary Playwright browser tests now exercise the
  normal motion preference; only the reduced-motion regression opts into reduction.

**Checks:** focused Markdown editor unit regression; focused Chromium school-use and accessibility
flows; full web Playwright suite; root typecheck, lint and asset build.

## Video embed content-security policy

- Added the two existing note-video providers to the web and packaged-Electron `frame-src`
  policies: `www.youtube-nocookie.com` and `player.vimeo.com`. No other remote frame origin is
  allowed, and Electron retains its existing `'self'`, `app:` and `file:` allowances.
- Moved the packaged renderer CSP into the testable Electron security-policy boundary. COOP,
  COEP, CSP and the `app://` CORS header now apply only to Lacuna's trusted renderer URL, so a
  provider subframe keeps its own response headers. The exact default-relay CORS repair remains
  the sole narrow remote-response exception.
- Corrected `MarkdownView`'s contract: imported notes also use embed-aware rendering. Its anchored
  provider URL checks and sanitisation are therefore the security boundary, not an assumption that
  all notes are locally authored.
- Added hermetic web and Electron note-authoring tests. Both create and save a note containing the
  two provider URLs, route the exact embed documents to deterministic HTML, and assert marker text
  inside each iframe document rather than merely checking that iframe shells exist.

**Checks:** focused Electron policy unit test (red to green); focused Chromium and Electron
Playwright authoring flows; root typecheck, lint and asset build.

## Quiet root unit tests

- Removed avoidable test-suite noise from mocked button refs, React Router future-flag opt-ins,
  successful automatic sync, expected AI chunk failures and delayed session-report updates.
  Automatic sync failures still emit their production warning, with a regression test preserving
  that distinction.
- Made the browser Stop proof acknowledge the request through the terminal's polling operation
  before asserting that a later domain call is rejected. The old test used the domain call itself to
  discover Stop, racing acknowledgement and sometimes observing a valid in-flight result discarded.

**Checks:** focused red-to-green warning regressions; full root unit suite output inspection;
root lint and typecheck.

## Hosted macOS releases and build provenance

- Added a native Apple Silicon release job on GitHub's official `macos-15` runner. It runs the
  Electron AI end-to-end gate, builds the existing arm64 DMG and ZIP targets, disables signing
  identity discovery and uploads only the macOS package, blockmap and update-metadata allowlist.
- Gated the draft publisher on Windows, Linux and macOS. Every native job now creates GitHub build
  provenance for its exact uploaded files with `actions/attest@v4`; the publisher creates and
  separately attests `SHA256SUMS.txt` after combining the three named workflow artefacts. Native
  PowerShell and Bash checks fail first if any expected package, blockmap or metadata class is absent.
- Reduced default release permissions to read-only, granting OIDC-token and attestation writes only
  to attesting jobs alongside the action's artifact-metadata permission, and release-content writes
  only to the publisher. The verifier now proves that the exact release tag resolves to
  `GITHUB_SHA`, not merely that its text matches the package version.
- Required successful ordinary `CI` and `Security` push workflows for the exact tagged commit before
  release verification can proceed. A repeated subset of checks no longer disguises a red commit.
- Replaced the Windows catch-all executable glob with separate NSIS installer, NSIS blockmap and
  portable executable patterns, so either advertised package failing to build stops publication.
- Documented the operator and verification contract in `docs/maintenance/release.md`, including the
  strict upload allowlists and the limits of provenance. The macOS beta remains unsigned,
  unnotarised and manual-update; hosted CI does not constitute physical-device evidence.

**Checks:** red-to-green release-workflow configuration regression; focused release tests; YAML
structure, full lint and diff checks; native Electron AI and macOS packaging checks.

## Security analysis and audit gates

- Added a least-privilege security workflow for pull requests and pushes to `master`/`main`, plus a
  weekly scheduled run. Root, relay and handwriting-maths each install with Bun 1.4.0's frozen lock
  file and fail on high or critical `bun audit` findings; the existing moderate Router 6 findings
  remain visible and are deliberately left to a separately owned major-version migration.
- Added CodeQL v4 analysis for JavaScript/TypeScript and GitHub Actions with `build-mode: none`,
  read-only checkout permissions and only the `security-events: write` permission required to
  publish analysis results. Documented the ownership, threshold and the GitHub settings that cannot
  be proved from repository files in `docs/maintenance/security.md`.

**Checks:** security-workflow configuration regression; YAML structure and diff checks; frozen Bun
installs and high-severity audits in the root, relay and handwriting-maths workspaces.

## Dependency security refresh

- Refreshed the root, relay and handwriting lockfiles with Bun 1.4.0 while preserving existing
  major-version boundaries. Raised the explicit minimums for Electron (42.11.0), React Router
  (6.30.6), Vite (6.4.3) and the nanoid override (3.3.18).
- Root audit findings fell from 69 to 21; the handwriting tool fell from 6 to 5; relay remained at
  5. Remaining critical/high findings are confined to the deferred Vitest and electron-builder
  layers, plus Vite 5 transitive dependencies in the relay and handwriting workspaces.

**Checks:** frozen Bun 1.4.0 installs in all workspaces; root typecheck, lint and asset build, with
2,908 unit tests passing in the native environment; relay typecheck, lint and tests; handwriting
typecheck, build and tests; package audits.

## Electron Builder 26 security migration

- Moved desktop packaging from Electron Builder 24.13.3 to the maintained 26.15.7 release on the
  official `v26` registry channel. The lock now resolves `app-builder-lib` 26.15.7,
  `builder-util-runtime` 9.7.0 and `tar` 7.5.22, and no longer carries the obsolete
  `app-builder-bin` or the stale Builder 24 Squirrel peer tree.
- Preserved the existing package matrix and configuration: Windows x64 NSIS and portable, Linux
  x64 AppImage and DEB, and macOS arm64 DMG and ZIP. The explicit Windows artefact names remain
  unchanged, as do the macOS updater filenames generated from the existing configuration.
- Reduced the root audit from 21 findings to 7. No Electron Builder or `tar` advisory remains; the
  outstanding findings belong to the separately stacked Vitest, Vite and React Router work.

**Checks:** red-to-green release dependency and security-floor regression; frozen Bun install;
root typecheck and lint; Electron preparation; native Electron AI end-to-end test; host-native
arm64 DMG and ZIP build, DMG checksum and ZIP integrity. Windows cross-packaging produced the x64
unpacked application but this Apple Silicon host cannot execute Electron Builder's x86_64 NSIS
compiler without Rosetta; Windows NSIS/portable and Linux AppImage/DEB remain authoritative on their
native CI runners.

## Vitest 3 security migration

- Moved the root application, sync relay, handwriting prototype and standalone AI MCP tool from
  Vitest 2.1.9 to the patched 3.2.7 release. The root coverage provider is pinned to the same exact
  version, while Vite remains on the supported 6.4.3 line.
- Added an explicit Vite 6 relay development dependency and override. This prevents Bun from
  retaining the old Vite 5 resolution or selecting Vite 7 through Vitest's broad peer range, and
  keeps every tracked test lockfile on one maintained Vite major.
- Covered the manifest and lockfile alignment with a release-toolchain regression. Existing fake
  timers, `performance.now`, error assertions and promise-valued mock results required no semantic
  changes under Vitest 3.
- Reduced the root audit from 7 findings to 2 moderate React Router findings. Relay and handwriting
  audits now report no vulnerabilities, down from 5 findings each; no critical or high finding
  remains in these three tracked lockfiles.

**Checks:** red-to-green Vitest and Vite toolchain regression; focused fake-timer,
`performance.now` and promise-valued mock-result suites; frozen Bun installs; root typecheck, lint,
unit and coverage suites; relay typecheck, lint and tests; handwriting build and tests; standalone AI
MCP typecheck, lint, tests and build; root, relay and handwriting audits.

## Repository governance

- Added contributor and security policies, CODEOWNERS review requests, pull-request and issue
  templates, and grouped Dependabot updates for the root, relay, handwriting tool and GitHub Actions.
  GitHub branch-protection settings are still required to enforce CODEOWNERS. The policy
  records Bun 1.4.0 checks, red-to-green evidence, stacked-PR expectations, risk-bearing review and
  managed-device/data-integrity reporting without inventing a security email route.

**Checks:** Markdown and YAML structure validation; repository link and ownership review; `git diff --check`.

## Maintainership baseline truth

- Reconciled the roadmap and specification with the current v0.2.3 beta, recorded the active feature
  freeze and ordered maintenance programme, and clarified that older plans are parked.
- Corrected the relay environment example: `RELAY_MINT_SECRET` is optional, providing a private
  rate-limit bypass; public channel minting remains available when it is unset.

**Checks:** documentation line-count, stale-version and environment-example searches; `git diff --check`.

## Platform-aware quick-search hint

- Replaced the ambiguous sidebar `Ctrl/Cmd+K` reminder with the native `⌘K` label on macOS and
  `Ctrl+K` on Windows and Linux. Electron uses its preload-provided platform; the web app falls
  back conservatively to browser platform information and remains safe during server-side and
  test rendering.
- Kept the existing Ctrl/Meta+K shortcut behaviour unchanged, including the collapsed sidebar's
  accessible tooltip.

**Checks:** red-to-green Electron-platform, browser-fallback and sidebar component regressions;
web and Electron typecheck; focused lint and production build.

## Desktop AI companion hardening

- Added automatic native message-lease renewal while a claimed run is active, so legitimate model
  work is not rejected merely because several domain calls exceed the original five-minute lease.
  Protocol 2 now negotiates that capability explicitly; current clients fall back to v0.2.3's
  protocol 1 without sending an unsupported renewal request. Stop, expiry and permanent renewal
  failures cancel renewal instead of starting an endless retry loop.
- Made local reply recording idempotent for the exact run, message and content. Retrying after an
  ambiguous acknowledgement now returns success without duplicating the assistant turn; changed
  content still conflicts.
- Added structured, actionable AI-companion errors with retryability, recovery action, user-action
  and commit-state fields. Unexpected exception text is redacted at the companion boundary rather
  than exposing native paths or endpoint details. Handshake failure and pre-acknowledgement socket
  closure now preserve safe retry guidance; ambiguous replies and writes report unknown commit
  state so their exact idempotency keys can be reused.
- Added a searchable domain-tool catalogue with JSON schemas and permission levels, plus likely
  alternatives for unknown names. New `find_course` and `search_cards` reads resolve learner-facing
  Course/deck names and return compact, cursor-paginated Card content without FSRS state or review
  history by default. Tool-name suggestions reject oversized input before distance calculation;
  compact reads count and search stored rows without hydrating review history, and Card cursors are
  bound to their Course and query. Tool-catalogue cursors are likewise bound to the normalised query
  and tool-surface version, so they cannot silently skip a different result set.
- Extracted native socket negotiation, request draining and lease lifecycle behind the local AI app
  client interface, leaving MCP stdio registration to describe only the five model-facing tools.
- Kept the five-tool conversation surface separate from the broader data MCP authority. Durable
  model execution, client tool-registry reload and waking a finished task remain client-owned MCP
  limitations rather than fake background behaviour inside Lacuna.
- Made the device-local AI setting a snapshot-checked external store. An enable or disable write
  which lands between render and listener subscription is now observed instead of being silently
  lost, which was the real cause behind the intermittent lazy-runtime CI failure.

**Checks:** red-to-green protocol negotiation and fallback, lease renewal and permanent-failure,
ambiguous-write recovery, handshake recovery, error-redaction, bounded tool-catalogue,
natural Course resolution, lightweight compact pagination, cursor-scope, scope-resolution and settings-subscription
regressions; native Electron AI lifecycle; browser suite; web/Electron typecheck, lint and
production build.

## Dashboard polish

- Removed the decorative dashboard eyebrow and tightened the header's vertical rhythm around its
  actual title.
- Centred the Lacuna mark with the rest of the no-course empty state instead of leaving it aligned
  to the text block's left edge.

**Checks:** red-to-green dashboard component regressions; web typecheck and focused lint.

## Settings and Help layout

- Removed the decorative header eyebrows from Settings and Help and tightened their header spacing.
- Rebalanced both desktop layouts around the shared, narrower section rail so the primary content
  uses the width previously left idle beside the navigation. Help now uses the established rail
  component instead of maintaining a duplicate implementation; responsive rail visibility remains
  unchanged.

**Checks:** red-to-green Settings, Help and shared section-rail layout regressions; focused unit
suite, typecheck, lint and production build.

## Controlled desktop updates

- Added a narrow, validated updater bridge from Electron to the renderer. Settings now shows the
  installed version, current update state, manual **Check for updates**, download percentage and
  transferred size, plus a retry path when a check fails.
- Added a compact application-level checking/downloading indicator with percentage and transferred
  size. Once an update has downloaded, Lacuna presents **Restart and install** and **Later** rather
  than closing or restarting without permission. Ordinary application quit no longer installs a
  deferred update.
- Kept distribution limits explicit: Windows portable, Linux DEB and unsigned Apple Silicon macOS
  builds link to the beta releases page for manual replacement; only Windows NSIS and Linux
  AppImage use the automatic route. Release-note HTML is not passed into the renderer.

**Checks:** red-to-green updater policy, Settings and application-level progress,
manual-route and restart-consent tests; shared-contract/preload-validator parity; native Electron
preload/Settings lifecycle; web and Electron typecheck; lint.

## Archived-course navigation and inspection

- Moved **Archived** out of the customisable primary navigation and pinned it directly beneath the
  **Courses** heading. Active courses retain their own scroll region, so the archive destination
  does not disappear when the course list is long.
- Made archived-course cards open the existing course path with a native card hover and keyboard
  focus state. **Unarchive** remains a separate action and cannot trigger card navigation.
- Added an explicit archived, read-only state to course and lesson views. Every lesson remains
  inspectable from a multi-lesson path, including lessons that were still locked when the course
  was archived, while the lesson workspace remains read-only.
- Added one course-route access guard: archived courses may open only their overview, lesson
  content and read-only analytics. Direct bookmarks to card/question banks, settings, update
  review, editors, study conductors and Learn sessions return to the archived overview until the
  course is restored.
- Removed the decorative **Course library** eyebrow from the Archived page and rebalanced its
  header spacing.

**Checks:** red-to-green Archived page, sidebar preference migration, course-path lesson navigation,
central route-access and lesson-view regressions; focused path-node tests; web typecheck and lint;
production build and browser pass.

## 0.2.3 beta — archived courses and desktop AI recovery

### Bun 1.4 toolchain

- Aligned the declared package manager and every CI and release job on Bun 1.4.0. The local 1.4.0
  runtime passed the full browser suite, Electron AI lifecycle test, typecheck and lint before the
  project pin was advanced.
- Resolved the native E2E executable through Electron's package entry point instead of rebuilding
  a path beneath `electron/dist`. Electron 42 deliberately downloads its platform runtime on first
  use, so a clean Windows runner must not assume that directory exists immediately after install.

### Desktop AI connection recovery

- Moved direct desktop AI companion commands onto Electron's supported run-as-Node entry point.
  Windows no longer starts a second Chromium browser process which exits before the MCP handshake;
  the shipped Electron runtime now hosts only the stdio bridge while Lacuna remains open normally.
- Made the native AI broker wait briefly for an enabled renderer which is still mounting instead
  of rejecting the companion's first request immediately. A renderer which never becomes ready
  still fails within five seconds with an actionable connection error.
- Added renderer readiness to the existing desktop status bridge and a targeted **Restart AI
  runtime** action. Recovery disposes and remounts only the optional AI runtime; it does not reload
  the router, current page or database.
- Replaced the vague terminal-restart setup prompt with AI-client-aware MCP guidance. It preserves the
  exact companion command and profile, distinguishes `--ai-companion` from `--mcp-companion`, tells
  Codex users how to reload and verify the active tool list, and forbids launching a duplicate app
  as a diagnostic. Configuration status is no longer treated as proof of a live connection, and
  every claimed message must receive a fresh model-authored reply rather than canned harness text.
- Added a real Electron lifecycle test using an isolated profile and the official MCP client. It
  enables AI through the UI and proves the exact five-tool surface, connection, message claim,
  reply rendering, renderer reload recovery and disconnection. Windows CI and release packaging
  now run this lifecycle gate instead of merely documenting a local command.

**Checks:** red-to-green renderer readiness, restart IPC, AI-only remount and setup-prompt tests;
real Electron companion lifecycle; web and Electron typecheck; focused lint; browser suite.

### Passed-final-exam course lifecycle

- Added a dedicated **Archived** sidebar destination and removed archived courses from the normal
  dashboard and sidebar course lists. Restoration now lives on that page rather than in a second
  dashboard section.
- Replaced the retired **Show archived courses** toggle with an **After the final exam** policy:
  **Ask me** by default, **Archive automatically**, or **Keep revising**. The ask flow offers
  archive, direct final-date editing and rolling maintenance, remembers the exact handled exam date,
  and re-arms when a replacement final exam later passes. Explicitly unarchiving a passed course
  also overrides automatic archiving for that exact exam instead of producing an absurd archive
  loop. Checkpoints never trigger it.
- Excluded archived-course cards from Review today and future workload forecasts without deleting
  or filtering their historical reviews from streaks, reviewed-today figures or activity history.

**Checks:** red-to-green lifecycle persistence, policy controller, Archived page, sidebar filtering,
dashboard removal, final-assessment editor and forecast-history regressions; focused Settings,
Course Settings and route-prefetch suites; web/Electron typecheck and lint. The full unit run passed
2,804 tests; its unrelated native companion socket test could not bind inside the sandbox (`EPERM`).

### Windows application icon integrity

- Removed the stale hand-authored Windows ICO whose every embedded size omitted the bright left
  Lacuna stroke. Windows packaging now gives Electron Builder the same generated PNG used by the
  other desktop targets and lets its platform converter produce the executable icon.

**Checks:** red-to-green Windows release-configuration regression; direct Electron Builder icon
conversion with a pixel assertion for the previously missing stroke.

## 0.2.2 beta — local desktop AI companion

### Local desktop AI transport

- Added a packaged `--ai-companion` with only the five AI conversation tools. Electron now carries
  AI requests over its authenticated Unix socket or Windows named pipe instead of the HTTPS relay,
  so a managed network cannot redirect or block the desktop AI connection.
- Kept web AI on the encrypted relay and kept device sync relay-dependent. The local transport does
  not claim that model inference is local and does not bypass operating-system policies which ban
  unsigned applications.
- Kept the renderer authoritative for optional-AI enablement, one active companion, Stop, call-id
  ledgering and exact one-shot approvals. Native requests fail closed before the renderer listener
  mounts and after it disposes; long message waits are cancellable across disconnect and shutdown.
- Replaced Electron's redundant pairing action with one copyable setup prompt containing the
  installed or portable companion command. Browser builds retain their short-lived pairing code.
- Corrected packaged companion discovery to advertise the stable Windows portable or Linux
  AppImage wrapper rather than electron-builder's temporary extraction path.
- Kept the renderer-owned local session above the hot-reloaded runtime listener so active waits and
  ownership survive a brief React remount. Disabling AI still disposes the retained session
  immediately, and real renderer navigation still fails closed.
- Included Electron's active user-data directory in both generated companion commands. Development,
  packaged and isolated-profile clients now read the same authenticated connection metadata as the
  running Lacuna instance.
- Routed companion signals, stdin closure and application quit through tested close-once shutdown
  coordinators. Lacuna waits for native broker shutdown before completing application quit.
- Restored an unclaimed local prompt to the editable draft when its owning companion channel dies,
  rather than stopping the transcript item and silently discarding the text.
- Prevented an Electron launch with a missing preload bridge from silently falling back to web
  relay pairing; the AI panel instead reports that desktop integration failed to load.
- Restyled user and assistant turns as compact, opposing chat bubbles while leaving errors,
  approvals and action receipts on their specialised surfaces.
- Made explicit Disconnect terminate the exact owning AI channel, and made genuine renderer loss
  close every AI-purpose channel without touching the broader data companion.
- Kept cancelled or timed-out write calls draining on their authenticated channel so a retry with
  the same call ID reaches the renderer ledger instead of risking a duplicate mutation. Abandoned
  drains now have a bounded cleanup deadline rather than leaking indefinitely.
- Made Stop revoke pending approvals, temporary grants and replay authority immediately. An
  unacknowledged Stop now expires at the claim lease without resurrecting the stopped prompt.

**Checks:** red-to-green purpose-bound authentication, malformed-message, portable/profile command,
renderer remount and shutdown lifecycle, single-owner, Stop and local/web runtime-selection
regressions; native companion smoke; full unit, typecheck, lint and production builds; desktop and
mobile browser screenshots; packaged Electron verification.

### Desktop AI and Settings reliability

- Kept the router and application shell mounted while optional AI starts or stops. Toggling AI no
  longer reloads the current Settings view or loses its scroll position; the shell-level
  scroll-restoration workaround has been removed because the remount itself no longer occurs.
- Replaced the collapsed, markerless terminal setup disclosure with visible setup guidance and a
  direct README link before pairing. A browser-level relay failure now explains that the network
  must permit `lacuna-relay.vercel.app` instead of reporting an unspecified internal error.
- Removed the repeated `Settings group` eyebrow from all five task groups. Reworked Teaching
  memory filters into a wider responsive column and replaced the raw checkbox with Lacuna's
  established toggle control.

**Checks:** red-to-green router-identity and scroll regression; blocked-relay classification;
terminal setup discoverability; Settings-group and Teaching memory layout regressions; focused
unit suite, typecheck and lint.

### Node 24 GitHub Actions

- Updated checkout, upload-artifact and download-artifact across CI and release workflows to the
  current official Node 24 action majors. Permissions, job ordering and release artefact allowlists
  are unchanged.

**Checks:** workflow configuration regression coverage in `src/release/releaseConfig.test.ts`.

## 0.2.1 beta — desktop onboarding and reliability

### Mobile edge navigation

- Added a deliberate left-edge rightward swipe to open the mobile navigation drawer. It is limited
  to touch at the mobile breakpoint, ignores interactive targets and rejects vertical or ambiguous
  movement before opening.
- Suppressed horizontal history overscroll with the standard CSS property while the application
  shell is mounted on supported mobile browsers. iOS Safari may still reserve its native edge-back
  gesture and does not provide a web API that can reliably replace it.

**Checks:** red-to-green drawer-opening and gesture-rejection regressions; existing course-section
swipe regressions; web typecheck and focused lint.

### Packaged-app network bootstrap

- Made Electron repair CORS response headers for the exact default sync relay and exact packaged
  renderer origin. This keeps sync working when a managed-device proxy strips the unusual
  `app://.` origin from an otherwise valid relay response without disabling Chromium web security
  or granting arbitrary remote origins.
- Stopped the packaged app requesting the hosted Google Fonts stylesheet which its production CSP
  correctly blocks. HTTP(S) builds still load the hosted fonts; Electron continues to inject the
  existing bundled fonts for offline use.
- Moved PWA registration into the protocol-aware application bootstrap. Production HTTP(S) pages
  still register `/sw.js`, while `app://` no longer attempts an unsupported service-worker
  registration or emits an unhandled rejection.

**Checks:** red-to-green exact-relay CORS, hosted-font and service-worker protocol regressions;
focused unit tests, typecheck, focused lint and production asset build.

### Unlocked sync channel deletion

- Fixed the Device sync deletion path when the device already remembers its unlocked credentials.
  The existing destructive confirmation now purges with that authenticated write-token capability
  instead of demanding a passphrase through a field which the unlocked state deliberately hides.
- Locked devices still require the recovery passphrase before deletion. Unpairing remains local to
  the current device; deleting the channel remains a separately confirmed purge for every device.
- The sync boundary rejects an unlocked credential whose relay or channel does not match the local
  pairing before it sends a purge request or clears local state.

**Checks:** red-to-green Settings deletion regression, credential-boundary purge and mismatch tests;
focused unit tests, web typecheck and focused lint.

### Public download journey

- Added an operating-system-aware download page with direct links to supported release artefacts.
  Managed Windows computers receive the portable build as the primary recommendation; installer,
  DEB, signing and update trade-offs are stated beside the relevant choice.
- Simplified the welcome page's first decision to opening Lacuna or downloading the desktop app,
  with shared-course import demoted to a text link and desktop prompts omitted inside Electron.
- Kept first-run routing from replacing an intentional visit to the public download page,
  including hashes with the router's accepted trailing slash.
- Kept desktop-download calls to action off phone layouts and made direct mobile visits neutral
  until the visitor chooses the computer where Lacuna will run, rather than defaulting to Windows.

**Checks:** red-to-green download selection, welcome hierarchy, first-run routing (including a
trailing slash), public route transition and browser first-launch tests; web typecheck and focused
unit tests.

### Windows packaging polish

- Corrected the Windows maximise/restore control's incomplete restore outline without changing the
  established caption-button sizing or placement.
- Added a restrained branded splash to the Windows portable wrapper so extraction is no longer
  silent. It appears before Electron starts and honestly warns that managed computers may take a
  moment; Windows security checks which occur before the wrapper starts remain outside the app's
  control.

**Checks:** red-to-green titlebar glyph and portable splash configuration tests; Electron builder
configuration validation, typecheck and focused lint.

### MCP setup guidance

- Expanded the copied AI terminal pairing instruction with a fallback to the README's terminal
  companion setup when `lacuna.wait_for_message` is unavailable, including the need to restart the
  terminal after configuring MCP. The pairing panel now also exposes that setup link directly.
- Reworked the Teaching memory controls into a cohesive responsive header and preserved Settings
  scroll position when the optional AI runtime remounts the application shell. Ordinary route
  changes still reset to the top without persisting the outgoing page position.
- Removed the redundant Dashboard study banner; course cards still open a resumable course study
  flow, while Review today in the sidebar still opens the shared course-picker sheet.

**Checks:** focused AI, Settings and Dashboard tests, plus the full browser suite.

## 0.2.0 beta — release hardening

- Guarded outstanding Card and Question sessions against explicit Exit, application navigation,
  browser back and page unload. The safe **Stay** action preserves the mounted answer; confirmed
  departure reports how many items were answered, keeps committed evidence and abandons only the
  current presentation.
- Added versioned Simple-session recovery using Card identities, mastery, outcomes and session
  events. Interrupted sessions reconcile the saved queue with currently eligible Cards; completion
  or an explicit confirmed exit clears the recovery state.
- Added recoverable Question-editor drafts for fixed, working and generated definitions, including
  invalid in-progress mark-scheme source, fixtures and uncommitted Concept text. Drafts are isolated
  by Course and Question, flush before navigation or unload, remain available after confirmed
  departure and clear only after discard, successful save or deletion.
- Closed the deferred Question-start exit race so an Attempt which finishes starting after unmount
  is abandoned exactly once, and serialised a confirmed exit behind any answer write already in
  flight.
- Bumped the desktop application to `0.2.0` and added explicit Windows x64 NSIS/portable, Linux x64
  AppImage/DEB and macOS arm64 DMG/ZIP builders. Windows and Linux build in GitHub Actions; macOS
  builds locally so the release does not consume a hosted macOS runner.
- Generated native macOS and Linux icons from the canonical web SVG instead of falling back to
  Electron's stock application icon.
- Corrected the macOS titlebar to reserve the native traffic-light area and omit duplicate
  Windows-style controls; Windows and Linux keep the custom control group. The desktop sidebar now
  fills the remaining shell height instead of extending beneath that titlebar and hiding its footer.
- Replaced concurrent electron-builder publishing with one gated draft publisher. The tag must
  match the package version; typecheck, lint, unit, coverage, production, release-scenario,
  performance and browser checks must pass; and only distributable artefacts plus update metadata
  are uploaded with SHA-256 checksums.
- Installed the relay dependency tree in the release verifier so the browser tests can import the
  real relay store on a clean GitHub runner.
- Kept the AI terminal fixture's accelerated polling on a real wall clock. Its previous synthetic
  clock compressed a nominal 25-second tool timeout to roughly 2.5 seconds and made the release
  browser gate fail under ordinary hosted-runner contention.
- Made Electron preparation execute TypeScript and the MCP builder through Node's JavaScript entry
  points. Windows no longer asks `spawnSync` to execute a `.cmd` shell shim while explicitly
  disabling the shell.
- Gave the Windows installer and portable executable explicit URL-safe artefact names. GitHub no
  longer rewrites spaces differently from electron-builder's `latest.yml`, so update metadata and
  SHA-256 manifests point at files that actually exist.
- Kept automatic beta-channel updates for Windows NSIS and Linux AppImage. Windows portable and
  Linux DEB update manually. The unsigned macOS beta also updates manually because macOS requires
  code signing for electron-updater.

**Checks:** red-to-green navigation-guard, Question-draft, session-exit, Simple-resume, Attempt-race,
release-configuration and updater tests; full validation is recorded by the pull request and release
workflow.

## Unreleased — maintainability consolidation

- Moved revision-plan persistence from the general database repository into
  `src/db/revisionPlanRepository.ts`; UI, session and test callers now depend on that narrower
  interface directly.
- Removed the duplicate current-input refresh path shared by plan creation/resume and refresh while
  preserving the existing transaction scope and error behaviour.
- Replaced the delivered roadmap head with the maintainability queue and removed the obsolete July
  code-quality draft. The current roadmap now distinguishes passing assertions from the remaining
  noisy-test-signal work instead of claiming both are complete.

**Checks:** focused revision-plan, repository transaction, portability, read, Learn and setup tests;
web typecheck; full validation is recorded with the pull request.

## Unreleased — grading transparency

- Replace the generic "Answer recorded" notification with the FSRS grade Lacuna actually stored
  and a plain-language next interval, such as "Good · again in 4 days". The existing Undo action
  remains attached to the same notification.
- Disclose the 1.5-second silent-grading adjustment beside a revealed lines-mode hint. Manual
  grading and Simple mode remain unaffected.
- Keep the general explanation of response-time grading in Settings and Help instead of repeating
  it in every study card's grading controls.

**Checks:** red-to-green grade/interval formatting, Learn notification, hint disclosure and session
boundary tests; full validation is recorded with the pull request.

## Unreleased — optional exam dates and steady retention

- Card analytics now labels an expired exam's rolling horizon as a predicted maintenance target
  rather than pretending the elapsed deadline is still the active exam target.
- Course creation now requires an explicit choice between a dated exam and steady long-term
  retention. The form no longer invents a seven-day deadline before the learner has chosen one.
- A steady course stores that target on its sole final assessment without an `examDate` or time
  zone. Course hydration, scheduling units, backups and v3 share codes preserve the distinction;
  existing dated assessments continue to infer the exam mode without a schema migration.
- Steady courses reuse the scheduler's rolling seven-day maintenance horizon. Exam-only behaviour
  such as countdowns, urgency, cram mode and revision-plan deadlines is hidden or rejected, while
  Course headers, cards and settings describe the ongoing retention target directly.
- The final assessment editor can switch an existing Course between the two targets. Checkpoints
  remain dated and continue to override the Course target for cards in their coverage.

**Checks:** red-to-green creation, settings, repository, backup and share tests; focused scheduler,
assessment, path and revision-plan suites; full validation is recorded with the pull request.

## Unreleased — audit regression follow-up

- Stop offering the short-lived Undo action when the recorded answer has already finalised the
  study session. Completion clears the single-answer reversal boundary while it writes milestones,
  revision-window state and unlock progress; the old toast therefore advertised an action that
  could no longer do anything.
- Restore focus to **Accept all clean** when a batch revision fixes every failing staged Question
  and removes its **Revise N with AI** trigger.
- Replaced the delivered-only roadmap head with the selected next slices: optional exam dates and
  steady long-term retention first, followed by grading transparency.

**Checks:** merge-base red-to-green UI tests cover terminal-answer Undo and batch-revision focus;
full validation is recorded with the pull request.

## Unreleased — review fixes for the audit implementation

- Flush the Card editor's pending draft when navigating directly between two card routes inside
  the 800 ms autosave window; the source card's edit previously died with the cancelled timer.
- Route synchronous Question-generator resolution failures through the same recovery path as
  failed attempt writes, so Retry and Exit render for either failure mode.
- Close a staged candidate's "Revise with AI" panel when editing begins and focus the editor
  through a dedicated ref, so the panel's complaint textarea can no longer win the edit-focus
  query or steal focus through its close transition.
- Give the batch revision panel a focus fallback to "Accept all clean" when applied revisions
  leave no failing candidate and the "Revise N with AI" trigger unmounts.
- Gate the notes-list layout animation and the lesson-management reorder animation on the motion
  multiplier, so reduced motion no longer animates note add, delete and reorder movements.
- Derive the mobile course section bar's active styling and current-page semantics from the
  NavLink's own route match, removing the inactive fallback styling that disagreed with
  aria-current on nested routes.
- Extracted the shared height-collapse motion configuration into a `collapse` helper beside
  `scaledSpring` and applied it across the note components.
- Reconciled the audit documents' delivered-status wording and corrected LG-8's priority rating
  to match the priority matrix.

**Checks:** focused red-to-green tests for the draft flush and generated-Question recovery paths
plus the staging, notes, navigation and settings suites; full typecheck and lint recorded with
the pull request.

## Unreleased — UI/UX audit implementation

- Delivered QW-1–QW-6 and QW-8–QW-10 from the 30 August sticking-point audit: restore points
  report Course lessons; failed Question starts offer Retry and Exit; study-flow Continue exposes
  planner delay; Card drafts save only real edits; checked Question answers can be edited; every
  recorded FSRS answer offers Undo; Welcome actions have deliberate light-theme contrast; the two
  confirmed live Course-facing Deck strings are gone; and Learn announces concise progress.
- Made the motion-speed setting apply to shared buttons, toggles, menus and assessment sheets, and
  added continuity to Question and study results, Lesson Study/Author swaps and reordering, inline
  confirmations, notes and annotations, batch authoring, optional constraints, staging review and
  Course tabs. All transitions collapse under reduced motion.
- Extracted the staging candidate row from its oversized review component instead of turning one
  755-line file into an even larger dumping ground.
- Fixed Card-editor draft identity when navigating directly between two card routes in one mounted
  editor; each card now restores and updates only its own draft.
- Fixed the mobile Course section bar marking Path as current alongside every nested section;
  assistive technology now receives exactly one current-page tab.
- Recorded the delivered and deliberately deferred audit items in both source audit documents.

**Checks:** focused red-to-green component, page, session, backup and draft tests; full typecheck,
lint, unit, coverage, production, tooling and browser checks are recorded by the pull request.

## Unreleased — first-load and network performance

- Contained a failed lazy AI-panel download inside the workspace so the shell and
  learner's current page remain usable, with a native Close control. Remembered
  sync startup now also contains a failed pairing-module download instead of
  producing an unhandled rejection.
- Restored the production lazy boundaries for charts and Markdown, and moved the
  disabled AI relay runtime plus the AI conversation panel behind their actual use
  conditions. Existing panel motion, visual treatment and AI session lifecycle are
  unchanged.
- Stopped automatic sync startup from fetching pairing, backup validation, math
  verification and charts on an unpaired device. Remembered startup, focus and
  completed-study triggers still use the same sync path when credentials exist,
  and re-check the credential generation after the lazy module loads so Lock or
  replacement cannot use a stale bearer capability.
- Loaded the schema-v24 question migration only while that upgrade runs, using
  `Dexie.waitFor` so the version-change transaction remains valid.
- Reduced the initial production JavaScript from 2,561,545 raw bytes to 863,072
  (264,211 gzip), removed 29,290 bytes of optional CSS from first load and reduced
  the PWA install precache from 1,519.50 KiB to 998.47 KiB.
- Added enforceable initial-asset budgets and repaired the performance audit for
  the current Course and scheduling-unit APIs. Content-hashed scripts and the
  hosted font stylesheet now use bounded cache-first runtime caches.

## Unreleased — CI and test throughput

- Split the root unit suite into four one-worker CI shards, with coverage retained as one separate
  job and the existing `test` check kept as an aggregate gate. Local Vitest defaults remain serial.
- Removed full typechecking from CI asset builds through the new `build:assets` script; the ordinary
  `bun run build` command still typechecks before building. Playwright uses that asset-only build and
  two isolated workers in CI while remaining serial for local runs.
- Made the 2,000-entry relay bounds fixture linear by using a fixed mock envelope, cached instruction
  data and a no-op storage adapter; persistence coverage remains in the dedicated persistence tests.
- Restricted workflow tokens to read-only repository contents and made the aggregate `test` check
  fail closed when either its unit shards or coverage job fails.

## Unreleased — canonical review-history storage cutover

- Added schema v26. Its atomic migration copies and verifies every remaining inline Card review
  before clearing the duplicate projection; a failed canonical write leaves the v25 database and
  source history unchanged. The existing pre-migration restore-point gate now covers this cutover.
- Made the Card-table write hook the single storage seam for compact Card rows. Review writes and
  undo still return fully hydrated Cards, while repository snapshots, APKG imports, backup replace/
  merge and generated-card restores cannot reintroduce an expanding inline history array.
- Current full backups and encrypted peer snapshots carry review evidence once in canonical
  `reviewHistory`; compact Card rows retain `history: []`. Old inline-only backup, APKG and peer
  inputs remain accepted and are canonicalised before storage.
- Replaced Analytics' whole-array `sessionHistory` reads with cursor-backed daily projections that
  produce exactly the same last-point-per-day chart input without deleting stored evidence.
  Recovery-merge deduplication now queries only incoming event ids and legacy timestamps instead of
  materialising the entire local session table.
- Corrected Card hydration to remove canonical row metadata (`id`, ownership and scheduling keys)
  from runtime `ReviewLog` values rather than leaking IndexedDB fields through the Card interface.
- Made Card, Course and Lesson snapshot restoration replace the restored Cards' canonical review
  rows atomically, so events written after the snapshot cannot survive an undo. Schema v26 also
  normalises missing or malformed legacy Card history projections to an empty stored array.

**Checks:** schema migration and rollback, review/undo, backup replace/merge, Course/Lesson/
generated-card snapshots, APKG legacy import, peer merge, daily analytics projection, typecheck,
lint and the full test suite.

## Unreleased — AI connection health

- A relay pairing request that finishes after AI is disabled now starts contained
  best-effort revocation. Cleanup is detached from the serialised session queue, so
  an unavailable relay cannot block a later connection attempt. The remote bearer
  session cannot be published locally after disposal wins the race and is revoked
  when the relay remains available.
- Corrected the companion README's obsolete claim that durable learner memories were not
  implemented; schema-v25 memories already use the scoped domain-tool path.
- Added throttled terminal heartbeats to the existing encrypted mailbox protocol. Repeated bounded
  waits now prove that the companion task is still running without creating a second transport or
  changing the relay's plaintext-blind trust model. A heartbeat PUT is cancelled at the wait
  deadline and an uncertain outcome requires reconnection instead of overrunning the advertised
  bound.
- The browser marks an idle connection **Connection quiet** after 90 seconds without a newer
  terminal mailbox revision and restores **connected** on the next terminal write. An active run
  remains connected for its claim lease, so ordinary model work is not falsely reported as dead.
- Claim expiry and explicit mid-run disconnect now append persistent, bounded failure records to the
  transcript while recovering the interrupted prompt. Previously the header failure could be
  cleared during recovery, leaving the learner with a draft but no durable explanation. Truncated
  failure identifiers retain a source fingerprint so distinct long run and event ids cannot
  collide.

## Unreleased — UX flow consolidation

- Repaired onboarding import links: **Import a shared course** now opens the existing Share-page
  importer directly instead of sending an Anki/JSON or deck-labelled action to Settings.
- Distinguished **Quick search** (the Ctrl/Cmd+K overlay) from the full **Search content** page in
  navigation, shortcuts, accessibility labels and the seeded Welcome course.
- Replaced the repeated Read/Edit decision with one persisted **Study/Author** workspace mode beside
  course and lesson content. Course Settings no longer duplicates the same setting.
- Added one Author-mode path action group for lessons, Manual practice and checkpoints. The existing
  Practice and assessment editors now handle path-native creation/editing, including single-lesson
  courses; Study mode keeps checkpoint details and revision.
- Grouped global Settings under Appearance & access, Study behaviour, Course defaults, Data safety
  and Integrations while preserving the old child anchors. Scheduler internals, practice thresholds
  and optimisation now use deliberate Advanced disclosures; workload and session goals remain
  visible.
- Automatic restore points now require confirmation before deletion from Lacuna and report failures.
  Folder-mirrored backup files are explicitly left untouched.

## Unreleased — AI closed-panel activity capsule

- Added a compact top-right AI activity capsule while the full conversation panel is closed. It
  exposes explicit status, current activity, the latest reply, editable queued follow-up, Open and
  cooperative Stop controls through the existing `AiSession` seam.
- Preserved an active or Stop-requested run's compact Stop surface when the viewport crosses below
  the 1024 px desktop-panel breakpoint without exposing the ordinary AI entry point on mobile.
  Completed activity remains desktop-only.
- Made the capsule and full panel mutually exclusive, restored focus after Escape or outside-click
  dismissal, and suppressed capsule interaction beneath the command palette, navigation drawer,
  key hints and study sheet.
- The streamlined interaction and visual pass found and fixed duplicated generic activity status
  and queued-follow-up text disappearing after an update. Width, dark-theme, reduced-motion and
  200%-zoom checks were run independently, without a wasteful Cartesian-product matrix.
- Blocked new follow-ups while a Stop request awaits acknowledgement, preserving draft content
  without allowing new AI work to slip behind an explicit Stop.

## Unreleased — course-wide Practice Now action

- Removed the repeated manual-practice insertion controls from the curriculum path. The course
  header now places a secondary **Practice Now** action beside **Study** and sends eligible,
  reached course cards through the existing ad-hoc Practice conductor. The action is disabled when
  there is no eligible practice work. Existing authored practice nodes remain visible and editable
  on the path; Settings links to the path only when there is an existing node to manage. Single-
  lesson courses expose the same Practice Now action in their inline lesson header.

## Unreleased — AI teaching memory and replacement lifecycle

- Upgraded the encrypted mailbox to protocol v3. Every queued prompt captures the live
  `teaching-v1` instruction bundle, and terminal claims receive conditional misconception-first
  routing plus grounding, conservative memory authorship, approval and Stop rules.
- Added schema-v25 learner memories with bounded validation, immutable scope, controlled evidence
  status and provenance, lexical search, Course cascade/Undo and a native Settings inspector.
  `lacuna.search_memories`, `lacuna.create_memory`, `lacuna.update_memory` and
  `lacuna.delete_memory` reuse the existing approval and exact-call replay boundaries; AI search
  and creation require explicit global or Course scope.
- Included memories in full backup, replacement, recovery merge, encrypted peer sync, tombstones
  and size attribution. Peer merge converges updates, deletion and deliberate resurrection while
  rejecting an attempt to move one memory id between scopes.
- Hardened recovery merge against duplicate incoming memory ids by selecting the deterministic
  newest record and rejecting scope conflicts before persistence. Card references now resolve
  ownership through the Card's scheduling unit rather than its obsolete direct Course field.
- Added `ReplacementLifecycle` around AI writes and every snapshot/merge/import operation. Peer and
  recovery application preserve the AI session; manual replacement invalidates new work, drains
  admitted writes, attempts remote revocation and clears the local transcript, connection, grants,
  approvals and replay state only after a successful commit.
- Made completed activity receipts re-check their native targets. A target deleted by peer sync is
  shown as **Unavailable**, unresolved availability never exposes a stale link, and the global
  memory pseudo-Course is never linked.
- Browser scenario 4 passed with an approved uncertain misconception, failed prediction,
  learner-evidence resolution and transfer check. Scenario 6 passed with focus-triggered peer sync
  preserving the terminal and transcript, a deleted Course receipt becoming **Unavailable**, and a
  full backup replacement revoking and clearing the AI session.

## Unreleased — AI domain-action vertical slice

- Hardened the live terminal path after browser acceptance exposed failures hidden by the
  in-memory tests. `lacuna.connect` now returns a JSON-safe public projection, companion operations
  are serialised through its single mailbox writer, and five-minute claim leases leave practical
  time for approval and multi-tool work. Expiry preserves the original message identity, accepts a
  reply authored before the deadline even when the browser polls later, and ignores genuinely late
  replies without duplicating the transcript. The companion also claims a queued follow-up already
  observed during the preceding reply instead of waiting for an unrelated browser mailbox change,
  while slow read-only browser polling no longer blocks an explicit Send action.
- Normalised successful domain-tool results at the AI wire boundary by omitting optional
  `undefined` object fields while continuing to reject cycles, symbols, accessors, sparse arrays
  and non-finite numbers. This fixes `lacuna.create_card` and `lacuna.list_cards`, which previously
  committed or read a real Card and then reported the successful result as an internal JSON error.
- Fixed the AI panel's composer actions overlapping multiline drafts, scrolled the transcript when
  either side appends an item, added a restrained accessible responding/stopping indicator, and
  made the Send control shorter and wider so it no longer dominates the compact footer.
- Added mailbox protocol v2 tool calls and browser responses to the terminal AI companion. The
  companion now exposes `lacuna.invoke_tool`; the browser executes existing `lacuna.*` definitions
  through one transport-neutral executor shared with the Electron renderer adapter.
- Added browser-owned trust state: implicit reads, connection/course write grants, exact one-shot
  course-creation and destructive approvals, stable `callId` replay, Stop enforcement and
  disconnect revocation. Course creation no longer requests reusable global write access; approval
  is bound to the exact call, input digest and requested course name.
- Added structured activity receipts from real repository results. Course, Lesson, Card, fixed
  Question and assessment receipts link to their native surfaces; replay returns the same receipt
  without appending or creating a duplicate. Receipt and approval copy is bounded before protocol
  validation, so a valid long entity name cannot turn a committed write into an internal error.
- Fixed approved stable-call retries accepting the stale pre-approval response still present in the
  browser mailbox. The terminal now waits until the browser has acknowledged the terminal revision
  containing the retry before accepting a response with that `callId`.
- Fixed successful relay writes to retain the real returned generation before falling back to a
  synthetic ciphertext digest. Using the digest unconditionally forced Vercel Blob through a
  read-after-write check and produced false `412` conflicts when that read was stale.
- Fixed pending approvals and grants surviving disconnect/reconnect, and fixed the Stop control to
  follow active run state instead of disappearing whenever the latest tool activity completed.
- Browser acceptance passed before automated verification: one live terminal run obtained exact
  Course approval and one course-scoped grant, created a Course, Lesson, Concept, Card, fixed
  Question and checkpoint assessment, replayed the assessment call without duplication, verified
  saved record counts and rendered linked receipts. A local instance of the repository relay
  handler also proved that browser Stop prevented the terminal from sending a later tool call after
  the production pairing limit was exhausted.
- Restricted writer-token mailbox GET access to authenticated digest receipts. Ordinary reads of a
  writer's own full ciphertext mailbox now return `401`; the opposite role remains the only peer
  reader.

## Unreleased — AI roadmap and sync verification close-out

- Recorded PR #101 as merged after its complete GitHub and deployed-browser gates passed, and made
  the AI sidebar plan the single active product plan. The delivered checkpoint remains encrypted
  chat transport only; domain tools, approvals, teaching instructions and durable memories are the
  approved next slices rather than current product claims.
- Closed multi-device sync P9 after Tom completed and confirmed the real two- then three-device pass
  against the live relay on 28 August 2026. Sync P1–P9 is now delivered with no outstanding
  implementation or manual verification phase.

## Unreleased — stale deployment recovery

- Removed the unnecessary Vercel SPA catch-all from this hash-routed app. It returned `index.html`
  with `200 OK` for deleted content-hashed JavaScript chunks, allowing the service worker to cache
  HTML under a script URL and leaving lazy routes broken after a deployment. Vite preload failures
  now clear stale service-worker/cache state and reload once; a repeated failure falls through to
  the existing diagnostic boundary instead of entering a reload loop.

## Unreleased — AI sidebar foundation

- Added the web AI chat transport: Lacuna creates a short-lived terminal pairing code, derives a
  shared AES-256-GCM key with ephemeral P-256 ECDH, and persists/polls one encrypted mailbox per
  direction through the HTTPS relay. The model- and harness-agnostic
  `tooling/lacuna-ai-mcp` stdio companion exposes only `lacuna.connect`,
  `lacuna.wait_for_message`, `lacuna.reply` and `lacuna.disconnect`. It claims queued messages with
  bounded leases, survives ordinary browser reloads, uses `ETag` / `If-Match` for its single-writer
  mailboxes, acknowledges cooperative Stop, and refreshes Stop state immediately before refusing a
  late reply. Replied terminal runs remain eligible for a later Stop acknowledgement until the
  browser has observed their mailbox revision, closing the final read/write race. Persisted relay
  sessions now reject malformed transcript variants and inconsistent connection state rather than
  stranding the panel. Browser acceptance covers encrypted exchange, pending-run reload continuity
  and cooperative Stop acknowledgement. There is no browser extension, WebSocket, inbound local
  listener or model credential in Lacuna. The current relay payload is chat-only: course/Card
  actions, learner memories, approvals, receipts and misconception-first instructions remain future
  integration.
- Hardened the public AI relay after review. Pairing creation now uses a shared, compare-and-swap
  IP rate limit rather than a per-process counter, malformed or oversized mailbox state is bounded,
  and stale browser generations fail closed instead of looping or risking a write against state the
  browser cannot authenticate. The terminal companion advances its browser generation only after a
  successful relay write. A daily authenticated Vercel maintenance route removes expired sessions,
  orphaned AI objects and elapsed pairing-rate records after a 24-hour grace period; deployments must
  configure `CRON_SECRET` for that route. Elapsed pairing windows are atomically cleared to compact
  reset markers so cleanup cannot delete a counter concurrently refreshed by a pairing request.
- Fixed live browser pairing through Vercel. Its function request omitted `Content-Length` from
  the browser's JSON POST; the relay now reads request bodies through a bounded stream, retains its
  4 KB JSON and 1 MB mailbox ceilings, and still rejects malformed declared lengths. The browser
  acceptance fixture no longer describes the only supported shape.
- Fixed live mailbox acknowledgement through Vercel. The platform can replace or omit `ETag` on a
  `204` response, so the relay now also exposes the compare-and-swap generation through
  `X-Lacuna-Generation`. Successful mailbox writes now return the generation in a small JSON body,
  avoiding header-only acknowledgement across consecutive browser writes. Browser and terminal
  clients retain header compatibility with older relay deployments.
- Fenced the web AI session lifecycle so React cannot leave a discarded session polling after a
  replacement mounts. Restored polling now starts only after the owning UI commits, and disposal or
  reconnection invalidates delayed relay and crypto work before it can push or persist stale mailbox
  state. This fixes the same-tab reconnect race that surfaced as a `412` stale-generation failure.
- Hardened browser mailbox acknowledgement when Vercel commits a `200` write but the browser cannot
  use its response. A later live run proved Vercel can make an arbitrary successful acknowledgement
  unreadable, not merely the first one. A valid response body or exposed generation header is used
  directly; a `200` with damaged metadata falls back to
  `"sha256:<lowercase ciphertext digest>"` from the exact attempted bytes. The relay recognises that synthetic
  generation in a later `If-Match`, verifies it against the current stored bytes, then uses the
  backing store's current ETag for the atomic write; a changed mailbox still fails with `412`.
  Browser and terminal writers reconcile a transport-rejected request, an unusable non-`200`
  success or a server-side `5xx` through bounded, authenticated digest-receipt GETs on their own
  mailbox. The relay returns success only when the stored ciphertext matches the supplied SHA-256
  digest, and the writer derives the same synthetic generation without trusting the receipt's body
  or headers.
  Browser checks use absolute 0/650/1400 ms offsets, a 600 ms per-read limit and a 2.2-second overall
  deadline so Vercel's cross-origin authorisation preflight has time to complete; terminal checks
  retain 0/250/650 ms offsets, a 250 ms per-read limit and a one-second deadline. Neither retries the
  PUT or trusts a modern platform `ETag`; a mismatch that persists through the receipt window fails
  closed.
  The relay permits each writer to request a digest receipt for its own opaque mailbox without
  weakening PUT authorisation. If a committed store write omits its ETag, the relay
  re-reads and adopts the stored generation only when the ciphertext still matches exactly; an
  ETag-less read fails closed because an unconditional repair could overwrite a concurrent
  successor. Stale-writer conflicts and unverifiable relay acknowledgements now have distinct error
  messages instead of both claiming that the connection changed elsewhere; either condition also
  clears terminal client state so it can reconnect safely. Fresh deployed-browser verification
  completed two clean same-tab exchanges, recovered a claimed prompt through terminal replacement,
  retained the transcript after disconnect and showed no late acknowledgement warning with the
  corrected preflight-aware recovery window.
  Connected users can also disconnect a dead terminal directly from the AI panel; local reset no
  longer waits for relay revocation and recovers an active prompt or queued follow-up into the
  composer. A clean disconnect while a prompt is claimed follows the same recovery path. Ambiguous
  outgoing sends persist the exact attempted text for reconnection without falsely adding it to the
  transcript, successful replacement sends clear the persisted draft, and a terminal event already
  reduced before an ambiguous browser acknowledgement is retained rather than discarded. The panel
  keeps completed conversation history visible after disconnect while disabling the composer.
- Added the first testable AI interface slice: a device-local, disabled-by-default Settings opt-in,
  optional misconception-first preference, desktop-only sidebar action and 400 px conversation
  panel. Opening AI contracts the existing navigation to its 72 px rail without overwriting the
  saved sidebar preference; closing restores focus, and crossing below 1024 px removes the inactive
  surface. The panel renders connection, transcript, activity, approval, receipt, error, Stop and
  composer states through the `AiSession` seam, with an in-memory adapter for UI development. Stop
  returns queued follow-up text to an untouched composer, approval focus starts on the safe action,
  queued messages can be edited in place, source links are emitted only when Lacuna has a valid
  route, and interactive targets retain their documented minimum size. Device-local setting changes
  remain active for the current page when browser persistence is temporarily unavailable.
- Defined a versioned future domain-action protocol as one strict request seam with bounded,
  JSON-safe records, serialisable expected errors, explicit Stop semantics and server-held one-shot
  approvals. The current relay mailbox does not expose this action seam. Added the UI-facing
  `AiSession` read-model interface and typed fixtures for the broader six-scenario target.
- Corrected MCP Undo dispatch so deleted Concepts and Questions use their own repository restorers.
  The exhaustive dispatcher can no longer silently treat a future Undo kind as a Sequence.
- Corrected `docs/SPEC.md` to identify MCP tool-surface version 3, matching
  `MCP_TOOL_SURFACE_VERSION` in `src/mcp/registry.ts`.

## Unreleased — AI sidebar prototype plan

- Added `docs/plans/ai-sidebar.md`, a one-week implementation plan for an optional desktop AI
  sidebar paired to a trusted running terminal task through a standard stdio MCP companion, a
  short-lived code and encrypted directional HTTP mailboxes. The delivered chat checkpoint is
  model/harness agnostic; later phases propose reuse of the transport-independent Lacuna tool
  registry while keeping reviews and raw FSRS state human-owned.
- Planned durable agent memories for a later prototype phase with schema v25, controlled
  provenance, learner correction, full-backup and peer-sync semantics. Conversation transcripts
  remain device-local. Neither memories nor misconception-first instructions are wired to the
  current chat mailbox.
- Split delivery into four parallel ownership lanes after a shared interface/schema foundation,
  followed by central integration, browser acceptance and independent standards/specification
  reviews. It recorded the then-existing Concept/Question MCP Undo dispatch defect as a separate
  prerequisite correction rather than hiding it inside the feature.

## Unreleased — Agent workspace housekeeping

- Removed obsolete mailbox and LMO directions from the agent-agnostic instructions while retaining
  the mailbox protocol where it is still used by Claude-managed workers.
- Ignored Freebuff's clone-local project metadata so using the preferred hand-off tool no longer
  dirties the Git workspace.

## Unreleased — Questions as separate post-instruction application practice

- Renamed the former Question bank to **Cards** and added a separate **Questions** course tab. Cards
  remain direct recall; fixed Questions and built-in generated Question families provide deliberate
  post-instruction application practice. Questions are not placed in the Course path, Practice nodes
  or assessment revision plans in v1.
- Added stable Concepts shared by Card and Question authoring. Every Question has exactly one primary
  Concept and optional prerequisite Concepts. Question answers never review or fail linked Cards;
  their schedules, histories, analytics and Course-objective contribution remain isolated.
- Added deterministic numeric and working checking with mandatory worked feedback. A Question's
  first submission is immutable and an optional correction is stored separately. Full marks map to
  FSRS Good; any incomplete result, including partial marks, maps to Again. Undetermined or disputed
  checker results retain the receipt and marks but withhold scheduling.
- Added the separate Question session pool: due definitions first, then unseen fixed Questions and
  generated families, interleaved by primary Concept where possible. Generated quadratic variants
  carry deterministic seeds, parameters, fingerprints, answers and explanations in immutable
  Attempt receipts. Definitions whose generator version the current client cannot resolve remain
  portable but are excluded from practice until support exists.
- Added Question analytics that keep fixed first-presentation/repeat evidence separate and generated
  novel-variant/repeated-variant evidence separate. Marks, versioned criteria, repeat rate and
  excluded shown/abandoned/undone/checker-withheld Attempts are reported without contaminating Card
  readiness or calibration. Retained Attempts remain visible after the final live Question is
  deleted.
- Added schema v24 and full-backup v11 support for Concepts, Question definitions, relationship
  aggregates and Attempts. Older backups use the pure v24 converter; replace, recovery merge, peer
  sync, tombstones, asset reachability and Course deletion cover all four stores, and merged
  schedules replay eligible Attempt evidence. Deleting one Question retains its personal Attempts.
- Added Course-share payload v3, search result routing, external batch authoring and MCP tools for
  Concepts, fixed Questions and generated families. Share codes carry authored Question material but
  exclude personal Attempts and scheduling.
- Recorded the complete design, scientific limits and deferred Path integration in
  `docs/plans/question-mode.md`; added the canonical Concept/Card/Question/Question family/Attempt
  vocabulary in `CONTEXT.md`.
- Corrected the shipped documentation after implementation: Help now covers Question authoring,
  practice, marking and evidence isolation; legacy Concept and migration exceptions, Attempt
  lifecycle semantics and due-Question interleaving now match the code; stale Question-bank,
  bulk-deck and batch-prompt wording has been removed from the current specification, flows and
  Help.

## Unreleased — Full audit 2026-08-24: code, quality, accuracy and science

Six concurrent audit streams examined scheduling science, grading accuracy, analytics, code quality,
security/privacy/deployment, data integrity/sync and UX/accessibility against
`docs/lacuna-objective-audit.html`, `docs/lacuna-interrogation-report.html` and the then-current
code-quality remediation draft. The fixes below address the highest-severity open items; remaining
ranked remediation is archived in `.agent-mail/` and `docs/next_plan.md` for follow-up. This is a
behaviour-preserving maintenance arc except where noted.

- **Calendar popover containment.** The date/time picker now renders outside overflow-clipping dialog panels while remaining inside the owning modal layer, uses fixed viewport-clamped positioning, and behaves as a popover rather than falsely declaring a nested modal. A browser pass against New Course confirmed the full calendar stays inside the viewport without clipping, restores initial day focus and logs no errors; the regression test covers the clipping-dialog placement.
- **Electron security hardening.** New windows remain denied and only ordinary HTTP(S) links may open externally; renderer navigation is restricted to the exact packaged-app origin or exact Vite development origin. Pure policy tests now cover those boundaries. Permission handling allows only audio/video capture and sanitised clipboard writes from Lacuna's trusted main renderer, preserving microphone recording, QR scanning and copy actions while denying unrelated permissions and untrusted frames.
- **APKG zip-bomb guard.** The 50 MB compressed-file, 100 MB expanded-data and 5,000-entry limits are now enforced by a strict central-directory parser before `unzipSync`. It fails closed on missing, truncated, mismatched and out-of-bounds metadata, traverses the declared entries exactly, supports bounded ZIP64 metadata and central-directory digital signatures, and retains the post-inflate defence. Regression fixtures prove malformed archives and oversized ZIP64 entries are rejected before inflation without rejecting those valid ZIP forms.
- **Persistent storage auto-request.** After `openDatabase` succeeds, startup fire-and-forgets `requestPersistentStorage()` on every launch without blocking readiness. Unsupported, denied and rejected requests remain non-fatal; repeating a previously denied request is intentional because browser policy can later change. This reduces eviction risk but does not claim the browser granted durable storage.
- **Lint gate restored** at `.eslintrc.cjs:38` (`warn` → `error` for `@typescript-eslint/consistent-type-imports`) and four sites fixed at `src/components/learn/StudySheet.test.tsx:5`, `src/pages/settings/DataPortabilitySection.test.tsx:5`, `src/sync/cycle.test.ts:3`, `src/sync/manualMerge.test.ts:4` (`typeof import()` → `import type` + `typeof Module`). `bun run lint` now passes with 0 warnings; `bun run typecheck` still passes.
- **Command palette accessibility.** The combobox now exposes consistent expanded, active-descendant, listbox, option, selection and live-result state, including while deferred search results catch up after the query is cleared. Keyboard navigation is tested without duplicate synthetic key events, and closing with Escape restores focus to the Search trigger after the inert application shell is re-enabled.
- **Date/time picker accessibility and containment.** The picker retains its focus trap and 44 px day/month/year targets, but no longer falsely declares a nested modal. Its popover is portalled within the owning modal layer and positioned against the viewport, preventing overflow clipping while preserving outside-dismissal and stacking behaviour. Initial focus, roving month/year focus, invalid-time focus and rendered viewport containment are covered against the New Course flow.
- **Atomic WASM delivery.** The SQL importer and FSRS optimiser binaries are imported as Vite assets and emitted under content-hashed filenames. Their owning JavaScript bundles therefore request an exact binary revision; Workbox may safely use `CacheFirst` for that immutable URL without returning a different deployment's binary. Configuration tests and a production build verify the hashed asset output.
- **Remaining ranked items deferred** (not in this slice): gate response-time pool by card kind and wire/delete `selfCorrected` (grading `Hard` dead), add APKG duplicate via `checkDuplicatesBatch`, wire `persist()` banner, pin `ts-fsrs` exact, move `requestRetention` behind Advanced, provenance-gate `allowEmbeds`, ship header CSP via `vercel.json`/`_headers`, ETag `X-Forwarded-For` trust note, and the `securedTopics` band-misclassification metric. Sites and evidence retained from the six subagent reports.

## Unreleased — SPEC staleness fix (half-life model and EPSILON)

- `docs/SPEC.md` now names the frozen routed model `half-life-logistic-v3-routed` (coefficients
  unchanged from v1) instead of the stale `half-life-logistic-v1` / `half-life-logistic-v1-lag64-count8`
  at `docs/SPEC.md:531`, `1044-1048` and `1313-1320`. Each site now documents the routed handover:
  success/no-outcome/first-review 21,600→86,400 s (6 h→24 h), failure 345,600→432,000 s (96 h→120 h),
  FSRS-6 only from 604,800 s (7 days), per `src/fsrs/halfLifeLogisticModel.ts:27` and
  `tooling/short-term-memory/coefficients/half-life-logistic-v3.json:53`. A note records that v1
  passed the initial gate but failed multi-day transfer and was conservatively retreated per
  `ROUTING_DECISION_RULE.md` / `tooling/short-term-memory/BENCHMARK.md`, and that the no-regression
  gate passes only against the fractional-day FSRS-6 the runtime uses (floored FSRS-6 is stronger by
  ~0.001–0.003 at 2–7 d).
- `docs/SPEC.md:1129` `EXPECTED_MARKS_EPSILON` corrected from `1e-3` to `5e-3` to match
  `src/fsrs/objective.ts:35`.
- Verified `docs/scientific-assessment.md` needs no change (already correct).

## Unreleased — Sync remembers this device

- Pairing, joining and every successful passphrase unlock now persist the unwrapped channel key
  and write token as `SyncState.remembered` through the pairing persistence helpers.
  `installSyncTriggers` restores that copy at install, so automatic
  focus/session-end sync and a manual `Sync now` work straight after a page reload without the
  recovery passphrase.
- The Settings `Lock` action clears only the remembered copy via `forgetRememberedCredentials`
  and keeps the wrapped recovery keybag, returning the device to the
  locked behaviour until the passphrase is next used. The unlock banner copy reflects the new
  persistent behaviour, and the stale "automatic … triggers arrive in the next phase" text in the
  unpaired state was corrected to describe the delivered P7 triggers.
- Sync-state updates are serialised so an automatic sync cannot restore credentials after Lock;
  failed storage reads keep the device visibly unlocked and report the failure. Remembered custom
  relay origins are restored into the web CSP before automatic sync resumes.

## Unreleased — Sync ease: public mint, in-session unlock, copy link, auto triggers, dashboard status

- `POST /channel` no longer requires `RELAY_MINT_SECRET` to be pasted on the default relay. Without `Authorization` it rate-limits (`10`/hour/IP, `429`) and still mints (`201`); with the correct bearer it bypasses the limiter. An unset or empty `RELAY_MINT_SECRET` no longer returns `503`. The `Advanced` disclosure in `Settings → Device sync → Set up sync` now hides the mint secret for the default relay (`https://lacuna-relay.vercel.app`) at `src/pages/settings/SyncPairingFlow.tsx:157` and `src/sync/pairing.ts:103` accepts an empty secret.
- `Settings → Device sync` keeps the unlock in memory after a successful `Sync now` or `Show pairing QR` via `src/sync/triggers.ts:15` (`publishUnlockedCredentials`). Subsequent `Sync now` reuses `unlocked` through `syncWithCredentials` at `src/sync/pairing.ts:15` without re-asking the recovery passphrase, shows `Unlocked` + `Lock` at `src/pages/settings/SyncSection.tsx:342`, and shares the same unlock for the auto triggers.
- The pairing QR panel at `src/pages/settings/SyncSection.tsx:397` now offers `Copy pairing link` alongside the QR (`LACUNA-SYNC-1:…` via `src/sync/pairing.ts:18`) for devices without a camera.
- `P7` auto triggers at `src/sync/triggers.ts:1` (`installSyncTriggers` from `src/App.tsx:419`, debounced `1500 ms`, `MIN 5000 ms`, `single-flight` at `src/sync/cycle.ts:66`) pull on `focus`/`visibilitychange` → `visible` and push after a study session ends via `lacuna:study-session-end` dispatched from `src/pages/LearnMode.tsx:247`.
- The dashboard at `src/pages/Dashboard.tsx:1` now shows a `Synced … · Open sync` pill via `src/components/dashboard/SyncStatus.tsx:1` (polled `5 s` + `visibilitychange`) that links to `Settings → Device sync`.

## Unreleased — Weak ETag normalisation

- Vercel serves Blob objects with `content-encoding: br` as `W/"..."`. The relay rejected that as `400 invalid if-match` at `relay/src/relay.ts:342` (`W/` → `null`) and `canonicalEtag` at `relay/src/store.ts:35` returned `''` for weak validators, so every second `PUT` after the initial `"0"` failed. The relay now strips `W/` before canonicalising and always emits strong `"..."` via `quoteEtag` at `relay/src/relay.ts:365`, and the app at `src/sync/relay.ts:259` normalises any `W/"..."` from `pull`/`push` to `"..."` before persisting or sending `If-Match`.

## Unreleased — Missing blob ETag safe recovery

- The live relay served `ETag: ""` for a channel's state slot: the blob's
  Vercel Blob metadata carried no etag (the same first-write path the README
  documents as measured, not guaranteed). The app accepted the quoted-empty
  `""` as a generation — its guard only rejected the truly empty string — and
  the next push sent `If-Match: ""`, which the relay rejects as "invalid
  if-match". That produced "Relay push failed with HTTP 400. Invalid if-match"
  in Settings on every sync after the first, regardless of content size. The
  relay now fails closed when a read has no store ETag. If a successful write
  response omits its ETag, the relay re-reads the slot and accepts a valid
  generation only when the stored bytes still match the attempted body. It
  never rewrites without a generation because that could overwrite a
  concurrent successor. The app also rejects quoted-empty generations on pull
  and push as protocol errors instead of sending them.

## Unreleased — Sync payload size gate hardening

- The relay platform's real request-body limit measures below the nominal
  4.5 MB: browser PUTs to the live relay passed at 4,490,000 bytes and died at
  4,495,000, and a body the platform truncates mid-flight can still reach the
  relay short, which answers 400 "length mismatch" — surfacing as the cryptic
  "Relay push failed with HTTP 400" in Settings. The sync size gate now sits
  at 4.4 MB, below the measured boundary with margin, so an oversized
  snapshot fails locally with the offending course names instead.
- Relay error responses now carry the relay's error reason into the sync
  failure message (for example "Relay push failed with HTTP 400. length
  mismatch."), so platform and protocol rejections stay diagnosable.

## Unreleased — Relay fetch binding fix

- Fixed "Failed to execute 'fetch' on 'Window': Illegal invocation" on the
  pairing and sync flows in the browser. The HTTP relay adapter called the
  stored `fetch` reference as a method of the provider, so `this` was the
  provider rather than the Window the WebIDL brand check demands; the error
  was thrown before any request left the page. All captured `fetch`
  references (adapter pull/push/purge and channel mint) are now bound to
  the global at capture time. Node's undici `fetch` and `vi.fn` mocks do
  not enforce the brand check, so the previous unit tests stayed green; a
  new regression test asserts the captured reference is never invoked with
  the provider as `this`. A browser-level Playwright spec also drives the
  real pairing UI through first-device setup against a stubbed loopback
  relay, so WebIDL brand-check failures surface in CI rather than only on a
  live deployment.

## Unreleased — Sync relay CSP

- The web and packaged-app CSPs now allow connections to the default relay
  (`https://lacuna-relay.vercel.app`). Previously `connect-src 'self'` made the
  browser refuse every relay fetch, so pairing and sync failed before any
  request left the page.
- The web meta policy is extended at runtime to any relay URL entered in the
  Settings pairing flow, so a custom relay origin works in the web app as well.
  The Electron production header stays static and covers the default relay
  only.

## Unreleased — Sync P5 review hardening

- The HTTP relay adapter now refuses plaintext URLs unless the host is
  loopback (localhost, 127.0.0.0/8 or ::1). The write token rides in the
  Authorization header on push and purge, so non-loopback HTTP would send
  it in the clear. HTTPS remains the only accepted transport for a real
  relay.
- The sync cycle now seals the snapshot it actually pushes after the merge
  has applied, rather than reusing bytes measured before replace-import
  normalised the merged object. The size gate still runs before the
  database is touched. Snapshot size accounting takes the already-encoded
  plaintext length instead of re-encoding, and canonical snapshot
  comparison serialises each array element once with a locale-stable
  code-unit sort.
- Single-flight sync now rejects an overlapping caller that asks for a
  different channel or key instead of returning the first caller's result.

## Unreleased — Sync P6 pairing and status

- Added a Device sync section in Settings for first-device channel setup, QR or passphrase pairing, deliberate Sync now, last-sync and snapshot-size status, local unpairing and separately confirmed shared-channel deletion.
- Enforced a real recovery-passphrase policy of at least 16 characters. The relay mint secret is entered only while creating a channel; it is not persisted or placed in the pairing QR.
- Reused the existing QR display and camera-scanner packages. Pairing QR capabilities are shown only after an explicit action and are dismissed on window blur or visibility change. P7 automatic triggers and real multi-device verification remain outstanding.

## Unreleased — Sync P5 transport and cycle

- Added the transport-only `RelayProvider` seam with callback-based manual handoff and an HTTP relay adapter. HTTP writes use the relay's opaque `ETag` compare-and-swap generation; a stale generation is pulled and retried once rather than overwritten.
- Added the encrypted pull-merge-push cycle. It validates and decrypts the remote snapshot, reuses `manualMerge` for the single replace-import path, takes a forced restore point before applying, avoids writes when merged state is unchanged, and shares overlapping calls through a single-flight guard.
- Persisted last successful generation, timestamp, error and encrypted/plaintext snapshot sizes under `syncState`. Oversized outgoing snapshots fail before apply with the contributing course names; the accepted Vercel Functions ceiling is 4.5 MB.
- P5 deliberately does not claim relay rollback protection: generations are opaque compare-and-swap values, not an authenticated monotonic clock. P6 pairing does not change that boundary; automatic focus/session triggers remain P7 work.

## Unreleased — Sync P2 review gate closed

- Tom reviewed and merged PR #86 on 18 August 2026. The Arc 8 §7 gate on
  `src/sync/crypto.ts` is closed. P5 may consume the module. Further changes
  to nonce, AAD, KDF or keybag layout still need the same review before they
  reach a real channel.

## Unreleased — Sync P2 crypto review hardening

- Keybag parsing now enforces the relay's canonical 32-byte bearer token
  representation (64 lowercase hexadecimal characters) and rejects every
  structurally impossible keybag before deriving PBKDF2. Current v1 keybags
  are exactly 162 bytes.
- Keybag parsing validates the format version before the fixed 162-byte size
  bounds, so a wrong-version blob reports as a version error even when it is
  also the wrong length.
- The keybag confirmation is now the tail of the same PBKDF2 output that
  produces the KEK, rather than a digest of the KEK, so neither value is a
  function of the other. The KEK length uses a dedicated `KEK_BYTES` constant
  instead of the channel-key length.
- State and keybag AAD now require the relay's canonical 128-bit channel ID
  representation (32 lowercase hexadecimal characters), preventing callers
  from creating valid ciphertext under an ID the relay can never route.
- The unwrap KDF cap is four times the current 600,000-iteration wrap cost,
  rather than a 10,000,000-iteration migration allowance. It still requires a benchmark
  on the slowest supported phone before the work factor or cap is raised.
- The v1 frozen state and keybag vectors were independently recomputed with
  a separate PBKDF2-HMAC-SHA-256/AES-GCM implementation; the keybag vector
  was recomputed again for the confirmation split, and a second frozen vector
  locks the non-default iteration path (unwrap must keep accepting counts
  above the current wrap constant as the floor stays fixed). This module
  deliberately does not provide snapshot freshness or rollback protection.
  P5 must either make that relay threat-model exclusion explicit or add an
  authenticated high-water mark to the sync cycle before deployment.

## Unreleased — Safe-area insets for standalone phone use

- `index.html` now sets `viewport-fit=cover`, so `black-translucent` can paint
  the status bar and the layout can extend to the screen edge. Insets of zero
  leave existing spacing unchanged: every `env(safe-area-inset-*)` is wrapped
  in `max()` or `calc()` against the previous padding.
- Study chrome is the main change. The touch grading sheet, card-actions
  sheet and sticky header clear the home indicator and notch. A grade control
  under the home indicator was the misgrade risk this work exists to close.
- Shell chrome: the mobile top bar, course section bar, drawer sidebar and
  study-decision sheet already had some inset padding; they now also clear
  landscape notches. `main` takes the left/right inset on small screens so
  page content is not handled per-route. The collapsed (and expanded) sidebar
  widths grow by `env(safe-area-inset-left)` rather than taking that padding
  out of the 72px / 264px chrome — under `border-box` the previous form
  left about 13px for icons on an iPhone 14 Pro in landscape.
- Other edge-reaching surfaces: toasts, the MCP consent card, the card-editor
  touch action bar, merge-review’s fixed footer, the assessment detail sheet,
  Welcome / Method, and the study-adjacent overlays (shortcuts, palette,
  in-session editor).
- The earlier PWA note that deferred this work is superseded.

## Unreleased — CI: relay job

- A `relay` job now runs `typecheck`, `lint` and `test` inside `relay/`
  on every push and pull request. Root scripts remain app-only.

## Unreleased — Sync P1: live Blob concurrency evidence

- The relay ran in production for the first time on 15 August 2026
  (`lacuna-relay.vercel.app`, private Blob store `lacuna-sync`, region
  `lhr1`, OIDC). Until that deploy it had never actually executed. Two
  defects — single-segment `api/` routing, and ESM module load without a
  `.js` specifier — were found only by deploying; both are recorded in
  the routing entry below.
- Against that deployment, 25 rounds of concurrent first writes
  (`PUT /c/:id/state` with `If-Match: "0"` and distinct bodies, each on
  a freshly minted channel): 10/10 two-racer rounds and 15/15
  three-racer rounds produced exactly one 204 and the rest 412. Zero
  multi-winner rounds, zero no-winner rounds. GET always returned the
  winner's body. The winning racer varied across rounds.
- That is empirical evidence that `allowOverwrite: false` behaved as an
  atomic create on Vercel Blob as of that date. It is not a documented
  platform guarantee. Do not read this as the race being closed.
  Pairing (P6) is not blocked on pre-creating zero-byte slots at mint.
- A smoke pass on the same host was correct: mint 201; first PUT
  `If-Match: "0"` 204 with an ETag; GET 200 returning the exact bytes
  with `cache-control: no-store`; stale `If-Match: "0"` 412; no auth
  401; missing `If-Match` 428; unknown slot 400; DELETE 204 then GET 404. CORS and `Cross-Origin-Resource-Policy` present on writes.
- Root CI does not run `relay/` tests. The app's vitest include is
  `src/**/*.test.ts(x)`, and `bun run test` in CI is that suite. PR #81's
  relay tests were run manually. Vercel preview deployments are behind
  Deployment Protection (302 to SSO), so a preview cannot be
  smoke-tested unauthenticated; production can.

## Unreleased — Sync P1: relay routing and operator errors

- The relay is a non-framework Vercel project. `api/[...path].ts` is a single
  dynamic segment there, not a catch-all, so every real route (`/c/:id/:slot`)
  404'd before the handler ran. One function at `api/index.ts` now receives
  every public path through `vercel.json` rewrites. `parseRoute` accepts the
  original pathname, a `__path` query stamped by those rewrites, and the
  `id`/`slot` query params Vercel adds when a rewrite drops path segments.
- Relative runtime imports in `relay/` now carry a `.js` extension.
  `"type": "module"` plus TypeScript's extensionless emit made the first
  deployment fail at module load (`ERR_MODULE_NOT_FOUND`) on every path that
  did reach the function, including `OPTIONS`. `relay/tsconfig.json` uses
  `module`/`moduleResolution` `NodeNext` so a missing extension fails
  `typecheck` instead of the deployment.
- Blob store failures keep the original error as `cause`. The handler logs a
  redacted form and still returns `{ error: "internal error" }` to the client.

## Unreleased — Sync P1: Blob compare-and-swap

- Replaced the relay's integer generation counter with Vercel Blob's native
  `ifMatch` / `BlobPreconditionFailedError`. Each slot is one pathname;
  `ETag` is the opaque Blob ETag. The empty-slot first write still uses
  `If-Match: "0"` and `allowOverwrite: false`.
- Overwrite of an existing slot is native compare-and-swap. The first write
  into an empty slot is not: `allowOverwrite: false` atomicity remains
  undocumented, as PR #70 recorded. Do not read this as the race being closed.
  Measured against live Blob on 15 August 2026; see the evidence entry above.
- Blob reads pass `useCache: false`. A cached pull is a wrong merge base.

## Pre-v22 import boundary retired

- Lacuna refuses backup files that still carry Deck or Folder rows, and refuses v1 deck share
  codes, with a specific error rather than converting them. Current-shaped backups and v2 course
  share codes are unchanged.
- Restoring a pre-v22 snapshot from Automatic backups now shows that same
  specific refusal, rather than a flat "Restore failed."
- Share decode still rejects a working item with no mark-scheme lines; the
  regression test is restored against a v2 course code.
- The Dexie `version(1)`–`version(21)` chain is untouched: existing databases
  still replay it. Projection reconstruction for current-shaped files that
  omit complete scheduling-unit rows is also unchanged.
- `LegacyDeckRecord` / `LegacyFolder` stay as the Dexie-chain, snapshot-builder
  and test-fixture shape. They are no longer an import path.

## Unreleased — Path authoring-gate tests

- `CoursePath` and `CoursePathSegment` now have tests for each Read/Edit
  authoring control: start/end and mid-path Manual practice, the
  practice-node pencil, Add lesson on empty and populated paths, and the
  course title rename. Each control is asserted absent in Read mode and
  present and usable in Edit mode.

## Unreleased — Locked copies stay in study even when stored as edit

- A locked distributed copy with `lessonViewMode: 'edit'` now has a
  regression test that `resolveLessonViewMode` still returns `'study'`, so
  `isLessonAuthoringMode` is false.

## Unreleased — Path Manual practice insert controls are persistent

- `docs/APP-FLOWS.md` no longer says Manual practice insert controls appear on
  hover, focus, and touch. `InsertButton` is a persistent labelled pill.

## Unreleased — Curricular practice no longer restarts the session on each answer

- Answering a card in a curricular practice session no longer blanks the screen
  or resets the progress bar. The live study-flow snapshot was rebuilding a
  fresh `scopeLessonIds` array, and `useLearnSession`'s load effect treated
  that new array as a new session.
- `CourseStudyFlow` now freezes the committed step's lesson ids, and the load
  effect keys on serialised session identity (ids, filters, practice node)
  rather than object identity. Changing course, node or filters still reloads.

## Unreleased — Read-mode authoring chrome

- Read mode is a presentation and focus mode, not a write barrier. Path and
  lesson authoring chrome now follows `isLessonAuthoringMode` (the existing
  `authoring` flag): start/end and mid-path Manual practice, the practice-node
  pencil, Add lesson on empty and populated paths and on a one-lesson course,
  and the course/lesson header rename pencil. The controls are absent in Read
  mode rather than disabled. Settings, the Question Bank, Analytics, the
  command palette and the repository are unchanged.

## Unreleased — Sync P1: relay service

- Added `relay/`, a separate Vercel project that stores opaque `state` and
  `keybag` ciphertext on Vercel Blob. Four endpoints: mint a channel, GET/PUT a
  slot, DELETE the channel. Knowledge of the id is the read capability; writes
  need the minted bearer token. No key material reaches the relay, request
  bodies are never parsed, and channel ids are never logged.
- PUT requires `If-Match` with the generation the client merged from (empty
  slot is `"0"`). A mismatch is 412. Concurrent PUTs from the same generation
  are decided by an exclusive create of the next generation key — exactly on the
  in-memory seam the tests use, and on live Blob only if Vercel's
  `allowOverwrite: false` is an atomic if-none-match, which it does not document.
  The residual race is a last-body-wins clobber; see `relay/README.md`.
- CORS and `Cross-Origin-Resource-Policy: cross-origin` are set on every
  response, including 401/404/412, so COEP on the app origin does not turn a
  relay error into an opaque network fault.

## Unreleased — Shared lesson-card exposure id

- `lessonCardExposureId` now lives in `src/db/mutationStamp.ts`. The copies in
  `repository.ts`, `sequenceRepository.ts` and `occlusionRepository.ts` import it.
  The string format is unchanged: it remains the tombstone matching key.

## Unreleased — Extract note repository

- Moved note CRUD and device-local note-annotation CRUD from `src/db/repository.ts` into
  `src/db/noteRepository.ts`. Every moved name is re-exported from `repository.ts`; no
  caller import changed. Note annotations remain un-tombstoned and absent from `BackupFile`.

## Unreleased — Extract sequence repository

- Moved sequence CRUD, regeneration and snapshot/restore from `src/db/repository.ts` into
  `src/db/sequenceRepository.ts`. Every moved name is re-exported from `repository.ts`; no
  caller import changed.

## Unreleased — Stale comment sweep after schema v22

- Corrected comments and docs that still described the hidden Deck and Folder stores, global Today
  recording against a Deck, CardList's `deck` / `allDecks` union, and UnifiedImportPanel as
  Dashboard new-deck creation. The stores are gone; Today reads `schedulingUnits`; `CardListProps`
  is `CardListBaseProps & { context: CardListContext }`. No behaviour change.

## Unreleased — Dead-code removal

- Removed unused hooks: `useCountUp`, `useAllLessons`, `useAllNotes`, `useRevisionPlan`,
  `useCourseRevisionPlans`, and `usePomodoroContext`. Production still uses
  `usePomodoroFlowContext` and `useOptionalPomodoroContext`.
- Removed unused `listRecordedUndos` / `clearRecordedUndos`. `recordUndo` remains.
- Removed unused `marksAnalytics` (and its test) and the CardList **Move to…** control.
  Production CardList callers never supplied `moveTargets` / `onMove`.
- Removed `moveCards` after that UI, plus `getRevisionPlan` (by plan id) and
  `listPracticeNodes`. Production uses `getRevisionPlanForAssessment` and
  `usePracticeNodes` / direct Dexie reads.

## Unreleased — Sync: two-device combine in Settings

- Full backup and recovery now names three jobs: export, combine with another device, and
  recover this installation. The two-device action is **Another device** / **Combine**, not a
  second merge. Recover's additive import is **Add from backup**; `importBackup(..., 'merge')`
  is unchanged.
- Combining is explained in the resting copy. Confirmation is the existing inline prompt,
  naming the file's date and card count. The success notice reports cards kept, added and
  removed — and reviews when those counts change — plus that a restore point was saved.
- `takeAutoBackup` now returns the snapshot it stored. `manualMerge` applies that snapshot
  instead of exporting the database a second time. The restore point is still taken before
  anything is merged or imported.
- Added a live-database test that `manualMerge`'s restore point is the pre-combine local
  state, that `importBackup(..., 'replace')` leaves the backups table in place, and that
  restoring from that snapshot returns the database to its pre-combine state. The same
  restore point remains usable if the replace-import fails.
- Corrected the Recover **Add from backup** description. It no longer claims the more
  recently updated copy wins a conflict. Existing items are not deleted.

## Unreleased — Sync: manual two-device merge

- Added `manualMerge` in `src/sync/manualMerge.ts`: take a forced restore point, export the
  current database, run `mergeSnapshots(local, remote)`, then apply with
  `importBackup(merged, 'replace')`. Returns before/after counts of cards, courses, lessons
  and review events. A file that fails `validateBackup`, or a failed safety backup, aborts
  before the import.
- Settings > Full backup and recovery now has a **Merge from another device** action, distinct
  from **Merge backup**. The confirmation states that data is combined, the newest edit wins,
  deletions are honoured, and a backup of this device is taken first.

## Unreleased — Sync P4: peer merge

- Added `mergeSnapshots` in `src/sync/mergeSnapshots.ts`: a pure function that takes two
  `BackupFile` values and returns a third. No Dexie, no I/O, no local/remote distinction.
- Order is tombstone-union, newest-wins content by `updatedAt` (canonical JSON on a
  same-millisecond tie), set-union of reviews by `eventId`, then FSRS replay with fuzz
  forced off. Card scheduler fields are derived from the unioned history, never taken
  from the newer card record.
- `importBackup(..., 'merge')` is unchanged. The two-device dance is merge-then-replace
  and belongs to a later slice.

## Unreleased — Sync P3: mutation timestamps and tombstones

- Schema v23 adds a `tombstones` table and a required `updatedAt` on every snapshot-carried
  row. The upgrade backfills timestamps from `createdAt` (or `lastReviewed` for cards).
- Every content write goes through one helper. Restores put the snapshotted timestamp back;
  `stampMissingLessonViewModes` is not treated as an edit.
- Snapshot-carried deletes write a tombstone in the same Dexie transaction. Course deletion
  now also removes occlusions. Undoing a deletion clears those tombstones.
- Tombstones older than 90 days are pruned after the database opens. A device offline longer
  than that must reset from a pull rather than merge.
- Backup version 10 carries tombstones. Older backups still import; merge-import unions
  incoming tombstones without applying them as deletes. Pre-migration snapshots now include
  occlusions.
- Tests now cover the remaining §7.4 contracts: one `updatedAt` assertion per remaining
  public mutation, `deleteCards` counts and rollback, a full course-delete cascade fixture,
  restore paths that must not restamp, and the leftover snapshot-carried tombstone writes.

## Unreleased — Smoother in-place motion

- Shell pages now crossfade instead of lifting in opposite directions, and `popLayout` stops
  the outgoing page stacking under the incoming one in the scroll area. Course-section
  moves still slide sideways. Full-screen study and welcome boundaries fade rather than
  drop. Incoming routes still mount immediately, so lazy imports are not held behind an exit.
- Same-surface steps share one sheet or panel and crossfade their contents: the study
  sheet's course picker and course options, Learn's reveal and grade controls (touch sheet
  and desktop), New course's create/import modes, and the course conductor's learn / step
  complete / revision-plan scenes. The study sheet also keeps the course title up while
  its options load, so that step no longer snaps twice. The conductor now derives the
  first planned step during render, so Continue cannot flash "You are caught up" into
  Learn. The conductor then commits that same object as `currentStep`, so a practice-node
  entry cannot rebuild the Learn request and restart the session. Shell fades no longer
  write a transform, they skip enter/exit when motion is reduced, and the shell root
  no longer keeps a standing scale except while settling in from the landing page.
  Learn's grade buttons no longer lift again inside `StepSwap`.
- A second pass removed the leftover page hops that the first review listed.
  Settings, course settings, dashboard cards/empty/skeleton, editor shells, Help,
  Share, the Learn session report and the Learn header no longer lift after the
  shell or `StepSwap` fade. Course-path nodes and lines no longer stagger in.
  Share, import, card-list, sidebar lesson lists and a few sibling panels fade
  instead of tweening height or margin. The mobile drawer, new-course and
  card-edit overlays, and the Learn touch sheet skip enter/exit when motion is
  reduced. Hover lifts, session-report stat choreography, and course-card hover
  detail (which still grows by height so the card can follow the pointer) were
  kept as in-scene motion.

## Schema v22 storage cutover

- Removed the hidden Deck and Folder IndexedDB stores. `schedulingUnits` is now the sole scheduling
  record, with Course and scheduling-unit performance held in their explicit target stores.
- Preserved legacy on-device upgrade compatibility through the existing
  `buildDomainStorageMigration` path. Standalone pre-v22 backups and v1 deck share payloads are
  rejected by the current portability boundary; current course share payloads continue to use
  the `LAC0`–`LAC3` encoding prefixes without treating them as support-version labels.
- Changed untargeted Anki `.apkg` imports to create a Course named after the Anki deck and place its
  cards in the Course question bank, rather than creating a Lacuna Deck.
- Made the destructive upgrade contingent on a separately committed pre-migration snapshot. A
  failed upgrade transaction leaves schema v21 readable. A successful upgrade has no in-place
  downgrade; recovery requires the previous build and the pre-migration snapshot. See the
  [schema v22 compatibility note](storage-v22-compatibility.md).
- Added rollback coverage proving the two legacy stores and review history remain readable after an
  aborted upgrade, plus successful-upgrade coverage proving review events remain byte-for-byte
  unchanged when the stores are removed.

## Unreleased — Explicit domain storage migration

- Began the approved full storage migration on `feat/storage-migration` with schema v21.
  Course- and Lesson-owned scheduling units are now materialised alongside the compatibility
  Deck rows, with separate Course calibration and scheduling-unit pacing stores. Cards and
  canonical review events carry their resolved scheduling-unit id, so later cutover slices can
  stop discovering hidden backing Decks without changing scheduling behaviour in this checkpoint.
- Kept legacy Deck/Folder stores, old backup/share/APKG formats and compatibility readers intact;
  this first slice is additive and rollback-safe rather than a premature destructive cutover.
- Cut Course calibration reads and review/undo writes over to `coursePerformance`, while Course
  pacing reads use `schedulingPerformance`. Course writes mirror the old calibration row for
  rollback, and legacy Deck sessions retain their explicit Deck key space; missing pacing rows
  continue to use downstream defaults rather than becoming zero-second estimates.
- Routed the active Course dashboard, sidebar and read-side course statistics through the same
  pacing adapter. Newly-created Course cards now carry their scheduling-unit id, and newly-created
  backing units initialise target pacing rows, so fresh installs and upgraded databases share the
  same target-store path.
- Kept target scheduling configuration current on repository Course, Lesson and assessment writes.
  Course settings cascade to inherited Lesson units, lesson exam-date/time-zone overrides remain
  authoritative, target performance rows initialise on fresh data, and Lesson/Course deletion
  snapshots restore the target rows atomically. Legacy Deck/Folder stores remain untouched.
- Closed compatibility transaction gaps at Share, lineage-merge and occlusion boundaries by
  including the target stores in their parent transactions. Added a Deck-only legacy-backup
  round-trip assertion, and made canonical review-event deduplication ignore projected ownership
  metadata so a later scheduling-unit stamp cannot duplicate one event.
- Cut active Course/Lesson Learn sessions over to the `schedulingUnits` configuration projection
  for FSRS scoring and review/time limits, with a source fallback for pre-projection databases;
  legacy global Deck sessions retain their existing configuration path.
- Kept destructive Deck/Folder removal gated because active legacy routes, global study/search/editing,
  MCP scope resolution and backup/import/share contracts still require those stores. This branch
  deliberately ends at the reviewed additive cutover instead of shipping a breaking schema deletion.
  +- Follow-up review fixes combine duplicate legacy performance profiles when several backing Decks

* resolve to one target scheduling unit, preserve legacy calibration when rebuilding a missing target
* row, and use constant-time scheduling-unit membership checks during schema upgrade.

## Unreleased — One place for study on the dashboard

- The dashboard's study control now holds the same position whether or not a study flow was
  interrupted. It resumes when there is a flow to resume, and otherwise opens the study sheet at
  its course picker. Previously it appeared only mid-flow, so the ordinary case reached study
  through a course card or the sidebar's Review today — an extra tap, and on a phone one hidden
  behind the hamburger drawer. The control stays hidden until at least one active course exists,
  so the empty state still reads as create-a-course.
- This closes the last of the learn screen redesign follow-ups. The alternatives were rejected
  deliberately: a second button in the header competes with New course at phone width, and a
  bottom-bar study entry would undo the change that gave the mobile bottom bar to course sections.

## Unreleased — Dead StudyEntry screen removed

- Removed the unused "Choose what to study" entry screen. The study bottom sheet
  (`StudySheet.tsx`) replaced it, so `StudyEntry` and its `entryHasChoice` helper had no
  production callers left anywhere; both are deleted. The file now holds only
  `StudyFlowMessage` and is renamed to `StudyFlowMessage.tsx`, which the course study flow
  still renders for its empty, blocked and caught-up states. The single-option shortcut
  documented in the "Study entry" section below is unchanged: a session with no decision
  to make still opens directly.

## Unreleased — Learn screen follow-ups reconciled

- Replaced the stale "Follow-ups, delegable once this lands" record in
  `docs/plans/learn-screen-redesign.md` with an in-place reconciliation, dated 12 August 2026,
  of all three items.
- Follow-up 1, the "Choose what to study" screen: delivered. The interstitial was replaced by a
  bottom sheet (`src/components/learn/StudySheet.tsx`) opened via `StudySheetContext` from the
  sidebar and the course path; the old `StudyEntry` screen is no longer rendered anywhere, with
  `CourseStudyFlow.tsx:15` importing only `StudyFlowMessage`. The dead component itself is being
  removed by a separate worker.
- Follow-up 2, the landing-page "SMOOTH SCROLL ON" pill: delivered. `Welcome.tsx:329-346`
  requires a `wheel` event before the pill is revealed, so on touch it never appears.
- Follow-up 3, the dashboard study control above the fold on mobile: partially delivered. The
  resume-study control sits above the fold at `Dashboard.tsx:137-156` when a study flow is
  interrupted, but it is conditional on `resumableCourse`; with none, study is reached through
  the sidebar's Review today control behind the mobile hamburger drawer or a course card's Study
  action. Whether an unconditional study entry belongs on the dashboard remains a live design
  question for Claude Code.
- Marked the learn screen redesign **delivered** in `docs/next_plan.md`, keeping only the one
  remaining open design question rather than an implementation diary, per roadmap rule 5.

## Unreleased — Deployment planning

- Recorded that Lacuna is not yet in real use and adjusted roadmap sequencing so data-integrity
  work takes priority before the September 2026 start of genuine revision history; work measured
  by observed usage remains deferred until then.

## Unreleased — Mobile navigation and course section transitions

- Fixed header text wrapping at phone widths. The course tab labels wrapped inside their own
  pills, breaking the segmented control; the dashboard header competed for about 280px between a
  4xl title and a button that would not shrink; the lesson view-mode toggle was stranded
  right-aligned on its own line once its row wrapped; and the course stat pills packed one-and-two
  to a row by whatever happened to fit. Tabs now abbreviate below sm while keeping their full
  accessible name, and the pills use a two-column grid.
- Added a mobile bottom navigation bar carrying Courses, Study, Search, Analytics and Settings.
  Deliberately opaque rather than translucent: content scrolling under a blurred bar competes with
  the icons. It mounts inside `AppShell`, so it is absent from Learn mode, which lives outside the
  shell and already pins its own grading controls to the bottom of the screen.
- Course tabs are a full-width 48px control below sm, returning to the compact pill above it.
- Moving between a course's sections now slides sideways in the direction of travel through the
  tab order, rather than using the standard page transition, so the sections read as one surface.
  The direction is passed through `AnimatePresence`'s `custom`, because an exiting element
  otherwise keeps the props it last rendered with and leaves towards the wrong side.
- Sections can also be swiped between on touch. The gesture is claimed only once movement is
  clearly horizontal, so vertical scrolling wins a close call, and it is inert outside an exact
  section route: deeper pages such as a lesson or the card editor are destinations within a
  section rather than siblings of it. The pointer is captured for the gesture and cancelled
  gestures are discarded; once the threshold is crossed, easing the finger back cannot reverse
  the selected direction.
- `COURSE_SECTIONS` is now the single source of section order, shared by the tab bar, the
  transition and the swipe, since all three must agree on what the next section is.

## Unreleased — Study entry and landing-page scroll toggle

- The study entry screen now appears only when there is a decision to make. With one way into
  the course it was a full-screen gate whose only action was "continue", tapped through before
  every session; the course page already names what Study will open and the learn header confirms
  it. `entryHasChoice` lives beside the buttons it describes in `StudyEntry.tsx` so the skip
  condition cannot drift from the screen it governs.
- This was deliberately framed as a rule rather than an exception for the single-option case: the
  screen's appearance now always means something needs choosing, so the first time an assessment
  overlaps your material the screen carries information rather than being routine.
- The landing page's smooth-scroll toggle is revealed by a wheel event rather than by any scroll.
  `useSmoothScroll` only intercepts `wheel`, so on a phone the pill offered an escape from
  behaviour that was never happening, while sitting pinned over the heading and covering a word.

## Unreleased — Learn screen: card, header and swipe undo

- The study card sizes to its content behind a 12rem floor instead of a 29rem one, and the card
  and its controls centre together as one block. Previously the card was centred within the
  region above the reveal button, so short cards floated in an oversized container while the
  leftover height collected beneath the controls.
- The study header no longer encodes progress three ways. The percentage readout and the counter
  ring are gone; focus mode and full screen moved into the card-actions menu on both pointer and
  touch. Focus mode keeps a header control while active so a chrome-less screen has a visible exit.
- The surviving progress track and pip bar now carry `role="progressbar"` and the progress value
  themselves. The removed ring had been the only accessible progress value, because the visual
  tracks were `aria-hidden` or an unvalued group.
- A swipe-committed grade now offers Undo in a toast. Undo already existed but was reachable only
  by keyboard shortcut, which is no use to the phone user who made the accidental swipe.
  Deliberate taps on Yes and No do not raise the toast.
- Added a test asserting that touch grading controls live in a `fixed bottom-0` container, so the
  thumb-zone property cannot regress unnoticed.
- Corrected two findings in `docs/plans/learn-screen-redesign.md`, both wrong for the same reason.
  The swipe finding claimed there was no answer-phase restriction, no commit threshold and no drag
  feedback; all three already existed and only the undo gap was real. The thumb-zone finding
  claimed the grading controls sat mid-screen on a phone; they are already anchored to the bottom,
  and the measurement had been taken in a resized desktop browser, which reports no touch points
  and so renders the pointer layout. Both entries are kept and marked rather than deleted.
- **Lesson for future passes:** a browser session at phone width is not a phone. Input mode
  resolves from reported touch points once on mount, so resizing a desktop window renders the
  pointer layout however narrow it gets. Verify a finding against the code before planning work
  from it.

## Unreleased — Loading placeholders and card entry animation

- Loading placeholders no longer flash. `useDelayedPending` withholds a placeholder until
  loading has lasted 250ms, and the `DelayedFallback` wrapper applies it at all fifteen
  placeholder sites, fading the placeholder in rather than snapping it on. Route chunks are
  prefetched, so warm navigation now shows no placeholder at all; the placeholder remains for
  cold chunk fetches and large courses. The delay is the enforced guarantee; a child fallback
  cannot enforce a minimum visible lifetime once its loading owner replaces it.
- `DelayedFallback` is a wrapper component rather than a hook call at each site, because
  mounting a placeholder is itself the loading signal. This avoids hoisting a hook above the
  pre-existing early returns in fifteen components, which would have risked breaking the
  rules of hooks for no gain.
- Fixed the card entry animation in `CardList`. Rows animated the first time they entered the
  virtual window, so whether a row faded in depended on how far the list had been scrolled,
  and rows revealed by scrolling staggered on their absolute card index and so always waited
  the capped delay. Rows now animate once as the list's own entrance, staggered by position
  among the rendered rows; scrolling reveals rows immediately. The `index` prop is renamed
  `staggerIndex`, since feeding it the absolute index is what caused the defect.
- Not fixed yet: the placeholder-to-content swap is still a hard cut, which reads as a
  flicker on a fast load. `AppShell` already crossfades route changes, but it animates the
  placeholder rather than the content that replaces it. Recorded in
  `docs/plans/learn-screen-redesign.md`.

## Unreleased — Course-facing Deck terminology audit

- Added `docs/course-terminology-audit.md`, tracing Course-facing Deck terminology into
  wire-format, internal scheduling and safe-rename categories. No source code or wire format
  changed.

## Unreleased — September phone performance pass

- Removed the whole-card-pool aggregate scan from the `recordReview` write transaction.
  Historical trajectory points are now sampled after commit at most once per local day;
  an existing point is detected before the card read, and sampling failure never loses a
  committed review. The benchmark now measures one call at 500, 2,000 and 10,000 cards
  plus the separate once-daily sampling cost.
- Disabled chart entry animations, moved progress bars from layout properties to
  compositor transforms, and removed persistent chrome backdrop blurs.
- Added lazy asynchronous image loading for Markdown card content and occlusion diagrams,
  route-chunk prefetching for sidebar navigation, and one combined sidebar live data read.
- Updated diagnostics to count canonical review events rather than daily trajectory samples.
- Isolated Pomodoro flow consumers from the per-second countdown, pruned virtual-list
  measurement callbacks, terminated idle share workers, fast-pathed single-unit session
  indexing, removed persistent decorative animation loops and count-up rAFs, slowed MCP
  polling while hidden, and pruned the backup-folder mirror.
- Kept `Card.history` and `sessionHistory` retention unchanged because pruning them would
  alter storage or analytics semantics while the storage migration is still in progress.

## Unreleased — Remaining performance follow-up

- Kept `recordReview` limited to the reviewed card, review event rows and performance row;
  the average-retrievability trajectory is sampled after commit at most once per day per
  unit, with no stored aggregate or cache.
- Split the share worker onto a transport-only codec so payload validation stays on the
  main thread without bundling the database, zod or mathjs into the worker.
- Moved KaTeX CSS into the lazy Markdown chunk. The final audit measured initial CSS at
  107,735 bytes / 16,210 bytes gz, down from 138,632 bytes / 24,777 bytes gz before this
  follow-up; the Markdown CSS chunk is 29,290 bytes / 8,070 bytes gz.
- Recorded the final before/after measurements in `docs/PERFORMANCE.md`: one
  `recordReview` call at 500, 2,000 and 10,000 cards, session timings, bundle sizes,
  worker size and the full test-suite result.

## Unreleased — Performance audit measurements

- Added `bun run perf:audit` for repeatable production bundle, 10,000-card session,
  and review-write measurements. The baseline values and timing protocol are recorded
  in `docs/PERFORMANCE.md` so performance changes are compared against the same work.

## Unreleased — FSRS weight-set provenance

- Recorded a short fingerprint of the `w` array on reviews written by the repository, and
  surfaced it in review-history CSV and JSON exports. The fingerprint deliberately excludes
  interval-choice settings such as `requestRetention` and does not store the weight vector.
- Landed this before any optimised weights are applied so future calibration analysis can
  attribute every new prediction to the weight set that produced it; older and imported history
  remains valid but has no fingerprint.

## Unreleased — Storage boundary follow-ups

- Routed FSRS optimisation, review analytics and diagnostics through the canonical
  `reviewHistory` event store, retaining `Card.history` as a compatibility projection while old
  backups and callers remain supported.
- Added named review-calibration read, update and undo adapters. Course/Lesson reviews remain
  Course-keyed; legacy Deck reviews remain Deck-keyed; backing-Deck pacing rows stay separate.
- Kept the physical `userPerformance` table and deferred destructive Deck/Folder storage
  migration until backup, restore, merge, deletion and undo coverage justify it.
- Made canonical review events win over stale card projections even when the shared event id's
  metadata differs, preventing compatibility reads from double-counting one review.
- Made an explicitly supplied empty canonical history authoritative, including during snapshot
  restores, so stale `Card.history` projections cannot resurrect deleted review events while
  ordinary compatibility reads continue to preserve legacy-only history.

## Unreleased — Specification accuracy audit

- Reconciled `docs/SPEC.md` with the current router, lazy-loading boundary, CourseAssessment
  storage, schema-v20 canonical review history, backup/merge behaviour, generated-card component
  names, explicit bulk selection, course archiving, motion controls and Electron MCP contract.
- Marked the v0.0.2/v0.0.3 sections as historical release notes so their former Deck UI names are
  not mistaken for current routes.

## Unreleased — Calibration harness deferred

No code changed. This entry records a decision and the findings behind it, so neither is re-derived.

- Considered building the offline calibration harness that `docs/scientific-assessment.md` §5 names
  as the highest-value scientific step, and deferred it: there is no real review corpus to measure,
  so the harness would produce nothing until an unknown future date. Recorded the deferral and its
  gate in `docs/next_plan.md`, and a status note at the head of §5 so the assessment does not read as
  active work.
- Confirmed that deferring is free. `ReviewLog.retrievabilityAtReview` is a genuine ex-ante
  prediction, computed from pre-grade state in `applyReview` and persisted in the same transaction as
  the grade, and full JSON backups preserve it. Reviews recorded now stay analysable indefinitely, so
  no data is lost by waiting.
- Noted that `src/fsrs/calibration.ts` already computes a per-day Brier score; a future harness
  extends it with horizon bucketing, log loss, calibration bins and uncertainty rather than starting
  fresh.
- Recorded two durable facts in `MEMORIES.md`: review logs do not record which FSRS weight set
  produced a prediction, which is unrecoverable once optimised weights are applied; and
  `tooling/short-term-memory/` is an external-corpus Python project, not a precedent for analysing
  Lacuna's own data.
- Two methodological questions remain open and should be settled before any harness is built:
  whether a scheduler can be validly evaluated on review data whose timing it chose, and whether
  long-horizon exam-day projection is measurable from observed intervals at all.

## Unreleased — Agent instruction split

- Split the agent instructions in two: `AGENTS.md` now holds the agent-agnostic house rules and the
  `.agent-mail` protocol, which every non-Claude worker uses by default, while `CLAUDE.md` holds only
  the Claude-specific delegation, model-choice and worker-supervision rules.
- Recorded Freebuff as the preferred delegation route ahead of Codex and OpenCode. It has no headless
  mode, so Claude writes a mailbox-aware prompt for the prompter to run rather than driving it.
- Removed GLM 5.2, which is no longer available.
- Added `MEMORIES.md` as the agent-agnostic store of durable working facts, edited in place, distinct
  from this chronological changelog.

## Unreleased — Scientific assessment

- Added `docs/scientific-assessment.md`, recording the evidence strength, modelling assumptions,
  corrected literature framing and validation priorities for Lacuna's exam-driven scheduling,
  response-time grading and assessment revision layers.

## Unreleased — Storage migration contract

- Recorded the first proposed migration boundary in `docs/plans/storage-migration.md`: Course-keyed
  calibration remains separate from backing-Deck pacing performance, review events move towards
  a dedicated recoverable event store, and no history pruning or legacy-store removal is proposed
  until backup, restore, merge, optimisation and compatibility coverage is complete.
- Kept canonical review-history ownership metadata in sync when cards move between decks or
  lessons, and dual-wrote review events imported from APKG files.
- Reduced schema-v20 migration memory use by avoiding retained event-identity JSON copies.

## Unreleased — Course/Deck boundary follow-up paused

- Hardened Course/Lesson backing-deck resolution against cross-course legacy adoption and
  concurrent duplicate creation, preserving existing scheduling calibration rows.
- Documented the reviewed stop point for the small Course/Lesson boundary pass at commit `9dd9107`.
  The remaining search, Deck-shaped component APIs, generic Deck hooks, dual UserPerformance
  semantics, portability surfaces and eventual storage migration are recorded in
  `docs/course-domain-boundary-follow-ups.md`; no further production changes are included in
  this paused pass.

## Unreleased — Arc 14 flow simplification complete

- Preserved published-course lineage on first import from both share-code entry points, so later
  classroom revisions merge into the tracked recipient copy instead of silently creating another
  course.
- Routed dashboard cards with queued classroom changes to the update-review screen, including
  single-lesson courses that otherwise skip the course overview.
- Made the sequence-editor introduction follow the selected preset instead of retaining the ordered
  list description after switching to script/dialogue mode.
- Removed the horizontal card-exit/card-entry movement after grading. The next card now fades and
  settles in place instead of making the study surface twitch left and back.
- Portalled the touch-first card-actions sheet out of the animated sticky header, so it anchors to
  the viewport instead of opening upwards from a header-height containing block.
- Made the course path the canonical manual-practice editor, exposed labelled insertion controls,
  and distinguished automatic from manual nodes without pretending custom filters are authorable.
- Kept course tabs visible from lesson views and standardised card, sequence, occlusion, linking,
  and card-import actions across lessons and the Question bank.
- Separated course sharing, card/APKG import, external batch staging, full backup, merge, and local
  replacement language. Media omissions now point directly to full backup and destructive local
  replacement requires explicit confirmation.
- Added persistent archived-course management, confirmation before course deletion, batch-discard
  protection, and shortcut-conflict rejection.
- Added targeted critical-domain coverage and a one-worker Chromium production smoke suite to CI,
  capped Vitest and Playwright at one worker, and extracted practice persistence and Learn
  card-capability rules from oversized modules.

## Unreleased — Roadmap consolidation

- Replaced the 3,700-line combined roadmap and implementation diary with a short current
  roadmap, archived the historical arc specifications, and extracted Arc 14's course-setup
  slice into the sole active implementation plan.
- New course creation now shows the seven-day local Exam date before saving, allows it to be
  changed in the same modal, rejects invalid local times, and creates the course's Final exam
  with the chosen instant and time zone while preserving the initial Lesson 1 and share-code flow.
- Portalled the New course overlay out of the mobile navigation drawer so the sidebar entry uses
  the full viewport instead of squeezing the modal into the transformed drawer width.
- Replaced competing course-header Study actions with one **Study** entry. The course conductor
  now distinguishes starting the next lesson, due review and named assessment revision before a
  session starts, while direct Practice-node and assessment selections retain their exact scope.
- Exposed the existing cross-course session as **Review today** in the configurable sidebar and
  replaced bare “Today” and retired “deck” language on that flow.
- Updated historical section references throughout the repository to point at the archive.
- Formally closed Arc 11. Its offline numeric/working authoring and grading scope is delivered;
  the model-dependent ten-minute clipboard benchmark was retired as an invalid release gate,
  while tuple answers, scaffold items and advanced maths-input work remain separate proposals.

## Unreleased — ADR for study-day time semantics

- Added `docs/architecture/fsrs-time-semantics.md`: a proposed ADR for one global
  study clock (04:00 rollover, learner-configured IANA time zone, exact epoch-ms
  instants) and the distinction between exact elapsed duration, study-day index
  and calendar-day. Implementation is explicitly deferred pending product review;
  the archived `archive/fsrs-validation` branch holds the experimental
  implementation and validation tooling.

## Unreleased — Audit correctness fixes

- Revalidated structured item payloads at the card repository, share-code and backup boundaries.
  Empty or semantically invalid v1 working schemes are rejected, payloads cannot be attached to
  cloze cards, and unknown future item versions remain intact for read-only fallback.

## Unreleased — Confirmed release-defect fixes

- Fixed the production CSP/font and analytics-load errors, restored mobile navigation focus,
  added a branded not-found route, made Method controls keyboard-operable, and named Settings,
  authoring and sharing controls.
- Added inline validation for blank course and sequence creation, consolidated toast announcements
  into one live region, corrected Working and Sequence card badges, and fixed iPhone SE Settings
  text-size overflow.
- Corrected full-backup import previews to count course lessons rather than internal backing decks.
- Added the omitted note count to course share-code previews on both import surfaces.

## Unreleased — Automated-test signal cleanup

- Removed KaTeX quirks-mode, React Router future-flag, Recharts zero-size and Happy DOM iframe
  fetch noise from the test harness and fixtures.
- Awaited asynchronous editor, lesson-management, LearnMode and report transitions instead of
  asserting before their user-visible state had settled.
- Removed expected share-validation and error-boundary logging, completed the navigation fixture
  for the Question Bank test, and closed pre-migration snapshot connections after each operation.
- The full suite now passes with 205 files and 1,774 tests without stderr output.

## Unreleased — Browser QA fixes

- Newly created lessons now open directly from single-lesson course views. Course and lesson
  headers expose inline renaming through an edit control or double-click, while distributed locked
  courses remain read-only.

## Unreleased — Preview tooling

- Removed the obsolete Cloudflare Vite plugin, Wrangler configuration and Wrangler dependencies
  now that the web application is deployed through Vercel. `bun run preview` now serves the
  production build directly with Vite instead of blocking on Wrangler's interactive agent-skills
  prompt, and the stale Wrangler deploy command has been removed.

## Unreleased — Image occlusion (Arc 6, second slice)

- Added image occlusion: upload a labelled diagram, draw boxes over it once, and one ordinary
  card is generated per box. A **label** box covers text printed on the diagram, so the author
  types nothing; a **feature** box points at an unlabelled part and is answered by uncovering its
  paired label. Every label is covered on every question face, so no card is answerable by
  reading the picture or by elimination. Schema v19 adds an `occlusions` table and an
  `occlusionRegionId` index on cards.
- Stored mask coordinates as fractions of the image rather than pixels, so masks hold their
  position at any viewport size and zoom, and persisted an explicit `shape` field from the first
  version so later geometry never has to guess what an old record meant.
- Routed editing through the same regeneration contract as sequences: moving, resizing, re-pairing
  or changing the role of a box rewrites that card's content and keeps its FSRS memory state;
  deleting a box removes its card with an undo; replacing the image warns before regenerating
  everything. Scheduling fields are never written by regeneration.
- Made generated cards read-only, badged and grouped under their owning diagram everywhere cards
  are listed, searched or shown in the command palette, matching the sequence conventions.
- Carried occlusions through backups (replace and merge), diagnostics counts, share codes and the
  published-lineage merge. A diagram is referenced only by its occlusion, never by card Markdown,
  so backup export and asset garbage collection both gather those hashes explicitly.
- Added five MCP tools — list, get, create, update and delete occlusion. `create_occlusion`
  references a diagram already stored in the install; there is no asset-upload tool, so region
  ids, roles and fractional coordinates are the whole agent-facing contract.
- Made the share-code media warning honest about diagrams. It previously counted only cards with
  an asset reference in their Markdown, which missed occlusion cards entirely; it now names them
  and says what the recipient actually receives — a placeholder for embedded files, and a text
  fallback with no image for a diagram card. Backups remain the way to move media between
  machines.
- Fixed sequence-generated cards duplicating on a lineage merge. A published course packs those
  cards like any other, so the merge both adopted the packed copy and regenerated the card from
  its sequence, leaving two per item with the adopted one frozen at the publishing revision.

## Unreleased — Audio cards (Arc 6, first slice)

- Widened the content-addressed image store into a media store without a schema migration.
  Existing records remain images; audio records carry `kind: 'audio'`, omit dimensions and retain
  the same SHA-256 deduplication, object-URL cache, garbage collection and backup round-trip.
- Added structured audio authoring to the card editor. MP3, M4A/MP4, Ogg, WAV and WebM files up to
  25 MB can be selected or recorded; the editor writes an ordinary `front_back` card containing a
  `![audio](lacuna-asset://…)` Markdown marker and an optional prompt.
- Rendered local audio markers as native players. Global autoplay and playback-speed settings live
  under Study & scheduling. The Learn face can return to the player with the R key without resetting
  the answer phase, response timer or available grading controls.
- Fixed Anki imports silently dropping audio. Supported `[sound:…]` media is now stored, rewritten
  to Lacuna's audio marker and returned with the imported card; rejected media no longer leaves a
  partial deck and cards behind.
- Prevented overlapping microphone permission requests from starting unreachable recorders, and
  made share-code warnings and placeholders describe omitted audio as media rather than images.
- Recorded the approved Arc 6 defaults: rectangle regions with an explicit shape field, all-label
  masking, a 2560px occlusion-image ceiling and desktop-first occlusion authoring.

## Unreleased — Answer forms and the revision loop (Arc 11 free-tier trial)

- Value predicates now accept an answer written as `y = 3` as well as a bare `3`. The verifier
  normalises an equation to `left - right`, so a named answer compared unequal to its own value and
  scored zero. This was found through authoring, but the study face runs the same verifier, so a
  student ending their working the natural way lost the mark too. Only a bare variable on the left
  is reduced, waypoints are untouched, and the line as written is still tried first, so nothing that
  matched before stops matching.
- Revised items can now be pasted back. Previously "Revise with AI" copied a prompt whose reply had
  nowhere to go: the per-item editor is a structured form, and the only free-text box re-parsed the
  whole batch, discarding every other item and every accept/reject decision. Each item now has its
  own paste target, and a batch-level control revises every failing item in one round trip, matching
  replies back by position and applying nothing on a count mismatch.

## Unreleased — Batch authoring hardening (Arc 11 free-tier trial)

- The batch review step now accepts a block closed by a mirrored `<<<LACUNA_ITEMS_V1>>>` instead
  of `<<<END_LACUNA_ITEMS_V1>>>`. Free-tier models mirror the opening delimiter often enough that
  a correct response was being rejected wholesale; a second opening token is unambiguous once the
  block is open, and a correct closing delimiter still takes precedence.
- The batch prompt now states the answer shape: a numeric answer and an `equals` criterion each
  take one constant expression with no variables and at most one `=`, and a multi-variable
  solution is written as one criterion per variable. Without this, a model asked about
  simultaneous equations returns `x=6,y=4` as a single answer, which both the numeric validator
  and the scheme compiler correctly reject.

## Unreleased — Verification engine corrections (Arc 11 follow-up)

- Fixed multi-variable equivalence checking. Sample signs were derived from the attempt and
  variable indices, so with two variables only the alternating sign patterns were ever drawn and
  the same-sign quadrants were unreachable: `abs(x*y)` compared equal to `-x*y`. Each variable now
  draws its own sign. The existing tests missed this because every one of them used a single
  variable, where index-derived signs do cover both halves of the line.
- Fixed domain-restricted comparisons. An expression such as `sqrt(x - 100)` evaluated to a
  non-finite value at every sampled point and did not compare equal even to itself. Sample
  magnitude now widens as attempts fail, so the sampler reaches the region where such an
  expression is defined.
- Separated "cannot check" from "wrong". Comparison returns `equivalent`, `different` or
  `undetermined` instead of a boolean, so a comparison that runs out of valid sample points is no
  longer reported as a difference.
- Working lines the checker cannot decide are recorded as `undetermined` rather than as misses,
  including lines whose scheme expression no longer parses or whose predicate arguments are
  unusable. They earn no marks but are shown as unchecked instead of a red zero, keep the dispute
  control, and carry the distinction into the persisted verdict and any dispute report. Older
  review logs without the flag are unaffected.
- Renamed `equivalentByRandomEvaluation` to `compareByRandomEvaluation`, since it no longer answers
  a yes/no question. It had no callers outside `verify.ts` and its tests.
- Recorded the greedy scheme-line matching limit in `docs/archive/roadmap-2026-08-11.md` §11.9: a student line that
  satisfies two scheme lines consumes whichever comes first, which can underscore a later line.
  Deferred deliberately, with the reproducing shape written down.
- Staged batch items no longer report "0 of N fixtures pass" when the mark scheme itself failed to
  compile. The fixtures were never run in that case, so the row now reads "Fixtures unavailable"
  and the scheme errors stand on their own.
- Removed the revision prompt from accepted staged items. Acceptance is terminal — there is no
  Edit, Reject or Restore afterwards — so the copied prompt could not be applied to anything.
- Fixed Learn mode silently mis-marking items it cannot render. A card whose `payload` has an
  unrecognised `v` or a known-but-unbuilt `kind` (currently `scaffold`, reserved but not built —
  see §11.2) used to fall through to the classic flip card with an empty back, offering the
  Again/Hard/Good/Easy controls for a question that was never actually answered. It now renders
  read-only via `UnknownItemFace` — the `front` fallback plus a plain notice — with no submit
  control and no `onAnswer` callback at all, so neither the on-screen controls nor the keyboard
  shortcuts can grade it. Only the share/backup round-trip validated unknown payloads correctly
  before this fix; study time did not.

## Unreleased — Item-type generalisation (Arc 11)

- Added the optional, versioned `Card.payload` model for structured practice items. Numeric
  and working payloads are implemented; the scaffold discriminant is reserved without a
  placeholder authoring or study surface. Backups, share codes and lineage merging validate
  known payloads fully and preserve unsupported versions as opaque values so they round-trip
  instead of being rejected — study-time handling of unsupported payloads is covered
  separately above, under the follow-up fix.
- Added an offline expression-verification engine over the restricted `mathjs/number` entry
  point. It accepts ordinary school notation, renders a KaTeX preview and checks algebraic
  equivalence through reproducible seeded evaluation rather than pretending to be a symbolic
  proof system.
- Added numeric-item authoring to the card editor: exact, tolerance and alternative-answer
  checks share a lenient maths input, live KaTeX preview and touch-sized symbol palette.
  Structured answers persist in the card payload rather than being hidden in display text.
- Added automatic numeric study marking and FSRS grade mapping. Numeric cards bypass reveal,
  typing comparison and self-grading, then persist earned and available marks in ordinary
  review history; Simple learn uses the same verdict without writing review history.
- Added line-oriented working-item schemes with independent compiler errors, plain-English
  previews, autocomplete and the v1 `equals`, `within`, `matches-one-of` and `contains`
  predicates. A built-in answer harness pins sample fixtures and reruns them whenever a scheme
  changes, and generated fixtures must actually earn their declared marks.
- Added automatic working-item study marking, per-line verdicts and deterministic checker
  dispute reports. Learners can report a whole numeric verdict or individual working line in
  FSRS-backed sessions; the submitted content, verdict and random seeds remain reproducible in
  the review log.
- Added a clipboard-only authoring pipeline. Tutors can copy a question-to-scheme prompt or
  build a note-grounded batch prompt, leave concept density and item count to the model or set
  either constraint independently, then paste the delimited result into a visual staging view.
  Each proposal is validated independently and can be edited, accepted, rejected or returned
  to a chatbot through a complaint-aware revision prompt. Lacuna stores no model key and sends
  no notes itself.
- Added optional exam-board and specification provenance to courses and Course Settings. Both
  values are plain strings, commit on blur, clear cleanly when blank and enter note-grounded
  batch-generation prompts only when present; no curriculum taxonomy or schema version was added.
- Clarified that batch generation creates durable concept checks rather than arbitrary-number
  worksheets. Working-item prompts now prefer reusable symbolic methods and derivations, and the
  authoring dialog states that parameterised exercise variants are not supported yet.
- Reserved generated `numeric` items for constant scalar answers. Generation and revision prompts
  now direct formula recall and all other variable-bearing answers into checked working items or
  omit them, preventing symbolic equations from being mislabelled as numeric answers.
- Disabled the PWA service worker in development and deduplicated React-family dependencies in Vite.
  Development startup also unregisters existing workers and clears their stale runtime caches.
  Modules can no longer be served from different optimiser cache generations, which previously
  caused invalid-hook crashes after route changes.
- Added structured numeric and working payloads to `lacuna.create_card` and
  `lacuna.update_card`. MCP writes use the same numeric validator, mark-scheme compiler and
  fixture runner as the visual editor and staging path.
- Added pure marks-analysis helpers for machine-marked review totals and criterion-labelled
  working performance, ready for later readiness and diagnostic UI.
- Measured the shipped verifier boundary: a standalone minified bundle of `verify.ts` plus
  `mathjs/number` is 153.75 KB (43,571 bytes gzip); the production application chunk containing
  it is 648,459 bytes minified (187,658 bytes gzip). These figures are recorded as measured
  boundaries, not falsely attributed to mathjs alone.
- Completed an in-app-browser close-out pass covering hand authoring, a passing 2/2 fixture,
  numeric and working study, an FSRS-backed checker dispute, batch prompt/staging/revision,
  lesson acceptance and a four-item share-code export/import. Deterministic sample model output
  was used; no external chatbot was contacted.
- Smoothed the end of each lesson with a staged, motion-speed-aware transition into the
  completion result and next-step controls instead of replacing the card surface abruptly.
- Fixed broken images in fresh and existing seeded Welcome courses. Bundled SVGs now use the
  asset layer's durable byte representation, and startup repairs missing or legacy Blob-backed
  seed assets without touching user images.
- Kept practice-session chrome mounted across Yes and No answers. Cards now hand off with a
  short motion-speed-aware transition while the objective track and ring interpolate from their
  previous values, removing the false impression of a page refresh or progress reset.
- Added an exhaustive manual website release checklist covering every current route, authoring
  path, study mode, setting, import/export flow, responsive state and explicit deferred boundary.
- Added Arc 13 as a bounded post-feature consolidation and release-verification pass covering dead
  and duplicate code, oversized modules, test/build warning hygiene, bundle baselines and execution
  of the complete website checklist.

## Unreleased — Browser QA

- Completed a desktop and mobile in-app-browser audit across every application route and
  recorded the coverage, reproduction steps and verification results in
  `BROWSER_QA_AUDIT.md`.
- Corrected Share guidance that confused `LAC0–LAC3` encoding prefixes with share-payload
  versions.
- Updated Help text to match the current course picker, course-settings ownership and
  configurable lesson unlocking, and removed the nonexistent automatic Cram dropdown.
- Added accessible names to previously unnamed settings and practice-node switches.
- Applied the interrupted forgetting-curve logo consistently across the app and package icon.
- Added pasted LAC share-code import to the New Course flow, with preview and safe copy import.
- Replaced the dashboard's deck-era predicted-score rail with a selectable course-card
  metric: completed curriculum lessons, reviewed-card coverage or today's workload. Ready
  counts now exclude future-scheduled reviews.
- Course and lesson header pills now use the dashboard's count-up animation, including the
  configured motion speed and reduced-motion behaviour.
- Added a right-click and keyboard context menu to dashboard course cards. Its confirmed Archive
  action preserves all course data, removes the course from active study and offers reliable Undo.
- Added consistent transitions between the app shell, welcome page and full-screen study routes,
  including practice-session exits, animation-speed settings and reduced-motion handling.

> **GitHub Release Note for v0.1.0**
>
> This release completes the Course Architecture Plan: Lacuna is now organised around
> **courses, lessons, notes and cards** throughout the UI. The legacy deck and folder
> surfaces are gone; scheduling, sharing, search, analytics and settings are course-aware.
>
> **What's new**
>
> - **Course model** — courses with ordered lesson paths, notes, practice nodes, exam
>   checkpoints, question bank, course settings and course-scoped learn sessions.
> - **Migration** — existing decks and folders upgrade automatically to courses and lessons
>   (schema v9); v1 share codes still import.
> - **Teacher tooling** — add lessons, configure lesson session filters, author manual
>   practice nodes, manage exam dates, undo course deletion.
> - **Analytics** — per-course analytics on the path; global analytics compares courses.
> - **Simple learn mode and recall presentation** (from v0.0.3) — algorithm-free YES/NO
>   study loop; Basic, Reversed and Cloze cards with optional type-before-reveal feedback.
>
> **Note:** internal `decks`/`folders` tables remain as hidden backing storage; dropping them
> is deferred to a later migration. See `docs/archive/roadmap-2026-08-11.md` for Arc 1 (sequence learning).
>
> **Full changelog below**

## Unreleased — Handwritten maths input prototype (Appendix A.2)

**No application changes.** Everything here lives in `tooling/handwriting-maths/`, an
exploratory prototype with no integration commitment, following the precedent of
`tooling/short-term-memory` and `tooling/semantic-answer-match`. It is not imported by
the browser or Electron builds, and `src/` is untouched. The deliverable is knowledge;
promotion to a numbered arc is a separate, later decision.

- **The question:** can a young student write `x^2 + 3` with a finger faster and more
  happily than they can find `^` on a keyboard? Two separable halves — recognition
  accuracy, and input preference. The preference half survives a poor recognition
  result, and is what feeds Arc 11 §11.3's palette design.
- **Recognition pipeline, all four stages** as pure, unit-tested modules: stroke capture
  and normalisation (`strokes.ts`), stroke grouping into symbols (`group.ts`), symbol
  recognition via the $P point-cloud recogniser (`dollarP.ts`), and baseline/superscript
  layout parsing into an expression string (`layout.ts`), joined by `interpret.ts`.
  $P rather than the $1 recogniser the plan named, because $1 is single-stroke only and
  cannot represent `=`, `x` or a two-stroke `4`. Fraction bars are out of scope for this
  pass. Scoped to nineteen symbol classes at 11+ level, not GCSE.
- **Preference harness** (`trial.ts`): three arms — written, typed, tapped — over
  identical targets, with Latin-square ordering so no method is systematically first,
  median-based summaries over correct entries only, and CSV export.
- **First session (22 July 2026), one adult, one phone.** Median entry: tapped 5.25s,
  written 5.66s, typed 6.84s. The finding worth carrying forward is the cost of `^`:
  typing a superscript target cost +2.21s against +0.47s for handwriting, and the two
  slowest typed entries of the session were exactly the two superscript targets. That is
  a direct input to Arc 11 §11.3 — `^` is the expensive character, and it is expensive
  even for a 115 WPM typist. Recorded with its caveats in the tooling README: n = 1, and
  the canvas arm is self-scored and produces no string, so its figure is a lower bound
  until the retained ink can be scored by `interpret()`.
- **Dataset and licence position recorded** before any training happens: MathWriting and
  CROHME are CC BY-NC-SA, HASYv2 is ODbL. Lacuna sells nothing so NonCommercial is not
  the obstacle; **ShareAlike** against the repository's MIT licence is. Irrelevant while
  nothing ships, decisive if handwriting input is ever promoted into `src/`.
- **`docs/archive/roadmap-2026-08-11.md` correction:** Arc 11 §11.3 claimed mathjs was "already shipped". It is
  not a dependency. The line now names adopting it as a decision the arc must make,
  weighed against a purpose-built parser, and pins the KaTeX claim to the packages that
  genuinely are present (`katex`, `rehype-katex`).

## Unreleased — UI de-clutter and navigation restructure (Arc 10)

No new capabilities — every change is navigation, layout, or consolidation of features
that already existed, following a July 2026 audit of redundant entry points, hidden
features and unstructured settings pages.

- **Study Today merged into the Dashboard.** Each Dashboard course card now has a direct
  **Study** action; the "resume active session" banner moved from the old Study Today
  page to the top of the Dashboard. The standalone page is gone and `/study` now
  redirects to `/`, the same shim pattern already used for `/deck/:deckId`. The `learn`
  sidebar nav item (labelled "Study today", pointing at `/study`) is removed; existing
  stored sidebar settings drop the stale entry automatically while preserving the order
  and visibility of everything else.
- **Shared course tab navigation.** A new `CourseTabs` component (Path / Question bank /
  Analytics / Settings) is now rendered on all four course surfaces, replacing
  CoursePath's small breadcrumb-row icon links — every course surface is one click from
  every other in any direction.
- **Editors return to where you came from.** Opening the card or sequence editor from
  the Question bank vs. from a lesson now sends its "back" link, Cancel and post-save
  navigation to the surface you actually opened it from, instead of always falling back
  to the Question bank.
- **CourseSettings regrouped, and now commits instantly.** The nine settings sections are
  grouped under five headings (Basics, Study, Content, Assessments, Danger zone) behind
  a scrollspy side-rail matching global Settings, extracted into a shared component that
  also gained a mobile fallback (a sticky section jumper) for viewports below `xl`, where
  the rail previously simply disappeared.
  **Behaviour change:** the previous split save model — some fields staged behind a
  sticky "Save changes" button, others (exam dates, lesson management, practice nodes)
  committing instantly — is gone. Every field on Course Settings now commits
  immediately: text and numeric fields on blur (with the same validation/clamping as
  before), toggles and selects on change, and the target-retention slider once per
  drag rather than on every tick. There is no longer a way to edit a setting and back
  out without saving.
- **Discoverability fixes:** the sidebar's Search entry now opens the command palette
  directly and shows the `Ctrl/Cmd+K` hint, rather than just linking to `/search`; the
  Help and Method pages now cross-link each other, so `/method` is reachable outside the
  one-time `/welcome` flow; the global Analytics page's course comparison links each
  course's name to its own `/course/:id/analytics`.
- **Upcoming assessments surfaced on the course path.** CoursePath's header now shows a
  compact strip of upcoming assessment dates (checkpoints and the final), reusing the
  existing `AssessmentDetailSheet` on click, so exam dates are visible without opening
  Course Settings.

## Unreleased — Classroom distribution: versioned courses and re-import merge (Arc 7)

Schema v18. Teachers can now **Publish** a course so that re-sharing an updated code
merges into a student's already-imported copy instead of always creating a duplicate.

- Added a teacher-side **Publish** action (schema v18, `Course.distribution`) that stamps
  a course with a stable lineage id on first publish and increments a revision counter on
  every subsequent publish; the teacher's own course is never locked and stays freely
  editable and re-publishable.
- Added a re-import **merge path** (`src/db/mergeImport.ts`) for students who have already
  imported a published course: new lessons/notes/cards apply immediately, and edits or
  removals of material the student has not touched apply automatically once the student
  opts in per course (`autoAcceptUpdates`) or otherwise queue for later review
  (`pendingMergeReviews`). A student's own edit is never silently overwritten — a conflict
  between a student's change and an incoming teacher change always queues, leaving the
  student's version active. Sequence content changes continue to flow through the existing
  sequence-regeneration path unchanged.
- Added a **locked/read-only mode** for a student's imported copy of a published course:
  lesson, note and card editing is disabled while the copy tracks its teacher's lineage.
  Students can **detach** at any time (a one-way action) to unlock the course and edit it
  freely, at the cost of no longer receiving merged updates from that teacher.
- Added a **review panel** for queued updates: an "Update available" badge on the course
  card and a "Review updates" link in the course header open a page listing every
  outstanding update, removal and conflict, with per-item and bulk (Accept all) actions.
  Conflicts default to keeping the student's own version. Accepting "Accept all" never
  overrides a student's own edit — conflicts always stay queued for an individual
  decision.
- Added an **"Apply updates automatically" toggle** to a shared course's settings, so a
  student can opt a course into silently applying future teacher updates instead of
  queuing them for review.
- Re-scanning or re-pasting a share code for a course already imported now **updates that
  course in place** instead of creating a duplicate: the preview shows what revision it
  would update to, and confirming applies the merge, reporting what changed and whether
  anything needs review. Re-scanning a code that is not newer than the local copy is
  reported as already up to date, with nothing applied.
- Added two MCP tools for agent-driven distribution: `lacuna.diff_lineage_update`
  (read-tier) previews what a re-published share code would change against a tracked
  course without writing anything, and `lacuna.apply_lineage_update` (write-tier,
  consent-gated) applies it through the same merge path the app uses, including
  resolving queued review items.

## Unreleased — Assessment-aware revision planning (Arc 3)

- Unified checkpoint and final assessments under stable `CourseAssessment` ids with independent
  path placement, prefix or custom lesson coverage, explicit card exclusions, validation and
  full backup/share/MCP round-trips.
- Made checkpoint nodes interactive and added exact assessment details. Relevant Practice nodes
  and Study now offer named assessment revision without silently replacing ordinary curriculum
  work or mixing overlapping assessment horizons.
- Added one persistent multi-day plan per assessment with editable daily windows, explicit
  assessment/plan/window provenance, safe leave-and-resume behaviour, deterministic explained
  replans, factual completion summaries and read-only archival after the deadline. Revision never
  completes a curricular Practice milestone or includes untaught, excluded or unavailable cards.
- Integrated the benchmark-selected `half-life-logistic-v3-routed` runtime through the existing
  expected-gain boundary. Exact-second predictions blend smoothly back into ordinary FSRS-6,
  simulated outcomes apply one normal FSRS transition, coefficient and feature validation use the
  typed Practice fallback, model-version changes explain replans, and readiness remains gated on a
  valid prediction with uncertainty. Successful simulations retain the established deterministic
  Good convention; local terms use the documented 500-example threshold and 1,000-example
  shrinkage prior.
- Retired the legacy `?mode=cram` entry and its 48-hour weakest-first product claims. Help,
  Welcome, the seeded example course, README and SPEC now describe the shipped named-assessment
  flow, local-only privacy, retry, milestone, replan and archival semantics consistently.

## Unreleased — MCP server and shared UI foundations (Arc 2 / Arc 5)

The Electron implementation now contains the Arc 2 MCP surface. A real MCP-client
end-to-end smoke pass has completed: tool listing, implicit read grants, blocking
write/destructive consent, destructive-with-undo, idempotent import preview/import, and
the cold-start renderer-not-ready case all behaved as designed.

- Added a versioned MCP tool registry backed by the existing repository/read layers: course,
  lesson, note, card, sequence and exam-date reads and writes; analytics-style summaries;
  destructive/bulk operations; and idempotent card-import preview/import.
- Added the Electron-only stdio server using the pinned official MCP SDK. The main process
  owns the transport while correlated IPC calls execute handlers in the renderer, where
  IndexedDB lives. Calls time out cleanly when the renderer is unavailable, and the web
  bundle does not import the SDK.
- Added per-process, course-scoped permissions. Reads are granted implicitly with an in-app
  notice; first-time write/destructive calls block on human consent. The Electron-only MCP
  Settings section reports server status and lets the user grant or revoke read, write and
  destructive access. Grants disappear when Lacuna closes.
- Added renderer-side scope resolution for ID-only inputs, rejecting missing entities,
  mismatched ownership and multi-course calls before consent. Destructive/bulk actions keep
  their repository snapshots inside the renderer and expose an in-app Undo action without
  leaking the snapshot to the MCP client.
- Added the shared `ConfirmInline`, warning colour tokens, reorder-chevron reuse and a typed,
  token-backed `Select` component. The shared select is adopted by sequence, practice-node,
  card-list and course-comparison controls. Split the former 1,519-line Settings page into a
  thin composition over ten section modules while preserving its scrollspy and navigation.

## Unreleased — Sequence learning (Arc 1 v1 slice)

Adds overlapping-cloze **sequence learning**: authoring an ordered list once (the periodic
table, a timeline, a chain of steps) generates a full set of ordinary FSRS cards, each
cueing recall from a configurable window of preceding items. See `docs/archive/roadmap-2026-08-11.md` Arc 1 for
the design; the v2 lines-mode slice is not part of this release.

- Added lesson edit-mode authoring for `LessonCardLink`: teachers can search and link
  existing course cards without moving or duplicating them. Linked cards are visibly marked,
  excluded from destructive bulk actions, and can be removed from the lesson without deleting
  the shared card.

- Added `Sequence`/`SequenceItem` types (`src/db/types.ts`) and one optional field on
  `Card`, `sequenceItemId`, present iff the card was generated from a sequence item.
- Added schema **v11** (`sequences: 'id, courseId, primaryLessonId, createdAt'`, plus a
  `sequenceItemId` index on `cards`) — additive, no upgrade needed. (v10 was already taken
  by the lesson-view-mode override above, so sequences landed at v11 rather than v10.)
- Added a pure generation/regeneration module, `src/db/sequenceGeneration.ts`: derives
  positional (and, optionally, label -> value) cards from a sequence's items, and diffs a
  previous against an edited sequence to update/regenerate/delete only the affected cards
  while preserving FSRS memory state wherever the recall target is unchanged.
- Added repository CRUD (`src/db/repository.ts`): `createSequence`/`updateSequence`/
  `deleteSequence`/`listSequences`, plus `snapshotSequence`/`restoreSequence` for the
  standard undo pattern.
- Wired sequences through **backup export/import** (replace and merge), **diagnostics**
  bundles, and **course share codes** as an additive v2 field, with id remapping for
  sequences, items and their generated cards' `sequenceItemId` (including label-card
  suffixes) on import.
- Added the **sequence editor** (`src/pages/SequenceEditor.tsx`) at
  `/course/:courseId/sequence/new`, `/course/:courseId/sequence/:sequenceId/edit`, and a
  lesson-scoped `/course/:courseId/lesson/:lessonId/sequence/new`, with entry points beside
  "Add card" in Lesson View and the Question Bank.
- Reworked sequence item entry with add-below controls, a trailing append control,
  responsive 44px actions and accessible item labels. Newly added items are focused and
  scrolled into view, while `Ctrl/Cmd+Enter` inserts after non-empty item content without
  allowing blank chains.
- Grouped and badged generated cards across management surfaces: `CardList` groups a
  sequence's cards under its name (`SequenceCardGroup`) and excludes them from bulk-select;
  a `SequenceBadge` marks generated cards in global search and the command palette; the
  card editor renders generated cards read-only (edit the sequence instead).
- Styled the cue items distinctly from the recall prompt on generated cards in Learn mode
  (`CardContent`'s `sequenceCue`), with no FSRS or session-flow changes.

## Unreleased — Sequence learning (Arc 1 v2 slice: lines mode data layer and editor)

Adds the **lines mode** skin to the existing overlapping-cloze `Sequence` model, for
memorising scripted scenes: paste a script, tag each line's speaker, and only "your"
lines generate recall cards — other speakers' lines are cue-only context. See
`docs/archive/roadmap-2026-08-11.md` §1.5. The study-flow half (first-letter hints, strict grading in Learn
mode) is a separate, not-yet-started slice.

- Added `Sequence.mode?: 'list' | 'lines'` and `Sequence.mySpeaker?: string`, plus
  `SequenceItem.speaker?: string` (`src/db/types.ts`). All additive and optional — no
  schema/index change was needed, and every existing (list-mode) sequence is unaffected.
- Extended `src/db/sequenceGeneration.ts`: only the item whose `speaker` matches
  `mySpeaker` generates a card in lines mode (`isMyLine`); other speakers' lines still
  count towards the cue window and render as `NAME: line` in generated fronts (`cueText`),
  so a card reads like a script. The first-in-scene prompt reads "First line?" instead of
  "First item?" in lines mode. Regeneration/diffing needed no new logic: `diffRegeneration`
  already keys on `sequenceItemId`, so switching `mySpeaker` diffs like any other edit
  (deletes the old speaker's cards, creates the new speaker's).
- Added `src/db/scriptSplitter.ts` (`splitScript`): a pure parser that turns pasted script
  text into speaker-tagged items, recognising `NAME: dialogue` lines and folding
  non-matching following lines in as wrapped continuations.
- Added `src/components/sequences/ScriptPasteImport.tsx`: a paste → preview → correct →
  confirm modal (mirroring `LinkCardsDialog`'s shell) around `splitScript`, so the author
  can fix a misattributed speaker or line before it replaces the editor's items.
- Extended the sequence editor (`src/pages/SequenceEditor.tsx`,
  `src/components/sequences/SequenceItemRow.tsx`): a List/Lines mode picker at creation
  time (mode is fixed once a sequence exists), a per-item speaker field in lines mode, a
  "my speaker" picker built from the speakers already entered, and a "Paste script…"
  entry point for the splitter. Saving is blocked until a speaker is chosen.
- Extended portability: `sequences`' `mode`/`mySpeaker`/`speaker` ride through backup
  export/import unchanged (generic per-table copy already round-trips whole `Sequence`
  objects) and through course share codes as further additive v2 keys (`m`, `ms`, `sp` on
  `ShareSequence`/`ShareSequenceItem`) — older v2 codes without them still parse.

## Unreleased — Lesson view study/edit mode

- Locked curriculum lessons now remain locked for study but can be opened for
  authoring while the course is in Edit mode. In Edit mode, lessons can also be
  reordered directly on the course path by holding and dragging a lesson node;
  `Alt+ArrowUp`/`Alt+ArrowDown` provides the keyboard equivalent, while the
  existing Course Settings controls remain available.
- Split `LessonView` into two modes instead of always showing full notes/cards
  CRUD: **study** (the new default) renders notes read-only and shows a cards
  summary (count, due count, mastery %); **edit** is the previous full-CRUD
  behaviour, unchanged. Added `LessonNotesStudyView` (`src/components/notes/`)
  and `LessonCardsSummary` (`src/components/cards/`) for the study-mode
  sections.
- Added a persisted global default (`src/state/lessonViewMode.ts`, mirroring
  `practiceDefaults`/`motionSpeed`) with a toggle on the Settings page, and an
  optional per-course override (`Course.lessonViewMode`, schema **v10**,
  additive) with a toggle on Course Settings (`LessonViewModeSection`,
  `src/pages/settings/`).
- Added `src/course/lessonViewMode.ts`: `resolveLessonViewMode` (course
  override, else global default) and `canEditLessons`, a single gate for
  whether edit mode is available at all — today always `true`, but the sole
  hook point for a future teacher/student locked-course sync.

## Unreleased — Landing page

- Welcome path is now a playable micro-course: interactive exam curve (drag the
  horizon; also drives the dashboard mock), multi-card grading demo, interactive
  path demo that unlocks later nodes, practice queue instead of a feature grid,
  and a soft-gated checkpoint CTA. British English throughout.

## 0.1.0 — Course architecture

Completes the migration from `Folder -> Deck -> Card` to `Course -> Lesson -> Note + Card`
(Arc 0 in `docs/archive/roadmap-2026-08-11.md`). The course model is built, the UI is cut over, and legacy
deck/folder surfaces are removed. Internal backing decks remain in storage only.

- Added the course domain types in `src/db/types.ts`: `Course`, `CourseExamDate`,
  `Lesson`, `Note`, `LessonCardLink`, `PracticeNode`, `UnlockMode`, plus optional
  `courseId`/`primaryLessonId` on `Card` and `courseId` on `SessionHistoryEntry`
  and `UserPerformance`, and the matching optional `BackupFile` arrays.
- Added schema **v9** (`src/db/schema.ts`) with six new stores (courses, lessons,
  notes, lessonCards, practiceNodes, courseExamDates) and an additive upgrade that
  folds each standalone deck into a single-lesson course and each folder into a
  course of ordered lessons, then stamps `courseId`/`primaryLessonId` onto cards,
  session history and performance rows. Mapping lives in `src/db/courseMigration.ts`
  (pure, with an injected id generator); decks with a missing folder reference are
  treated as standalone so none are dropped.
- Added UI-independent repository CRUD for courses, lessons, notes, lesson-card
  links, practice nodes and course exam dates (`src/db/repository.ts`), reusable by
  both the future course UI and any AI authoring path.
- Carried the six new tables through export, import (replace and merge), automatic
  backups and diagnostics, mirroring the existing folders handling; older backups
  without the new arrays still import.
- Introduced `SchedulerConfig` and widened the FSRS core (forward simulation,
  horizon, progress, objective) plus `studyPool` and `examEveAvailable` to accept
  any `SchedulerConfig`, so the engine can schedule a Course as well as a Deck with
  no behaviour change for decks.
- Added `src/fsrs/examDate.ts` (per-card exam-date resolution: lesson override, then
  nearest applicable future checkpoint, then the course default) and
  `src/fsrs/practice.ts` (`shouldInsertPractice`, the auto-practice insertion rule).
- Fixed a pre-existing flaky test: `portability.test.ts` relied on the wall clock
  advancing between two writes, so the merge tie-break test failed intermittently in
  the warm full-suite run.

### Notes engine (course UI groundwork)

- Extended `MarkdownView` with an opt-in `allowEmbeds` prop (default `false`). When
  set, bare YouTube (`youtube.com/watch?v=ID`, `youtu.be/ID`) and Vimeo
  (`vimeo.com/ID`) URLs on their own line become responsive 16:9 iframes on the
  privacy-first embed hosts (`youtube-nocookie.com`, `player.vimeo.com`), and
  `<details>`/`<summary>` collapsibles render. Card rendering stays on the default
  path and is byte-for-byte unchanged.
- Hardened the embed path against untrusted, imported content: the sanitise schema
  restricts iframe `src` to the two embed hosts by regex (so a malicious `src` is
  stripped) and limits iframe attributes; a follow-up plugin removes any sourceless
  iframe shell left behind. The embed-wrapper's layout classes are whitelisted so
  the responsive box survives sanitisation. Render-cache keys are namespaced by
  `allowEmbeds` to avoid cross-mode collisions.
- Extended `MarkdownEditor` with a matching `allowEmbeds` prop that adds
  "Collapsible" and "Video" toolbar actions and forwards the flag to its live
  preview; card editors are unaffected.
- Added `src/components/notes/LessonNotes.tsx` (collapsible per-note renderer) and
  `src/components/notes/LessonNoteEditor.tsx` (single-note editor; persistence is
  injected via `onSave`, so it suits both the lesson-view CRUD flow and any AI
  authoring path).
- Added tests covering embed conversion, the responsive wrapper, the two security
  cases (disallowed host and `javascript:` src both stripped), the `allowEmbeds`
  guard, collapsible rendering, and note ordering/rendering.

### Course path and data layer (UI groundwork)

- Added `src/state/useCourseData.ts`: reactive Dexie live-query hooks for courses,
  lessons, notes, course/lesson cards, practice nodes and exam dates, mirroring
  `useData.ts`. `useLessonCards` unions primary-lesson cards with
  `LessonCardLink`-linked cards, de-duplicated by id.
- Added `CourseSummary` and the pure `computeCourseSummaries` (lesson/card counts,
  mastery, unreviewed, eligible), computed with the Course as the `SchedulerConfig`;
  extension-lesson cards are excluded from all counts and orphaned card sets are
  guarded. Plus `useCourseSummaries` and the aggregated `useCourseDashboardData`.
- Added `src/course/path.ts`: pure course-path logic — live linear release-date
  cascade (skipping extension lessons), lesson unlock resolution for open/linear/
  semi-linear modes, lesson status, path assembly with derived checkpoint
  placement, and the curriculum "Lesson X of N" position.
- Added presentational path-node components under `src/components/course/` (lesson
  node, checkpoint marker, connecting line) and a registry-pattern renderer that
  falls back to an "Unrecognised step" placeholder for unknown node types, so a
  course exported by a future build still renders.
- Added tests for `computeCourseSummaries` and the full path module.

### Course and lesson pages (UI groundwork)

- Add the CoursePath page (route `/course/:courseId`): renders the lesson path with
  per-segment completion styling, the nearest upcoming exam date, and curriculum
  position and mastery shown as distinct labelled metrics; courses with exactly one
  lesson render the lesson inline instead of a one-item path.
- Add the LessonView page (route `/course/:courseId/lesson/:lessonId`, also rendered
  inline for single-lesson courses): full notes CRUD (add, edit, two-step inline
  delete, up/down reorder) over the Phase 3 note components, plus a read-only card
  list. A temporary Study control bridges to the existing deck-based learn flow until
  a course/lesson-aware learn mode lands.
- Make `CardList`'s "New card" action optional so the lesson card list can omit it
  until lesson card creation arrives (Phase 5).
- Wire both pages as lazy-loaded routes in `App.tsx`.

### Course UI cutover (Phases 4c)

- The dashboard is now a responsive course grid (new `CourseCard`) backed by `useCourseDashboardData`, keeping the study-signals header, "study all" entry and review heatmap; the deck/folder grid, folder tree, drag-and-drop, multi-select, merge, move-to-folder, deck sort and inline deck/folder creation were removed from it.
- The sidebar now lists active courses and their lessons (multi-lesson courses collapsible, single-lesson courses plain links, with a per-course due badge); folder/deck drag-and-drop and folder create/rename/delete were removed. Added `useAllLessons()` to back the lesson tree.
- The bare `/deck/:deckId` route now redirects to the dashboard; the deck learn, card-edit and settings routes remain so the lesson pages can bridge to them until a course/lesson-aware learn mode and lesson card creation arrive.

### Cutover fixes (browser verification)

- Removed the duplicate "Cards (N)" heading on the lesson view: `CardList` gained an optional `hideHeader` prop so the embedded list no longer repeats the heading `LessonView` already renders (other callers unaffected).
- Fixed the `MarkdownEditor` toolbar overflowing when `allowEmbeds` is on (the Collapsible and Video actions overlapped and clipped): the toolbar now wraps instead of silently overflowing a hidden scroll region.
- Fixed the dashboard seven-day forecast showing "Unknown deck": the course cutover stopped passing decks to `StudySignals`, so the forecast now groups slices by `courseId` (falling back to `deckId` for legacy cards) and resolves names and colours from the active courses (`DeckForecastSlice.deckId` renamed to `sourceId`).

### Course-scoped sharing and question bank (Phase 5)

- `SharePage` now exports and imports whole courses instead of individual decks: pick a
  course, generate a share code, QR code or plain-text export directly from it. Share
  codes moved to payload v2 (course metadata, ordered lessons with notes and cards, exam
  dates); legacy v1 deck codes are now recognised and refused rather than converted.
  Typing-answer cards round-trip through the compact `k:3` type code alongside Basic and
  Reversed.
- Added the Question Bank page (route `/course/:courseId/bank`): every card in a course
  grouped by lesson, with an Unassigned bucket for cards not tied to a lesson, bulk
  assign-to-lesson from the card list, and unassigned card creation backed by a lazily
  created per-course bank deck.
- Fixed a regression from the export rewrite: the pre-generation warning that images in
  the selected material will be replaced with placeholders was dropped when the export
  flow moved from decks to courses. Reinstated it against the selected course's cards
  (`referencedAssetHashesInCards`).

### Course-scoped sessions and practice nodes (Phase 6)

- Widened `session.ts` to `SessionUnit` scopes (deck/course/lesson, `LessonCardLink`-aware)
  and `recordReview` to `SchedulerConfig` with a deck/course discriminator; course reviews
  bump `Course.lastInteractedAt` and populate `sessionHistory.courseId`. Cards linked into
  multiple lesson units are deduped in the serve pool by card id, scored via the
  `primaryLessonId`-owning unit or else the most urgent matching unit (previously entered
  the pool once per unit with last-write-wins priority by map order).
- Added practice nodes on the course path: `practice-auto`/`practice-manual` `PathNode`
  variants, manual `PracticeNode` records and `shouldInsertPractice` auto slots woven into
  `buildPath`, a distinct `PracticeNode` component, and clicks wired to the course practice
  session route. A due-count snapshot no longer keeps the volume trigger latched after it
  fires — only the `practiceMaxGap` backstop can insert another auto slot until a manual
  node re-arms the volume trigger.
- Added `/course/:courseId/learn` (practice over due course cards) and
  `/lesson/:lessonId/learn` (new cards, including `LessonCardLink`-linked cards) routes,
  replacing `LessonView`'s temporary shadow-deck study bridge.
- Wired `nextLessonUnlockCondition` and `ratchetLessonUnlock` on session completion in
  semi-linear mode: the one-way `unlockedAt` ratchet advances once a lesson is taught and,
  where a manual practice node sits in the slot after it, that practice session is also
  completed. Auto practice nodes deliberately do not gate the ratchet, since they are
  recomputed from a volatile due-card snapshot and would make the one-way ratchet flap.
- Added a `kind` (deck/course) discriminator to `ReviewUndo`.
- Fixed a `tsc -b` break in `QuestionBank.test.tsx` and `SharePage.test.tsx`: their fixtures
  predated the Course practice fields (vitest does not type-check, so this only surfaced on
  the project build).

### Settings and course management (Phase 7)

- Extracted `DeckSettings.tsx` (848 lines) into reusable pieces under `src/pages/settings/`:
  `SchedulingFieldsSection` (pure controlled fields), `OptimisationPanel` (generalised to a
  `{ id, fsrsParameters, autoOptimise }` entity with an `onUpdate` callback instead of calling
  `updateDeck` directly), `DangerZoneSection` (delete-with-undo-toast, parameterised), and the
  `parseSteps` helper, so the new `CourseSettings.tsx` can share them. Added a `DeckSettings`
  smoke test to guard behaviour through the extraction; `DeckSettings.tsx` and its route remain
  as the legacy deck-scoped settings surface until Phase 8.
- Added `src/state/practiceDefaults.ts` (localStorage-backed, mirrors `optimiseSetting.ts`
  conventions) for the `autoPractice`/threshold/urgent-window/max-gap fields on `Course`.
  `createCourse` now seeds new courses from these defaults instead of hardcoded literals;
  explicit opts still override. `Settings.tsx` gains a "Course defaults" sub-section inside
  Study & scheduling exposing the fields, with the urgent-window field framed as the revision
  period.
- Added the course-only settings sections `UnlockModeSection`, `PracticeSettingsSection`,
  `ExamDatesSection` and `LessonManagementSection` under `src/pages/settings/`, and composed
  them into the new `CourseSettings.tsx` page (route `/course/:courseId/settings`), with an
  entry point from `CoursePath`. Course deletion uses a plain confirmation dialogue with no
  undo — an intentional trade-off for this phase; undo is deferred.
- Fixed card exporters (plain text, CSV, TSV, Markdown, JSON) showing the internal lesson
  backing-deck name for course-created cards; they now resolve `"<Course name> — <Lesson name>"`
  (or just the course name) via `courseId`/`primaryLessonId` lookups, falling back to the deck
  map for legacy deck-only cards. `deck_name`/`deck_colour` CSV headers are unchanged. This was
  the only import/export gap: `portability.ts` (backups, merge/replace import) already carried
  `courseExamDates` and `practiceNodes` correctly; `import.ts` needed no changes. Added
  merge-mode test coverage for both tables in `portability.ts`.
- Fixed a `CourseSettings` not-found branch that could never be reached: `useCourse` can only
  ever resolve `Course | undefined` (Dexie's `.get()` has no not-found sentinel), so a bad
  `courseId` hung on the loading skeleton forever instead of showing "not found". Resolved the
  course locally with the same null-sentinel `useLiveQuery` pattern `CoursePath` already uses.
- Fixed `parsePositiveIntOr` rejecting `0` for the practice threshold and urgent-window fields,
  where `0` is a meaningful value (see `src/fsrs/practice.ts`) and the inputs allow `min=0`; the
  maximum lesson gap keeps its floor of 1, matching its `min=1` input.

### Phase 8 close-out (Arc 0 — one data model, paid-down deferrals)

- Rewrote `HelpPage.tsx` for the Course/Lesson/Note model (courses & lessons, study modes,
  filtered study, how to study, keyboard shortcuts, touch gestures, progress & scheduling,
  card types, tips), replacing the deck-era copy. Fixed the coloured left accent left over on
  the section cards and removed a gesture-configuration line that no longer described anything
  the app does (dashboard swipe actions are fixed, not user-configurable).
- Added `src/db/search.ts`'s `searchCourseContent` (courses, lessons and notes, ranked
  alongside the existing card search) and rewired `SearchPage` and `CommandPalette` to search
  both cores and deep-link results to `/course/:courseId/...` routes, replacing the deck/card-only
  search.
- Added course-scoped analytics: `src/components/analytics/CourseAnalytics.tsx` (predicted
  exam-day trajectory, stability profile and review volume over a course's deduplicated card
  set) plus a lesson-level breakdown chart (cards, mastery, completion per lesson), rendered at
  the new `/course/:courseId/analytics` route with an entry point from `CoursePath`. Fixed a
  related inconsistency: an empty lesson's mastery now follows the same course-level convention
  (empty = 100%, not 0%) as `computeCourseSummaries`.
- Removed the legacy deck-facing UI surfaces: `DeckView.tsx`, `DeckSettings.tsx` (and its test),
  `DeckAnalytics.tsx`, `DeckSearchOverlay.tsx`, `folderTree.ts`, and the `/deck/:deckId/*` routes
  (view, settings, card create/edit, learn) — all superseded by their course/lesson equivalents.
  `/deck/:deckId` now redirects to `/` so old links don't dead-end. The `gestureSettings.ts`
  module (per-user configurable swipe actions) was removed alongside it, since it configured a
  deck-card affordance that no longer has a settings surface; swipe-to-study/archive on the
  dashboard course cards is now fixed behaviour. The `decks`/`folders` tables are untouched —
  this was a UI-surface removal only (see `docs/archive/roadmap-2026-08-11.md` §0.3).
- Wired the dashboard's course-ordering control (recent / ready to study / mastery / exam date /
  name / created) and the Settings → Sidebar due-count and archived-course visibility toggles,
  which had stopped taking effect during the course-UI cutover. Compact mode and the
  per-nav-item visibility toggles were unaffected and continued to work throughout.
- Rewrote the first-run seed (`src/db/seed.ts`) to build a demo **course** (with lessons, notes
  and cards) instead of a demo deck, so a fresh install no longer seeds deck-era example content
  into a UI that can't show it.
- Rewrote `README.md` and `SPEC.md` for the Course/Lesson/Note model: route map, wireframes,
  navigation, search, analytics, sharing and settings sections now describe courses and lessons
  throughout; the data-model section documents the `decks`/`folders` tables honestly as the
  legacy backing structure each lesson still runs on (a lesson is a hidden single-lesson deck),
  rather than as a user-facing concept.

### Lesson session filters, manual practice-node authoring, and course-deletion undo

- **Teacher-configured lesson session filters.** Lessons gain an optional, un-indexed
  `Lesson.sessionFilter` (`'new' | 'due' | 'mixed'`; default `'new'` preserves current
  behaviour). `LearnMode`'s lesson-session card selection now honours it, reusing the same
  due semantics (`isDue`/`dueCards`, new in `src/fsrs/eligibility.ts`) as the course-level
  session. Teachers set it per lesson from `LessonManagementSection`, with plain-language
  descriptions for each option (New material / Revision / Both). The field round-trips
  through v2 share payloads as `sf`. `CoursePath`'s due-count logic was also switched to the
  new shared `dueCards` helper instead of an inlined duplicate.
- **Manual practice-node authoring.** Adds create/edit/delete UI for teacher-authored
  `PracticeNode` records: a hover-revealed "+" between lesson nodes on `CoursePath` inserts
  one at a specific gap, an edit badge on manual practice nodes lets a teacher reposition,
  rename or delete them, and a new `PracticeNodesSection` in course settings mirrors
  `ExamDatesSection`'s list/inline-edit pattern. Auto-inserted practice nodes are untouched by
  this UI and remain computed fresh on every path render. Filters are intentionally left out
  of the form (no existing `CardFilter`-builder UI to reuse) but remain supported in storage.
  Create/update/delete are wrapped in try/catch with a failure toast so a repository error
  cannot soft-lock the editor.
- **Course deletion undo.** Replaces `CourseSettings`' blocking `window.confirm()` with the
  same snapshot + undo-toast pattern deck deletion uses (`DangerZoneSection`), closing the
  deferral noted above. Adds `snapshotCourse`/`restoreCourse` to `repository.ts`, capturing
  everything `deleteCourse` removes — including the lessons' hidden backing decks and
  question-bank deck, and their session history and calibration profiles. Incidentally,
  `deleteCourse` itself never removed those backing decks, their `userPerformance` rows, or
  the course/deck-scoped `sessionHistory` rows, leaving them orphaned on every course
  deletion; `deleteCourse` now sweeps them up too.

### Add lesson UI (course architecture close-out)

- Added `AddLessonControl` (`src/components/course/AddLessonControl.tsx`): inline form wired
  to the existing `createLesson` repository function, with a suggested default name
  (`Lesson N`). Surfaces on the course path (including the empty state), in course settings
  under Lessons (`LessonManagementSection`), and on single-lesson course views where the path
  is hidden (`LessonView`). Creating a second lesson switches the course from the inline
  single-lesson view to the full path.

### Global analytics course cutover (Arc 0 close-out)

- Migrated `/analytics` from the legacy deck model to courses: `CourseComparison` replaces
  `DeckComparison`, cards and session history are scoped to active courses via `courseId`,
  leech counts use `leechCountByCourse`, and the predicted exam-day trajectory uses a new
  `globalTrajectorySeries` helper that averages per-course snapshots per day. Removed
  `DeckComparison.tsx`.

## 0.0.3 — Simple learn mode, card types, and touch-first polish

- Added `useStudyMode` hook (`src/state/studyMode.ts`) with `fsrs` and `simple` modes, persisted to `localStorage`.
- Added Simple learn mode to LearnMode: no FSRS scheduling, no DB writes, YES/NO only. Wrong cards are re-queued at the end of the deck and loop until all cards are marked YES.
- Added live pill UI in Simple learn mode showing Wrong (red), Remaining (grey), and Right (green) counts that update on every answer.
- SessionReport skips the grade-distribution chart in Simple mode since grades are not meaningful.
- Added `simpleMode` flag to `SessionSummary` and `SessionReport` for mode-aware reporting.
- Added card type selector in CardEditor and CardEditOverlay: Basic (front/back), Reversed (back/front), and Typing-answer.
- Added `answer` field to Card type for typing-answer cards.
- Updated `createCard` and `createCardForDeck` in repository.ts to accept and persist `cardType` and `answer`.
- Updated CardContent to render a typing-answer input field during the question phase and compare answers on reveal.
- Updated CardEditor and CardEditOverlay with card type selector (dropdown) and conditional answer field for typing cards.
- Added "Simple learn" to the existing DeckView study dropdown menu (alongside Cram, Due, New, Leech, and Flagged).
- Fixed Base45 whitespace stripping in share.ts — the Base45 alphabet includes space as a valid character, so stripping all whitespace corrupted the encoding. Only strip whitespace for legacy base64 (LAC0/LAC1) formats.
- Fixed internal box-shadow ring on `input:focus-visible` in `index.css` so only the external `:focus-visible` ring applies.
- Added folder delete confirmation dialog in Dashboard with AnimatePresence.
- Auto-set font scale to Large (1.15) when switching to touch mode from default (1.0); never clobber explicit choices when switching to keyboard mode.
- Wired `lacuna:font-scale` custom event from `inputMode.ts` to `FontScaleContext` so the Settings page reflects the change immediately.
- Added gesture settings (swipe left/right action mapping) in Settings and wired them into Dashboard card swipes.
- Fixed 10 ESLint errors across Dashboard, DeckSettings, and LearnMode.
- TypeScript is clean; 332 tests pass.

---

# Lacuna — version 0.0.2

> **GitHub Release Note for v0.0.2**
>
> This patch release expands test coverage to page-level flows, adds virtualisation for large card lists, and polishes mobile gesture interactions.
>
> **What's new**
>
> - Page-level integration tests for CardList, Dashboard, SharePage, SessionReport, and LearnSkeleton.
> - Lightweight dependency-free virtual card list for decks with more than 50 cards.
> - Haptic feedback on all major mobile gestures (swipe, long-press, grade, tray actions).
> - Spring physics on card swipe snap-back and bottom-sheet drag handles.
>
> **Bug fixes**
>
> - Fixed image-asset handling in `fake-indexeddb` test environments (continued from v0.0.2).
> - Fixed pre-existing `touchstart` type error in Dashboard.
> - Fixed DeckSearchOverlay props destructuring bug.
>
> **Full changelog below**

## 0.0.2 — Page-level tests, card list virtualisation, and mobile gesture polish

- Added page-level integration tests:
  - `CardList.test.tsx`: empty state, card rendering, select mode, selection toggling, card expansion, import panel, new card button.
  - `Dashboard.test.tsx`: skeleton, empty state, deck cards, select mode, folder rendering, header buttons.
  - `SharePage.test.tsx`: loading, empty state, deck list, selection, import section.
  - `SessionReport.test.tsx`: goal reached, stat values, progress bar, chart rendering, back button, daily limit, distractions.
  - `LearnMode.test.tsx`: LearnSkeleton rendering, header and main structure.
- Added `useVirtualList` hook — a lightweight dependency-free virtual list with window scroll tracking, binary search for visible ranges, and dynamic item measurement via `ResizeObserver` / `getBoundingClientRect`.
- Integrated virtualisation into `CardList` with a threshold of 50 cards. Small decks render as a simple grid; large decks use absolute positioning with `translateY` to keep only visible cards in the DOM.
- Added `skipAnimation` prop to `CardRow` so cards that scroll back into view do not re-trigger entrance animations.
- Added `src/utils/haptic.ts` — a haptic feedback utility with light, medium, and strong vibration patterns via `navigator.vibrate`.
- Triggered haptic feedback on gesture commits: long-press (`hapticStrong`), swipe-to-grade (`hapticMedium`), swipe-to-study (`hapticMedium`), mastery gestures (`hapticMedium`), card tray open/close (`hapticLight`), and tray actions (`hapticLight` / `hapticMedium`).
- Added spring physics to `FlipCard` swipe (`stiffness: 480`, `damping: 32`) for snap-back instead of abrupt reset.
- Polished `TouchMenuSheet` drag handle with drag-to-close gesture, keyboard accessibility (Enter/Space to close), and a larger touch target.
- Fixed pre-existing `touchstart` type error in `Dashboard.tsx` (`MouseEvent` → `Event`).
- Fixed `DeckSearchOverlay` props destructuring bug.

---

# Lacuna — version 0.0.2

> **GitHub Release Note for v0.0.2**
>
> This patch release focuses on reliability, test coverage, and visual polish.
>
> **What's new**
>
> - Smoother page transitions and toast animations throughout the app.
> - Added a comprehensive unit-test suite covering UI components, hooks, and state modules.
>
> **Bug fixes**
>
> - Fixed image-asset round-trip handling in test environments (`fake-indexeddb`) by storing assets as `Uint8Array` and converting back to `Blob` on demand.
> - Fixed `usePomodoro` settings parsing so `0` is handled correctly.
> - Fixed a typo in the Dashboard copy ("examotion" → "exam").
> - Prevented test-suite race conditions by disabling parallel test-file execution.
>
> **Full changelog below**

## 0.0.2 — Bug fixes, test suite hardening, and visual polish

- Fixed `fake-indexeddb` Blob round-trip issue by storing image assets as `Uint8Array` and converting back to `Blob` via `toBlob()` when DOM APIs need one. Added `blobToArrayBuffer` and `blobToText` helpers for robust cross-environment Blob reading.
- Added `fileParallelism: false` to `vitest.config.ts` so database tests sharing `fake-indexeddb` state do not race each other.
- Added comprehensive unit tests for UI components (`Button`, `Toggle`, `Toast`, `TagInput`, `FadeInView`, `DateTimePicker`, `ProgressBar`), hooks (`usePomodoro`, `useFocusTrap`, `useLongPress`, `useInstallPrompt`, `useStorageQuotaWarning`), and state modules (`sidebarSettings`, `dashboardSort`, `gradingMode`, `inputMode`, `motionSpeed`, `optimiseSetting`, `shortcutBindings`, `shortcuts`).
- Fixed `usePomodoro` settings parsing to use `??` instead of `||` for proper falsy handling.
- Fixed typo in Dashboard copy: "examotion" → "exam".
- Smoother page transitions in `AppShell` — added subtle scale animation (0.995 → 1) alongside the existing fade-and-lift, with a slightly longer duration for a more settled feel.
- Smoother toast exit animation with refined timing and easing.

---

## Planned for 0.0.3

- Expand test coverage to page-level flows (Learn mode, Dashboard, Deck view) and integration tests for the import/export engine.
- Refine mobile touch interactions — spring-tuning on swipe gestures, bottom-sheet behaviour, and touch-target feedback.
- Accessibility audit: focus management in modals and drawers, ARIA live regions for toasts, and screen-reader labels on icon-only controls.
- Performance: virtualise the card list for large decks and investigate image lazy-loading in Markdown renders.

---

# Lacuna — production hardening (round two)

British English throughout. Changes are grouped by work-order task.

## Task 1 — Official FSRS trainer

**Outcome:** Replaced the hand-rolled coordinate-descent optimiser with
`@open-spaced-repetition/binding` (`computeParameters()` via fsrs-rs WASM in the optimisation
Web Worker).

- Added `@open-spaced-repetition/binding`; npm overrides for transitive WASM deps.
  The `binding-wasm32-wasi` WASM binary and worker are vendored into `public/` and `src/fsrs/`
  so the package no longer needs to be installed (it incorrectly declares `cpu: wasm32` and
  fails on x64 VMs).
- `src/fsrs/optimise.ts` converts card histories to binding review items, calls the trainer with
  `enableShortTerm: true`, validates weights against `CLAMP_PARAMETERS` bounds, then clips.
- `src/fsrs/bindingOptimiser.ts` lazy-loads the WASM trainer (`initOptimizer` + Vite `?url` /
  `?worker`).
- Vite: `optimizeDeps.exclude` for the binding; COOP/COEP headers on dev and preview servers.
- Tests: history conversion, out-of-range rejection, gating threshold, persistence feeding
  `makeEngine`.

## Task 2 — Out-of-sample validation

**Outcome:** The before/after calibration metric is now computed on held-out data, not on the
same reviews the weights were fitted to. The confirmation dialog only offers to apply fitted
weights when they genuinely beat the defaults out of sample.

- `src/fsrs/optimise.ts`: added `chronologicallySplitSequences` to split each deck's history
  into a training portion (80% by time) and a held-out validation portion (20%).
- `evaluateParameters` accepts `scoreAfterTimestamp` so only validation reviews are scored.
- `optimiseParameters` trains on the training portion, evaluates before/after on the validation
  portion, and sets `isOutOfSampleWin` in the result.
- Raised `MIN_OPTIMISE_REVIEWS` from 400 to 1,000; the UI copy explains the train/validation split.
- `DeckSettings.tsx` only shows the "Apply" button when `isOutOfSampleWin` is true; plain copy
  is shown when the fit does not improve out of sample.
- Tests: split correctness, validation-only scoring, gating on out-of-sample win, defensive
  guard against an empty training set.

## Task 3 — Pre-migration snapshot ordering

**Outcome:** The pre-migration snapshot is now captured in a separate committed transaction
before the destructive migration runs, so it survives even if the upgrade aborts and rolls
back the main database.

- `src/db/preMigrationSnapshots.ts`: a dedicated Dexie database (`lacuna-pre-migration`) stores
  snapshots keyed by target schema version.
- `src/db/schema.ts`: `ensurePreMigrationSnapshot` detects a pending upgrade via
  `indexedDB.databases()` (with a fallback to raw `indexedDB.open` for older browsers), reads
  all data from the current version, and writes the snapshot to the separate DB before the
  first Dexie query triggers the open. `readAllDataFromVersion` now includes the `assets`
  table in the payload.
- `savePreMigrationSnapshot` also mirrors the snapshot to the configured folder if the File
  System Access API is available.
- `backups.ts` already exempts `tag === 'pre-migration'` from the ten-snapshot pruning.
- Tests: a simulated migration failure proves the snapshot remains restorable; the snapshot is
  skipped when the database is already at the target version.

## Task 4 — Persistent storage

**Outcome:** The app now requests `navigator.storage.persist()` on first run and surfaces the
result honestly in the backup UI.

- `src/db/persistence.ts`: `requestPersistentStorage` and `checkPersistentStorage` handle
  granted, denied, and unsupported browsers; `estimate()` results are surfaced when available.
- `src/App.tsx`: requests persistence once on first run (guarded by localStorage flag).
- `src/pages/Settings.tsx`: shows whether storage is persisted, approximate quota usage, and
  a "Request persistence" button when not yet granted. When denied or unsupported, the UI
  states plainly that the browser may delete data and points to regular exports or folder
  mirroring as the safeguard.
- Tests: unsupported, granted, denied, and thrown-estimate cases are mocked and asserted.

## Task 5 — Asset garbage collection

**Outcome:** Orphaned image assets are now collected automatically after destructive card
operations.

- `src/db/assets.ts`: `collectOrphanedAssets` scans every card's Markdown, builds the set of
  still-referenced hashes, and deletes unreferenced rows. `scheduleAssetGc` debounces the
  sweep (3-second quiet period) so bulk edits collapse into one pass.
- `src/db/repository.ts`: `deleteDeck`, `deleteCards`, and `updateCard` (when front or back
  changes) now call `scheduleAssetGc` after the transaction commits.
- Tests: deleting a sole-referencing card removes the asset; a shared asset survives until
  the last referencing card is gone; replacing an image in a card orphans and collects the
  old one.

## Task 6 — Object URL session cache

**Outcome:** Image object URLs are cached per hash for the app lifetime, eliminating the
create/revoke churn on every card flip in a fast Learn session.

- `src/db/assetCache.ts`: `resolveAssetUrl` caches one object URL per hash; subsequent
  renders return the same URL. `resolveAssetMarkdownCached` replaces all asset references
  in a Markdown string with cached URLs.
- `src/components/markdown/MarkdownView.tsx`: switched from `resolveAssetMarkdown` (per-mount
  create/revoke) to `resolveAssetMarkdownCached`.
- `src/App.tsx`: registers a `beforeunload` handler that calls `revokeAllCachedUrls` to
  release the URLs at app teardown.
- Tests: stable URL across repeated calls, null for missing assets, correct Markdown
  replacement, and revocation at teardown.

**Checks:** `typecheck` and `test` pass.

## Schema v22 removal contract

**Outcome:** The destructive half of the storage migration now has a written contract, so the
removal can be specified once and implemented against a fixed target rather than negotiated
commit by commit.

- `docs/plans/storage-v22-removal.md`: recorded, per gate-holder, what was deleted, what
  compatibility adapter replaced it, and what had to be tested before the deletion landed. The
  original plan proposed conversion-on-import for pre-v22 backups and `LAC0`-`LAC3` share codes;
  the later implementation retained the on-device migration but retired those standalone import
  paths, as recorded above.
- The contract requires the existing `ensurePreMigrationSnapshot` mechanism to be hardened rather
  than replaced: its failure is currently caught and logged, which is acceptable for an additive
  migration but not for a destructive one. For v22 a failed snapshot must block the upgrade.
- Rollback is explicitly one-way. An aborted upgrade leaves the database at v21; a completed one
  has no downgrade path, only snapshot restore under the previous build. The release note must say
  so plainly.
- Workstream 2 of `docs/course-domain-boundary-follow-ups.md` (the CardList legacy Deck-shaped
  union) is subsumed by gate 3 and must not be run as a separate pass.

**Checks:** documentation only; no code changed.

## PWA installation on iPhone

**Outcome:** Lacuna installs to an iPhone home screen with its own icon, and the Settings panel
teaches the gesture rather than claiming the browser cannot install web apps.

The app was already a PWA — `vite-plugin-pwa`, a manifest, Apple meta tags and an install panel
all existed. Two specific things were broken.

- `index.html` pointed `apple-touch-icon` at an SVG. iOS silently ignores an SVG there and uses a
  screenshot of the page as the home-screen icon instead. It now points at a 180px PNG.
- `scripts/generate-icons.ts` rasterises `public/icon.svg` into `public/icons/` with `sharp`
  (a devDependency; run `bun run icons:generate`). The maskable variant scales the artwork to 80%
  on an opaque background so Android's circular mask cannot crop it.
- `public/manifest.json`: split the single `"any maskable"` entry into separate `any` and
  `maskable` icons, since one bitmap cannot serve both well. Added `id` and `scope`, and set
  `start_url` to `/#/` to match the hash router.
- `src/hooks/useInstallPrompt.ts`: iOS never fires `beforeinstallprompt`, so `isInstallable` was
  permanently false there and the panel told iPhone users their browser was unsupported. The hook
  now returns an `InstallMethod` discriminant (`prompt`, `manual-ios`, `unavailable`) and detects
  iPadOS, which reports itself as `MacIntel` and is distinguished from a desktop Mac only by its
  touch-point count. Installation is also detected through the legacy `navigator.standalone` flag.
- `src/pages/settings/InstallSection.tsx`: shows the Share-sheet gesture on iOS, with a new
  `IosShareIcon` inline so the button is recognisable on the user's own screen.
- Tests: `src/release/pwaAssets.test.ts` asserts every manifest icon exists on disk, that the
  Apple touch icon is a PNG that exists, and that exactly one icon is maskable — the last of which
  is the regression that caused this work.

**Deliberately not done:** `viewport-fit=cover` was not added. The status bar is already set to
`black-translucent`, which only takes effect with `viewport-fit=cover`, and enabling it without
matching `env(safe-area-inset-*)` padding in the stylesheet would push content under the notch.
There is currently no safe-area handling anywhere in the CSS, so that is a separate piece of work.

**Checks:** `typecheck`, `lint`, `test` and `build` pass.

## Unreleased — Grok added as a delegation route

**Outcome:** Grok 4.6 is available as a headless mailbox worker, driven by Claude directly rather
than by the prompter.

- A SuperGrok subscription was taken out on 13 August 2026. The `grok` CLI (Grok Build TUI 1.0.3,
  at `~/.local/bin/grok`) is signed in through grok.com OIDC with coding-data retention opted out,
  and offers `grok-4.6` (default, 500k context) and `grok-4.5`.
- Verified headless operation with `grok -p`, so unlike Freebuff it needs no supervision from the
  prompter. It supports `--effort low|medium|high|xhigh`, `--json-schema` for enforced structured
  output, `--tools`/`--disallowed-tools` and `--rules` for scoping, and several streaming output
  formats.
- `-w/--worktree` is silently ignored under `-p`. A Grok worker that needs isolation must be given
  a worktree created beforehand and pointed at it with `--cwd`.
- `CLAUDE.md`: added a Grok section, a table row (intelligence 9, cost 8, speed 8), Grok to the
  permitted-without-asking mailbox workers, and Grok as a fourth independent concurrency quota
  alongside OpenCode, Cline and Codex.
- Taste and 3D remain unrated and must not be guessed, on the same rule that already governs
  DeepSeek V4 Pro. Until the prompter supplies a number, Grok gets no frontend, design or 3D work.
  Its intelligence rating does put it out of the slop tier, so it takes whole tasks like Sol rather
  than needing them decomposed — and unlike Sol, its output is usually mergeable as written rather
  than needing a polishing pass. Review it as a competent colleague's branch, not as a draft.
- A first real session registered 0% of the SuperGrok allowance, against an estimated 5% had the
  same work gone to Claude. One data point, not a measured ceiling, so the cost rating stays at 8;
  the practical consequence is that Grok need not be rationed the way Sol must be.

**Checks:** documentation only; no code changed.

## Unreleased — Grok 4.6 taste rating

**Outcome:** Grok's taste column in `CLAUDE.md` is a 7.5, so design work can be delegated to a
worker other than Claude for the first time.

- Measured on 13 August 2026 with a from-scratch landing-page redesign, briefed as a replacement
  for a page the prompter disliked. The returned concept set the product name as the word missing
  from the headline and punched the forgetting curve into the sentence as the gap itself — an idea
  rather than a restyling, and notably not the cream-and-serif look that LLM-authored landing pages
  default to.
- The draft was **not** adopted; the prompter prefers the existing `/welcome` page, and Grok deleted
  `design/landing-draft/` and reverted its own changelog entry. The rating stands on the thinking,
  not the outcome — a future agent reading the table should not infer that the work failed.
- Defects found on review, recorded because they are the shape of mistake this tier still makes:
  a visually-hidden chart description nested _inside_ the `<h1>` and also referenced by the SVG's
  `aria-labelledby`, so the heading's accessible name contained the whole description twice and
  mutated live as the chart was dragged; one line of copy that broke the register; and three
  Google Fonts families loaded from a third party on a page whose central claim is that nothing
  leaves the device.
- The 3D and graphical column remains unrated and must not be inferred from this. Taste in a flat
  editorial layout is not evidence about 3D.

**Checks:** documentation only; no code changed.

## Unreleased — UI polish audit

**Outcome:** `docs/ui-polish-points.md` records 24 source-backed opportunities to improve motion,
state-transition continuity and interaction polish, with priorities, code locations and an
implementation order. No application behaviour changed in this entry, and those polish
opportunities remain open; the separate sticking-point fixes delivered afterwards are recorded
in "Unreleased — UI/UX audit implementation" above.

**Checks:** documentation only; no code changed.
