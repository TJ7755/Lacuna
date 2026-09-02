import { app, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer, CallToolResult } from '@modelcontextprotocol/server';
import {
  TOOL_CONTRACT_REGISTRY,
  MCP_TOOL_SURFACE_VERSION,
} from '../../src/mcp/contracts/registry.js';
import type {
  McpConsentRequest,
  McpInvokeRequest,
  McpScopeResolutionRequest,
  McpScopeResolutionResponse,
  McpScopeTarget,
  McpToolError,
} from '../../src/mcp/bridge/protocol.js';
import { InvokeDispatcher } from '../../src/mcp/bridge/dispatcher.js';
import { ConsentCoordinator } from '../../src/mcp/bridge/consentCoordinator.js';
import {
  isMcpConsentResponse,
  isMcpInvokeResponse,
  isMcpScopeResolutionResponse,
} from '../../src/mcp/bridge/ipcValidation.js';
import { GrantStore, courseIdOrGlobal, resolveGrant } from '../../src/mcp/grants.js';
import type { McpGrant, ToolContract } from '../../src/mcp/types.js';
import type { McpClientIdentity } from '../../src/mcp/connections.js';

const RENDERER_TIMEOUT_MS = 10_000;
const SERVER_STOPPED_ERROR = { kind: 'internal', message: 'MCP server stopped.' } as const;

type McpWindowProvider = () => BrowserWindow | null;

function errorToCallToolResult(error: McpToolError): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `[${error.kind}] ${error.message}` }],
  };
}

/**
 * Owns the complete data-tool bridge: renderer IPC, process grants, consent and scope
 * decisions, tool execution, and registration with the MCP SDK.
 */
export class DataBridge {
  private dispatcher: InvokeDispatcher | null = null;
  private grantStore: GrantStore | null = null;
  private readonly pendingConsent = new Map<string, (approved: boolean) => void>();
  private readonly pendingScopes = new Map<string, (response: McpScopeResolutionResponse) => void>();
  private readonly consentCoordinator = new ConsentCoordinator();
  private closed = true;

  constructor(private readonly getWindow: McpWindowProvider) {}

  start(): void {
    this.closed = false;
    this.grantStore = new GrantStore();
    this.dispatcher = new InvokeDispatcher((request) => {
      const window = this.getWindow();
      if (!window || window.webContents.isDestroyed()) {
        this.dispatcher?.resolvePending({
          id: request.id,
          ok: false,
          error: { kind: 'internal', message: 'Lacuna window is not open or still loading.' },
        });
        return;
      }
      window.webContents.send('mcp:invoke', request);
    }, RENDERER_TIMEOUT_MS);

    try {
      ipcMain.on('mcp:invoke:reply', this.onInvokeReply);
      ipcMain.on('mcp:consent:reply', this.onConsentReply);
      ipcMain.on('mcp:scope:reply', this.onScopeReply);
      ipcMain.handle('mcp:grants:list', this.listGrants);
      ipcMain.handle('mcp:grants:grant', this.grantScope);
      ipcMain.handle('mcp:grants:revoke', this.revokeGrant);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  registerTools(server: McpServer): void {
    const store = this.requireGrantStore();
    const connectionId = randomUUID();
    this.registerServerInfoTool(server, store);
    for (const tool of TOOL_CONTRACT_REGISTRY) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (rawInput: unknown): Promise<CallToolResult> =>
          this.execute(tool, rawInput, store, this.clientIdentity(server, connectionId)),
      );
    }
  }

  execute(
    tool: ToolContract,
    rawInput: unknown,
    store: GrantStore,
    client: McpClientIdentity,
  ): Promise<CallToolResult> {
    if (this.closed) return Promise.resolve(errorToCallToolResult(SERVER_STOPPED_ERROR));
    const invoke = this.requireDispatcher();
    return this.executeTool(tool, rawInput, store, client, invoke);
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    this.dispatcher?.close(SERVER_STOPPED_ERROR);
    for (const resolve of this.pendingConsent.values()) resolve(false);
    this.pendingConsent.clear();
    this.consentCoordinator.clear();
    for (const resolve of this.pendingScopes.values()) {
      resolve({ id: '', ok: false, error: SERVER_STOPPED_ERROR });
    }
    this.pendingScopes.clear();
    ipcMain.removeListener('mcp:invoke:reply', this.onInvokeReply);
    ipcMain.removeListener('mcp:consent:reply', this.onConsentReply);
    ipcMain.removeListener('mcp:scope:reply', this.onScopeReply);
    ipcMain.removeHandler('mcp:grants:list');
    ipcMain.removeHandler('mcp:grants:grant');
    ipcMain.removeHandler('mcp:grants:revoke');
    this.dispatcher = null;
    this.grantStore = null;
  }

