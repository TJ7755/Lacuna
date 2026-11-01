import { describe, expect, it, vi } from 'vitest';
import { buildAiInstructionBundle } from '../../../apps/web/src/ai/instructions';
import {
  AI_RELAY_PROTOCOL_VERSION,
  type RelayBrowserMailbox,
} from '../../../apps/web/src/ai/relayProtocol';
import {
  AI_TERMINAL_HEARTBEAT_INTERVAL_MS,
  DEFAULT_AI_RELAY_URL,
  TerminalAiClient,
  TerminalRelayReconnectRequiredError,
} from './client';
import { CONNECTION, FakeTransport, queuedMailbox } from './client.testHarness';

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
      leaseExpiresAt: 301_000,
      instructions: buildAiInstructionBundle({ misconceptionFirstEnabled: true }),
    });
    expect(transport.writes).toEqual([
      {
        version: AI_RELAY_PROTOCOL_VERSION,
        revision: 1,
        browserRevisionSeen: 1,
        events: [
          {
            type: 'claimed',
            eventId: 'event-1',
            messageId: 'message-1',
            runId: 'run-1',
            claimedAt: 1_000,
            leaseExpiresAt: 301_000,
          },
        ],
      },
    ]);
  });

  it('publishes throttled liveness heartbeats while bounded waits are empty', async () => {
    const transport = new FakeTransport();
    let now = 1_000;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      sleep: async () => undefined,
      createId: (prefix) => `${prefix}-1`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

    await expect(client.waitForMessage(0)).resolves.toEqual({ type: 'empty' });
    await expect(client.waitForMessage(0)).resolves.toEqual({ type: 'empty' });
    expect(transport.writes).toEqual([
      {
        version: AI_RELAY_PROTOCOL_VERSION,
        revision: 1,
        browserRevisionSeen: 0,
        events: [],
      },
    ]);

    now += AI_TERMINAL_HEARTBEAT_INTERVAL_MS;
    await expect(client.waitForMessage(0)).resolves.toEqual({ type: 'empty' });
    expect(transport.writes.at(-1)).toEqual({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 2,
      browserRevisionSeen: 0,
      events: [],
    });
  });

  it('does not let a hung heartbeat write overrun a bounded wait', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      const transport = new FakeTransport();
      transport.blockWrites = true;
      const client = new TerminalAiClient({ transport });
      await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

      const wait = client.waitForMessage(25_000);
      const outcome = Promise.race([
        wait.catch((error: unknown) => error),
        new Promise<'overrun'>((resolve) => setTimeout(() => resolve('overrun'), 25_001)),
      ]);
      await vi.advanceTimersByTimeAsync(25_001);

      await expect(outcome).resolves.toMatchObject({
        name: 'TerminalRelayReconnectRequiredError',
        reason: 'write_outcome_unknown',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries the same browser generation when publishing a claim fails', async () => {
    const transport = new FakeTransport();
    const mailbox = queuedMailbox();
    transport.reads.push(
      { generation: '"browser-1"', mailbox },
      { generation: '"browser-1"', mailbox },
    );
    transport.writeError = new Error('relay write failed');
    let now = 1_000;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      createId: (prefix) => `${prefix}-1`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

    await expect(client.waitForMessage(25_000)).rejects.toThrow('relay write failed');
    await expect(client.waitForMessage(25_000)).resolves.toEqual(
      expect.objectContaining({ type: 'message', messageId: 'message-1' }),
    );
    expect(transport.writes).toHaveLength(1);
  });

  it.each([
    {
      reason: 'write_outcome_unknown' as const,
      message: 'The terminal mailbox write outcome is unknown.',
    },
    {
      reason: 'terminal_writer_changed' as const,
      message: 'Another terminal writer changed this Lacuna AI session.',
    },
  ])('clears the connection after a $reason error and allows reconnection', async (testCase) => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    transport.writeError = new TerminalRelayReconnectRequiredError(testCase.reason);
    let now = 1_000;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

    await expect(client.waitForMessage(25_000)).rejects.toMatchObject({
      name: 'TerminalRelayReconnectRequiredError',
      reason: testCase.reason,
      message: expect.stringContaining(testCase.message),
    });
    await expect(client.waitForMessage(250)).rejects.toThrow('not connected');
    await expect(
      client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' }),
    ).resolves.toEqual(CONNECTION);
  });

  it('compacts only the browser-acknowledged terminal event prefix', async () => {
    const transport = new FakeTransport();
    const first = queuedMailbox().messages[0];
    const second = { ...first, messageId: 'message-2', content: 'Second message.' };
    const third = { ...first, messageId: 'message-3', content: 'Third message.' };
    transport.reads.push(
      { generation: '"browser-1"', mailbox: queuedMailbox() },
      {
        generation: '"browser-2"',
        mailbox: {
          version: AI_RELAY_PROTOCOL_VERSION,
          revision: 2,
          terminalRevisionSeen: 0,
          toolResponses: [],
          messages: [{ ...first, delivery: 'claimed', runId: 'run-1' }, second],
        },
      },
      {
        generation: '"browser-3"',
        mailbox: {
          version: AI_RELAY_PROTOCOL_VERSION,
          revision: 3,
          terminalRevisionSeen: 1,
          toolResponses: [],
          messages: [
            { ...first, delivery: 'claimed', runId: 'run-1' },
            { ...second, delivery: 'claimed', runId: 'run-3' },
            third,
          ],
        },
      },
    );
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });

    await client.waitForMessage(25_000);
    await client.waitForMessage(25_000);
    await client.waitForMessage(25_000);

    expect(transport.writes.at(-1)).toEqual({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 3,
      browserRevisionSeen: 3,
      events: [
        expect.objectContaining({ type: 'claimed', messageId: 'message-2' }),
        expect.objectContaining({ type: 'claimed', messageId: 'message-3' }),
      ],
    });
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
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 3,
      browserRevisionSeen: 1,
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

  it('claims a queued follow-up already observed while publishing the preceding reply', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let now = 1_000;
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');

    const first = queuedMailbox().messages[0];
    const followUp = {
      ...first,
      messageId: 'message-2',
      content: 'Compare it with rereading.',
      createdAt: 1_500,
    };
    const followUpMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 2,
      terminalRevisionSeen: 1,
      messages: [{ ...first, delivery: 'claimed', runId: claimed.runId }, followUp],
    };
    transport.reads.push({ generation: '"browser-2"', mailbox: followUpMailbox });
    transport.fallbackRead = { generation: '"browser-2"', mailbox: followUpMailbox };

    await client.reply(claimed.runId, claimed.messageId, 'Retrieval strengthens recall.');

    await expect(client.waitForMessage(1_000)).resolves.toEqual(
      expect.objectContaining({
        type: 'message',
        messageId: 'message-2',
        content: 'Compare it with rereading.',
      }),
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

it('uses the custom relay domain by default', () => {
  expect(DEFAULT_AI_RELAY_URL).toBe('https://relay.getlacuna.app');
});
