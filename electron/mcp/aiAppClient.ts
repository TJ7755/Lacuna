import { createAiAppTransport } from './aiAppTransport.js';
import type { AiAppClientState } from './aiAppClientState.js';
import {
  cancelledOperation,
  timedOutOperation,
  disconnectedOperation,
} from './aiAppOperationErrors.js';
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

const CONNECT_TIMEOUT_MS = 3_000;
const REQUEST_GRACE_MS = 5_000;
const DEFAULT_WAIT_MS = MAX_AI_WAIT_MS;
const CLAIM_LEASE_MS = 5 * 60_000;
const LEASE_RENEW_INTERVAL_MS = 60_000;
const APPROVAL_RETRY_INTERVAL_MS = 500;
const WRITE_DRAIN_TIMEOUT_MS = MAX_AI_WAIT_MS + REQUEST_GRACE_MS * 2;

export class LocalAiAppClient {
  private readonly state: AiAppClientState = {
    socket: null,
    connecting: null,
    pending: new Map(),
    connectionId: null,
    activeRun: null,
    leaseRenewTimer: null,
    leaseRenewalFailure: null,
    supportsLeaseRenewal: false,
  };
  private readonly transport: ReturnType<typeof createAiAppTransport>;

  constructor(
    writeDrainTimeoutMs = WRITE_DRAIN_TIMEOUT_MS,
    hostUserDataPath = '',
    private readonly leaseRenewIntervalMs = LEASE_RENEW_INTERVAL_MS,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
  ) {
    this.transport = createAiAppTransport(this.state, {
      writeDrainTimeoutMs,
      hostUserDataPath,
      connectTimeoutMs,
      close: () => this.close(),
    });
  }

  async connect(identity: AiClientIdentity, signal: AbortSignal): Promise<object> {
    if (this.state.connectionId) {
      throw new AiCompanionOperationError({
        kind: 'conflict',
        message: 'Lacuna AI is already connected.',
        retryable: false,
        suggestedAction: 'stop',
        userActionRequired: false,
        commitState: 'not_started',
      });
    }
    const result = await this.transport.request(
      {
        type: 'connect',
        protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
        client: identity,
      },
      CONNECT_TIMEOUT_MS,
      signal,
    );
    const data = this.expectSuccess(result, 'connection');
    this.state.connectionId = data.connectionId as string;
    this.state.leaseRenewalFailure = null;
    return data;
  }

  async waitForMessage(timeoutMs: number, signal: AbortSignal): Promise<object> {
    this.throwLeaseRenewalFailure();
    const connectionId = this.requireConnection();
    const stop = await this.requestedStop(connectionId, signal);
    if (stop) return stop;
    const claim = await this.transport.request(
      {
        type: 'claim_message',
        connectionId,
        timeoutMs,
        leaseMs: CLAIM_LEASE_MS,
      },
      timeoutMs + REQUEST_GRACE_MS,
      signal,
    );
    const claimData = this.expectSuccess(claim, 'message_claim');
    const message = claimData.message as AiClaimedMessage | null;
    if (!message) return { type: 'empty' };
    const instructions = await this.transport.request(
      {
        type: 'get_instructions',
        connectionId,
      },
      CONNECT_TIMEOUT_MS,
      signal,
    );
    const instructionData = this.expectSuccess(
      instructions,
      'instructions',
    ) as unknown as AiInstructionBundle;
    this.state.activeRun = { runId: message.runId, messageId: message.messageId };
    this.state.leaseRenewalFailure = null;
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
      const result = await this.transport.request(request, remaining, signal);
      if (!result.ok) {
        if (result.error.kind === 'unavailable') this.close();
        if (result.error.kind === 'tool') return { ok: false, error: result.error.error };
        if (result.error.kind === 'stopped' && this.state.activeRun?.runId === result.error.runId) {
          await this.requestedStop(request.connectionId, signal);
        }
        if (result.error.kind === 'approval_required' || result.error.kind === 'approval_pending') {
          const retryAfterMs =
            result.error.kind === 'approval_pending'
              ? result.error.retryAfterMs
              : APPROVAL_RETRY_INTERVAL_MS;
          await this.waitForApprovalRetry(retryAfterMs, deadline, signal);
          continue;
        }
        throw bridgeOperationError(result.error);
      }
      if (result.data.type !== 'tool_result')
        throw new Error('Lacuna returned the wrong AI response.');
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
    const result = await this.transport.request(
      {
        type: 'reply',
        connectionId: this.requireConnection(),
        runId,
        messageId,
        reply: { content },
      },
      DEFAULT_WAIT_MS + REQUEST_GRACE_MS,
      signal,
    );
    this.expectSuccess(result, 'reply_recorded');
    if (this.state.activeRun?.runId === runId) {
      this.state.activeRun = null;
      this.state.leaseRenewalFailure = null;
      this.stopLeaseRenewal();
    }
  }