  private readonly onInvokeReply = (event: IpcMainEvent, response: unknown): void => {
    if (!this.isActiveRendererEvent(event) || !isMcpInvokeResponse(response)) return;
    this.dispatcher?.resolvePending(response);
  };

  private readonly onConsentReply = (event: IpcMainEvent, response: unknown): void => {
    if (!this.isActiveRendererEvent(event) || !isMcpConsentResponse(response)) return;
    this.pendingConsent.get(response.id)?.(response.approved);
  };

  private readonly onScopeReply = (event: IpcMainEvent, response: unknown): void => {
    if (!this.isActiveRendererEvent(event) || !isMcpScopeResolutionResponse(response)) return;
    this.pendingScopes.get(response.id)?.(response);
  };

  private readonly listGrants = (event: IpcMainInvokeEvent): McpGrant[] => {
    if (!this.isActiveRendererEvent(event)) throw new Error('Untrusted MCP grant request.');
    return this.grantStore?.list() ?? [];
  };

  private readonly grantScope = (
    event: IpcMainInvokeEvent,
    courseId: unknown,
    scope: unknown,
    label?: unknown,
  ): McpGrant => {
    if (!this.isActiveRendererEvent(event)) throw new Error('Untrusted MCP grant request.');
    if (!this.grantStore) throw new Error('MCP server is not running.');
    if (typeof courseId !== 'string' || courseId.length === 0 ||
      (scope !== 'read' && scope !== 'write' && scope !== 'destructive') ||
      (label !== undefined && typeof label !== 'string')) {
      throw new Error('Invalid MCP grant request.');
    }
    return this.grantStore.setScope(courseId, scope, label);
  };

  private readonly revokeGrant = (event: IpcMainInvokeEvent, courseId: unknown): void => {
    if (!this.isActiveRendererEvent(event)) throw new Error('Untrusted MCP revoke request.');
    if (typeof courseId !== 'string' || courseId.length === 0) {
      throw new Error('Invalid MCP revoke request.');
    }
    this.grantStore?.revoke(courseId);
  };

  private isActiveRendererEvent(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    const window = this.getWindow();
    return !!window && !window.isDestroyed() && !window.webContents.isDestroyed() &&
      event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  }

  private async executeTool(
    tool: ToolContract,
    rawInput: unknown,
    store: GrantStore,
    client: McpClientIdentity,
    invoke: InvokeDispatcher,
  ): Promise<CallToolResult> {
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return errorToCallToolResult({ kind: 'validation', message: parsed.error.message });
    }

    const scopes = await this.resolveScopes(tool, parsed.data);
    if (this.closed) return errorToCallToolResult(SERVER_STOPPED_ERROR);
    if (!scopes.ok) return errorToCallToolResult(scopes.error);
    if (scopes.targets.length !== 1) {
      return errorToCallToolResult({
        kind: 'conflict',
        message: 'A single MCP tool call must resolve to exactly one permission scope.',
      });
    }
    const target = scopes.targets[0];
    const authorised = await this.ensureGrant(store, tool, target.courseId, client, target.label);
    if (this.closed) return errorToCallToolResult(SERVER_STOPPED_ERROR);
    if (!authorised.ok) return errorToCallToolResult(authorised.error);

