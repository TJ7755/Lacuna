import { randomUUID } from 'node:crypto';
import type { AiClientIdentity } from '../../../src/ai/protocol.js';
import {
  AI_RELAY_EMPTY_GENERATION,
  type RelayBrowserMailbox,
  type RelayTerminalEvent,
  type RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol.js';

export const DEFAULT_AI_RELAY_URL = 'https://lacuna-relay.vercel.app';
const DEFAULT_WAIT_MS = 25_000;
const POLL_INTERVAL_MS = 500;
const CLAIM_LEASE_MS = 60_000;

export interface ConnectedTerminalRelay {
  relayUrl: string;
  sessionId: string;
  expiresAt: number;
}

export interface TerminalRelayTransport {
  connect(
    code: string,
    relayUrl: string,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay>;
  readBrowserMailbox(connection: ConnectedTerminalRelay): Promise<{
    generation: string;
    mailbox: RelayBrowserMailbox;
  } | null>;
  writeTerminalMailbox(
    connection: ConnectedTerminalRelay,
    generation: string,
    mailbox: RelayTerminalMailbox,
  ): Promise<string>;
}

export type WaitForMessageResult =
  | {
      type: 'message';
      messageId: string;
      conversationId: string;
      runId: string;
      content: string;
      createdAt: number;
      leaseExpiresAt: number;
    }
  | { type: 'stop_requested'; messageId: string; runId: string }
  | { type: 'empty' };

interface ActiveRun {
  messageId: string;
  runId: string;
}

export interface TerminalAiClientOptions {
  transport: TerminalRelayTransport;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  createId?: (prefix: 'event' | 'run') => string;
}

export class TerminalAiClient {
  private readonly transport: TerminalRelayTransport;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly createId: (prefix: 'event' | 'run') => string;
  private connection: ConnectedTerminalRelay | null = null;
  private browserGeneration: string | null = null;
  private terminalGeneration = AI_RELAY_EMPTY_GENERATION;
  private terminalMailbox: RelayTerminalMailbox = { version: 1, revision: 0, events: [] };
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
  }

  async connect(
    code: string,
    relayUrl: string | undefined,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay> {
    if (this.connection) throw new Error('Lacuna AI is already connected.');
    const connection = await this.transport.connect(code, relayUrl ?? DEFAULT_AI_RELAY_URL, client);
    this.connection = connection;
    return connection;
  }

  async waitForMessage(timeoutMs = DEFAULT_WAIT_MS): Promise<WaitForMessageResult> {
    const connection = this.requireConnection();
    const deadline = this.now() + timeoutMs;

    for (;;) {
      const read = await this.transport.readBrowserMailbox(connection);
      if (read && read.generation !== this.browserGeneration) {
        this.browserGeneration = read.generation;
        const stop = await this.acknowledgeRequestedStop(read.mailbox);
        if (stop) return stop;

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
          return {
            type: 'message',
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            runId,
            content: queued.content,
            createdAt: queued.createdAt,
            leaseExpiresAt,
          };
        }
      }

      const remaining = deadline - this.now();
      if (remaining <= 0) return { type: 'empty' };
      await this.sleep(Math.min(POLL_INTERVAL_MS, remaining));
    }
  }

  async reply(runId: string, messageId: string, content: string): Promise<void> {
    const connection = this.requireConnection();
    const active = this.activeRuns.get(runId);
    if (!active || active.messageId !== messageId) {
      throw new Error('The supplied run and message are not active in this terminal session.');
    }
    const latest = await this.transport.readBrowserMailbox(connection);
    if (latest && latest.generation !== this.browserGeneration) {
      this.browserGeneration = latest.generation;
      const stopped = await this.acknowledgeRequestedStop(latest.mailbox);
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
    this.activeRuns.delete(runId);
  }

  async disconnect(): Promise<void> {
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
  ): Promise<Extract<WaitForMessageResult, { type: 'stop_requested' }> | null> {
    const stopped = mailbox.messages.find(
      (message) =>
        message.delivery === 'stop_requested' &&
        this.activeRuns.has(message.runId) &&
        !this.acknowledgedStops.has(message.runId),
    );
    if (!stopped || stopped.delivery !== 'stop_requested') return null;
    await this.appendEvent({
      type: 'stop_acknowledged',
      eventId: this.createId('event'),
      runId: stopped.runId,
      stoppedAt: this.now(),
    });
    this.acknowledgedStops.add(stopped.runId);
    this.activeRuns.delete(stopped.runId);
    return { type: 'stop_requested', messageId: stopped.messageId, runId: stopped.runId };
  }

  private async appendEvent(event: RelayTerminalEvent): Promise<void> {
    const connection = this.requireConnection();
    const next: RelayTerminalMailbox = {
      version: 1,
      revision: this.terminalMailbox.revision + 1,
      events: [...this.terminalMailbox.events, event],
    };
    const generation = await this.transport.writeTerminalMailbox(
      connection,
      this.terminalGeneration,
      next,
    );
    this.terminalMailbox = next;
    this.terminalGeneration = generation;
  }

  private requireConnection(): ConnectedTerminalRelay {
    if (!this.connection) throw new Error('Lacuna AI is not connected.');
    return this.connection;
  }

  private clearConnection(): void {
    this.connection = null;
    this.browserGeneration = null;
    this.terminalGeneration = AI_RELAY_EMPTY_GENERATION;
    this.terminalMailbox = { version: 1, revision: 0, events: [] };
    this.activeRuns.clear();
    this.claimedMessageIds.clear();
    this.acknowledgedStops.clear();
  }
}
