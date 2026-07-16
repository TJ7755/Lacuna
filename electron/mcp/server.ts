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

import { app, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import log from 'electron-log';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_REGISTRY, MCP_TOOL_SURFACE_VERSION } from '../../src/mcp/registry.js';
import type { McpConsentRequest, McpInvokeRequest, McpScopeResolutionRequest, McpScopeResolutionResponse, McpScopeTarget, McpToolError } from '../../src/mcp/bridge/protocol.js';
import { InvokeDispatcher } from '../../src/mcp/bridge/dispatcher.js';
import { ConsentCoordinator } from '../../src/mcp/bridge/consentCoordinator.js';
import { isMcpConsentResponse, isMcpInvokeResponse, isMcpScopeResolutionResponse } from '../../src/mcp/bridge/ipcValidation.js';
import { GrantStore, courseIdOrGlobal, resolveGrant } from '../../src/mcp/grants.js';
import type { McpGrant, ToolDefinition } from '../../src/mcp/types.js';

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
const pendingConsent = new Map<string, (approved: boolean) => void>();
const pendingScopes = new Map<string, (response: McpScopeResolutionResponse) => void>();
const consentCoordinator = new ConsentCoordinator();

function isActiveRendererEvent(
  event: IpcMainEvent | IpcMainInvokeEvent,
  getWindow: () => BrowserWindow | null,
): boolean {
  const window = getWindow();
  return !!window && !window.isDestroyed() && !window.webContents.isDestroyed() &&
    event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
}

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

async function resolveScopes(
  tool: ToolDefinition,
  input: unknown,
  getWindow: () => BrowserWindow | null,
): Promise<{ ok: true; targets: McpScopeTarget[] } | { ok: false; error: McpToolError }> {
  const window = getWindow();
  if (!window || window.webContents.isDestroyed()) {
    return { ok: false, error: { kind: 'internal', message: 'Lacuna window is not open or still loading.' } };
  }
  const id = randomUUID();
  const request: McpScopeResolutionRequest = { id, tool: tool.name, input };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingScopes.delete(id);
      resolve({ ok: false, error: { kind: 'internal', message: 'Lacuna did not resolve the tool scope in time.' } });
    }, RENDERER_TIMEOUT_MS);
    pendingScopes.set(id, (response) => {
      clearTimeout(timeout);
      pendingScopes.delete(id);
      resolve(response.ok ? { ok: true, targets: response.targets } : { ok: false, error: response.error });
    });
    window.webContents.send('mcp:scope', request);
  });
}

/** Applies implicit read access or waits for a bounded, fail-closed renderer decision. */
async function ensureGrant(
  store: GrantStore,
  tool: ToolDefinition,
  courseId: string,
  getWindow: () => BrowserWindow | null,
  label?: string,
): Promise<{ ok: true; grant: McpGrant } | { ok: false; error: McpToolError }> {
  if (tool.requiredScope === 'read') {
    const existing = store.get(courseId);
    const grant = store.ensureImplicitRead(courseId, label);
    if (!existing) getWindow()?.webContents.send('mcp:grant-notice', { courseId, tool: tool.name });
    return { ok: true, grant };
  }
  const outcome = resolveGrant(store, tool.requiredScope, courseId);
  if (outcome.ok) return { ok: true, grant: store.get(courseId)! };

  const window = getWindow();
  if (!window || window.webContents.isDestroyed()) return { ok: false, error: outcome.error };
  const id = randomUUID();
  const request: McpConsentRequest = { id, tool: tool.name, courseId, scope: tool.requiredScope };
  const approved = await consentCoordinator.request(courseId, tool.requiredScope, () =>
    new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        pendingConsent.delete(id);
        resolve(false);
      }, RENDERER_TIMEOUT_MS);
      pendingConsent.set(id, (value) => {
        clearTimeout(timeout);
        pendingConsent.delete(id);
        resolve(value);
      });
      window.webContents.send('mcp:consent', request);
    }),
  );
  if (!approved) return { ok: false, error: outcome.error };
  return { ok: true, grant: store.grant(courseId, tool.requiredScope, label) };
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
    toolCount: TOOL_REGISTRY.length + 1,
    toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
  };
}

/**
 * Registers a single tool definition with the MCP SDK. The callback dispatches to the
 * renderer and awaits a correlated reply; every branch returns a `CallToolResult` (never
 * throws), so a handler failure surfaces to the agent as a normal tool error.
 */
