import { describe, expect, it, vi } from 'vitest';
import { LACUNA_AI_PROTOCOL_VERSION, type AiBridgeRequest } from '../protocol';
import type { AiToolSession } from '../toolSession';
import { buildAiInstructionBundle } from '../instructions';
import { createLocalAiSession, type LocalAiRequestSource } from './local';

function requestSource() {
  let handler:
    | ((channelId: string, request: AiBridgeRequest) => Promise<unknown>)
    | undefined;
  let disconnected: ((channelId: string) => void) | undefined;
  const source: LocalAiRequestSource = {
    listen(next, onDisconnected) {
      handler = next;
      disconnected = onDisconnected;
      return () => {
        handler = undefined;
        disconnected = undefined;
      };
    },
  };
  return {
    source,
    request: (channelId: string, request: AiBridgeRequest) => handler!(channelId, request),
    disconnect: (channelId: string) => disconnected!(channelId),
    listening: () => handler !== undefined,
  };
}

describe('local AI session', () => {
  it('does not manufacture a pairing code for the direct local transport', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({ source: transport.source });

    await expect(session.pair()).resolves.toEqual({
      ok: false,
      error: {
        kind: 'unavailable',
        message: 'The desktop AI companion connects directly; no pairing code is required.',
      },
    });
  });

  it('clears the disabled reason when the same runtime is activated again', () => {
    const transport = requestSource();
    const session = createLocalAiSession({ source: transport.source });

    session.activate();
    session.dispose();
    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'AI was disabled.',
    });

    session.activate();

    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });
    expect(transport.listening()).toBe(true);
  });

  it('connects one purpose-bound companion and completes a message through the AiSession seam', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      now: vi.fn(() => 1_000),
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();

    await expect(
      transport.request('channel-1', {
        type: 'connect',
        protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
        client: { name: 'Codex', version: '1.0' },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { type: 'connection', connectionId: 'connection-1', client: { name: 'Codex' } },
    });
    await expect(session.send('Explain retrieval practice.')).resolves.toEqual({
      ok: true,
      data: { messageId: 'message-1' },
    });
    const claim = await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    expect(claim).toMatchObject({
      ok: true,
      data: {
        type: 'message_claim',
        message: {
          messageId: 'message-1',
          conversationId: 'conversation-1',
          runId: 'run-1',
          content: 'Explain retrieval practice.',
        },
      },
    });
    await expect(
      transport.request('channel-1', {
        type: 'reply',
        connectionId: 'connection-1',
        runId: 'run-1',
        messageId: 'message-1',
        reply: { content: 'Retrieval practice strengthens later recall.' },
      }),
    ).resolves.toEqual({
      ok: true,
      data: { type: 'reply_recorded', messageId: 'message-1' },
    });

    expect(session.getSnapshot()).toMatchObject({
      connection: { status: 'connected', connectionId: 'connection-1' },
      run: { status: 'completed', runId: 'run-1' },
      items: [
        { kind: 'user', id: 'message-1', delivery: 'completed' },
        { kind: 'assistant', content: 'Retrieval practice strengthens later recall.' },
      ],
    });
  });

  it('rejects a second owner and requests from a foreign native channel', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    const connect = {
      type: 'connect' as const,
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    };
    await transport.request('channel-1', connect);

    await expect(transport.request('channel-2', connect)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'conflict' },
    });
    await expect(
      transport.request('channel-2', {
        type: 'heartbeat',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'forbidden' } });
  });

  it('enforces Stop before late tool calls and replies, then restores the queued follow-up draft', async () => {
    const transport = requestSource();
    const invoke = vi.fn(async ({ runId, runStatus }: { runId: string; runStatus: string }) => ({
      response: {
        ok: false as const,
        error: {
          kind: 'stopped' as const,
          runId,
          message: `Run is ${runStatus}.`,
        },
      },
      effects: {},
    }));
    const toolSession = {
      invoke,
      decide: vi.fn(),
      clear: vi.fn(),
    } as never;
    const session = createLocalAiSession({
      source: transport.source,
      toolSession,
      now: () => 2_000,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('First prompt.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    await session.send('Follow-up prompt.');
    await session.stop('run-1');

    await expect(
      transport.request('channel-1', {
        type: 'invoke_tool',
        connectionId: 'connection-1',
        runId: 'run-1',
        callId: 'call-1',
        call: { name: 'lacuna.list_courses', input: {} },
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'stopped', runId: 'run-1' } });
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ runStatus: 'stop_requested' }));
    await expect(
      transport.request('channel-1', {
        type: 'reply',
        connectionId: 'connection-1',
        runId: 'run-1',
        messageId: 'message-1',
        reply: { content: 'Too late.' },
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'stopped', runId: 'run-1' } });
    await expect(
      transport.request('channel-1', {
        type: 'acknowledge_stop',
        connectionId: 'connection-1',
        runId: 'run-1',
      }),
    ).resolves.toEqual({
      ok: true,
      data: { type: 'stop_acknowledged', runId: 'run-1' },
    });

    expect(session.getSnapshot()).toMatchObject({
      run: { status: 'stopped' },
      draft: 'Follow-up prompt.',
      queuedFollowUp: null,
      items: [{ kind: 'user', delivery: 'stopped' }],
    });
  });

  it('cancels a bounded wait and clears authority when the owning channel disappears', async () => {
    const transport = requestSource();
    const cancelTimeout = vi.fn();
    const session = createLocalAiSession({
      source: transport.source,
      timers: { schedule: vi.fn(() => cancelTimeout) },
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    const waiting = transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 25_000,
      leaseMs: 300_000,
    });

    transport.disconnect('other-channel');
    expect(session.getSnapshot().connection.status).toBe('connected');
    transport.disconnect('channel-1');

    await expect(waiting).resolves.toMatchObject({
      ok: false,
      error: { kind: 'unavailable', reason: 'disconnected' },
    });
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Terminal disconnected',
    });
    await expect(
      transport.request('channel-1', {
        type: 'heartbeat',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });

  it('delivers a message into an existing 25-second wait without polling', async () => {
    const transport = requestSource();
    const cancelWait = vi.fn();
    const schedule = vi.fn(() => cancelWait);
    const session = createLocalAiSession({
      source: transport.source,
      timers: { schedule },
      now: () => 3_000,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    const waiting = transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 25_000,
      leaseMs: 300_000,
    });

    await session.send('Arrived during the wait.');

    await expect(waiting).resolves.toMatchObject({
      ok: true,
      data: { type: 'message_claim', message: { content: 'Arrived during the wait.' } },
    });
    expect(schedule).toHaveBeenNthCalledWith(1, expect.any(Function), 25_000);
    expect(schedule).toHaveBeenNthCalledWith(2, expect.any(Function), 300_000);
    expect(cancelWait).toHaveBeenCalledOnce();
  });

  it('binds the instruction bundle to the queued message rather than later settings', async () => {
    const transport = requestSource();
    let misconceptionFirstEnabled = true;
    const session = createLocalAiSession({
      source: transport.source,
      getInstructions: () => buildAiInstructionBundle({ misconceptionFirstEnabled }),
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Use the teaching preference captured now.');
    misconceptionFirstEnabled = false;
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });

    await expect(
      transport.request('channel-1', {
        type: 'get_instructions',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { type: 'instructions', misconceptionFirstEnabled: true },
    });
  });

  it('expires a bounded claim lease and requeues the message', async () => {
    const transport = requestSource();
    let clock = 5_000;
    let expireLease: () => void = () => undefined;
    const session = createLocalAiSession({
      source: transport.source,
      now: () => clock,
      timers: {
        schedule(task) {
          expireLease = task;
          return vi.fn();
        },
      },
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Do not lose this prompt.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });

    clock = 305_000;
    expireLease();

    expect(session.getSnapshot()).toMatchObject({
      run: { status: 'expired', runId: 'run-1', expiredAt: 305_000 },
      items: [
        { kind: 'user', delivery: 'queued' },
        { kind: 'error', error: { kind: 'internal' } },
      ],
    });
    await expect(
      transport.request('channel-1', {
        type: 'list_pending',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { messages: [{ content: 'Do not lose this prompt.' }] },
    });
  });

  it('publishes AiToolSession approvals and receipts without exposing approval authority', async () => {
    const transport = requestSource();
    const approval = {
      approvalId: 'approval-1',
      kind: 'write_call' as const,
      toolName: 'lacuna.create_course',
      targetLabel: 'New course: Biology',
      summary: 'Create Biology',
      requestedAt: 4_000,
      status: 'pending' as const,
    };
    const receipt = {
      receiptId: 'receipt-1',
      callId: 'call-1',
      toolName: 'lacuna.create_course' as const,
      summary: 'Created Biology',
      createdAt: 4_000,
      targets: [],
    };
    const invoke = vi
      .fn<AiToolSession['invoke']>()
      .mockResolvedValueOnce({
        response: {
          ok: false,
          error: {
            kind: 'approval_required',
            approvalId: 'approval-1',
            approvalKind: 'write_call',
            message: 'Approval required.',
          },
        },
        effects: {
          approval,
          activity: {
            status: 'awaiting_approval',
            summary: 'Approval required',
            updatedAt: 4_000,
          },
        },
      })
      .mockResolvedValueOnce({
        response: { ok: true, result: { id: 'course-1' } },
        effects: { receipt },
      });
    const decide = vi.fn<AiToolSession['decide']>().mockResolvedValue({
      ok: true,
      approval: { ...approval, status: 'approved', decidedAt: 4_000 },
      effects: {},
    });
    const toolSession = { invoke, decide, clear: vi.fn() } as unknown as AiToolSession;
    const session = createLocalAiSession({
      source: transport.source,
      toolSession,
      now: () => 4_000,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Create a Biology course.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    const call: AiBridgeRequest = {
      type: 'invoke_tool',
      connectionId: 'connection-1',
      runId: 'run-1',
      callId: 'call-1',
      call: { name: 'lacuna.create_course', input: { name: 'Biology' } },
    };

    await expect(transport.request('channel-1', call)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalId: 'approval-1' },
    });
    expect(session.getSnapshot().approval).toEqual(approval);
    await session.decide('approval-1', true);
    await expect(transport.request('channel-1', call)).resolves.toMatchObject({
      ok: true,
      data: { type: 'tool_result', result: { id: 'course-1' }, receipt },
    });
    expect(session.getSnapshot().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'receipt', id: 'receipt-1', receipt }),
      ]),
    );
    expect(decide).toHaveBeenCalledWith('approval-1', true);
  });
});
