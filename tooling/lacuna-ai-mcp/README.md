# Lacuna AI MCP companion

## Build

From the Lacuna repository root:

```sh
node apps/relay/scripts/security-bun.mjs install --frozen-lockfile
bun run build:ai-mcp
```

Configure the terminal harness to launch this command as an MCP server, replacing the path with the
absolute path to this checkout:

```text
node /absolute/path/to/Lacuna/tooling/lacuna-ai-mcp/dist/index.js
```

The exact configuration file differs by harness; the command and arguments do not. Once the server
is available, enable AI in Lacuna, select **Connect terminal**, then paste the displayed instruction
into the running terminal task. Keep the terminal task running throughout the paired conversation.