function registerBridgedTool(server: McpServer, tool: ToolDefinition, store: GrantStore, invoke: InvokeDispatcher, getWindow: () => BrowserWindow | null): void {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema },
    async (rawInput: unknown): Promise<CallToolResult> => {
      const parsed = tool.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return errorToCallToolResult({ kind: 'validation', message: parsed.error.message });
      }

      const scopes = await resolveScopes(tool, parsed.data, getWindow);
      if (!scopes.ok) return errorToCallToolResult(scopes.error);
      if (scopes.targets.length !== 1) {
        return errorToCallToolResult({ kind: 'conflict', message: 'A single MCP tool call must resolve to exactly one permission scope.' });
      }
      const target = scopes.targets[0];
      const authorised = await ensureGrant(store, tool, target.courseId, getWindow, target.label);
      if (!authorised.ok) return errorToCallToolResult(authorised.error);

      const request: McpInvokeRequest = {
        id: randomUUID(),
        tool: tool.name,
        input: parsed.data,
        agentId: 'stdio-mcp-client',
        grant: authorised.grant,
      };
      const response = await invoke.dispatch(request);
      if (response.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(response.result) }] };
      }
      return errorToCallToolResult(response.error);
    },
  );
}

function registerServerInfoTool(server: McpServer, store: GrantStore, getWindow: () => BrowserWindow | null): void {
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
      const courseId = courseIdOrGlobal(undefined);
      const existing = store.get(courseId);
      store.ensureImplicitRead(courseId, 'All Lacuna data');
      if (!existing) getWindow()?.webContents.send('mcp:grant-notice', { courseId, tool: 'lacuna.get_server_info' });
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

  ipcMain.on('mcp:invoke:reply', (event, response: unknown) => {
    if (!isActiveRendererEvent(event, getWindow) || !isMcpInvokeResponse(response)) return;
    dispatcher?.resolvePending(response);
  });
  ipcMain.on('mcp:consent:reply', (event, response: unknown) => {
    if (!isActiveRendererEvent(event, getWindow) || !isMcpConsentResponse(response)) return;
    pendingConsent.get(response.id)?.(response.approved);
  });
  ipcMain.on('mcp:scope:reply', (event, response: unknown) => {
    if (!isActiveRendererEvent(event, getWindow) || !isMcpScopeResolutionResponse(response)) return;
    pendingScopes.get(response.id)?.(response);
  });
  ipcMain.handle('mcp:grants:list', (event) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP grant request.');
    return grantStore?.list() ?? [];
  });
  ipcMain.handle('mcp:grants:grant', (event, courseId: unknown, scope: unknown, label?: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP grant request.');
    if (!grantStore) throw new Error('MCP server is not running.');
    if (typeof courseId !== 'string' || courseId.length === 0 ||
      (scope !== 'read' && scope !== 'write' && scope !== 'destructive') ||
      (label !== undefined && typeof label !== 'string')) {
      throw new Error('Invalid MCP grant request.');
    }
    return grantStore.grant(courseId, scope, label);
  });
  ipcMain.handle('mcp:grants:revoke', (event, courseId: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP revoke request.');
    if (typeof courseId !== 'string' || courseId.length === 0) throw new Error('Invalid MCP revoke request.');
    grantStore?.revoke(courseId);
  });

  mcpServer = new McpServer({ name: 'lacuna', version: app.getVersion() });

  registerServerInfoTool(mcpServer, grantStore, getWindow);
  for (const tool of TOOL_REGISTRY) {
    registerBridgedTool(mcpServer, tool, grantStore, dispatcher, getWindow);
  }

  transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  started = true;
}

/** Stops the stdio MCP server and drops all in-memory state, including every grant. */
export async function stopMcpServer(): Promise<void> {
  if (!started) return;
  ipcMain.removeAllListeners('mcp:invoke:reply');
  ipcMain.removeAllListeners('mcp:consent:reply');
  ipcMain.removeAllListeners('mcp:scope:reply');
  ipcMain.removeHandler('mcp:grants:list');
  ipcMain.removeHandler('mcp:grants:grant');
  ipcMain.removeHandler('mcp:grants:revoke');
  for (const resolve of pendingConsent.values()) resolve(false);
  pendingConsent.clear();
  consentCoordinator.clear();
  for (const resolve of pendingScopes.values()) {
    resolve({ id: '', ok: false, error: { kind: 'internal', message: 'MCP server stopped.' } });
  }
  pendingScopes.clear();
  await mcpServer?.close();
  mcpServer = null;
  transport = null;
  dispatcher = null;
  grantStore = null;
  started = false;
}
