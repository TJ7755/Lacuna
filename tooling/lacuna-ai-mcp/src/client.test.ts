import { describe, expect, it, vi } from 'vitest';
import type { AiClientIdentity } from '../../../src/ai/protocol';
import type { RelayBrowserMailbox, RelayTerminalMailbox } from '../../../src/ai/relayProtocol';
import {
  DEFAULT_AI_RELAY_URL,
  TerminalAiClient,
  type ConnectedTerminalRelay,
  type TerminalRelayTransport,
} from './client';

const CONNECTION: ConnectedTerminalRelay = {
  relayUrl: DEFAULT_AI_RELAY_URL,
  sessionId: 'ABCDEFGHJKMNPQRSTVW',
  expiresAt: 100_000,
};

class FakeTransport implements TerminalRelayTransport {
  readonly connect = vi.fn(
    async (_code: string, _relayUrl: string, _client: AiClientIdentity) => CONNECTION,
  );
  readonly reads: Array<{ generation: string; mailbox: RelayBrowserMailbox } | null> = [];
  readonly writes: RelayTerminalMailbox[] = [];

  async readBrowserMailbox(): Promise<{
    generation: string;
    mailbox: RelayBrowserMailbox;
  } | null> {
    return this.reads.shift() ?? null;
  }

  async writeTerminalMailbox(
    _connection: ConnectedTerminalRelay,
    _generation: string,
    mailbox: RelayTerminalMailbox,
  ): Promise<string> {
    this.writes.push(mailbox);
    return `"terminal-${mailbox.revision}"`;
  }
}

function queuedMailbox(): RelayBrowserMailbox {
  return {
    version: 1,
    revision: 1,
    terminalRevisionSeen: 0,
    messages: [
      {
        delivery: 'queued',
        messageId: 'message-1',
        conversationId: 'conversation-1',
        content: 'Explain why this answer is wrong.',
        createdAt: 10,
      },
    ],
  };
}

describe('TerminalAiClient', () => {
  it('claims the pairing code against the default relay with the MCP client identity', async () => {
    const transport = new FakeTransport();
    const client = new TerminalAiClient({ transport });
    const identity = { name: 'OpenCode', version: '1.2.3' };

    await expect(client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, identity)).resolves.toEqual({
      sessionId: CONNECTION.sessionId,
      relayUrl: DEFAULT_AI_RELAY_URL,
      expiresAt: CONNECTION.expiresAt,
    });
    expect(transport.connect).toHaveBeenCalledWith(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
      DEFAULT_AI_RELAY_URL,
      identity,
    );
  });

  it('claims one queued browser message before returning it', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-1`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

    await expect(client.waitForMessage(25_000)).resolves.toEqual({
      type: 'message',
      messageId: 'message-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      content: 'Explain why this answer is wrong.',
      createdAt: 10,
      leaseExpiresAt: 61_000,
    });
    expect(transport.writes).toEqual([
      {
        version: 1,
        revision: 1,
        events: [
          {
            type: 'claimed',
            eventId: 'event-1',
            messageId: 'message-1',
            runId: 'run-1',
            claimedAt: 1_000,
            leaseExpiresAt: 61_000,
          },
        ],
      },
    ]);
  });

  it('writes a reply for the exact active run and then disconnects', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let now = 1_000;
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');

    now = 2_000;
    await client.reply(claimed.runId, claimed.messageId, 'The distinction is causal.');
    now = 3_000;
    await client.disconnect();

    expect(transport.writes.at(-1)).toEqual({
      version: 1,
      revision: 3,
      events: [
        expect.objectContaining({ type: 'claimed', runId: claimed.runId }),
        {
          type: 'reply',
          eventId: 'event-3',
          runId: claimed.runId,
          messageId: claimed.messageId,
          content: 'The distinction is causal.',
          createdAt: 2_000,
        },
        { type: 'disconnected', eventId: 'event-4', disconnectedAt: 3_000 },
      ],
    });
    await expect(client.waitForMessage(250)).rejects.toThrow('not connected');
  });

  it('acknowledges a stop request for the active run instead of reclaiming it', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        terminalRevisionSeen: 1,
        messages: [
          {
            ...queuedMailbox().messages[0],
            delivery: 'stop_requested',
            runId: claimed.runId,
          },
        ],
      },
    });

    await expect(client.waitForMessage(25_000)).resolves.toEqual({
      type: 'stop_requested',
      messageId: claimed.messageId,
      runId: claimed.runId,
    });
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual({
      type: 'stop_acknowledged',
      eventId: 'event-3',
      runId: claimed.runId,
      stoppedAt: 1_000,
    });
    await expect(client.reply(claimed.runId, claimed.messageId, 'Too late.')).rejects.toThrow(
      'not active',
    );
  });

  it('refreshes Stop state immediately before refusing a late reply', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        terminalRevisionSeen: 1,
        messages: [
          {
            ...queuedMailbox().messages[0],
            delivery: 'stop_requested',
            runId: claimed.runId,
          },
        ],
      },
    });

    await expect(
      client.reply(claimed.runId, claimed.messageId, 'This reply arrived too late.'),
    ).rejects.toThrow('Stop was requested');
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'stop_acknowledged', runId: claimed.runId }),
    );
    expect(transport.writes.flatMap((mailbox) => mailbox.events)).not.toContainEqual(
      expect.objectContaining({ type: 'reply', runId: claimed.runId }),
    );
  });

  it('returns an empty result after a bounded series of polls', async () => {
    const transport = new FakeTransport();
    let now = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const client = new TerminalAiClient({ transport, now: () => now, sleep });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

    await expect(client.waitForMessage(1_000)).resolves.toEqual({ type: 'empty' });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(now).toBe(1_000);
  });
});
