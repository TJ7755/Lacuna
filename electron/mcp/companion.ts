import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import log from 'electron-log';
import { z } from 'zod';
import { McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { TOOL_CONTRACT_REGISTRY, MCP_TOOL_SURFACE_VERSION } from '../../src/mcp/contracts/registry.js';
import type { McpClientIdentity } from '../../src/mcp/connections.js';
import {
  CompanionLineDecoder,
  MCP_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
  type CompanionResponse,
} from '../../src/mcp/companionProtocol.js';
import {
  companionHostUserDataPath,
  readCompanionConnectionFile,
} from './connectionFile.js';

const CONNECT_TIMEOUT_MS = 3_000;
const CALL_TIMEOUT_MS = 15_000;

function toError(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: `[internal] ${message}` }] };
}

function silenceStdoutNoise(): void {
  log.transports.console.level = false;
  const toStderr = (...args: unknown[]): void => {
    process.stderr.write(`${args.map(String).join(' ')}\n`);
  };
  // eslint-disable-next-line no-console -- stdout is reserved for MCP frames.
  console.log = toStderr;
  // eslint-disable-next-line no-console
  console.info = toStderr;
  // eslint-disable-next-line no-console
  console.debug = toStderr;
}

class CompanionAppClient {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private appVersion: string | null = null;
  private readonly pending = new Map<string, (response: CompanionResponse) => void>();

  constructor(
    private identity: McpClientIdentity,
    private readonly hostUserDataPath: string,
  ) {}

  updateIdentity(identity: McpClientIdentity): void {
    this.identity = identity;
  }

  async call(tool: string, input: unknown): Promise<CallToolResult> {
    try {
      await this.connect();
    } catch (error) {
      return toError(error instanceof Error ? error.message : 'Lacuna is not running.');
    }
    const id = randomUUID();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve(toError('Lacuna did not answer the MCP companion in time.'));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, (response) => {
        clearTimeout(timeout);
        this.pending.delete(id);
        if (response.type === 'fatal') {
          resolve(toError(response.error.message));
        } else if (response.type !== 'result' || response.id !== id) {
          resolve(toError('Lacuna returned an invalid companion response.'));
        } else if (!response.ok) {
          resolve({ isError: true, content: [{ type: 'text', text: `[${response.error.kind}] ${response.error.message}` }] });
        } else {
          resolve(response.result as CallToolResult);
        }
      });
      this.socket!.write(encodeCompanionMessage({ type: 'call', id, tool, input, client: this.identity }));
    });
  }

  async serverInfo(): Promise<CallToolResult> {
    try {
      await this.connect();
      const data = {
        name: 'Lacuna',
        version: this.appVersion,
        companionProtocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
        toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
      };
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      return toError(error instanceof Error ? error.message : 'Lacuna is not running.');
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
    this.connecting = null;
    for (const resolve of this.pending.values()) {
      resolve({ type: 'fatal', error: { kind: 'internal', message: 'The running Lacuna application disconnected.' } });
    }
    this.pending.clear();
  }

  private connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private async open(): Promise<void> {
    let connection;
    try {
      connection = await readCompanionConnectionFile(this.hostUserDataPath);
    } catch {
      throw new Error('Lacuna is not running or its companion endpoint is unavailable.');
    }

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(connection.endpoint);
      const decoder = new CompanionLineDecoder();
      let ready = false;
      const timeout = setTimeout(() => fail(new Error('Timed out while connecting to the running Lacuna application.')), CONNECT_TIMEOUT_MS);
      const fail = (error: Error) => {
        clearTimeout(timeout);
        if (!ready) reject(error);
        socket.destroy();
      };
      socket.setEncoding('utf8');
      socket.once('error', (error) => fail(new Error(`Could not connect to the running Lacuna application: ${error.message}`)));
      socket.once('connect', () => {
        socket.write(encodeCompanionMessage({
          type: 'hello',
          protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
          token: connection.token,
          client: this.identity,
        }));
      });
      socket.on('data', (chunk: string) => {
        try {
          for (const response of decoder.push(chunk) as CompanionResponse[]) {
            if (!ready) {
              if (response.type !== 'ready') {
                fail(new Error(response.type === 'fatal' ? response.error.message : 'Lacuna rejected the companion handshake.'));
                return;
              }
              ready = true;
              clearTimeout(timeout);
              this.socket = socket;
              this.appVersion = response.appVersion;
              resolve();
              continue;
            }
            if (response.type === 'fatal') {
              fail(new Error(response.error.message));
              return;
            }
            if (response.type === 'result') this.pending.get(response.id)?.(response);
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Invalid response from Lacuna.'));
        }
      });
      socket.once('close', () => {
        if (!ready) fail(new Error('The running Lacuna application closed the companion connection.'));
        if (this.socket === socket) this.close();
      });
    });
  }
}

function reportedIdentity(server: McpServer, context: ServerContext, connectionId: string): McpClientIdentity {
  void context;
  const reported = server.server.getClientVersion();
  return { connectionId, name: reported?.name ?? 'MCP client', version: reported?.version };
}

export function startMcpCompanion(): StdioServerHandle {
  silenceStdoutNoise();
  const hostUserDataPath = companionHostUserDataPath(process.argv, app.getPath('userData'));
  return serveStdio(() => {
    const connectionId = randomUUID();
    const fallback: McpClientIdentity = { connectionId, name: 'MCP client' };
    const appClient = new CompanionAppClient(fallback, hostUserDataPath);
    const server = new McpServer({ name: 'lacuna', version: app.getVersion() });
    server.registerTool(
      'lacuna.get_server_info',
      { description: 'Report the running Lacuna and companion protocol versions.', inputSchema: z.object({}) },
      async (_input, context) => {
        appClient.updateIdentity(reportedIdentity(server, context, connectionId));
        return appClient.serverInfo();
      },
    );
    for (const tool of TOOL_CONTRACT_REGISTRY) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (input: unknown, context: ServerContext) => {
          appClient.updateIdentity(reportedIdentity(server, context, connectionId));
          return appClient.call(tool.name, input);
        },
      );
    }
    server.server.onclose = () => appClient.close();
    return server;
  }, {
    legacy: 'serve',
    onerror: (error) => log.error('MCP companion stdio failed', error),
  });
}
