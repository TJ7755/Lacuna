import { TerminalInvocationBudget } from './terminalInvocationBudget.js';
import {
  TerminalRelayReconnectRequiredError,
  type ConnectedTerminalRelay,
  type TerminalRelayTransport,
  type WaitForMessageResult,
  type TerminalToolResponse,
  type TerminalAiClientOptions,
} from './terminalContracts.js';
export {
  TerminalRelayReconnectRequiredError,
  type TerminalRelayReconnectReason,
  type ConnectedTerminalRelay,
  type TerminalRelayTransport,
  type WaitForMessageResult,
  type TerminalToolResponse,
  type TerminalAiClientOptions,
} from './terminalContracts.js';
import { randomUUID } from 'node:crypto';
import type { AiClientIdentity, JsonValue } from '../../../apps/web/src/ai/protocol.js';
import {
  AI_RELAY_EMPTY_GENERATION,
  AI_RELAY_PROTOCOL_VERSION,
  relayTerminalEventSchema,
  type RelayBrowserMailbox,
  type RelayTerminalEvent,
  type RelayTerminalMailbox,
} from '../../../apps/web/src/ai/relayProtocol.js';

export const DEFAULT_AI_RELAY_URL = 'https://relay.getlacuna.app';
const DEFAULT_WAIT_MS = 25_000;
const POLL_INTERVAL_MS = 500;
const APPROVAL_RETRY_INTERVAL_MS = 500;
const CLAIM_LEASE_MS = 5 * 60_000;
const TOOL_CALL_TIMEOUT_MS = 25_000;
export const AI_TERMINAL_HEARTBEAT_INTERVAL_MS = 60_000;

interface ActiveRun {
  messageId: string;
  runId: string;
  replyRevision?: number;
}

export class TerminalAiClient {
  private readonly transport: TerminalRelayTransport;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly createId: (prefix: 'event' | 'run') => string;
  private readonly invocationBudget: TerminalInvocationBudget;
  private operationQueue: Promise<void> = Promise.resolve();
  private connection: ConnectedTerminalRelay | null = null;
  private browserGeneration: string | null = null;
  private terminalGeneration = AI_RELAY_EMPTY_GENERATION;
  private lastTerminalWriteAt: number | null = null;
  private terminalMailbox: RelayTerminalMailbox = {
    version: AI_RELAY_PROTOCOL_VERSION,
    revision: 0,
    events: [],
    browserRevisionSeen: 0,
  };
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly claimedMessageIds = new Set<string>();
  private readonly acknowledgedStops = new Set<string>();

  constructor(options: TerminalAiClientOptions) {
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.createId = options.createId ?? ((prefix) => `${prefix}-${randomUUID()}`);
    this.invocationBudget = new TerminalInvocationBudget(this.transport, this.now, this.sleep);
  }

