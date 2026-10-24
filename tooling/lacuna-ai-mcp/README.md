# Lacuna AI MCP companion

This is the terminal half of Lacuna's paired AI conversation. It is a standard stdio MCP server;
it does not contain a model, choose a terminal harness or store model credentials.

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
returns complete replies with `lacuna.reply`. Domain work uses `lacuna.invoke_tool` with a stable
`callId`; exact retries replay the recorded result instead of repeating the mutation.

Use `lacuna.invoke_tool` to call `lacuna.list_tools` before guessing a domain-tool name. The
catalogue contains descriptions, input schemas and permission levels; unknown names return likely
alternatives. For learner-facing requests, `lacuna.find_course` resolves Course or deck wording and
`lacuna.search_cards` returns compact, cursor-paginated content rather than full scheduling records.

Pairing uses outbound HTTPS from the browser and terminal. It needs no browser extension,
WebSocket, inbound localhost listener or terminal access to the browser profile.

The task must remain running. MCP does not turn an idle terminal conversation into a background
daemon.
