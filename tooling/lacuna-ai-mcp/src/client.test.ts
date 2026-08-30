import { describe, expect, it, vi } from 'vitest';
import { buildAiInstructionBundle } from '../../../src/ai/instructions';
import type { AiClientIdentity } from '../../../src/ai/protocol';
import {
  AI_RELAY_EMPTY_GENERATION,
  AI_RELAY_PROTOCOL_VERSION,
  type RelayBrowserMailbox,
  type RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol';
import {
  AI_TERMINAL_HEARTBEAT_INTERVAL_MS,
  DEFAULT_AI_RELAY_URL,
  TerminalAiClient,
  TerminalRelayReconnectRequiredError,
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
  fallbackRead: { generation: string; mailbox: RelayBrowserMailbox } | null = null;
  readonly writes: RelayTerminalMailbox[] = [];
  beforeWrite?: (mailbox: RelayTerminalMailbox) => void;
  blockWrites = false;
  writeError?: Error;

  async readBrowserMailbox(): Promise<{
    generation: string;
    mailbox: RelayBrowserMailbox;
  } | null> {
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
      await new Promise<never>((_resolve, reject) => {
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
}

class ConcurrentCallTransport implements TerminalRelayTransport {
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

function queuedMailbox(): RelayBrowserMailbox {
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

  it('publishes one tool call and returns only its exact browser response', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => prefix + '-1',
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    const responseMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 3,
      terminalRevisionSeen: 2,
      messages: [{ ...queuedMailbox().messages[0], delivery: 'claimed', runId: claimed.runId }],
      toolResponses: [
        {
          runId: claimed.runId,
          callId: 'call-1',
          respondedAt: 1_100,
          ok: true,
          result: { courses: [] },
        },
      ],
    };
    transport.reads.push(
      { generation: '"browser-2"', mailbox: responseMailbox },
      { generation: '"browser-3"', mailbox: responseMailbox },
    );

    await expect(
      client.invokeTool(claimed.runId, 'call-1', 'lacuna.list_courses', {}, 1_000),
    ).resolves.toEqual({ ok: true, result: { courses: [] } });
    const calls = transport.writes
      .flatMap((mailbox) => mailbox.events)
      .filter((event) => event.type === 'tool_call');
    expect(new Set(calls.map((event) => event.eventId))).toHaveLength(1);
  });

  it('ignores a stale response when an approved call resumes with the same callId', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => prefix + '-1',
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    const staleMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 2,
      terminalRevisionSeen: 1,
      messages: [{ ...queuedMailbox().messages[0], delivery: 'claimed', runId: claimed.runId }],
      toolResponses: [
        {
          runId: claimed.runId,
          callId: 'call-1',
          respondedAt: 1_050,
          ok: false,
          error: {
            kind: 'approval_required',
            approvalId: 'approval-1',
            approvalKind: 'write_call',
            message: 'Approve this Course creation.',
          },
        },
      ],
    };
    const approvedMailbox: RelayBrowserMailbox = {
      ...staleMailbox,
      revision: 3,
      terminalRevisionSeen: 2,
      toolResponses: [
        {
          runId: claimed.runId,
          callId: 'call-1',
          respondedAt: 1_100,
          ok: true,
          result: { id: 'course-1' },
        },
      ],
    };
    transport.reads.push(
      { generation: '"browser-2"', mailbox: staleMailbox },
      { generation: '"browser-2"', mailbox: staleMailbox },
      { generation: '"browser-3"', mailbox: approvedMailbox },
    );

    await expect(
      client.invokeTool(claimed.runId, 'call-1', 'lacuna.create_course', { name: 'Biology' }),
    ).resolves.toEqual({ ok: true, result: { id: 'course-1' } });
  });

  it('serialises concurrent tool invocations through one terminal mailbox writer', async () => {
    const transport = new ConcurrentCallTransport();
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => prefix + '-1',
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');

    await expect(
      Promise.all([
        client.invokeTool(claimed.runId, 'call-1', 'lacuna.list_courses', {}, 1_000),
        client.invokeTool(claimed.runId, 'call-2', 'lacuna.list_courses', {}, 1_000),
      ]),
    ).resolves.toEqual([
      { ok: true, result: { callId: 'call-1' } },
      { ok: true, result: { callId: 'call-2' } },
    ]);
  });

  it('refreshes Stop state before admitting a tool call', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => prefix + '-1',
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        messages: [
          { ...queuedMailbox().messages[0], delivery: 'stop_requested', runId: claimed.runId },
        ],
        toolResponses: [],
      },
    });

    await expect(
      client.invokeTool(claimed.runId, 'call-1', 'lacuna.list_courses', {}, 1_000),
    ).rejects.toThrow('tool call was not sent');
    expect(transport.writes.flatMap((mailbox) => mailbox.events)).not.toContainEqual(
      expect.objectContaining({ type: 'tool_call', callId: 'call-1' }),
    );
  });

  it('times out while polling without publishing another call', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    const client = new TerminalAiClient({
      transport,
      now: (() => {
        let current = 1_000;
        return () => current++;
      })(),
      sleep: async () => {},
      createId: (prefix) => prefix + '-1',
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.fallbackRead = { generation: '"browser-1"', mailbox: queuedMailbox() };

    await expect(
      client.invokeTool(claimed.runId, 'call-1', 'lacuna.list_courses', {}, 250),
    ).rejects.toThrow('Timed out');
    expect(
      transport.writes
        .flatMap((mailbox) => mailbox.events)
        .filter((event) => event.type === 'tool_call'),
    ).toHaveLength(1);
  });

  it('acknowledges a stop request for the active run instead of reclaiming it', async () => {
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
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        terminalRevisionSeen: 1,
        toolResponses: [],
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

  it('retries the same browser generation when publishing a Stop acknowledgement fails', async () => {
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
    const stoppedMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 2,
      terminalRevisionSeen: 1,
      toolResponses: [],
      messages: [
        {
          ...queuedMailbox().messages[0],
          delivery: 'stop_requested',
          runId: claimed.runId,
        },
      ],
    };
    transport.reads.push(
      { generation: '"browser-2"', mailbox: stoppedMailbox },
      { generation: '"browser-2"', mailbox: stoppedMailbox },
    );
    transport.writeError = new Error('relay write failed');

    await expect(client.waitForMessage(25_000)).rejects.toThrow('relay write failed');
    await expect(client.waitForMessage(25_000)).resolves.toEqual({
      type: 'stop_requested',
      messageId: claimed.messageId,
      runId: claimed.runId,
    });
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'stop_acknowledged', runId: claimed.runId }),
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
        toolResponses: [],
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

  it('acknowledges Stop arriving after the pre-reply refresh but before reply publication', async () => {
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

    transport.beforeWrite = (mailbox) => {
      if (mailbox.events.at(-1)?.type !== 'reply') return;
      transport.reads.push({
        generation: '"browser-2"',
        mailbox: {
          ...queuedMailbox(),
          revision: 2,
          terminalRevisionSeen: 1,
          toolResponses: [],
          messages: [
            {
              ...queuedMailbox().messages[0],
              delivery: 'stop_requested',
              runId: claimed.runId,
            },
          ],
        },
      });
    };

    await client.reply(claimed.runId, claimed.messageId, 'This reply lost the Stop race.');
    await expect(client.waitForMessage(1)).resolves.toEqual({
      type: 'stop_requested',
      messageId: claimed.messageId,
      runId: claimed.runId,
    });
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'stop_acknowledged', runId: claimed.runId }),
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
