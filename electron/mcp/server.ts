// Hosts the Model Context Protocol stdio server inside the Electron main process
// (next_plan.md Arc 2 Section 2.1/2.6, Task 9). Tool *definitions* live in
// src/mcp/registry.ts and their handlers run inside the renderer — the only process with
// IndexedDB (Section 2.1's "Where tool handlers execute"). This module only registers each
// definition's name/description/schema with the MCP SDK and relays invocations to the
// renderer over IPC, using the pure correlation/timeout logic in
// src/mcp/bridge/dispatcher.ts.
//
// Invocation. An MCP client launches Lacuna itself as its stdio subprocess, e.g.:
//   claude mcp add lacuna -- /Applications/Lacuna.app/Contents/MacOS/Lacuna
// (Windows: the installed .exe; dev smoke test: `electron .` from the repo root after
// `bun run electron:build`'s tsc/esbuild steps, or `bun run electron:dev` while the app is
// already open). The MCP server starts unconditionally alongside the normal renderer
// window (Section 2.6) — there is no separate headless mode, since tool execution needs
// the renderer's IndexedDB regardless of how the process was launched.
//
// Stdout corruption (Section 2.10, "Bridge deadlock" neighbour risk; Task 9's brief calls
// this out explicitly). StdioServerTransport speaks newline-delimited JSON-RPC over
// process.stdout, so anything else written there — electron-log's console transport, a
// stray console.log/info/debug from this process or a dependency — corrupts the channel.
// `silenceStdoutNoise()` therefore (a) disables electron-log's console transport (its file
// transport is untouched) and (b) redirects console.log/info/debug to stderr, which is
// always safe for an MCP client since only stdout carries protocol frames.
// console.error/warn already default to stderr in Node and are left alone. Chromium's own
// GPU/renderer diagnostics are not implicated: Electron only routes them to stdout when
// launched with --enable-logging=stdout, which nothing here does.

import { app, ipcMain, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import log from 'electron-log';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_REGISTRY, MCP_TOOL_SURFACE_VERSION } from '../../src/mcp/registry.js';
import type { McpInvokeRequest, McpInvokeResponse, McpToolError } from '../../src/mcp/bridge/protocol.js';
import { InvokeDispatcher } from '../../src/mcp/bridge/dispatcher.js';
import { GrantStore, courseIdOrGlobal, resolveGrant } from '../../src/mcp/grants.js';
import type { ToolDefinition } from '../../src/mcp/types.js';

const RENDERER_TIMEOUT_MS = 10_000;

export interface McpStatus {
  running: boolean;
  toolCount: number;
  toolSurfaceVersion: number;
}

let dispatcher: InvokeDispatcher | null = null;
let grantStore: GrantStore | null = null;
let mcpServer: McpServer | null = null;
let transport: StdioServerTransport | null = null;
let started = false;

/** See the module doc comment's "Stdout corruption" section. */
function silenceStdoutNoise(): void {
  log.transports.console.level = false;
  const toStderr = (...args: unknown[]): void => {
    process.stderr.write(`${args.map(String).join(' ')}\n`);
  };
  // eslint-disable-next-line no-console -- redirecting console output IS the mitigation.
  console.log = toStderr;
  // eslint-disable-next-line no-console
  console.info = toStderr;
  // eslint-disable-next-line no-console
  console.debug = toStderr;
}

