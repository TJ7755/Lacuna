import { vi } from 'vitest';
import { buildAiInstructionBundle } from '../../../src/ai/instructions';
import type { AiClientIdentity } from '../../../src/ai/protocol';
import {
  AI_RELAY_EMPTY_GENERATION,
  AI_RELAY_PROTOCOL_VERSION,
  type RelayBrowserMailbox,
  type RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol';
import {
  DEFAULT_AI_RELAY_URL,
  TerminalRelayReconnectRequiredError,
  type ConnectedTerminalRelay,
  type TerminalRelayTransport,
} from './client';

export const CONNECTION: ConnectedTerminalRelay = {
  relayUrl: DEFAULT_AI_RELAY_URL,
  sessionId: 'ABCDEFGHJKMNPQRSTVW',
  expiresAt: 100_000,
};

export class FakeTransport implements TerminalRelayTransport {
  readonly connect = vi.fn(
    async (_code: string, _relayUrl: string, _client: AiClientIdentity) => CONNECTION,
  );
  readonly reads: Array<{ generation: string; mailbox: RelayBrowserMailbox } | null> = [];
  fallbackRead: { generation: string; mailbox: RelayBrowserMailbox } | null = null;
  readonly writes: RelayTerminalMailbox[] = [];
  beforeWrite?: (mailbox: RelayTerminalMailbox) => void;
  blockReads = false;
  blockWrites = false;
  writeError?: Error;
  private readonly blockedReadReleases: Array<() => void> = [];
  private readonly blockedWriteReleases: Array<() => void> = [];

  async readBrowserMailbox(
    _connection?: ConnectedTerminalRelay,
    signal?: AbortSignal,
  ): Promise<{
    generation: string;
    mailbox: RelayBrowserMailbox;
  } | null> {
    if (this.blockReads) {
      await new Promise<void>((resolve, reject) => {
        this.blockedReadReleases.push(resolve);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    return this.reads.shift() ?? this.fallbackRead;
  }

  async writeTerminalMailbox(
    _connection: ConnectedTerminalRelay,
    _generation: string,
    mailbox: RelayTerminalMailbox,
    signal?: AbortSignal,
  ): Promise<string> {
    this.beforeWrite?.(mailbox);
    if (this.blockWrites) {
      await new Promise<void>((resolve, reject) => {
        this.blockedWriteReleases.push(resolve);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = undefined;
      throw error;
    }
    this.writes.push(mailbox);
    return `"terminal-${mailbox.revision}"`;
  }

  releaseBlockedReads(): void {
    for (const release of this.blockedReadReleases.splice(0)) release();
  }

  releaseBlockedWrites(): void {
    for (const release of this.blockedWriteReleases.splice(0)) release();
  }
}

export class ConcurrentCallTransport implements TerminalRelayTransport {
  readonly connect = vi.fn(
    async (_code: string, _relayUrl: string, _client: AiClientIdentity) => CONNECTION,
  );
  private terminalGeneration = AI_RELAY_EMPTY_GENERATION;
  private terminalWriteSequence = 0;
  private readonly toolCalls = new Map<string, string>();

  async readBrowserMailbox(): Promise<{
    generation: string;
    mailbox: RelayBrowserMailbox;
  }> {
    const responses = [...this.toolCalls].map(([callId, runId]) => ({
      runId,
      callId,
      respondedAt: 1_100,
      ok: true as const,
      result: { callId },
    }));
    const runId = this.toolCalls.values().next().value as string | undefined;
    return {
      generation: `"browser-${responses.length + 1}"`,
      mailbox: {
        ...queuedMailbox(),
        revision: responses.length + 1,
        terminalRevisionSeen: responses.length + 1,
        messages: runId
          ? [{ ...queuedMailbox().messages[0], delivery: 'claimed', runId }]
          : queuedMailbox().messages,
        toolResponses: responses,
      },
    };
  }

  async writeTerminalMailbox(
    _connection: ConnectedTerminalRelay,
    generation: string,
    mailbox: RelayTerminalMailbox,
  ): Promise<string> {
    if (generation !== this.terminalGeneration) {
      throw new TerminalRelayReconnectRequiredError('terminal_writer_changed');
    }
    this.terminalGeneration = `"terminal-${++this.terminalWriteSequence}"`;
    for (const event of mailbox.events) {
      if (event.type === 'tool_call') this.toolCalls.set(event.callId, event.runId);
    }
    return this.terminalGeneration;
  }
}

export function queuedMailbox(): RelayBrowserMailbox {
  return {
    version: AI_RELAY_PROTOCOL_VERSION,
    revision: 1,
    terminalRevisionSeen: 0,
    toolResponses: [],
    messages: [
      {
        delivery: 'queued',
        messageId: 'message-1',
        conversationId: 'conversation-1',
        content: 'Explain why this answer is wrong.',
        createdAt: 10,
        instructions: buildAiInstructionBundle({ misconceptionFirstEnabled: true }),
      },
    ],
  };
}
