# 19. Electron desktop build

Lacuna can be packaged as a standalone desktop application via Electron. The current beta matrix is
Windows x64 NSIS and portable, Linux x64 AppImage and DEB, and macOS arm64 DMG and ZIP.
The Electron layer lives in `electron/` and wraps the existing Vite SPA without
modifying the renderer source.

The public `/download` route selects Windows, macOS or Linux from a desktop browser user agent while
keeping all three choices available. Mobile and unknown agents remain neutral until the visitor
chooses the computer where Lacuna will run. It recommends the Windows portable executable for
managed computers, the macOS Apple Silicon DMG and the Linux AppImage, with the installer or DEB
demoted to clearly labelled alternatives. The page states signing and update limitations rather
than exposing GitHub's updater metadata as user choices.

### Architecture

- **Main process** (`electron/main.ts`): creates a frameless `BrowserWindow`,
  injects Cross-Origin Isolation headers (COOP/COEP) required by the FSRS WASM trainer and the
  packaged renderer CSP only for Lacuna's trusted renderer URL, registers a custom `app://`
  protocol for production builds, repairs CORS only for the exact default sync relay when a
  managed-device intermediary strips that response header, and manages window lifecycle
  (single-instance lock, close/minimise/maximise). Remote subframes keep their own response
  headers; Lacuna does not overwrite provider CSP or isolation policy.
- **Preload** (`electron/preload.ts`): exposes a minimal `electronAPI` via
  `contextBridge` for platform detection, window controls and narrow, schema-validated data-MCP and
  local-AI IPC surfaces. Raw Electron IPC and native sockets are never exposed to the renderer.
- **Titlebar** (`src/components/layout/Titlebar.tsx`): a custom React component which reserves the
  native traffic-light inset and omits duplicate controls on macOS. Windows and Linux render the
  custom minimise, maximise/restore and close controls; the restore glyph uses two complete,
  overlapping window outlines rather than an incomplete front corner. It only mounts when
  `window.electronAPI.isElectron` is truthy, so the web version is completely unaffected.
- **Portable startup** (`electron/assets/portable-splash.bmp`): electron-builder's NSIS wrapper
  shows a restrained Lacuna-branded bitmap while the Windows portable executable extracts. This
  gives immediate feedback before Electron exists; it does not claim progress or disguise any
  earlier Windows security scan.
- **Windows upgrade coordination** (`electron/windows-installer.nsh`): before NSIS closes the
  installed application, it records the live installer PID in Lacuna's per-user local state. Normal,
  data-companion and AI-companion entry points refuse to start while any recorded installer remains
  alive, preventing an MCP host from immediately relaunching `Lacuna.exe` and racing file removal.
  Successful installation removes the marker; application start removes abandoned or stale markers.
  The marker is deliberately independent of Electron's selectable user-data profile.
- **Fonts** (`electron/assets/fonts/`): Fraunces and JetBrains Mono
  bundled as local TTF variable fonts. The main process injects
  `electron/fonts.css` via `webContents.insertCSS` so the app works fully
  offline. Instrument Sans ships with the shared renderer assets in `public/fonts/`.
  The hosted Google Fonts links are added only on HTTP(S), so Electron does not make a
  request which its production CSP would reject.
- **Auto-updater** (`electron/updater.ts`): uses `electron-updater` with GitHub Releases and checks
  the beta channel shortly after launch. A narrow, validated preload surface exposes only current
  state, a deliberate check, state-change subscription and explicit restart-and-install. Settings
  shows the installed version, check/download/error state and byte progress; checking and downloads
  also use a compact application-level notice with percentage and transferred/total size when the
  updater supplies it. A downloaded update never restarts Lacuna or installs on ordinary quit: the
  user chooses **Restart and install** or **Later**. Windows portable and Linux DEB update manually.
  The unsigned macOS beta also updates manually because electron-updater
  requires a signed macOS application. Those packages receive package-specific guidance and a link
  to the beta releases page.
  The downloaded-update dialogue uses a symmetrical card illustration and places the
  version in its body text. “What’s new” expands the available release notes in a bounded,
  scrollable region; the restart actions remain outside that region. The existing GitHub
  provider supplies Markdown or HTML notes. Only the target version's notes are retained,
  bounded to 64,000 characters and passed through the preload's validated state. Rendering
  sanitises HTML, omits remote media and permits only HTTP(S) note links. Missing or malformed
  notes hide the disclosure without blocking installation. Escape and Later defer this version;
  keyboard focus remains within the dialogue and returns to its previous control on dismissal.