/** Every tool takes an explicit `courseId`, or none for the global-scope tools (Arc 2 Section 2.4). */
function extractCourseId(input: unknown): string | undefined {
  if (input && typeof input === 'object' && 'courseId' in input) {
    const value = (input as Record<string, unknown>).courseId;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * TASK 11 SEAM — this is the one function Task 11 replaces. Read tools are always allowed
 * and simply record the implicit read grant (Section 2.4: "read access is granted
 * implicitly on first read-tool call"). Write/destructive tools are meant to block on a
 * renderer consent prompt (`McpConsentPrompt`, Task 11) the first time per course per
 * process; that prompt does not exist yet, so this permissively auto-grants instead of
 * returning `forbidden`, purely so the transport can be smoke-tested end to end now
 * (Task 9's brief: "No consent UI yet — grants default to a permissive stub"). Task 11
 * swaps the `store.grant(...)` auto-grant branch below for an IPC round-trip that awaits
 * the user's decision; nothing else in this file needs to change.
 */
function ensureGrant(store: GrantStore, tool: ToolDefinition, courseId: string): void {
  if (tool.requiredScope === 'read') {
    store.ensureImplicitRead(courseId);
    return;
  }
  const outcome = resolveGrant(store, tool.requiredScope, courseId);
  if (!outcome.ok) {
    store.grant(courseId, tool.requiredScope, 'auto-granted (Task 9 stub — Task 11 adds consent prompt)');
  }
}

function errorToCallToolResult(error: McpToolError): CallToolResult {
  // Never leaks a raw stack trace — `error.message` is already one of the curated
  // McpToolError messages from src/mcp/registry.ts's validateAndRun or a tool handler's
  // McpToolException (src/mcp/types.ts). The `kind` is folded into the text since
  // CallToolResult has no separate machine-readable error-code field.
  return {
    isError: true,
    content: [{ type: 'text', text: `[${error.kind}] ${error.message}` }],
  };
}

/** Reports the server's live status for `settings/McpSection.tsx` (Task 11) via `mcp:status`. */
export function getMcpStatus(): McpStatus {
  return {
    running: started,
    toolCount: TOOL_REGISTRY.length,
    toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
  };
}

/**
 * Registers a single tool definition with the MCP SDK. The callback dispatches to the
 * renderer and awaits a correlated reply; every branch returns a `CallToolResult` (never
 * throws), so a handler failure surfaces to the agent as a normal tool error.
 */
function registerBridgedTool(server: McpServer, tool: ToolDefinition, store: GrantStore, invoke: InvokeDispatcher): void {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema },
    async (rawInput: unknown): Promise<CallToolResult> => {
      const parsed = tool.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return errorToCallToolResult({ kind: 'validation', message: parsed.error.message });
      }

      const courseId = courseIdOrGlobal(extractCourseId(parsed.data));
      ensureGrant(store, tool, courseId);

      const request: McpInvokeRequest = {
        id: randomUUID(),
        tool: tool.name,
        input: parsed.data,
        agentId: 'stdio-mcp-client',
      };
      const response = await invoke.dispatch(request);
      if (response.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(response.result) }] };
      }
      return errorToCallToolResult(response.error);
    },
  );
}

function registerServerInfoTool(server: McpServer, store: GrantStore): void {
  server.registerTool(
    'lacuna.get_server_info',
    {
      description:
        'Report the running Lacuna app name/version and the MCP tool-surface version, so a client can detect a stale cached tool list.',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      // No courseId — gated against the global pseudo-course like the other no-courseId
      // read tools (src/mcp/grants.ts's GLOBAL_SCOPE_KEY doc comment).
      store.ensureImplicitRead(courseIdOrGlobal(undefined));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              name: app.getName(),
              version: app.getVersion(),
              toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
            }),
          },
        ],
      };
    },
  );
}

/**
 * Starts the stdio MCP server. `getWindow` is called on every dispatch (not captured once)
 * so a closed-then-reopened window is picked up without restarting the server. Idempotent —
 * a second call while already running is a no-op.
 */
export async function startMcpServer(getWindow: () => BrowserWindow | null): Promise<void> {
  if (started) return;
  silenceStdoutNoise();

  grantStore = new GrantStore();
  dispatcher = new InvokeDispatcher((request) => {
    const window = getWindow();
    if (!window || window.webContents.isDestroyed()) {
      // No window to deliver to. Resolve immediately with the same "not open" error the
      // dispatcher's own timeout would otherwise produce after the full 10s, rather than
      // making the agent wait needlessly for a window that is not coming back this call.
      dispatcher?.resolvePending({
        id: request.id,
        ok: false,
        error: { kind: 'internal', message: 'Lacuna window is not open or still loading.' },
      });
      return;
    }
    window.webContents.send('mcp:invoke', request);
  }, RENDERER_TIMEOUT_MS);

  ipcMain.on('mcp:invoke:reply', (_event, response: McpInvokeResponse) => {
    dispatcher?.resolvePending(response);
  });

  mcpServer = new McpServer({ name: 'lacuna', version: app.getVersion() });

  registerServerInfoTool(mcpServer, grantStore);
  for (const tool of TOOL_REGISTRY) {
    registerBridgedTool(mcpServer, tool, grantStore, dispatcher);
  }

  transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  started = true;
}

/** Stops the stdio MCP server and drops all in-memory state, including every grant. */
export async function stopMcpServer(): Promise<void> {
  if (!started) return;
  ipcMain.removeAllListeners('mcp:invoke:reply');
  await mcpServer?.close();
  mcpServer = null;
  transport = null;
  dispatcher = null;
  grantStore = null;
  started = false;
}
