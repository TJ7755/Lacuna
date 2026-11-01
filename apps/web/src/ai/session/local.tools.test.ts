import { describe, expect, it, vi } from 'vitest';
import { LACUNA_AI_PROTOCOL_VERSION, type AiBridgeRequest } from '../protocol';
import type { AiToolSession } from '../toolSession';
import { buildAiInstructionBundle } from '../instructions';
import { createLocalAiSession } from './local';
import { requestSource } from './local.testHarness';

describe('local AI session', () => {
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

  it('revokes tool authority on Stop and rejects an approval decision that resolves afterwards', async () => {
    const transport = requestSource();
    const approval = {
      approvalId: 'approval-1',
      kind: 'write_grant' as const,
      toolName: 'lacuna.create_card',
      targetLabel: 'Biology',
      summary: 'Allow writes to Biology',
      requestedAt: 2_000,
      status: 'pending' as const,
    };
    let resolveDecision: ((decision: Awaited<ReturnType<AiToolSession['decide']>>) => void) | null =
      null;
    const decide = vi.fn<AiToolSession['decide']>(
      () =>
        new Promise((resolve) => {
          resolveDecision = resolve;
        }),
    );
    const clear = vi.fn();
    const toolSession = {
      invoke: vi.fn<AiToolSession['invoke']>().mockResolvedValue({
        response: {
          ok: false,
          error: {
            kind: 'approval_required',
            approvalId: approval.approvalId,
            approvalKind: approval.kind,
            message: 'Approval required.',
          },
        },
        effects: { approval },
      }),
      decide,
      clear,
    } as unknown as AiToolSession;
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
    await session.send('Add a card to Biology.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    await transport.request('channel-1', {
      type: 'invoke_tool',
      connectionId: 'connection-1',
      runId: 'run-1',
      callId: 'call-1',
      call: { name: 'lacuna.create_card', input: { courseId: 'course-1' } },
    });
    expect(session.getSnapshot().approval).toEqual(approval);

    const deciding = session.decide(approval.approvalId, true);
    await session.stop('run-1');

    expect(session.getSnapshot().approval).toBeNull();
    expect(clear).toHaveBeenCalledTimes(2);
    resolveDecision!({
      ok: true,
      approval: { ...approval, status: 'approved', decidedAt: 2_000 },
      effects: {},
    });
    await expect(deciding).resolves.toEqual({
      ok: false,
      error: { kind: 'conflict', message: 'That approval is no longer pending.' },
    });
    expect(session.getSnapshot()).toMatchObject({
      run: { status: 'stop_requested' },
      approval: null,
    });
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
