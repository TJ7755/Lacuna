import { randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import log from 'electron-log';
import { z } from 'zod';
import { McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import {
  LACUNA_AI_PROTOCOL_VERSION,
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_WAIT_MS,
  MIN_AI_WAIT_MS,
  aiToolNameSchema,
  boundedJsonValueSchema,
  type AiBridgeRequest,
  type AiBridgeResult,
  type AiClientIdentity,
  type AiClaimedMessage,
  type AiInstructionBundle,
  type AiRunState,
  type JsonValue,
} from '../../src/ai/protocol.js';
import {
  AiCompanionOperationError,
  bridgeOperationError,
  companionErrorDetails,
} from '../../src/ai/companionErrors.js';
import {
  CompanionLineDecoder,
  MCP_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
  isAiCompanionResponse,
  type AiCompanionResponse,
} from '../../src/mcp/companionProtocol.js';
import {
  companionAppVersion,
  companionHostUserDataPath,
  readCompanionConnectionFile,
} from './connectionFile.js';

const CONNECT_TIMEOUT_MS = 3_000;
const REQUEST_GRACE_MS = 5_000;
const DEFAULT_WAIT_MS = MAX_AI_WAIT_MS;
const CLAIM_LEASE_MS = 5 * 60_000;
const LEASE_RENEW_INTERVAL_MS = 60_000;
const WRITE_DRAIN_TIMEOUT_MS = MAX_AI_WAIT_MS + (REQUEST_GRACE_MS * 2);

interface ActiveRun {
  runId: string;
  messageId: string;
}

function cancelledOperation(commitState: 'not_started' | 'unknown'): AiCompanionOperationError {
  return new AiCompanionOperationError({
    kind: 'cancelled',
    message: 'The Lacuna AI request was cancelled.',
    retryable: true,
    suggestedAction: 'retry_same_request',
    userActionRequired: false,
    commitState,
  });
}

interface PendingRequest {
  resolve: (result: AiBridgeResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
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

export class LocalAiAppClient {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private connectionId: string | null = null;
  private activeRun: ActiveRun | null = null;
  private leaseRenewTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly writeDrainTimeoutMs = WRITE_DRAIN_TIMEOUT_MS,
    private readonly hostUserDataPath = '',
    private readonly leaseRenewIntervalMs = LEASE_RENEW_INTERVAL_MS,
  ) {}

  async connect(identity: AiClientIdentity, signal: AbortSignal): Promise<object> {
    if (this.connectionId) {
      throw new AiCompanionOperationError({
        kind: 'conflict',
        message: 'Lacuna AI is already connected.',
        retryable: false,
        suggestedAction: 'stop',
        userActionRequired: false,
        commitState: 'not_started',
      });
    }
    const result = await this.request({
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: identity,
    }, CONNECT_TIMEOUT_MS, signal);
    const data = this.expectSuccess(result, 'connection');
    this.connectionId = data.connectionId as string;
    return data;
  }

  async waitForMessage(timeoutMs: number, signal: AbortSignal): Promise<object> {
    const connectionId = this.requireConnection();
    const stop = await this.requestedStop(connectionId, signal);
    if (stop) return stop;
    const claim = await this.request({
      type: 'claim_message',
      connectionId,
      timeoutMs,
      leaseMs: CLAIM_LEASE_MS,
    }, timeoutMs + REQUEST_GRACE_MS, signal);
    const claimData = this.expectSuccess(claim, 'message_claim');
    const message = claimData.message as AiClaimedMessage | null;
    if (!message) return { type: 'empty' };
    const instructions = await this.request({
      type: 'get_instructions',
      connectionId,
    }, CONNECT_TIMEOUT_MS, signal);
    const instructionData = this.expectSuccess(instructions, 'instructions') as unknown as AiInstructionBundle;
    this.activeRun = { runId: message.runId, messageId: message.messageId };
    this.scheduleLeaseRenewal();
    return { type: 'message', ...message, instructions: instructionData };
  }

  async invokeTool(
    runId: string,
    callId: string,
    toolName: string,
    input: JsonValue,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<object> {
    const result = await this.request({
      type: 'invoke_tool',
      connectionId: this.requireConnection(),
      runId,
      callId,
      call: { name: toolName, input },
    }, timeoutMs + REQUEST_GRACE_MS, signal);
    if (!result.ok) {
      if (result.error.kind === 'unavailable') this.close();
      if (result.error.kind === 'tool') return { ok: false, error: result.error.error };
      throw bridgeOperationError(result.error);
    }
    if (result.data.type !== 'tool_result') throw new Error('Lacuna returned the wrong AI response.');
    return {
      ok: true,
      result: result.data.result,
      ...(result.data.receipt ? { receipt: result.data.receipt } : {}),
    };
  }

  async reply(
    runId: string,
    messageId: string,
    content: string,
    signal: AbortSignal,
  ): Promise<void> {
    const result = await this.request({
      type: 'reply',
      connectionId: this.requireConnection(),
      runId,
      messageId,
      reply: { content },
    }, DEFAULT_WAIT_MS + REQUEST_GRACE_MS, signal);
    this.expectSuccess(result, 'reply_recorded');
    if (this.activeRun?.runId === runId) {
      this.activeRun = null;
      this.stopLeaseRenewal();
    }
  }

  async disconnect(signal?: AbortSignal): Promise<void> {
    const connectionId = this.connectionId;
    if (!connectionId) {
      this.close();
      return;
    }
    try {
      const result = await this.request({ type: 'disconnect', connectionId }, CONNECT_TIMEOUT_MS, signal);
      this.expectSuccess(result, 'disconnected');
    } finally {
      this.connectionId = null;
      this.activeRun = null;
      this.stopLeaseRenewal();
      this.close();
    }
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.connecting = null;
    this.connectionId = null;
    this.activeRun = null;
    this.stopLeaseRenewal();
    socket?.destroy();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('The running Lacuna application disconnected.'));
    }
    this.pending.clear();
  }

  private async requestedStop(connectionId: string, signal: AbortSignal): Promise<object | null> {
    if (!this.activeRun) return null;
    const result = await this.request({
      type: 'get_run',
      connectionId,
      runId: this.activeRun.runId,
    }, CONNECT_TIMEOUT_MS, signal);
    const data = this.expectSuccess(result, 'run_state');
    const run = data.run as AiRunState;
    if (run.status !== 'stop_requested') return null;
    const active = this.activeRun;
    const acknowledged = await this.request({
      type: 'acknowledge_stop',
      connectionId,
      runId: active.runId,
    }, CONNECT_TIMEOUT_MS, signal);
    this.expectSuccess(acknowledged, 'stop_acknowledged');
    this.activeRun = null;
    this.stopLeaseRenewal();
    return { type: 'stop_requested', runId: active.runId, messageId: active.messageId };
  }

  private scheduleLeaseRenewal(): void {
    this.stopLeaseRenewal();
    if (!this.activeRun || !this.connectionId) return;
    this.leaseRenewTimer = setTimeout(() => {
      this.leaseRenewTimer = null;
      void this.renewActiveLease();
    }, this.leaseRenewIntervalMs);
    this.leaseRenewTimer.unref?.();
  }

  private async renewActiveLease(): Promise<void> {
    const active = this.activeRun;
    const connectionId = this.connectionId;
    if (!active || !connectionId) return;
    try {
      const result = await this.request({
        type: 'renew_lease',
        connectionId,
        runId: active.runId,
        leaseMs: CLAIM_LEASE_MS,
      }, CONNECT_TIMEOUT_MS);
      this.expectSuccess(result, 'lease_renewed');
      if (this.activeRun?.runId === active.runId) this.scheduleLeaseRenewal();
    } catch (error) {
      if (
        this.activeRun?.runId === active.runId &&
        this.connectionId === connectionId &&
        (!(error instanceof AiCompanionOperationError) || error.details.kind !== 'stopped')
      ) {
        this.scheduleLeaseRenewal();
      } else {
        this.stopLeaseRenewal();
      }
    }
  }

  private stopLeaseRenewal(): void {
    if (!this.leaseRenewTimer) return;
    clearTimeout(this.leaseRenewTimer);
    this.leaseRenewTimer = null;
  }

  private expectSuccess(
    result: AiBridgeResult,
    type: string,
  ): Record<string, unknown> {
    if (!result.ok) {
      if (result.error.kind === 'unavailable') this.close();
      throw bridgeOperationError(result.error);
    }
    if (result.data.type !== type) throw new Error('Lacuna returned the wrong AI response.');
    return result.data as unknown as Record<string, unknown>;
  }

  private requireConnection(): string {
    if (!this.connectionId) {
      throw new AiCompanionOperationError({
        kind: 'not_connected',
        message: 'Lacuna AI is not connected.',
        retryable: true,
        suggestedAction: 'connect',
        userActionRequired: false,
        commitState: 'not_started',
      });
    }
    return this.connectionId;
  }

  private async request(
    request: AiBridgeRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<AiBridgeResult> {
    if (signal?.aborted) throw cancelledOperation('not_started');
    await this.open();
    if (signal?.aborted) throw cancelledOperation('not_started');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const drainAfterCancellation = request.type === 'invoke_tool' || request.type === 'reply' ||
        request.type === 'renew_lease';
      const abort = () => {
        clearTimeout(timeout);
        if (!drainAfterCancellation) {
          this.pending.delete(id);
          this.close();
        } else {
          this.armWriteDrainTimeout(id);
        }
        reject(cancelledOperation(drainAfterCancellation ? 'unknown' : 'not_started'));
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        if (!drainAfterCancellation) {
          this.pending.delete(id);
          this.close();
        } else {
          this.armWriteDrainTimeout(id);
        }
        reject(new AiCompanionOperationError({
          kind: 'timeout',
          message: 'Lacuna did not answer the local AI companion in time.',
          retryable: true,
          suggestedAction: 'retry_same_request',
          userActionRequired: false,
          commitState: drainAfterCancellation ? 'unknown' : 'not_started',
        }));
      }, timeoutMs);
      this.pending.set(id, {
        timeout,
        resolve: (result) => {
          signal?.removeEventListener('abort', abort);
          if (request.type === 'reply' && result.ok && result.data.type === 'reply_recorded' &&
            this.activeRun?.runId === request.runId) {
            this.activeRun = null;
          }
          resolve(result);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      });
      signal?.addEventListener('abort', abort, { once: true });
      this.socket!.write(encodeCompanionMessage({ type: 'ai_request', id, request }));
    });
  }

  private armWriteDrainTimeout(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(() => {
      if (!this.pending.delete(id)) return;
      this.close();
    }, this.writeDrainTimeoutMs);
  }

  private async open(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectSocket().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private async connectSocket(): Promise<void> {
    let connection;
    try {
      connection = await readCompanionConnectionFile(this.hostUserDataPath);
    } catch {
      throw new AiCompanionOperationError({
        kind: 'app_unavailable',
        message: 'Lacuna is not running or its local AI endpoint is unavailable.',
        retryable: true,
        suggestedAction: 'open_lacuna',
        userActionRequired: true,
        commitState: 'not_started',
      });
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
      socket.once('error', () => fail(new AiCompanionOperationError({
        kind: 'app_unavailable',
        message: 'Could not connect to the running Lacuna application.',
        retryable: true,
        suggestedAction: 'open_lacuna',
        userActionRequired: true,
        commitState: 'not_started',
      })));
      socket.once('connect', () => {
        socket.write(encodeCompanionMessage({
          type: 'ai_hello',
          protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
          token: connection.aiToken,
        }));
      });
      socket.on('data', (chunk: string) => {
        try {
          for (const value of decoder.push(chunk)) {
            if (!isAiCompanionResponse(value)) throw new Error('Lacuna returned an invalid AI companion response.');
            const response: AiCompanionResponse = value;
            if (!ready) {
              if (response.type !== 'ai_ready') {
                fail(new Error(response.type === 'fatal' ? response.error.message : 'Lacuna rejected the AI companion handshake.'));
                return;
              }
              ready = true;
              clearTimeout(timeout);
              this.socket = socket;
              resolve();
              continue;
            }
            if (response.type === 'fatal') {
              fail(new Error(response.error.message));
              return;
            }
            if (response.type === 'ai_result') {
              const pending = this.pending.get(response.id);
              if (!pending) continue;
              clearTimeout(pending.timeout);
              this.pending.delete(response.id);
              pending.resolve(response.result);
            }
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Invalid response from Lacuna.'));
        }
      });
      socket.once('close', () => {
        if (!ready) fail(new Error('The running Lacuna application closed the AI companion connection.'));
        if (this.socket === socket) this.close();
      });
    });
  }
}

const identifierSchema = z.string().min(1).max(MAX_AI_IDENTIFIER_LENGTH);
const contentSchema = z.string().max(MAX_AI_MESSAGE_LENGTH)
  .refine((value) => value.trim().length > 0, 'Reply content must not be blank.');

function reportedIdentity(server: McpServer, context: ServerContext): AiClientIdentity {
  void context;
  const reported = server.server.getClientVersion();
  return {
    name: reported?.name ?? 'MCP client',
    ...(reported?.version ? { version: reported.version } : {}),
  };
}

export async function callAiCompanionTool<T extends object>(operation: () => Promise<T>): Promise<CallToolResult> {
  try {
    const data = await operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    };
  } catch (error) {
    const details = companionErrorDetails(error);
    const data = { ok: false as const, error: details };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    };
  }
}

