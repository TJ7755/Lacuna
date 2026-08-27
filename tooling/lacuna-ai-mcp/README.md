# Lacuna AI MCP companion

This is the terminal half of Lacuna's paired AI conversation. It is a standard stdio MCP server;
it does not contain a model, choose a terminal harness or store model credentials.

The current companion is deliberately a chat transport. It cannot read or change Courses, Lessons,
Cards, Questions or learner memories. Those domain actions require later integration and must not
be inferred from the existence of Lacuna's separate Electron MCP server.

## Build

From the Lacuna repository root:

```sh
bun install --frozen-lockfile
bun run build:ai-mcp
```

Configure the terminal harness to launch this command as an MCP server, replacing the path with the
absolute path to this checkout:

```text
node /absolute/path/to/Lacuna/tooling/lacuna-ai-mcp/dist/index.js
```

The exact configuration file differs by harness; the command and arguments do not. Once the server
is available, enable AI in Lacuna, select **Connect terminal**, then paste the displayed instruction
into the running terminal task. The agent calls `lacuna.connect`, waits for sidebar messages and
returns complete replies with `lacuna.reply`.

Pairing uses outbound HTTPS from the browser and terminal. It needs no browser extension,
WebSocket, inbound localhost listener or terminal access to the browser profile.

The task must remain running. MCP does not turn an idle terminal conversation into a background
daemon.

## Tools

- `lacuna.connect`
- `lacuna.wait_for_message` — waits for at most 25 seconds; an empty result means call it again.
- `lacuna.reply`
- `lacuna.disconnect`

`lacuna.reply` is bound to the claimed `runId` and `messageId`. It refreshes Stop state before
writing, so a late reply is refused after Lacuna records **Stop requested**. Stop is cooperative:
it blocks later relay replies but cannot terminate inference already running inside the chosen
model or harness.

The default relay is `https://lacuna-relay.vercel.app`. A custom relay may be supplied to
`lacuna.connect`; plain HTTP is accepted only for loopback development.