    const request: McpInvokeRequest = {
      id: randomUUID(),
      tool: tool.name,
      input: parsed.data,
      agentId: client.connectionId,
      grant: authorised.grant,
    };
    const response = await invoke.dispatch(request);
    if (this.closed) return errorToCallToolResult(SERVER_STOPPED_ERROR);
    return response.ok
      ? { content: [{ type: 'text', text: JSON.stringify(response.result) }] }
      : errorToCallToolResult(response.error);
  }

  private async resolveScopes(
    tool: ToolContract,
    input: unknown,
  ): Promise<{ ok: true; targets: McpScopeTarget[] } | { ok: false; error: McpToolError }> {
    if (this.closed) return { ok: false, error: SERVER_STOPPED_ERROR };
    const window = this.getWindow();
    if (!window || window.webContents.isDestroyed()) {
      return { ok: false, error: { kind: 'internal', message: 'Lacuna window is not open or still loading.' } };
    }
    const id = randomUUID();
    const request: McpScopeResolutionRequest = { id, tool: tool.name, input };
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingScopes.delete(id);
        resolve({ ok: false, error: { kind: 'internal', message: 'Lacuna did not resolve the tool scope in time.' } });
      }, RENDERER_TIMEOUT_MS);
      this.pendingScopes.set(id, (response) => {
        clearTimeout(timeout);
        this.pendingScopes.delete(id);
        resolve(response.ok
          ? { ok: true, targets: response.targets }
          : { ok: false, error: response.error });
      });
      window.webContents.send('mcp:scope', request);
    });
  }

  private async ensureGrant(
    store: GrantStore,
    tool: ToolContract,
    courseId: string,
    client: McpClientIdentity,
    label?: string,
  ): Promise<{ ok: true; grant: McpGrant } | { ok: false; error: McpToolError }> {
    if (tool.requiredScope === 'read') {
      const existing = store.get(courseId);
      const grant = store.ensureImplicitRead(courseId, label);
      if (!existing) {
        this.getWindow()?.webContents.send('mcp:grant-notice', { courseId, tool: tool.name, client });
      }
      return { ok: true, grant };
    }
    const outcome = resolveGrant(store, tool.requiredScope, courseId);
    if (outcome.ok) return outcome;

    const window = this.getWindow();
    if (!window || window.webContents.isDestroyed()) return { ok: false, error: outcome.error };
    const id = randomUUID();
    const request: McpConsentRequest = {
      id,
      tool: tool.name,
      courseId,
      scope: tool.requiredScope,
      client,
    };
    const approved = await this.consentCoordinator.request(
      client.connectionId,
      courseId,
      tool.requiredScope,
      () => new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          this.pendingConsent.delete(id);
          resolve(false);
        }, RENDERER_TIMEOUT_MS);
        this.pendingConsent.set(id, (value) => {
          clearTimeout(timeout);
          this.pendingConsent.delete(id);
          resolve(value);
        });
        window.webContents.send('mcp:consent', request);
      }),
    );
    if (this.closed) return { ok: false, error: SERVER_STOPPED_ERROR };
    if (!approved) return { ok: false, error: outcome.error };
    return { ok: true, grant: store.grant(courseId, tool.requiredScope, label) };
  }

  private registerServerInfoTool(server: McpServer, store: GrantStore): void {
    server.registerTool(
      'lacuna.get_server_info',
      {
        description:
          'Report the running Lacuna app name/version and the MCP tool-surface version, so a client can detect a stale cached tool list.',
        inputSchema: z.object({}),
      },
      async (): Promise<CallToolResult> => {
        if (this.closed) return errorToCallToolResult(SERVER_STOPPED_ERROR);
        const courseId = courseIdOrGlobal(undefined);
        const existing = store.get(courseId);
        store.ensureImplicitRead(courseId, 'All Lacuna data');
        if (!existing) {
          this.getWindow()?.webContents.send('mcp:grant-notice', {
            courseId,
            tool: 'lacuna.get_server_info',
          });
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name: app.getName(),
              version: app.getVersion(),
              toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
            }),
          }],
        };
      },
    );
  }

  private clientIdentity(server: McpServer, connectionId: string): McpClientIdentity {
    const reported = server.server.getClientVersion();
    return {
      connectionId,
      name: reported?.name ?? 'stdio-mcp-client',
      version: reported?.version,
    };
  }

  private requireDispatcher(): InvokeDispatcher {
    if (!this.dispatcher) throw new Error('MCP data bridge is not running.');
    return this.dispatcher;
  }

  private requireGrantStore(): GrantStore {
    if (!this.grantStore) throw new Error('MCP data bridge is not running.');
    return this.grantStore;
  }
}