export interface AiCompanionOptions {
  appVersion: string;
  hostUserDataPath: string;
}

export function startAiCompanion(options?: AiCompanionOptions): StdioServerHandle {
  silenceStdoutNoise();
  const appVersion = options?.appVersion ?? companionAppVersion(process.argv, '0.0.0');
  const hostUserDataPath = options?.hostUserDataPath ?? companionHostUserDataPath(process.argv, '');
  if (!hostUserDataPath) throw new Error('The Lacuna host profile was not provided.');
  const appClient = new LocalAiAppClient(
    WRITE_DRAIN_TIMEOUT_MS,
    hostUserDataPath,
  );
  return serveStdio(() => {
    const server = new McpServer({ name: 'lacuna-ai', version: appVersion });
    server.registerTool(
      'lacuna.connect',
      {
        description: 'Connect this terminal task to the local AI session in the running Lacuna app.',
        inputSchema: z.object({}).strict(),
      },
      async (_input, context) => callAiCompanionTool(() => appClient.connect(reportedIdentity(server, context), context.mcpReq.signal)),
    );
    server.registerTool(
      'lacuna.wait_for_message',
      {
        description: 'Wait for and claim one queued local Lacuna AI message. Empty waits are normal; call again while connected.',
        inputSchema: z.object({
          timeoutMs: z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS).optional(),
        }).strict(),
      },
      async (input, context) => callAiCompanionTool(() => appClient.waitForMessage(input.timeoutMs ?? DEFAULT_WAIT_MS, context.mcpReq.signal)),
    );
    server.registerTool(
      'lacuna.invoke_tool',
      {
        description: 'Invoke one authorised Lacuna domain tool for the active local AI run.',
        inputSchema: z.object({
          runId: identifierSchema,
          callId: identifierSchema,
          toolName: aiToolNameSchema,
          input: z.unknown(),
          timeoutMs: z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS).optional(),
        }).strict(),
      },
      async (input, context) => callAiCompanionTool(async () => {
        const parsedInput = boundedJsonValueSchema.safeParse(input.input);
        if (!parsedInput.success) {
          throw new AiCompanionOperationError({
            kind: 'validation',
            message: 'The Lacuna AI tool input is invalid.',
            retryable: false,
            suggestedAction: 'inspect_input',
            userActionRequired: false,
            commitState: 'not_started',
          });
        }
        return {
          runId: input.runId,
          callId: input.callId,
          ...(await appClient.invokeTool(
            input.runId,
            input.callId,
            input.toolName,
            parsedInput.data,
            input.timeoutMs ?? MAX_AI_WAIT_MS,
            context.mcpReq.signal,
          )),
        };
      }),
    );
    server.registerTool(
      'lacuna.reply',
      {
        description: 'Send one complete reply for the exact claimed local Lacuna AI message.',
        inputSchema: z.object({
          runId: identifierSchema,
          messageId: identifierSchema,
          content: contentSchema,
        }).strict(),
      },
      async (input, context) => callAiCompanionTool(async () => {
        await appClient.reply(input.runId, input.messageId, input.content, context.mcpReq.signal);
        return { replied: true, runId: input.runId, messageId: input.messageId };
      }),
    );
    server.registerTool(
      'lacuna.disconnect',
      { description: 'Disconnect this terminal task from local Lacuna AI.', inputSchema: z.object({}).strict() },
      async (_input, context) => callAiCompanionTool(async () => {
        await appClient.disconnect(context.mcpReq.signal);
        return { disconnected: true };
      }),
    );
    server.server.onclose = () => appClient.close();
    return server;
  }, {
    legacy: 'serve',
    onerror: (error) => log.error('Local AI companion stdio failed', error),
  });
}