### Model Context Protocol server

The Electron main process hosts the data-owning MCP bridge using the pinned official TypeScript
SDK. A client launches the installed Lacuna executable with `--mcp-companion`; that disposable
stdio companion attaches to the already-running application through a token-authenticated,
user-local Unix-domain socket (macOS/Linux) or named pipe (Windows). There is no TCP/HTTP endpoint
or browser MCP server. The normal renderer window must remain open because it owns IndexedDB.
Modern SDK v2 and legacy stdio negotiation are both accepted.

The broker has a second purpose-bound attachment for the optional desktop AI panel. A direct
installation runs the bundled AI companion entry point through the shipped Electron binary with
`ELECTRON_RUN_AS_NODE=1`; it does not bootstrap another Chromium process. The companion exposes
exactly `lacuna.connect`, `lacuna.wait_for_message`,
`lacuna.invoke_tool`, `lacuna.reply` and `lacuna.disconnect`; it cannot call the broader data-MCP
surface directly. Main-process authentication proves attachment to this installation, while the
enabled renderer remains the authority for session ownership, Stop, call-id ledgering, course
creation and destructive one-shot approval. No localhost TCP, HTTP or WebSocket origin is
introduced. Generated AI and data companion commands carry Electron's active user-data directory,
so custom and isolated profiles resolve the same authenticated endpoint as the open renderer. The
hosted web build retains its encrypted HTTPS mailbox transport because browsers cannot host the
native socket. The native broker waits for at most five seconds when a live renderer is still
mounting before returning an actionable unavailable result. Renderer readiness is exposed only
through the trusted Electron status bridge, not as a sixth AI companion tool. The disconnected AI
panel shows that status and can request a targeted restart which remounts the optional AI runtime
without reloading the application shell or data layer.

| Component                      | Pinned version | Compatibility                                                       |
| ------------------------------ | -------------- | ------------------------------------------------------------------- |
| `@modelcontextprotocol/core`   | 2.0.0          | Shared protocol types and modern/legacy negotiation                 |
| `@modelcontextprotocol/server` | 2.0.0          | Companion and embedded stdio server                                 |
| `@modelcontextprotocol/client` | 2.0.0          | Portable smoke client                                               |
| Lacuna data companion protocol | 1              | Authenticated native-IPC relay; independent of MCP protocol version |
| Lacuna AI companion protocol   | 2              | Capability-negotiated native AI relay; protocol 1 remains supported |

The tool contract is transport-independent and versioned separately from the Dexie schema
(`MCP_TOOL_SURFACE_VERSION`, currently 3 — additive tools never bump it). It exposes:

- a searchable `lacuna.list_tools` catalogue with descriptions, JSON input schemas and permission
  levels, plus recovery suggestions for unknown names and query/version-bound pagination cursors;
- read/query tools for courses, lessons, cards, due and weak cards, statistics, sequences,
  occlusions, notes and diagnostics, including natural-language `lacuna.find_course` resolution and
  bounded `lacuna.search_cards` results which omit scheduling and review history by default, use
  query- and Course-bound cursors, and read stored Card content without hydrating review history;
- content tools for course, lesson, note, card, sequence, occlusion and course-assessment
  creation/update;
- destructive or bulk tools for cards, lessons, courses, sequences and occlusions, plus
  suspension, flags and bounded rescheduling; and
- idempotent card-import preview/import tools that classify items as create, skip or
  update candidates before writing.

Tool definitions and handlers live under `src/mcp/` and reuse `src/db/read.ts` and the
existing repository functions. The main process owns the SDK transport and sends correlated
requests over the preload bridge to the renderer; a ten-second timeout turns a missing or
not-ready renderer into a normal tool error. Tool inputs are resolved to their owning course
before permission checks, and a call spanning more than one course is rejected.

Permissions are connection-scoped and ordinal: destructive implies write, which implies read.
The first read for a course is allowed with a non-blocking notice. The first write or
destructive call blocks on an in-app consent prompt and fails closed if no decision arrives.
Settings identifies each live client, shows its current grants and can grant or revoke them
manually. A client's grants are destroyed on disconnect. Destructive and bulk handlers capture
repository snapshots; their internal undo payload never reaches the
client, but drives an in-app undo toast after the action completes.

