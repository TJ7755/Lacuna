// Hosts the Model Context Protocol stdio server inside the Electron main process
// (docs/archive/roadmap-2026-08-11.md Arc 2 Section 2.1/2.6, Task 9). Tool *definitions* live in
// src/mcp/registry.ts and their handlers run inside the renderer — the only process with
// IndexedDB (Section 2.1's "Where tool handlers execute"). This module only registers each
// definition's name/description/schema with the MCP SDK and relays invocations to the
// renderer over IPC, using the pure correlation/timeout logic in
// src/mcp/bridge/dispatcher.ts.
//
// Invocation. The normal application owns the renderer and authenticated local broker. MCP
// clients launch a disposable --mcp-companion or --ai-companion stdio process, which forwards to
// that broker while keeping IndexedDB and permission decisions inside the renderer. The embedded
// stdio server remains for legacy cold-start clients.
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
import { promises as fs } from 'node:fs';
import net, { type Server as NetServer, type Socket } from 'node:net';
import log from 'electron-log';
import { z } from 'zod';
import { McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { TOOL_REGISTRY, MCP_TOOL_SURFACE_VERSION, getTool } from '../../src/mcp/registry.js';
import type { McpConsentRequest, McpInvokeRequest, McpScopeResolutionRequest, McpScopeResolutionResponse, McpScopeTarget, McpToolError } from '../../src/mcp/bridge/protocol.js';
import { InvokeDispatcher } from '../../src/mcp/bridge/dispatcher.js';
import { ConsentCoordinator } from '../../src/mcp/bridge/consentCoordinator.js';
import { isMcpConsentResponse, isMcpInvokeResponse, isMcpScopeResolutionResponse } from '../../src/mcp/bridge/ipcValidation.js';
import { GrantStore, courseIdOrGlobal, resolveGrant } from '../../src/mcp/grants.js';
import type { McpGrant, ToolDefinition } from '../../src/mcp/types.js';
import type { McpClientConnection, McpClientIdentity } from '../../src/mcp/connections.js';
import { McpConnectionStore } from '../../src/mcp/connections.js';
import {
  CompanionLineDecoder,
  encodeCompanionMessage,
  isAiCompanionRequest,
  isAiRendererReply,
  isCompanionRequest,
  type AiCompanionResponse,
  type CompanionResponse,
} from '../../src/mcp/companionProtocol.js';
import {
  companionLaunchCommand,
  companionProcessUserDataPath,
  removeCompanionConnectionFile,
  writeCompanionConnectionFile,
  type CompanionConnectionFile,
} from './connectionFile.js';
import { authoriseCompanionHello, type CompanionPurpose } from './companionAuth.js';
import { AiRendererDispatcher } from './aiDispatcher.js';
import { AiRendererAvailability } from './rendererAvailability.js';
import { AiChannelRegistry } from './aiChannelRegistry.js';

const RENDERER_TIMEOUT_MS = 10_000;
const AI_RENDERER_READY_TIMEOUT_MS = 5_000;

export interface McpStatus {
  running: boolean;
  toolCount: number;
  toolSurfaceVersion: number;
  clients: McpClientConnection[];
  companion: { command: string; args: string[]; env?: Record<string, string> };
  aiCompanion: { command: string; args: string[]; env?: Record<string, string> };
  aiRenderer: { status: 'ready' | 'waiting' | 'unavailable' };
}

let dispatcher: InvokeDispatcher | null = null;
let grantStore: GrantStore | null = null;
let stdioHandle: StdioServerHandle | null = null;
let companionServer: NetServer | null = null;
let companionConnection: CompanionConnectionFile | null = null;
let companionLaunchCommands: Pick<McpStatus, 'companion' | 'aiCompanion'> | null = null;
let activeWindowProvider: (() => BrowserWindow | null) | null = null;
const companionSockets = new Set<Socket>();
const aiCompanionChannels = new AiChannelRegistry();
const companionClients = new McpConnectionStore();
const aiDispatcher = new AiRendererDispatcher();
const aiRendererAvailability = new AiRendererAvailability(() => {
  aiDispatcher.close();
  aiCompanionChannels.terminateAll();
});
let started = false;
const pendingConsent = new Map<string, (approved: boolean) => void>();
const pendingScopes = new Map<string, (response: McpScopeResolutionResponse) => void>();
const consentCoordinator = new ConsentCoordinator();

function sendCompanion(socket: Socket, response: CompanionResponse): void {
  if (!socket.destroyed) socket.write(encodeCompanionMessage(response));
}

function sendAiCompanion(socket: Socket, response: AiCompanionResponse): void {
  if (!socket.destroyed) socket.write(encodeCompanionMessage(response));
}

function rendererCanHandleAi(getWindow: () => BrowserWindow | null): boolean {
  const window = getWindow();
  return !!window && !window.isDestroyed() && aiRendererAvailability.canHandle(window.webContents);
}

async function waitForAiRenderer(getWindow: () => BrowserWindow | null): Promise<boolean> {
  const window = getWindow();
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
  if (!await aiRendererAvailability.waitUntilReady(
    window.webContents,
    AI_RENDERER_READY_TIMEOUT_MS,
  )) return false;
  return getWindow() === window && rendererCanHandleAi(getWindow);
}

function rendererSubscriptionId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function notifyAiDisconnected(channelId: string, getWindow: () => BrowserWindow | null): void {
  if (!rendererCanHandleAi(getWindow)) return;
  getWindow()!.webContents.send('ai:disconnected', { channelId });
}

async function startCompanionBroker(
  invoke: InvokeDispatcher,
  getWindow: () => BrowserWindow | null,
): Promise<void> {
  const userDataPath = app.getPath('userData');
  companionConnection = await writeCompanionConnectionFile(userDataPath, app.getVersion());
  if (process.platform !== 'win32') await fs.rm(companionConnection.endpoint, { force: true });

  companionServer = net.createServer((socket) => {
    companionSockets.add(socket);
    const decoder = new CompanionLineDecoder();
    let purpose: CompanionPurpose | null = null;
    let connectionId: string | null = null;
    let aiChannelId: string | null = null;
    let processing = Promise.resolve();
    let closing = false;

    const close = () => {
      closing = true;
      companionSockets.delete(socket);
      if (aiChannelId) aiCompanionChannels.delete(aiChannelId);
      if (connectionId) companionClients.disconnect(connectionId);
      if (aiChannelId) {
        aiDispatcher.cancelChannel(aiChannelId);
        notifyAiDisconnected(aiChannelId, getWindow);
      }
      connectionId = null;
      aiChannelId = null;
    };
    const fail = (error: unknown) => {
      if (closing) return;
      closing = true;
      sendCompanion(socket, {
        type: 'fatal',
        error: { kind: 'internal', message: error instanceof Error ? error.message : 'MCP companion connection failed.' },
      });
      socket.end();
    };
    const processMessage = async (value: unknown): Promise<void> => {
      if (closing) return;
      if (!purpose) {
        if (!companionConnection) throw new Error('The companion broker is unavailable.');
        if (authoriseCompanionHello(value, 'data', companionConnection.token)) {
          companionClients.connect(value.client);
          connectionId = value.client.connectionId;
          purpose = 'data';
          sendCompanion(socket, {
            type: 'ready',
            protocolVersion: companionConnection.protocolVersion,
            appVersion: companionConnection.appVersion,
          });
          return;
        }
        if (authoriseCompanionHello(value, 'ai', companionConnection.aiToken)) {
          aiChannelId = randomUUID();
          purpose = 'ai';
          aiCompanionChannels.add(aiChannelId, socket);
          sendAiCompanion(socket, {
            type: 'ai_ready',
            protocolVersion: companionConnection.protocolVersion,
            appVersion: companionConnection.appVersion,
          });
          return;
        }
        const aiHandshake = isAiCompanionRequest(value) && value.type === 'ai_hello';
        const response = { type: 'fatal', error: {
          kind: 'forbidden',
          message: `${aiHandshake ? 'AI' : 'MCP'} companion authentication failed.`,
        } } as const;
        if (aiHandshake) sendAiCompanion(socket, response);
        else sendCompanion(socket, response);
        closing = true;
        socket.end();
        return;
      }

      if (purpose === 'ai') {
        if (!isAiCompanionRequest(value) || value.type !== 'ai_request' || !aiChannelId) {
          sendAiCompanion(socket, {
            type: 'fatal',
            error: { kind: 'forbidden', message: 'Invalid message for the AI companion connection.' },
          });
          closing = true;
          socket.end();
          return;
        }
        const result = await waitForAiRenderer(getWindow)
          ? await aiDispatcher.dispatch(aiChannelId, value.id, value.request, (request) => {
              getWindow()!.webContents.send('ai:request', request);
            })
          : {
              ok: false as const,
              error: {
                kind: 'unavailable' as const,
                reason: 'disconnected' as const,
                message: 'Lacuna AI did not become ready. Keep Lacuna open with AI enabled, restart the AI runtime, then reconnect.',
              },
            };
        sendAiCompanion(socket, { type: 'ai_result', id: value.id, result });
        if (value.request.type === 'disconnect' ||
          (!result.ok && result.error.kind === 'unavailable')) {
          socket.end();
        }
        return;
      }

      if (!isCompanionRequest(value)) {
        sendCompanion(socket, {
          type: 'fatal',
          error: { kind: 'forbidden', message: 'Invalid message for the data companion connection.' },
        });
        closing = true;
        socket.end();
        return;
      }
      if (value.type !== 'call' || value.client.connectionId !== connectionId) {
        throw new Error('MCP companion connection identity changed unexpectedly.');
      }
      companionClients.updateIdentity(value.client);
      companionClients.touch(value.client.connectionId);
      const tool = getTool(value.tool);
      if (!tool) {
        sendCompanion(socket, { type: 'result', id: value.id, ok: false, error: { kind: 'not_found', message: `Unknown tool "${value.tool}".` } });
        return;
      }
      const result = await executeBridgedTool(
        tool,
        value.input,
        companionClients.grants(value.client.connectionId),
        invoke,
        getWindow,
        value.client,
      );
      sendCompanion(socket, { type: 'result', id: value.id, ok: true, result });
    };
    socket.once('close', close);
    socket.on('error', (error) => log.warn('MCP companion connection failed', error));
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      if (closing) return;
      let messages: unknown[];
      try {
        messages = decoder.push(chunk);
      } catch (error) {
        processing = processing.then(() => { throw error; }).catch(fail);
        return;
      }
      for (const message of messages) {
        processing = processing.then(() => processMessage(message)).catch(fail);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const server = companionServer!;
    server.once('error', reject);
    server.listen(companionConnection!.endpoint, () => {
      server.off('error', reject);
      resolve();
    });
  });
  if (process.platform !== 'win32') await fs.chmod(companionConnection.endpoint, 0o600);
}

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
  client: McpClientIdentity,
  label?: string,
): Promise<{ ok: true; grant: McpGrant } | { ok: false; error: McpToolError }> {
  if (tool.requiredScope === 'read') {
    const existing = store.get(courseId);
    const grant = store.ensureImplicitRead(courseId, label);
    if (!existing) getWindow()?.webContents.send('mcp:grant-notice', { courseId, tool: tool.name, client });
    return { ok: true, grant };
  }
  const outcome = resolveGrant(store, tool.requiredScope, courseId);
  if (outcome.ok) return outcome;

  const window = getWindow();
  if (!window || window.webContents.isDestroyed()) return { ok: false, error: outcome.error };
  const id = randomUUID();
  const request: McpConsentRequest = { id, tool: tool.name, courseId, scope: tool.requiredScope, client };
  const approved = await consentCoordinator.request(client.connectionId, courseId, tool.requiredScope, () =>
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
  // Never leaks internal state or a raw stack trace. Validation messages may echo the
  // caller's own input. The `kind` is folded into the text since CallToolResult has no
  // separate machine-readable error-code field.
  return {
    isError: true,
    content: [{ type: 'text', text: `[${error.kind}] ${error.message}` }],
  };
}

/** Reports the server's live status for `settings/McpSection.tsx` (Task 11) via `mcp:status`. */
export function getMcpStatus(): McpStatus {
  const environment = {
    appPath: app.getAppPath(),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
    appImageFile: process.env.APPIMAGE,
  };
  companionLaunchCommands ??= {
    companion: companionLaunchCommand({
      ...environment,
      companionUserDataPath: companionProcessUserDataPath(),
    }, '--mcp-companion'),
    aiCompanion: companionLaunchCommand({
      ...environment,
      companionUserDataPath: companionProcessUserDataPath(),
    }, '--ai-companion'),
  };
  const window = activeWindowProvider?.() ?? null;
  return {
    running: started,
    toolCount: TOOL_REGISTRY.length + 1,
    toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
    clients: companionClients.list(),
    ...companionLaunchCommands,
    aiRenderer: {
      status: aiRendererAvailability.status(
        window && !window.isDestroyed() && !window.webContents.isDestroyed()
          ? window.webContents
          : null,
      ),
    },
  };
}

/**
 * Registers a single tool definition with the MCP SDK. The callback dispatches to the
 * renderer and awaits a correlated reply; every branch returns a `CallToolResult` (never
 * throws), so a handler failure surfaces to the agent as a normal tool error.
 */
async function executeBridgedTool(
  tool: ToolDefinition,
  rawInput: unknown,
  store: GrantStore,
  invoke: InvokeDispatcher,
  getWindow: () => BrowserWindow | null,
  client: McpClientIdentity,
): Promise<CallToolResult> {
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
  const authorised = await ensureGrant(store, tool, target.courseId, getWindow, client, target.label);
  if (!authorised.ok) return errorToCallToolResult(authorised.error);

  const request: McpInvokeRequest = {
    id: randomUUID(),
    tool: tool.name,
    input: parsed.data,
    agentId: client.connectionId,
    grant: authorised.grant,
  };
  const response = await invoke.dispatch(request);
  return response.ok
    ? { content: [{ type: 'text', text: JSON.stringify(response.result) }] }
    : errorToCallToolResult(response.error);
}

function clientIdentity(server: McpServer, context: ServerContext, connectionId: string): McpClientIdentity {
  void context;
  const reported = server.server.getClientVersion();
  return {
    connectionId,
    name: reported?.name ?? 'stdio-mcp-client',
    version: reported?.version,
  };
}

function registerBridgedTool(server: McpServer, tool: ToolDefinition, store: GrantStore, invoke: InvokeDispatcher, getWindow: () => BrowserWindow | null, connectionId: string): void {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema },
    async (rawInput: unknown, context: ServerContext): Promise<CallToolResult> =>
      executeBridgedTool(tool, rawInput, store, invoke, getWindow, clientIdentity(server, context, connectionId)),
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
  companionLaunchCommands = null;

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
  ipcMain.on('ai:renderer-ready', (event, value: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) return;
    const subscriptionId = rendererSubscriptionId(value);
    if (subscriptionId === undefined) return;
    aiRendererAvailability.markReady(event.sender, subscriptionId);
    event.sender.send('ai:renderer-ready-ack', subscriptionId);
  });
  ipcMain.on('ai:renderer-unavailable', (event, value: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) return;
    const subscriptionId = rendererSubscriptionId(value);
    if (subscriptionId === undefined) return;
    aiRendererAvailability.markUnavailable(event.sender, subscriptionId);
  });
  ipcMain.on('ai:disconnect-channel', (event, value: unknown) => {
    if (!isActiveRendererEvent(event, getWindow) || typeof value !== 'string' ||
      value.length === 0 || value.length > 160) return;
    aiCompanionChannels.terminate(value);
  });
  ipcMain.on('ai:reply', (event, response: unknown) => {
    if (!isActiveRendererEvent(event, getWindow) || !isAiRendererReply(response)) return;
    aiDispatcher.resolve(response);
  });
  ipcMain.handle('ai:restart-renderer', (event) => {
    if (!isActiveRendererEvent(event, getWindow)) {
      throw new Error('Untrusted AI renderer restart request.');
    }
    if (!aiRendererAvailability.beginRestart(event.sender)) {
      throw new Error('The AI renderer is not ready to restart.');
    }
    event.sender.send('ai:restart-requested');
  });
  ipcMain.handle('mcp:grants:list', (event) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP grant request.');
    return grantStore?.list() ?? [];
  });
  ipcMain.handle('mcp:connections:list', (event) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP connection request.');
    return companionClients.list();
  });
  ipcMain.handle('mcp:connections:grant', (event, connectionId: unknown, courseId: unknown, scope: unknown, label?: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP grant request.');
    if (typeof connectionId !== 'string' || connectionId.length === 0 ||
      typeof courseId !== 'string' || courseId.length === 0 ||
      (scope !== 'read' && scope !== 'write' && scope !== 'destructive') ||
      (label !== undefined && typeof label !== 'string')) {
      throw new Error('Invalid MCP connection grant request.');
    }
    return companionClients.setGrant(connectionId, courseId, scope, label);
  });
  ipcMain.handle('mcp:connections:revoke', (event, connectionId: unknown, courseId: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP revoke request.');
    if (typeof connectionId !== 'string' || connectionId.length === 0 ||
      typeof courseId !== 'string' || courseId.length === 0) {
      throw new Error('Invalid MCP connection revoke request.');
    }
    companionClients.revoke(connectionId, courseId);
  });
  ipcMain.handle('mcp:grants:grant', (event, courseId: unknown, scope: unknown, label?: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP grant request.');
    if (!grantStore) throw new Error('MCP server is not running.');
    if (typeof courseId !== 'string' || courseId.length === 0 ||
      (scope !== 'read' && scope !== 'write' && scope !== 'destructive') ||
      (label !== undefined && typeof label !== 'string')) {
      throw new Error('Invalid MCP grant request.');
    }
    return grantStore.setScope(courseId, scope, label);
  });
  ipcMain.handle('mcp:grants:revoke', (event, courseId: unknown) => {
    if (!isActiveRendererEvent(event, getWindow)) throw new Error('Untrusted MCP revoke request.');
    if (typeof courseId !== 'string' || courseId.length === 0) throw new Error('Invalid MCP revoke request.');
    grantStore?.revoke(courseId);
  });

  await startCompanionBroker(dispatcher, getWindow);

  stdioHandle = serveStdio(() => {
    const connectionId = randomUUID();
    const server = new McpServer({ name: 'lacuna', version: app.getVersion() });
    registerServerInfoTool(server, grantStore!, getWindow);
    for (const tool of TOOL_REGISTRY) {
      registerBridgedTool(server, tool, grantStore!, dispatcher!, getWindow, connectionId);
    }
    return server;
  }, {
    legacy: 'serve',
    onerror: (error) => log.error('MCP stdio transport failed', error),
  });
  activeWindowProvider = getWindow;
  started = true;
}

