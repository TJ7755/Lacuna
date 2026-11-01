import { describe, expect, it, vi } from 'vitest';
import { type RelayBrowserMailbox } from '../../../apps/web/src/ai/relayProtocol';
import { TerminalAiClient } from './client';
import { FakeTransport, queuedMailbox } from './client.testHarness';

describe('TerminalAiClient', () => {
  it('keeps an approval-gated call open and resumes the exact call after approval', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      sleep: async () => undefined,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    const claimedMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 2,
      terminalRevisionSeen: 1,
      messages: [{ ...queuedMailbox().messages[0], delivery: 'claimed', runId: claimed.runId }],
    };
    const approvalMailbox: RelayBrowserMailbox = {
      ...claimedMailbox,
      revision: 3,
      terminalRevisionSeen: 2,
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
    const receipt = {
      receiptId: 'receipt-1',
      callId: 'call-1',
      toolName: 'lacuna.create_course',
      summary: 'Created Course: Biology',
      createdAt: 1_100,
      targets: [{ kind: 'course' as const, id: 'course-1', label: 'Biology' }],
    };
    const approvedMailbox: RelayBrowserMailbox = {
      ...approvalMailbox,
      revision: 4,
      terminalRevisionSeen: 3,
      toolResponses: [
        {
          runId: claimed.runId,
          callId: 'call-1',
          respondedAt: 1_100,
          ok: true,
          result: { id: 'course-1' },
          receipt,
        },
      ],
    };
    transport.reads.push(
      { generation: '"browser-2"', mailbox: claimedMailbox },
      { generation: '"browser-3"', mailbox: approvalMailbox },
      { generation: '"browser-3"', mailbox: approvalMailbox },
      { generation: '"browser-4"', mailbox: approvedMailbox },
    );

    await expect(
      client.invokeTool(claimed.runId, 'call-1', 'lacuna.create_course', { name: 'Biology' }),
    ).resolves.toEqual({
      ok: true,
      result: { id: 'course-1' },
      receipt,
    });
    const calls = transport.writes
      .flatMap((mailbox) => mailbox.events)
      .filter((event) => event.type === 'tool_call');
    const exactCalls = [...new Map(calls.map((call) => [call.eventId, call])).values()];
    expect(exactCalls).toHaveLength(2);
    expect(exactCalls.map(({ eventId: _eventId, createdAt: _createdAt, ...call }) => call)).toEqual(
      [
        {
          type: 'tool_call',
          runId: claimed.runId,
          callId: 'call-1',
          toolName: 'lacuna.create_course',
          input: { name: 'Biology' },
        },
        {
          type: 'tool_call',
          runId: claimed.runId,
          callId: 'call-1',
          toolName: 'lacuna.create_course',
          input: { name: 'Biology' },
        },
      ],
    );
  });

  it('publishes no approval retry after the MCP request is cancelled', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let sequence = 0;
    let releaseSleep: (() => void) | undefined;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      sleep: () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    const claimedMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 2,
      terminalRevisionSeen: 1,
      messages: [{ ...queuedMailbox().messages[0], delivery: 'claimed', runId: claimed.runId }],
    };
    const approvalMailbox: RelayBrowserMailbox = {
      ...claimedMailbox,
      revision: 3,
      terminalRevisionSeen: 2,
      toolResponses: [
        {
          runId: claimed.runId,
          callId: 'call-cancelled',
          respondedAt: 1_100,
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
    transport.reads.push(
      { generation: '"browser-2"', mailbox: claimedMailbox },
      { generation: '"browser-3"', mailbox: approvalMailbox },
    );
    transport.fallbackRead = { generation: '"browser-3"', mailbox: approvalMailbox };
    const abort = new AbortController();
    const invocation = client.invokeTool(
      claimed.runId,
      'call-cancelled',
      'lacuna.create_course',
      { name: 'Biology' },
      1_000,
      abort.signal,
    );
    await vi.waitFor(() => expect(releaseSleep).toBeTypeOf('function'));
    abort.abort();
    const outcome = await Promise.race([
      invocation.catch((error: unknown) => error),
      new Promise<'overrun'>((resolve) => setTimeout(() => resolve('overrun'), 20)),
    ]);
    releaseSleep?.();
    await invocation.catch(() => undefined);

    expect(outcome).toMatchObject({ message: expect.stringContaining('cancelled') });
    const calls = transport.writes
      .flatMap((mailbox) => mailbox.events)
      .filter((event) => event.type === 'tool_call');
    expect(new Set(calls.map((event) => event.eventId))).toHaveLength(1);
  });

  it('fails closed when the approval retry mailbox write exceeds the original deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      const transport = new FakeTransport();
      transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
      let sequence = 0;
      const client = new TerminalAiClient({
        transport,
        createId: (prefix) => `${prefix}-${++sequence}`,
      });
      await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
      const claimed = await client.waitForMessage(25_000);
      if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
      const claimedMailbox: RelayBrowserMailbox = {
        ...queuedMailbox(),
        revision: 2,
        terminalRevisionSeen: 1,
        messages: [{ ...queuedMailbox().messages[0], delivery: 'claimed', runId: claimed.runId }],
      };
      const approvalMailbox: RelayBrowserMailbox = {
        ...claimedMailbox,
        revision: 3,
        terminalRevisionSeen: 2,
        toolResponses: [
          {
            runId: claimed.runId,
            callId: 'call-blocked-write',
            respondedAt: 1_100,
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
      transport.reads.push(
        { generation: '"browser-2"', mailbox: claimedMailbox },
        { generation: '"browser-3"', mailbox: approvalMailbox },
      );
      transport.fallbackRead = { generation: '"browser-3"', mailbox: approvalMailbox };
      const observedToolEventIds = new Set<string>();
      transport.beforeWrite = (mailbox) => {
        for (const event of mailbox.events) {
          if (event.type === 'tool_call') observedToolEventIds.add(event.eventId);
        }
        if (observedToolEventIds.size >= 2) transport.blockWrites = true;
      };
      const invocation = client.invokeTool(
        claimed.runId,
        'call-blocked-write',
        'lacuna.create_course',
        { name: 'Biology' },
        750,
      );
      const outcome = Promise.race([
        invocation.catch((error: unknown) => error),
        new Promise<'overrun'>((resolve) => setTimeout(() => resolve('overrun'), 751)),
      ]);
      await vi.advanceTimersByTimeAsync(751);
      const result = await outcome;
      transport.releaseBlockedWrites();
      await invocation.catch(() => undefined);

      expect(result).toMatchObject({
        name: 'TerminalRelayReconnectRequiredError',
        reason: 'write_outcome_unknown',
      });
      await expect(client.waitForMessage(250)).rejects.toThrow('not connected');
    } finally {
      vi.useRealTimers();
    }
  });
});