  async disconnect(signal?: AbortSignal): Promise<void> {
    const connectionId = this.state.connectionId;
    if (!connectionId) {
      this.close();
      return;
    }
    try {
      const result = await this.transport.request(
        { type: 'disconnect', connectionId },
        CONNECT_TIMEOUT_MS,
        signal,
      );
      this.expectSuccess(result, 'disconnected');
    } finally {
      this.state.connectionId = null;
      this.state.activeRun = null;
      this.stopLeaseRenewal();
      this.close();
    }
  }

  close(): void {
    const socket = this.state.socket;
    this.state.socket = null;
    this.state.connecting = null;
    this.state.connectionId = null;
    this.state.activeRun = null;
    this.state.supportsLeaseRenewal = false;
    this.stopLeaseRenewal();
    socket?.destroy();
    for (const pending of this.state.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(disconnectedOperation(pending.request));
    }
    this.state.pending.clear();
  }

  private async requestedStop(connectionId: string, signal: AbortSignal): Promise<object | null> {
    if (!this.state.activeRun) return null;
    const result = await this.transport.request(
      {
        type: 'get_run',
        connectionId,
        runId: this.state.activeRun.runId,
      },
      CONNECT_TIMEOUT_MS,
      signal,
    );
    const data = this.expectSuccess(result, 'run_state');
    const run = data.run as AiRunState;
    if (run.status !== 'stop_requested') return null;
    const active = this.state.activeRun;
    const acknowledged = await this.transport.request(
      {
        type: 'acknowledge_stop',
        connectionId,
        runId: active.runId,
      },
      CONNECT_TIMEOUT_MS,
      signal,
    );
    this.expectSuccess(acknowledged, 'stop_acknowledged');
    this.state.activeRun = null;
    this.stopLeaseRenewal();
    return { type: 'stop_requested', runId: active.runId, messageId: active.messageId };
  }

  private scheduleLeaseRenewal(): void {
    this.stopLeaseRenewal();
    if (!this.state.supportsLeaseRenewal || !this.state.activeRun || !this.state.connectionId)
      return;
    this.state.leaseRenewTimer = setTimeout(() => {
      this.state.leaseRenewTimer = null;
      void this.renewActiveLease();
    }, this.leaseRenewIntervalMs);
    this.state.leaseRenewTimer.unref?.();
  }

  private async renewActiveLease(): Promise<void> {
    const active = this.state.activeRun;
    const connectionId = this.state.connectionId;
    if (!active || !connectionId) return;
    try {
      const result = await this.transport.request(
        {
          type: 'renew_lease',
          connectionId,
          runId: active.runId,
          leaseMs: CLAIM_LEASE_MS,
        },
        CONNECT_TIMEOUT_MS,
      );
      this.expectSuccess(result, 'lease_renewed');
      if (this.state.activeRun?.runId === active.runId) this.scheduleLeaseRenewal();
    } catch (error) {
      if (
        this.state.activeRun?.runId !== active.runId ||
        this.state.connectionId !== connectionId
      ) {
        this.stopLeaseRenewal();
        return;
      }
      if (this.isTransientLeaseRenewalFailure(error)) {
        this.scheduleLeaseRenewal();
      } else {
        this.state.activeRun = null;
        this.state.leaseRenewalFailure =
          error instanceof AiCompanionOperationError
            ? error
            : new AiCompanionOperationError(companionErrorDetails(error));
        this.stopLeaseRenewal();
      }
    }
  }

  private isTransientLeaseRenewalFailure(error: unknown): boolean {
    return (
      error instanceof AiCompanionOperationError &&
      error.details.retryable &&
      (error.details.kind === 'timeout' ||
        error.details.kind === 'app_unavailable' ||
        error.details.kind === 'renderer_unavailable' ||
        error.details.kind === 'cancelled')
    );
  }

  private throwLeaseRenewalFailure(): void {
    if (this.state.leaseRenewalFailure) throw this.state.leaseRenewalFailure;
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
    if (!this.state.leaseRenewTimer) return;
    clearTimeout(this.state.leaseRenewTimer);
    this.state.leaseRenewTimer = null;
  }

  private expectSuccess(result: AiBridgeResult, type: string): Record<string, unknown> {
    if (!result.ok) {
      if (result.error.kind === 'unavailable') this.close();
      throw bridgeOperationError(result.error);
    }
    if (result.data.type !== type) throw new Error('Lacuna returned the wrong AI response.');
    return result.data as unknown as Record<string, unknown>;
  }

  private requireConnection(): string {
    if (!this.state.connectionId) {
      throw new AiCompanionOperationError({
        kind: 'not_connected',
        message: 'Lacuna AI is not connected.',
        retryable: true,
        suggestedAction: 'connect',
        userActionRequired: false,
        commitState: 'not_started',
      });
    }
    return this.state.connectionId;
  }
}

export function createLocalAiAppClient(hostUserDataPath: string): LocalAiAppClient {
  return new LocalAiAppClient(undefined, hostUserDataPath);
}