Native AI-companion MCP failures use a compact machine-readable envelope containing an error kind,
retryability, suggested action, whether user intervention is required and whether a write may have
committed. Arbitrary thrown exception text is replaced at the native companion boundary so a
filesystem path, account name or native endpoint cannot leak into model-visible diagnostics. The
hosted web companion retains its existing encrypted-relay error contract.

`create_occlusion` takes the hash of a diagram already stored in this install: there is no
asset-upload tool, deliberately, since binary transport is not a natural MCP shape. Region
ids, roles and fractional coordinates are the whole agent-facing contract, which makes an
agent-authored SVG diagram plus coordinates a text-only workflow.

The shipped surface deliberately excludes raw FSRS-state writes, review recording, backup/share
operations, note annotations and most curriculum-structure mutation. Streamable HTTP, a web
companion process, durable client identity and plugin extension points remain deferred.

These exclusions describe the shipped contract, not an instruction to bolt future operations onto
the renderer through generic UI automation. The attachable local companion and canonical
programmatic release scenario implement the first §§2.12–2.13 slices. The broader proposed
user-action surface — including the separate safety boundary for study-history writes — remains in
`docs/archive/roadmap-2026-08-11.md` §2.14.

### Scripts

- `bun run electron:dev` — runs Vite dev server and Electron in parallel.
- `bun run release:scenario -- --scenario canonical` — runs the isolated canonical domain and
  import-preview release checks and writes a machine-readable evidence report.
- `bun run electron:build:win` — builds Windows x64 NSIS and portable artefacts.
- `bun run electron:build:linux` — builds Linux x64 AppImage and DEB artefacts.
- `bun run electron:build:mac` — builds macOS arm64 DMG and ZIP artefacts.

The tag-triggered release workflow requires `v<package version>` and rejects a tag whose exact
commit does not equal `GITHUB_SHA`. It also requires successful ordinary `CI` and `Security` push
workflows for that exact commit on `master` or `main`; repeating selected checks in the tag workflow
does not substitute for a failed commit workflow. It then runs the complete release gate and builds
Windows x64 and Linux x64 in separate native GitHub jobs. Windows runs the native AI end-to-end gate
before packaging.

Each GitHub platform job first requires every file class in its explicit distributable and update-metadata
allowlist, then uploads and creates GitHub build-provenance attestations for those exact files with
`actions/attest@v4`. One publisher, gated on both native builds, combines the named workflow
artefacts, writes and separately attests `SHA256SUMS-github.txt`, then creates or refreshes a GitHub
pre-release draft. Only that publisher can write release contents; build jobs receive only
repository-read, OIDC-token, attestation and artifact-metadata permissions. Attestations identify
the workflow and commit behind a digest; they are not application code signing or notarisation.

The unsigned macOS arm64 DMG and ZIP are built from the exact release commit on the maintainer's
Apple Silicon device after the same native AI gate, then exercised as a packaged application before
upload. They carry a separate `SHA256SUMS-macos.txt` integrity manifest and no GitHub Actions
provenance attestation. The maintainer procedure and verification commands are recorded in
`docs/maintenance/release.md`.

### Build output

Anki ZIP/SQLite parsing lives in `src/db/apkgParser.ts`, separate from the persistence and
worker launcher in `src/db/apkgImport.ts`. The worker cannot import application storage;
`src/build/apkgBoundary.test.ts` enforces that boundary. Worker-free environments load the
parser dynamically. Imported image hashes come from the existing asset-storage result.

The Electron MCP build bundles the SDK and Zod into shared ESM chunks. Only Electron,
electron-log and Node built-ins remain external to those chunks. Generated output includes
full third-party licence texts and removes obsolete chunks before each build. The SDK and
Zod remain development dependencies because their used code is already in the package.

Packaged files land in `release/` (gitignored). The electron-builder
configuration is at `electron/electron-builder.yml`. Packaging stays on the maintained Electron
Builder 26 line; a future v27 move is a separate migration because it changes the builder's Node
and module-system requirements rather than being a routine lockfile refresh.


[Specification index](../SPEC.md)
