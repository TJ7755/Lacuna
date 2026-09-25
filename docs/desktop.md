# Desktop and AI setup

## Packages and updates

Lacuna ships Windows x64 NSIS and portable executables, Linux x64 AppImage and DEB packages,
and unsigned macOS arm64 DMG and ZIP archives. The web app's `#/download` page offers direct
platform-aware downloads and recommends portable Windows for managed computers.

Windows NSIS and Linux AppImage follow the beta update channel. **Restart and install** applies
a downloaded update; choosing **Later** does not install it on ordinary quit. Settings shows
the installed version, progress and retry controls. Portable Windows, Linux DEB and unsigned
macOS require manual updates. Unsigned packages may trigger operating-system trust warnings.

```bash
bun run electron:dev
bun run electron:build:win
bun run electron:build:linux
bun run electron:build:mac
```

Run each native target on its supported host. [Release maintenance](maintenance/release.md)
defines the checks, exact asset allowlists, provenance and signing gates. The native AI test
uses a disposable profile, while package tests validate the built artefact:

```bash
bun run test:e2e:electron-ai
bun run test:e2e:electron-package
```

## Optional AI chat

Settings → AI offers **Built-in AI** alongside the existing external AI client. Built-in AI uses
the existing sidebar on web and Electron. An issued beta access code is required. The web app
calls its own `/api/ai/` functions; Electron calls `https://lacuna-beta-one.vercel.app/api/ai/`.
Some managed networks may block that host. Ordinary study remains available when the AI service
or network is unavailable. Messages and selected tool content travel over HTTPS to the hosted
provider; the local transcript, study database, tool execution and write approvals stay on the
device. The access code is stored locally, outside backups and sync. Free providers may retain or
use submitted content under their own terms. Switching modes starts a separate conversation.

### Hosted service operation

Deploy the existing web project with Node functions in `api/ai/`. Set these server-only
environment variables in Vercel; never use a `VITE_` prefix:

| Variable | Purpose |
| --- | --- |
| `AI_ACCESS_CREDENTIAL_HASHES` | JSON object mapping individual learner IDs to lowercase SHA-256 access-code hashes. Codes must be 32–256 characters. Remove an entry to revoke its sessions. |
| `AI_SESSION_SIGNING_KEY` | Random secret of at least 32 characters for one-hour session tokens. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Secure Redis REST endpoint and token for atomic usage and concurrent-run admission. |
| `AI_GATEWAY_API_KEY` | Optional Vercel AI Gateway key. Only `inclusionai/ling-3.0-flash-fin` and `poolside/laguna-s-2.1-free` are selected, in that order, and only while every live catalogue price field is zero for each route. |
| `OPENROUTER_API_KEY` | Preferred route using `openrouter/free`, selected only while the live catalogue reports zero pricing and tool support. Its free-account rate limit applies in addition to Lacuna's limits. |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GOOGLE_FREE_TIER_CONFIRMED=1` | Optional final fallback through Gemini 2.5 Flash Lite. Set the confirmation only for a project verified to remain on the free tier. |
| `AI_SERVICE_DISABLED=1` | Immediately refuse new sessions and inference requests. |

At least one provider key is required for inference. If access or Redis configuration is missing,
the service fails closed. Default admission is 50 inference steps per learner per day, 600 per
month, 1,000 globally per day, six per learner per minute, with two learner and twelve global
in-flight steps. Multi-step tool conversations consume multiple steps. Responses are limited to
768 output tokens per step, eight continuations and a 30-second request timeout. The server
never accepts a client-selected model. Review actual provider pricing and free-tier conditions
before enabling a key. No paid route is configured by this implementation.

The hosted flow has browser and unpacked Windows Electron fixture tests. A real provider answer
and a managed-network check need a configured test key and target device respectively. Keep the
existing external client mode available if the hosted endpoint is unreachable.

### External AI client

Enable **Settings → AI**, open the panel and copy its setup prompt into an MCP-capable client.
Preserve the complete command, arguments and environment: these select the correct installation
and Electron profile. Use the client's server registration flow and required reload/restart;
do not start another ordinary Lacuna process as a connection test.

Verify that the active client exposes `lacuna.connect` and `lacuna.wait_for_message`.
If the panel's renderer runtime remains unavailable, use **Restart AI runtime**. Keep the
Lacuna window and model task alive; the task must repeat `lacuna.wait_for_message`, because MCP
cannot wake a completed task or make a client continue generating in the background.

Packaged desktop AI uses the bundled stdio companion and authenticated local IPC, without a
network port or pairing code. Model credentials remain in the AI client, and the model still
runs wherever that client sends requests. Direct companions run in Electron's Node mode.

The browser uses the encrypted HTTPS relay and a short-lived pairing code. Build its standalone
companion from the repository root, then register the built entry point in the client:

```bash
bun run build:ai-mcp
node /absolute/path/to/Lacuna/tooling/lacuna-ai-mcp/dist/index.js
```

See the [web companion guide](../tooling/lacuna-ai-mcp/README.md) for the shared five-tool contract.
Managed networks may block the relay; desktop AI's local companion avoids that route, but device
sync still requires the relay.

Both AI companions can invoke typed domain tools during an active run. Reads are implicit;
writes require in-app approval, while course creation and destructive actions require exact
one-shot approval. Stop blocks later calls and replies; writes produce local receipts.
Agents should discover schemas through `lacuna.list_tools` via `lacuna.invoke_tool`.

Learner memories have explicit global or Course scope, are inspectable in Settings and join
full backups and encrypted peer sync. Peer sync preserves the device-local AI session and
transcript; successful full replacement disconnects and clears them. Protocol compatibility,
lease renewal and retry semantics are specified in the [specification](SPEC.md).

## Data MCP access

The separate **Settings → MCP server** configuration exposes the broader data tool surface.
Copy its generated configuration, including `--mcp-companion` and both profile arguments.
The companion attaches to the open application over a token-authenticated local socket or
Windows named pipe; the renderer must remain open because it owns IndexedDB.

Each connection has ephemeral grants. Read access is granted per Course with an in-app notice;
the first write or destructive operation waits for approval. Inspect or revoke grants in
Settings; they expire on disconnect. Data MCP and AI share the native broker but retain
separate authority and tool surfaces.

For disposable canonical data/recovery evidence, run `bun run release:scenario`. Its reports
are written under `artifacts/release-scenarios/`; browser automation uses the separate browser
profile's origin-scoped database.