  connect(
    code: string,
    relayUrl: string | undefined,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay> {
    return this.runExclusive(() => this.connectExclusive(code, relayUrl, client));
  }

  waitForMessage(timeoutMs = DEFAULT_WAIT_MS): Promise<WaitForMessageResult> {
    return this.runExclusive(() => this.waitForMessageExclusive(timeoutMs));
  }

  reply(runId: string, messageId: string, content: string): Promise<void> {
    return this.runExclusive(() => this.replyExclusive(runId, messageId, content));
  }

  invokeTool(
    runId: string,
    callId: string,
    toolName: string,
    input: JsonValue,
    timeoutMs = TOOL_CALL_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<TerminalToolResponse> {
    return this.runExclusive(() =>
      this.invokeToolExclusive(runId, callId, toolName, input, timeoutMs, signal),
    );
  }

  disconnect(): Promise<void> {
    return this.runExclusive(() => this.disconnectExclusive());
  }

  private async connectExclusive(
    code: string,
    relayUrl: string | undefined,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay> {
    if (this.connection) throw new Error('Lacuna AI is already connected.');
    const connection = await this.transport.connect(code, relayUrl ?? DEFAULT_AI_RELAY_URL, client);
    this.connection = connection;
    return connection;
  }

  private async waitForMessageExclusive(timeoutMs: number): Promise<WaitForMessageResult> {
    const connection = this.requireConnection();
    const deadline = this.now() + timeoutMs;

    for (;;) {
      const read = await this.transport.readBrowserMailbox(connection);
      if (read) {
        const generationChanged = read.generation !== this.browserGeneration;
        if (generationChanged) this.noteBrowserMailbox(read.mailbox);
        const stop = await this.acknowledgeRequestedStop(read.mailbox);
        if (stop) {
          this.browserGeneration = read.generation;
          return stop;
        }
        const queued = read.mailbox.messages.find(
          (message) =>
            message.delivery === 'queued' && !this.claimedMessageIds.has(message.messageId),
        );
        if (queued) {
          const claimedAt = this.now();
          const runId = this.createId('run');
          const leaseExpiresAt = claimedAt + CLAIM_LEASE_MS;
          await this.appendEvent({
            type: 'claimed',
            eventId: this.createId('event'),
            messageId: queued.messageId,
            runId,
            claimedAt,
            leaseExpiresAt,
          });
          this.claimedMessageIds.add(queued.messageId);
          this.activeRuns.set(runId, { messageId: queued.messageId, runId });
          this.browserGeneration = read.generation;
          return {
            type: 'message',
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            runId,
            content: queued.content,
            createdAt: queued.createdAt,
            leaseExpiresAt,
            instructions: queued.instructions,
          };
        }
        if (generationChanged) this.browserGeneration = read.generation;
      }

      await this.publishHeartbeatIfDue(Math.max(0, deadline - this.now()));
      const remaining = deadline - this.now();
      if (remaining <= 0) return { type: 'empty' };
      await this.sleep(Math.min(POLL_INTERVAL_MS, remaining));
    }
  }

  private async replyExclusive(runId: string, messageId: string, content: string): Promise<void> {
    const connection = this.requireConnection();
    const active = this.activeRuns.get(runId);
    if (!active || active.messageId !== messageId || active.replyRevision !== undefined) {
      throw new Error('The supplied run and message are not active in this terminal session.');
    }
    const latest = await this.transport.readBrowserMailbox(connection);
    if (latest && latest.generation !== this.browserGeneration) {
      this.noteBrowserMailbox(latest.mailbox);
      const stopped = await this.acknowledgeRequestedStop(latest.mailbox);
      this.browserGeneration = latest.generation;
      if (stopped?.runId === runId) {
        throw new Error('Stop was requested for this run; the late reply was not sent.');
      }
    }
    await this.appendEvent({
      type: 'reply',
      eventId: this.createId('event'),
      messageId,
      runId,
      content,
      createdAt: this.now(),
    });
    active.replyRevision = this.terminalMailbox.revision;
  }

  private async invokeToolExclusive(
    runId: string,
    callId: string,
    toolName: string,
    input: JsonValue,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<TerminalToolResponse> {
    const deadline = this.now() + timeoutMs;
    this.invocationBudget.throwIfCancelled(signal);
    const connection = this.requireConnection();
    const active = this.activeRuns.get(runId);
    if (!active || active.replyRevision !== undefined) {
      throw new Error('The supplied run is not active in this terminal session.');
    }
    const call = {
      type: 'tool_call',
      eventId: 'validation',
      runId,
      callId,
      toolName,
      input,
      createdAt: this.now(),
    } as const;
    const parsedCall = relayTerminalEventSchema.safeParse(call);
    if (!parsedCall.success) throw new Error('The Lacuna AI tool call is invalid.');

    const latest = await this.invocationBudget.readBrowserMailboxUntil(
      connection,
      deadline,
      signal,
    );
    if (!latest) throw new Error('The Lacuna AI session is disconnected.');
    if (latest.generation !== this.browserGeneration) {
      this.noteBrowserMailbox(latest.mailbox);
      const stopped = await this.acknowledgeRequestedStop(latest.mailbox, deadline, signal);
      this.browserGeneration = latest.generation;
      if (stopped?.runId === runId) {
        throw new Error('Stop was requested for this run; the tool call was not sent.');
      }
    }

    await this.appendEvent(
      { ...parsedCall.data, eventId: this.createId('event') },
      deadline,
      signal,
    );
    let callRevision = this.terminalMailbox.revision;

    for (;;) {
      const read = await this.invocationBudget.readBrowserMailboxUntil(
        connection,
        deadline,
        signal,
      );
      if (!read) throw new Error('The Lacuna AI session is disconnected.');
      if (read.generation !== this.browserGeneration) {
        this.noteBrowserMailbox(read.mailbox);
        const stopped = await this.acknowledgeRequestedStop(read.mailbox, deadline, signal);
        this.browserGeneration = read.generation;
        if (stopped?.runId === runId) {
          throw new Error('Stop was requested for this run; the tool result was discarded.');
        }
      }
      const response =
        read.mailbox.terminalRevisionSeen >= callRevision
          ? read.mailbox.toolResponses.find(
              (candidate) => candidate.runId === runId && candidate.callId === callId,
            )
          : undefined;
      if (response) {
        await this.acknowledgeBrowserRevision(deadline, signal);
        if (
          !response.ok &&
          (response.error.kind === 'approval_required' ||
            response.error.kind === 'approval_pending')
        ) {
          const retryAfterMs =
            response.error.kind === 'approval_pending'
              ? response.error.retryAfterMs
              : APPROVAL_RETRY_INTERVAL_MS;
          await this.invocationBudget.sleepUntil(retryAfterMs, deadline, signal);
          await this.appendEvent(
            { ...parsedCall.data, eventId: this.createId('event') },
            deadline,
            signal,
          );
          callRevision = this.terminalMailbox.revision;
          continue;
        }
        return response.ok
          ? {
              ok: true,
              result: response.result,
              ...(response.receipt ? { receipt: response.receipt } : {}),
            }
          : { ok: false, error: response.error };
      }
      await this.invocationBudget.sleepUntil(POLL_INTERVAL_MS, deadline, signal);
    }
  }

  private async disconnectExclusive(): Promise<void> {
    if (!this.connection) return;
    try {
      await this.appendEvent({
        type: 'disconnected',
        eventId: this.createId('event'),
        disconnectedAt: this.now(),
      });
    } finally {
      this.clearConnection();
    }
  }

  private async acknowledgeRequestedStop(
    mailbox: RelayBrowserMailbox,
    deadline?: number,
    signal?: AbortSignal,
  ): Promise<Extract<WaitForMessageResult, { type: 'stop_requested' }> | null> {
    const stopped = mailbox.messages.find(
      (message) =>
        message.delivery === 'stop_requested' &&
        this.activeRuns.has(message.runId) &&
        !this.acknowledgedStops.has(message.runId),
    );
    if (!stopped || stopped.delivery !== 'stop_requested') return null;
    await this.appendEvent(
      {
        type: 'stop_acknowledged',
        eventId: this.createId('event'),
        runId: stopped.runId,
        stoppedAt: this.now(),
      },
      deadline,
      signal,
    );
    this.acknowledgedStops.add(stopped.runId);
    this.activeRuns.delete(stopped.runId);
    return { type: 'stop_requested', messageId: stopped.messageId, runId: stopped.runId };
  }

  private async appendEvent(
    event: RelayTerminalEvent,
    deadline?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const next: RelayTerminalMailbox = {
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: this.terminalMailbox.revision + 1,
      events: [...this.terminalMailbox.events, event],
      browserRevisionSeen: this.terminalMailbox.browserRevisionSeen,
    };
    await this.writeTerminalMailbox(next, deadline, signal);
  }

  private async publishHeartbeatIfDue(timeoutMs: number): Promise<void> {
    const writtenAt = this.now();
    if (
      this.lastTerminalWriteAt !== null &&
      writtenAt - this.lastTerminalWriteAt < AI_TERMINAL_HEARTBEAT_INTERVAL_MS
    ) {
      return;
    }
    await this.writeTerminalMailbox(
      {
        ...this.terminalMailbox,
        revision: this.terminalMailbox.revision + 1,
      },
      this.now() + Math.max(1, timeoutMs),
    );
  }

  private async writeTerminalMailbox(
    next: RelayTerminalMailbox,
    deadline?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const connection = this.requireConnection();
    this.invocationBudget.throwIfCancelled(signal);
    if (deadline !== undefined) this.invocationBudget.requireRemaining(deadline);
    let generation: string;
    try {
      generation =
        deadline === undefined
          ? await this.transport.writeTerminalMailbox(
              connection,
              this.terminalGeneration,
              next,
              signal,
            )
          : await this.invocationBudget.awaitUntil(
              (boundedSignal) =>
                this.transport.writeTerminalMailbox(
                  connection,
                  this.terminalGeneration,
                  next,
                  boundedSignal,
                ),
              deadline,
              signal,
            );
    } catch (error) {
      if (
        deadline !== undefined &&
        !(error instanceof TerminalRelayReconnectRequiredError) &&
        (signal?.aborted ||
          this.now() >= deadline ||
          this.invocationBudget.isBoundedOperationError(error))
      ) {
        this.clearConnection();
        throw new TerminalRelayReconnectRequiredError();
      }
      if (error instanceof TerminalRelayReconnectRequiredError) this.clearConnection();
      throw error;
    }
    this.terminalMailbox = next;
    this.terminalGeneration = generation;
    this.lastTerminalWriteAt = this.now();
  }

  private applyBrowserAcknowledgement(terminalRevisionSeen: number): void {
    for (const [runId, run] of this.activeRuns) {
      if (run.replyRevision !== undefined && run.replyRevision <= terminalRevisionSeen) {
        this.activeRuns.delete(runId);
      }
    }
    const firstRetainedRevision =
      this.terminalMailbox.revision - this.terminalMailbox.events.length + 1;
    const acknowledgedCount = Math.min(
      this.terminalMailbox.events.length,
      Math.max(0, terminalRevisionSeen - firstRetainedRevision + 1),
    );
    if (acknowledgedCount > 0) {
      this.terminalMailbox = {
        ...this.terminalMailbox,
        events: this.terminalMailbox.events.slice(acknowledgedCount),
      };
    }
  }

  private noteBrowserMailbox(mailbox: RelayBrowserMailbox): void {
    this.applyBrowserAcknowledgement(mailbox.terminalRevisionSeen);
    this.terminalMailbox = {
      ...this.terminalMailbox,
      browserRevisionSeen: Math.max(this.terminalMailbox.browserRevisionSeen, mailbox.revision),
    };
  }

  private acknowledgeBrowserRevision(deadline: number, signal?: AbortSignal): Promise<void> {
    return this.writeTerminalMailbox(this.terminalMailbox, deadline, signal);
  }

  private requireConnection(): ConnectedTerminalRelay {
    if (!this.connection) throw new Error('Lacuna AI is not connected.');
    return this.connection;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.operationQueue.then(operation, operation);
    this.operationQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private clearConnection(): void {
    this.connection = null;
    this.browserGeneration = null;
    this.terminalGeneration = AI_RELAY_EMPTY_GENERATION;
    this.lastTerminalWriteAt = null;
    this.terminalMailbox = {
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 0,
      events: [],
      browserRevisionSeen: 0,
    };
    this.activeRuns.clear();
    this.claimedMessageIds.clear();
    this.acknowledgedStops.clear();
  }
}
