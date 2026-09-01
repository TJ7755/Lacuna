# Lacuna AI MCP companion

This is the terminal half of Lacuna's paired AI conversation. It is a standard stdio MCP server;
it does not contain a model, choose a terminal harness or store model credentials.

The companion can invoke Lacuna's existing typed domain tools for one active run. Lacuna performs
the registry lookup, validation, live scope resolution and repository write in the browser; the
terminal never receives IndexedDB access or an approval bearer token. Durable learner memories are
available through the same scoped, approved domain-tool path rather than a companion-owned store.

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

The companion serialises all public operations through its single terminal-mailbox writer. A host
may issue calls concurrently without manufacturing a stale-generation race. Claimed messages use
a five-minute lease so approval and ordinary multi-tool work do not expire while the user is still
responding. Empty bounded waits publish a throttled heartbeat at most once per minute so Lacuna can
show a quiet connection when the running task stops checking in. A heartbeat write cannot extend the
wait deadline; an uncertain timed-out write requires reconnection.

## Tools

- `lacuna.connect`
- `lacuna.wait_for_message` — waits for at most 25 seconds; an empty result means call it again.
- `lacuna.invoke_tool` — invokes one existing `lacuna.*` domain tool for the active run.
- `lacuna.reply`
- `lacuna.disconnect`

`lacuna.reply` is bound to the claimed `runId` and `messageId`. It refreshes Stop state before
writing, so a late reply is refused after Lacuna records **Stop requested**. Stop is cooperative:
it blocks later relay replies but cannot terminate inference already running inside the chosen
model or harness.

Reads execute without a prompt. Course-scoped writes require a browser approval which lasts only
for that connection and course. Course creation uses a one-shot approval bound to the exact call,
input digest and requested course name; destructive actions use the same exact-call binding and
consume their approval once. Stop blocks later tool calls as well as replies. Successful writes
return a structured receipt built from the repository result.

The default relay is `https://lacuna-relay.vercel.app`. A custom relay may be supplied to
`lacuna.connect`; plain HTTP is accepted only for loopback development.
