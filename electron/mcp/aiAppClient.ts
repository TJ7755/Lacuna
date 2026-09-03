import { randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import {
  LACUNA_AI_PROTOCOL_VERSION,
  MAX_AI_WAIT_MS,
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
  AI_COMPANION_PROTOCOL_VERSION,
  CompanionLineDecoder,
  LEGACY_AI_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
  isAiCompanionResponse,
  type AiCompanionProtocolVersion,
  type AiCompanionResponse,
} from '../../src/mcp/companionProtocol.js';
import {
  readCompanionConnectionFile,
  type CompanionConnectionFile,
} from './connectionFile.js';

const CONNECT_TIMEOUT_MS = 3_000;
const REQUEST_GRACE_MS = 5_000;
const DEFAULT_WAIT_MS = MAX_AI_WAIT_MS;
const CLAIM_LEASE_MS = 5 * 60_000;
const LEASE_RENEW_INTERVAL_MS = 60_000;
const APPROVAL_RETRY_INTERVAL_MS = 500;
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

function timedOutOperation(commitState: 'not_started' | 'unknown'): AiCompanionOperationError {
  return new AiCompanionOperationError({
    kind: 'timeout',
    message: 'Lacuna did not answer the local AI companion in time.',
    retryable: true,
    suggestedAction: 'retry_same_request',
    userActionRequired: false,
    commitState,
  });
}

function appConnectionError(message: string): AiCompanionOperationError {
  return new AiCompanionOperationError({
    kind: 'app_unavailable',
    message,
    retryable: true,
    suggestedAction: 'open_lacuna',
    userActionRequired: true,
    commitState: 'not_started',
  });
}

function disconnectedOperation(request: AiBridgeRequest): AiCompanionOperationError {
  const commitState = request.type === 'invoke_tool' || request.type === 'reply' ||
    request.type === 'renew_lease'
    ? 'unknown'
    : 'not_started';
  return new AiCompanionOperationError({
    kind: 'app_unavailable',
    message: commitState === 'unknown'
      ? 'Lacuna disconnected before acknowledging the request. Retry the exact same request.'
      : 'The running Lacuna application disconnected.',
    retryable: true,
    suggestedAction: commitState === 'unknown' ? 'retry_same_request' : 'open_lacuna',
    userActionRequired: commitState === 'not_started',
    commitState,
  });
}

interface PendingRequest {
  request: AiBridgeRequest;
  resolve: (result: AiBridgeResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class AiProtocolFallbackError extends Error {}

export class LocalAiAppClient {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private connectionId: string | null = null;
  private activeRun: ActiveRun | null = null;
  private leaseRenewTimer: ReturnType<typeof setTimeout> | null = null;
  private leaseRenewalFailure: AiCompanionOperationError | null = null;
  private supportsLeaseRenewal = false;

  constructor(
    private readonly writeDrainTimeoutMs = WRITE_DRAIN_TIMEOUT_MS,
    private readonly hostUserDataPath = '',
    private readonly leaseRenewIntervalMs = LEASE_RENEW_INTERVAL_MS,
    private readonly connectTimeoutMs = CONNECT_TIMEOUT_MS,
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
    this.leaseRenewalFailure = null;
    return data;
  }

  async waitForMessage(timeoutMs: number, signal: AbortSignal): Promise<object> {
    this.throwLeaseRenewalFailure();
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
    this.leaseRenewalFailure = null;
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
    const request: AiBridgeRequest = {
      type: 'invoke_tool',
      connectionId: this.requireConnection(),
      runId,
      callId,
      call: { name: toolName, input },
    };
    const deadline = Date.now() + timeoutMs + REQUEST_GRACE_MS;
    for (;;) {
      this.throwLeaseRenewalFailure();
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timedOutOperation('not_started');
      const result = await this.request(request, remaining, signal);
      if (!result.ok) {
        if (result.error.kind === 'unavailable') this.close();
        if (result.error.kind === 'tool') return { ok: false, error: result.error.error };
        if (result.error.kind === 'stopped' && this.activeRun?.runId === result.error.runId) {
          await this.requestedStop(request.connectionId, signal);
        }
        if (result.error.kind === 'approval_required' || result.error.kind === 'approval_pending') {
          const retryAfterMs = result.error.kind === 'approval_pending'
            ? result.error.retryAfterMs
            : APPROVAL_RETRY_INTERVAL_MS;
          await this.waitForApprovalRetry(retryAfterMs, deadline, signal);
          continue;
        }
        throw bridgeOperationError(result.error);
      }
      if (result.data.type !== 'tool_result') throw new Error('Lacuna returned the wrong AI response.');
      return {
        ok: true,
        result: result.data.result,
        ...(result.data.receipt ? { receipt: result.data.receipt } : {}),
      };
    }
  }

  async reply(
    runId: string,
    messageId: string,
    content: string,
    signal: AbortSignal,
  ): Promise<void> {
    this.throwLeaseRenewalFailure();
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
      this.leaseRenewalFailure = null;
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
    this.supportsLeaseRenewal = false;
    this.stopLeaseRenewal();
    socket?.destroy();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(disconnectedOperation(pending.request));
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
    if (!this.supportsLeaseRenewal || !this.activeRun || !this.connectionId) return;
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
      if (this.activeRun?.runId !== active.runId || this.connectionId !== connectionId) {
        this.stopLeaseRenewal();
        return;
      }
      if (this.isTransientLeaseRenewalFailure(error)) {
        this.scheduleLeaseRenewal();
      } else {
        this.activeRun = null;
        this.leaseRenewalFailure = error instanceof AiCompanionOperationError
          ? error
          : new AiCompanionOperationError(companionErrorDetails(error));
        this.stopLeaseRenewal();
      }
    }
  }

  private isTransientLeaseRenewalFailure(error: unknown): boolean {
    return error instanceof AiCompanionOperationError && error.details.retryable &&
      (error.details.kind === 'timeout' || error.details.kind === 'app_unavailable' ||
        error.details.kind === 'renderer_unavailable' || error.details.kind === 'cancelled');
  }

  private throwLeaseRenewalFailure(): void {
    if (this.leaseRenewalFailure) throw this.leaseRenewalFailure;
  }

  private async waitForApprovalRetry(
    retryAfterMs: number,
    deadline: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw cancelledOperation('not_started');
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timedOutOperation('not_started');
    const delay = Math.min(retryAfterMs, remaining);
    if (delay <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(cancelledOperation('not_started'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, delay);
      signal.addEventListener('abort', abort, { once: true });
    });
    if (deadline - Date.now() <= 0) throw timedOutOperation('not_started');
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
        reject(timedOutOperation(drainAfterCancellation ? 'unknown' : 'not_started'));
      }, timeoutMs);
      this.pending.set(id, {
        request,
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
    try {
      await this.connectSocketWithProtocol(connection, AI_COMPANION_PROTOCOL_VERSION);
    } catch (error) {
      if (!(error instanceof AiProtocolFallbackError)) throw error;
      await this.connectSocketWithProtocol(connection, LEGACY_AI_COMPANION_PROTOCOL_VERSION);
    }
  }

  private async connectSocketWithProtocol(
    connection: CompanionConnectionFile,
    protocolVersion: AiCompanionProtocolVersion,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(connection.endpoint);
      const decoder = new CompanionLineDecoder();
      let ready = false;
      const fallbackAllowed = protocolVersion === AI_COMPANION_PROTOCOL_VERSION;
      const timeout = setTimeout(() => fail(fallbackAllowed
        ? new AiProtocolFallbackError()
        : appConnectionError('Timed out while connecting to the running Lacuna application.')),
      this.connectTimeoutMs);
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
          protocolVersion,
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
                fail(fallbackAllowed
                  ? new AiProtocolFallbackError()
                  : appConnectionError(response.type === 'fatal'
                    ? 'The running Lacuna application rejected the AI companion handshake.'
                    : 'Lacuna returned an invalid AI companion handshake.'));
                return;
              }
              if (response.protocolVersion !== protocolVersion) {
                fail(fallbackAllowed
                  ? new AiProtocolFallbackError()
                  : appConnectionError('Lacuna returned an incompatible AI companion protocol.'));
                return;
              }
              ready = true;
              clearTimeout(timeout);
              this.socket = socket;
              this.supportsLeaseRenewal = response.protocolVersion === AI_COMPANION_PROTOCOL_VERSION &&
                response.capabilities.leaseRenewal;
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
          if (!ready) {
            fail(fallbackAllowed
              ? new AiProtocolFallbackError()
              : appConnectionError('Lacuna returned an invalid AI companion handshake.'));
          } else {
            fail(error instanceof Error ? error : new Error('Invalid response from Lacuna.'));
          }
        }
      });
      socket.once('close', () => {
        if (!ready) fail(fallbackAllowed
          ? new AiProtocolFallbackError()
          : appConnectionError('The running Lacuna application closed the AI companion connection.'));
        if (this.socket === socket) this.close();
      });
    });
  }
}


export function createLocalAiAppClient(hostUserDataPath: string): LocalAiAppClient {
  return new LocalAiAppClient(undefined, hostUserDataPath);
}
