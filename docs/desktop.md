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