/** Stops the stdio MCP server and drops all in-memory state, including every grant. */
export async function stopMcpServer(): Promise<void> {
  if (!started) return;
  ipcMain.removeAllListeners('mcp:invoke:reply');
  ipcMain.removeAllListeners('mcp:consent:reply');
  ipcMain.removeAllListeners('mcp:scope:reply');
  ipcMain.removeAllListeners('ai:renderer-ready');
  ipcMain.removeAllListeners('ai:renderer-unavailable');
  ipcMain.removeAllListeners('ai:disconnect-channel');
  ipcMain.removeAllListeners('ai:reply');
  ipcMain.removeHandler('ai:restart-renderer');
  aiRendererAvailability.dispose();
  aiDispatcher.close();
  ipcMain.removeHandler('mcp:grants:list');
  ipcMain.removeHandler('mcp:grants:grant');
  ipcMain.removeHandler('mcp:grants:revoke');
  ipcMain.removeHandler('mcp:connections:list');
  ipcMain.removeHandler('mcp:connections:grant');
  ipcMain.removeHandler('mcp:connections:revoke');
  for (const resolve of pendingConsent.values()) resolve(false);
  pendingConsent.clear();
  consentCoordinator.clear();
  for (const resolve of pendingScopes.values()) {
    resolve({ id: '', ok: false, error: { kind: 'internal', message: 'MCP server stopped.' } });
  }
  pendingScopes.clear();
  for (const socket of companionSockets) socket.destroy();
  companionSockets.clear();
  aiCompanionChannels.terminateAll();
  if (companionServer) {
    await new Promise<void>((resolve) => companionServer!.close(() => resolve()));
    companionServer = null;
  }
  const endpoint = companionConnection?.endpoint;
  companionConnection = null;
  await removeCompanionConnectionFile(app.getPath('userData'));
  if (endpoint && process.platform !== 'win32') await fs.rm(endpoint, { force: true });
  await stdioHandle?.close();
  stdioHandle = null;
  dispatcher = null;
  grantStore = null;
  activeWindowProvider = null;
  companionLaunchCommands = null;
  started = false;
}
