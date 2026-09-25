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

### Handing out beta access codes

Generate a batch from the repository root:

```bash
bun run ai:invites
```

This creates 20 individual codes in a new, Git-ignored `.ai-invites/batch-…/` directory.
Use `--count 50` for a different batch size (1–1,000). The command prints file paths,
never the codes. Files are owner-only on POSIX systems; on Windows, keep the directory
in your private user profile with appropriate filesystem permissions.

1. Open `credential-hashes.json`. Set the web project's server environment variable
   `AI_ACCESS_CREDENTIAL_HASHES` to its complete contents and redeploy once for the batch.
   The signing key, Redis and provider configuration below must already be set up.
2. Keep `codes.csv` private. Send each tester just one unused `access_code`, and record
   their name and the issue date in `issued_to` and `issued_on`. Do not send the whole CSV.
3. The tester selects **Settings → AI → Built-in AI**, enables AI, opens the sidebar,
   pastes their code and clicks **Connect**. Each code has a separate usage allowance.

When adding more codes, save the **current deployed** `AI_ACCESS_CREDENTIAL_HASHES` JSON
to a file inside `.ai-invites/`, then include it:

```bash
bun run ai:invites --count 20 --existing .ai-invites/current-hashes.json
```

The new configuration preserves those entries and adds the new batch; the new CSV contains
only the new codes. Replace the server variable with the combined JSON and redeploy.
Omitting `--existing` creates an independent list: deploying it would revoke earlier codes.
Do not reuse an old configuration containing revoked entries, as that would restore access.
To revoke a tester, remove their `learner_id` entry from the deployed configuration and
redeploy. Codes are reusable bearer credentials, not single-use invitations; distribute
them privately and keep the CSV in secure storage. Hashes cannot recover lost codes.

### Hosted service operation

Deploy the existing web project with Node functions in `api/ai/`. Set these server-only
environment variables in Vercel; never use a `VITE_` prefix:

| Variable | Purpose |
| --- | --- |
| `AI_ACCESS_CREDENTIAL_HASHES` | JSON object mapping individual learner IDs to lowercase SHA-256 access-code hashes. Codes must be 32–256 characters. Remove an entry to revoke its sessions. |
| `AI_SESSION_SIGNING_KEY` | Random secret of at least 32 characters for one-hour session tokens. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Secure Redis REST endpoint and token for atomic usage and concurrent-run admission. |
| `AI_GATEWAY_API_KEY` | Optional Vercel AI Gateway key. Only `inclusionai/ling-3.0-flash-fin` and `poolside/laguna-s-2.1-free` are selected, in that order, and only while every live catalogue price field is zero for each route. |
| `OPENROUTER_API_KEY` | Preferred provider. The pinned `nvidia/nemotron-3-ultra-550b-a55b:free` and `google/gemma-4-31b-it:free` routes precede `openrouter/free`; each is selected only while the live catalogue reports zero pricing and tool support. Free-account rate limits still apply. |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GOOGLE_FREE_TIER_CONFIRMED=1` | Optional final fallback through Gemini 2.5 Flash Lite. Set the confirmation only for a project verified to remain on the free tier. |
| `AI_SERVICE_DISABLED=1` | Immediately refuse new sessions and inference requests. |

At least one provider key is required for inference. If access or Redis configuration is missing,
the service fails closed. Default admission is 50 inference steps per learner per day, 600 per
month, 1,000 globally per day, six per learner per minute, with two learner and twelve global
in-flight steps. Multi-step tool conversations consume multiple steps. Responses are limited to
768 output tokens per step, eight continuations and a 30-second request timeout. The server
never accepts a client-selected model. Review actual provider pricing and free-tier conditions
before enabling a key. No paid route is configured by this implementation.

The hosted flow has browser and unpacked Windows Electron fixture tests. The preview deployment
has completed live read, approved-write, rejected-write and Stop checks using zero-priced
OpenRouter routes. The packaged app still needs a check on the target managed network. Keep the
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
