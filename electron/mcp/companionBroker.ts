import { app, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net, { type Server as NetServer, type Socket } from 'node:net';
import log from 'electron-log';
import { LACUNA_AI_PROTOCOL_VERSION } from '../../src/ai/protocol.js';
import type { GrantStore } from '../../src/mcp/grants.js';
import type { ToolContract } from '../../src/mcp/types.js';
import type { McpClientConnection, McpClientIdentity } from '../../src/mcp/connections.js';
import { McpConnectionStore } from '../../src/mcp/connections.js';
import {
  AI_COMPANION_PROTOCOL_VERSION,
  CompanionLineDecoder,
  encodeCompanionMessage,
  isAiCompanionRequest,
  isAiRendererReply,
  isCompanionRequest,
  type AiCompanionResponse,
  type AiCompanionProtocolVersion,
  type CompanionResponse,
} from '../../src/mcp/companionProtocol.js';
import { getToolContract, unknownToolMessage } from '../../src/mcp/contracts/registry.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import {
  removeCompanionConnectionFile,
  writeCompanionConnectionFile,
  type CompanionConnectionFile,
} from './connectionFile.js';
import { authoriseCompanionHello, type CompanionPurpose } from './companionAuth.js';
import { AiRendererDispatcher } from './aiDispatcher.js';
import { AiRendererAvailability, type AiRendererStatus } from './rendererAvailability.js';
import { AiChannelRegistry } from './aiChannelRegistry.js';
const AI_RENDERER_READY_TIMEOUT_MS = 5_000;

type ExecuteCompanionTool = (
  tool: ToolContract,
  input: unknown,
  grants: GrantStore,
  client: McpClientIdentity,
) => Promise<CallToolResult>;

