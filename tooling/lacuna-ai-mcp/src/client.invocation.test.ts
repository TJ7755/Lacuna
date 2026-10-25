import { describe, expect, it, vi } from 'vitest';
import { type RelayBrowserMailbox } from '../../../src/ai/relayProtocol';
import { TerminalAiClient } from './client';
import { FakeTransport, ConcurrentCallTransport, queuedMailbox } from './client.testHarness';

describe('TerminalAiClient', () => {
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

  it('bounds a blocked browser-mailbox read by the original invocation deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      const transport = new FakeTransport();
      transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
      const client = new TerminalAiClient({ transport });
      await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
      const claimed = await client.waitForMessage(25_000);
      if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
      transport.blockReads = true;
      const invocation = client.invokeTool(
        claimed.runId,
        'call-blocked-read',
        'lacuna.list_courses',
        {},
        250,
      );
      const outcome = Promise.race([
        invocation.catch((error: unknown) => error),
        new Promise<'overrun'>((resolve) => setTimeout(() => resolve('overrun'), 251)),
      ]);
      await vi.advanceTimersByTimeAsync(251);
      const result = await outcome;
      transport.releaseBlockedReads();
      await invocation.catch(() => undefined);

      expect(result).toMatchObject({ message: expect.stringContaining('Timed out') });
    } finally {
      vi.useRealTimers();
    }
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
});