/** Owns the authenticated local data and AI socket broker and its renderer IPC. */
export class CompanionBroker {
  private server: NetServer | null = null;
  private connection: CompanionConnectionFile | null = null;
  private readonly sockets = new Set<Socket>();
  private readonly aiChannels = new AiChannelRegistry();
  private readonly clients = new McpConnectionStore();
  private readonly aiDispatcher = new AiRendererDispatcher();
  private readonly aiAvailability = new AiRendererAvailability(() => {
    this.aiDispatcher.close();
    this.aiChannels.terminateAll();
  });

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly executeTool: ExecuteCompanionTool,
  ) {}

  async start(): Promise<void> {
    this.installIpc();
    const userDataPath = app.getPath('userData');
    this.connection = await writeCompanionConnectionFile(userDataPath, app.getVersion());
    if (process.platform !== 'win32') await fs.rm(this.connection.endpoint, { force: true });

    this.server = net.createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      const server = this.server!;
      server.once('error', reject);
      server.listen(this.connection!.endpoint, () => {
        server.off('error', reject);
        resolve();
      });
    });
    if (process.platform !== 'win32') await fs.chmod(this.connection.endpoint, 0o600);
  }

  status(): { clients: McpClientConnection[]; aiRenderer: { status: AiRendererStatus } } {
    const window = this.getWindow();
    return {
      clients: this.clients.list(),
      aiRenderer: {
        status: this.aiAvailability.status(
          window && !window.isDestroyed() && !window.webContents.isDestroyed()
            ? window.webContents
            : null,
        ),
      },
    };
  }

  async stop(): Promise<void> {
    ipcMain.removeListener('ai:renderer-ready', this.onRendererReady);
    ipcMain.removeListener('ai:renderer-unavailable', this.onRendererUnavailable);
    ipcMain.removeListener('ai:disconnect-channel', this.onDisconnectChannel);
    ipcMain.removeListener('ai:reply', this.onAiReply);
    ipcMain.removeHandler('ai:restart-renderer');
    this.aiAvailability.dispose();
    this.aiDispatcher.close();
    ipcMain.removeHandler('mcp:connections:list');
    ipcMain.removeHandler('mcp:connections:grant');
    ipcMain.removeHandler('mcp:connections:revoke');
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.aiChannels.terminateAll();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    const endpoint = this.connection?.endpoint;
    this.connection = null;
    await removeCompanionConnectionFile(app.getPath('userData'));
    if (endpoint && process.platform !== 'win32') await fs.rm(endpoint, { force: true });
  }

  private installIpc(): void {
    ipcMain.on('ai:renderer-ready', this.onRendererReady);
    ipcMain.on('ai:renderer-unavailable', this.onRendererUnavailable);
    ipcMain.on('ai:disconnect-channel', this.onDisconnectChannel);
    ipcMain.on('ai:reply', this.onAiReply);
    ipcMain.handle('ai:restart-renderer', this.restartRenderer);
    ipcMain.handle('mcp:connections:list', this.listConnections);
    ipcMain.handle('mcp:connections:grant', this.grantConnection);
    ipcMain.handle('mcp:connections:revoke', this.revokeConnection);
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    const decoder = new CompanionLineDecoder();
    let purpose: CompanionPurpose | null = null;
    let connectionId: string | null = null;
    let aiChannelId: string | null = null;
    let aiProtocolVersion: AiCompanionProtocolVersion | null = null;
    let processing = Promise.resolve();
    let closing = false;

    const close = () => {
      closing = true;
      this.sockets.delete(socket);
      if (aiChannelId) this.aiChannels.delete(aiChannelId);
      if (connectionId) this.clients.disconnect(connectionId);
      if (aiChannelId) {
        this.aiDispatcher.cancelChannel(aiChannelId);
        this.notifyAiDisconnected(aiChannelId);
      }
      connectionId = null;
      aiChannelId = null;
    };
    const fail = (error: unknown) => {
      if (closing) return;
      closing = true;
      this.send(socket, {
        type: 'fatal',
        error: {
          kind: 'internal',
          message: error instanceof Error ? error.message : 'MCP companion connection failed.',
        },
      });
      socket.end();
    };
    const processMessage = async (value: unknown): Promise<void> => {
      if (closing) return;
      if (!purpose) {
        if (!this.connection) throw new Error('The companion broker is unavailable.');
        if (authoriseCompanionHello(value, 'data', this.connection.token)) {
          this.clients.connect(value.client);
          connectionId = value.client.connectionId;
          purpose = 'data';
          this.send(socket, {
            type: 'ready',
            protocolVersion: this.connection.protocolVersion,
            appVersion: this.connection.appVersion,
          });
          return;
        }
        if (authoriseCompanionHello(value, 'ai', this.connection.aiToken)) {
          aiChannelId = randomUUID();
          aiProtocolVersion = value.protocolVersion;
          purpose = 'ai';
          this.aiChannels.add(aiChannelId, socket);
          this.send(socket, value.protocolVersion === AI_COMPANION_PROTOCOL_VERSION
            ? {
                type: 'ai_ready',
                protocolVersion: AI_COMPANION_PROTOCOL_VERSION,
                appVersion: this.connection.appVersion,
                capabilities: { leaseRenewal: true },
              }
            : {
                type: 'ai_ready',
                protocolVersion: value.protocolVersion,
                appVersion: this.connection.appVersion,
              });
          return;
        }
        const aiHandshake = isAiCompanionRequest(value) && value.type === 'ai_hello';
        const response = {
          type: 'fatal',
          error: {
            kind: 'forbidden',
            message: `${aiHandshake ? 'AI' : 'MCP'} companion authentication failed.`,
          },
        } as const;
        this.send(socket, response);
        closing = true;
        socket.end();
        return;
      }

      if (purpose === 'ai') {
        if (!isAiCompanionRequest(value) || value.type !== 'ai_request' || !aiChannelId) {
          this.send(socket, {
            type: 'fatal',
            error: { kind: 'forbidden', message: 'Invalid message for the AI companion connection.' },
          });
          closing = true;
          socket.end();
          return;
        }
        if (value.request.type === 'renew_lease' &&
          aiProtocolVersion !== AI_COMPANION_PROTOCOL_VERSION) {
          this.send(socket, {
            type: 'ai_result',
            id: value.id,
            result: {
              ok: false,
              error: {
                kind: 'version_mismatch',
                supportedVersion: LACUNA_AI_PROTOCOL_VERSION,
                message: 'This AI companion connection did not negotiate lease renewal.',
              },
            },
          });
          return;
        }
        const result = await this.waitForAiRenderer()
          ? await this.aiDispatcher.dispatch(aiChannelId, value.id, value.request, (request) => {
              this.getWindow()!.webContents.send('ai:request', request);
            })
          : {
              ok: false as const,
              error: {
                kind: 'unavailable' as const,
                reason: 'disconnected' as const,
                message: 'Lacuna AI did not become ready. Keep Lacuna open with AI enabled, restart the AI runtime, then reconnect.',
              },
            };
        this.send(socket, { type: 'ai_result', id: value.id, result });
        if (value.request.type === 'disconnect' ||
          (!result.ok && result.error.kind === 'unavailable')) {
          socket.end();
        }
        return;
      }

      if (!isCompanionRequest(value)) {
        this.send(socket, {
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
      this.clients.updateIdentity(value.client);
      this.clients.touch(value.client.connectionId);
      const tool = getToolContract(value.tool);
      if (!tool) {
        this.send(socket, {
          type: 'result',
          id: value.id,
          ok: false,
          error: { kind: 'not_found', message: unknownToolMessage(value.tool) },
        });
        return;
      }
      const result = await this.executeTool(
        tool,
        value.input,
        this.clients.grants(value.client.connectionId),
        value.client,
      );
      this.send(socket, { type: 'result', id: value.id, ok: true, result });
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
  }

  private readonly onRendererReady = (event: IpcMainEvent, value: unknown): void => {
    if (!this.isActiveRendererEvent(event)) return;
    const subscriptionId = this.rendererSubscriptionId(value);
    if (subscriptionId === undefined) return;
    this.aiAvailability.markReady(event.sender, subscriptionId);
    event.sender.send('ai:renderer-ready-ack', subscriptionId);
  };

  private readonly onRendererUnavailable = (event: IpcMainEvent, value: unknown): void => {
    if (!this.isActiveRendererEvent(event)) return;
    const subscriptionId = this.rendererSubscriptionId(value);
    if (subscriptionId === undefined) return;
    this.aiAvailability.markUnavailable(event.sender, subscriptionId);
  };

  private readonly onDisconnectChannel = (event: IpcMainEvent, value: unknown): void => {
    if (!this.isActiveRendererEvent(event) || typeof value !== 'string' ||
      value.length === 0 || value.length > 160) return;
    this.aiChannels.terminate(value);
  };

  private readonly onAiReply = (event: IpcMainEvent, response: unknown): void => {
    if (!this.isActiveRendererEvent(event) || !isAiRendererReply(response)) return;
    this.aiDispatcher.resolve(response);
  };

  private readonly restartRenderer = (event: IpcMainInvokeEvent): void => {
    if (!this.isActiveRendererEvent(event)) {
      throw new Error('Untrusted AI renderer restart request.');
    }
    if (!this.aiAvailability.beginRestart(event.sender)) {
      throw new Error('The AI renderer is not ready to restart.');
    }
    event.sender.send('ai:restart-requested');
  };

  private readonly listConnections = (event: IpcMainInvokeEvent): McpClientConnection[] => {
    if (!this.isActiveRendererEvent(event)) throw new Error('Untrusted MCP connection request.');
    return this.clients.list();
  };

  private readonly grantConnection = (
    event: IpcMainInvokeEvent,
    connectionId: unknown,
    courseId: unknown,
    scope: unknown,
    label?: unknown,
  ) => {
    if (!this.isActiveRendererEvent(event)) throw new Error('Untrusted MCP grant request.');
    if (typeof connectionId !== 'string' || connectionId.length === 0 ||
      typeof courseId !== 'string' || courseId.length === 0 ||
      (scope !== 'read' && scope !== 'write' && scope !== 'destructive') ||
      (label !== undefined && typeof label !== 'string')) {
      throw new Error('Invalid MCP connection grant request.');
    }
    return this.clients.setGrant(connectionId, courseId, scope, label);
  };

  private readonly revokeConnection = (
    event: IpcMainInvokeEvent,
    connectionId: unknown,
    courseId: unknown,
  ): void => {
    if (!this.isActiveRendererEvent(event)) throw new Error('Untrusted MCP revoke request.');
    if (typeof connectionId !== 'string' || connectionId.length === 0 ||
      typeof courseId !== 'string' || courseId.length === 0) {
      throw new Error('Invalid MCP connection revoke request.');
    }
    this.clients.revoke(connectionId, courseId);
  };

  private rendererCanHandleAi(): boolean {
    const window = this.getWindow();
    return !!window && !window.isDestroyed() && this.aiAvailability.canHandle(window.webContents);
  }

  private async waitForAiRenderer(): Promise<boolean> {
    const window = this.getWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
    if (!await this.aiAvailability.waitUntilReady(
      window.webContents,
      AI_RENDERER_READY_TIMEOUT_MS,
    )) return false;
    return this.getWindow() === window && this.rendererCanHandleAi();
  }

  private notifyAiDisconnected(channelId: string): void {
    if (!this.rendererCanHandleAi()) return;
    this.getWindow()!.webContents.send('ai:disconnected', { channelId });
  }

  private rendererSubscriptionId(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
      ? value
      : undefined;
  }

  private isActiveRendererEvent(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    const window = this.getWindow();
    return !!window && !window.isDestroyed() && !window.webContents.isDestroyed() &&
      event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  }

  private send(socket: Socket, response: CompanionResponse | AiCompanionResponse): void {
    if (!socket.destroyed) socket.write(encodeCompanionMessage(response));
  }
}
