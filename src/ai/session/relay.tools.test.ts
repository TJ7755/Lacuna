import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../protocol';
import {
  AI_RELAY_PROTOCOL_VERSION,
  type RelayBrowserMailbox,
  type RelayTerminalEvent,
  type RelayTerminalMailbox,
} from '../relayProtocol';
import { AiToolSession } from '../toolSession';
import type { ToolExecutionOutcome, ToolExecutionRequest } from '../../mcp/executor';
import type { RelaySessionCrypto } from './relay';
import { TERMINAL_PUBLIC_KEY, relaySessionHarness } from './relay.testHarness';

const TERMINAL_BYTES = new TextEncoder().encode('{}');

function mailbox(
  revision: number,
  events: RelayTerminalEvent[],
  browserRevisionSeen = 0,
): RelayTerminalMailbox {
  return { version: AI_RELAY_PROTOCOL_VERSION, revision, browserRevisionSeen, events };
}

function responseFromLastSeal(crypto: RelaySessionCrypto): RelayBrowserMailbox {
  const value = vi.mocked(crypto.seal).mock.lastCall?.[1] as RelayBrowserMailbox | undefined;
  if (!value) throw new Error('The browser mailbox was not sealed.');
  return value;
}

async function activeSession(toolSession: AiToolSession) {
  const harness = relaySessionHarness(toolSession);
  vi.mocked(harness.relay.peer).mockResolvedValue({
    terminalPublicKey: TERMINAL_PUBLIC_KEY,
    client: { name: 'Terminal agent' },
    expiresAt: 60_000,
  });
  await harness.session.pair();
  await harness.tick();
  await harness.session.send('Run the requested action.');
  vi.mocked(harness.relay.pull).mockResolvedValue({
    bytes: TERMINAL_BYTES,
    generation: '"terminal-1"',
  });
  vi.mocked(harness.crypto.open).mockResolvedValue(
    mailbox(1, [
      {
        eventId: 'event-claim',
        type: 'claimed',
        messageId: 'message-1',
        runId: 'run-1',
        claimedAt: 1_100,
        leaseExpiresAt: 20_000,
      },
    ]) as JsonValue,
  );
  await harness.tick();
  return harness;
}

function toolSession(
  executeToolCall: (request: ToolExecutionRequest) => Promise<ToolExecutionOutcome>,
) {
  return new AiToolSession({
    executeToolCall,
    now: () => 2_000,
    createId: () => 'approval-1',
    digest: (input) => input,
  });
}

describe('relay AI session tool calls', () => {
  it('returns the exact browser response and replays a repeated call without executing twice', async () => {
    const executeToolCall = vi.fn(
      async (): Promise<ToolExecutionOutcome> => ({
        ok: true,
        result: { courses: [] },
        receipt: {
          callId: 'call-1',
          toolName: 'lacuna.list_courses',
          requiredScope: 'read',
          target: { courseId: '__global__', label: 'All Lacuna data' },
          completedAt: 2_000,
        },
      }),
    );
    const harness = await activeSession(toolSession(executeToolCall));
    const call: RelayTerminalEvent = {
      eventId: 'event-tool-1',
      type: 'tool_call',
      runId: 'run-1',
      callId: 'call-1',
      toolName: 'lacuna.list_courses',
      input: {},
      createdAt: 2_100,
    };
    vi.mocked(harness.crypto.open).mockResolvedValue(mailbox(2, [call]) as JsonValue);
    await harness.tick();

    const firstMailbox = responseFromLastSeal(harness.crypto);
    expect(firstMailbox.toolResponses).toEqual([
      {
        runId: 'run-1',
        callId: 'call-1',
        respondedAt: 1_000,
        ok: true,
        result: { courses: [] },
      },
    ]);
    expect(executeToolCall).toHaveBeenCalledOnce();

    vi.mocked(harness.crypto.open).mockResolvedValue(
      mailbox(3, [{ ...call, eventId: 'event-tool-2' }]) as JsonValue,
    );
    await harness.tick();

    expect(executeToolCall).toHaveBeenCalledOnce();
    expect(responseFromLastSeal(harness.crypto).toolResponses).toEqual(firstMailbox.toolResponses);
  });

  it('publishes approval first, then a receipt-bearing response after approval', async () => {
    const executeToolCall = vi.fn(
      async (): Promise<ToolExecutionOutcome> => ({
        ok: true,
        result: { id: 'course-1', name: 'Biology' },
        receipt: {
          callId: 'call-1',
          toolName: 'lacuna.create_course',
          requiredScope: 'write',
          target: { courseId: '__create_course__', label: 'New course: Biology' },
          completedAt: 2_000,
        },
      }),
    );
    const session = toolSession(executeToolCall);
    const harness = await activeSession(session);
    const call: RelayTerminalEvent = {
      eventId: 'event-create-1',
      type: 'tool_call',
      runId: 'run-1',
      callId: 'call-1',
      toolName: 'lacuna.create_course',
      input: { name: 'Biology' },
      createdAt: 2_100,
    };
    vi.mocked(harness.crypto.open).mockResolvedValue(mailbox(2, [call]) as JsonValue);
    await harness.tick();

    expect(harness.session.getSnapshot().approval).toEqual(
      expect.objectContaining({ kind: 'write_call', status: 'pending' }),
    );
    expect(responseFromLastSeal(harness.crypto).toolResponses[0]).toMatchObject({
      ok: false,
      error: { kind: 'approval_required' },
    });

    const approvalId = harness.session.getSnapshot().approval!.approvalId;
    await harness.session.decide(approvalId, true);
    vi.mocked(harness.crypto.open).mockResolvedValue(
      mailbox(3, [{ ...call, eventId: 'event-create-2' }]) as JsonValue,
    );
    await harness.tick();

    expect(executeToolCall).toHaveBeenCalledOnce();
    expect(harness.session.getSnapshot().approval).toBeNull();
    expect(session.getState().approvals[0].approval.status).toBe('consumed');
    expect(harness.session.getSnapshot().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'receipt',
          receipt: expect.objectContaining({ callId: 'call-1' }),
        }),
      ]),
    );
    expect(responseFromLastSeal(harness.crypto).toolResponses[0]).toMatchObject({
      ok: true,
      result: { id: 'course-1' },
      receipt: expect.objectContaining({ callId: 'call-1', toolName: 'lacuna.create_course' }),
    });
  });

  it('rejects a tool call after Stop before executing it', async () => {
    const executeToolCall = vi.fn(
      async (): Promise<ToolExecutionOutcome> => ({
        ok: true,
        result: {},
        receipt: {
          callId: 'call-1',
          toolName: 'lacuna.list_courses',
          requiredScope: 'read',
          target: { courseId: '__global__', label: 'All Lacuna data' },
          completedAt: 2_000,
        },
      }),
    );
    const harness = await activeSession(toolSession(executeToolCall));
    await harness.session.stop('run-1');
    vi.mocked(harness.crypto.open).mockResolvedValue(
      mailbox(2, [
        {
          eventId: 'event-tool-after-stop',
          type: 'tool_call',
          runId: 'run-1',
          callId: 'call-1',
          toolName: 'lacuna.list_courses',
          input: {},
          createdAt: 2_100,
        },
      ]) as JsonValue,
    );
    await harness.tick();

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(responseFromLastSeal(harness.crypto).toolResponses[0]).toMatchObject({
      ok: false,
      error: { kind: 'stopped', runId: 'run-1' },
    });
  });

  it('clears approval and capability state when the terminal disconnects', async () => {
    const executeToolCall = vi.fn(
      async (): Promise<ToolExecutionOutcome> => ({
        ok: true,
        result: { id: 'course-1' },
        receipt: {
          callId: 'call-1',
          toolName: 'lacuna.create_course',
          requiredScope: 'write',
          target: { courseId: '__create_course__', label: 'New course' },
          completedAt: 2_000,
        },
      }),
    );
    const session = toolSession(executeToolCall);
    const harness = await activeSession(session);
    vi.mocked(harness.crypto.open).mockResolvedValue(
      mailbox(2, [
        {
          eventId: 'event-create-1',
          type: 'tool_call',
          runId: 'run-1',
          callId: 'call-1',
          toolName: 'lacuna.create_course',
          input: { name: 'Biology' },
          createdAt: 2_100,
        },
      ]) as JsonValue,
    );
    await harness.tick();
    expect(harness.session.getSnapshot().approval).not.toBeNull();

    vi.mocked(harness.crypto.open).mockResolvedValue(
      mailbox(3, [
        { eventId: 'event-disconnect', type: 'disconnected', disconnectedAt: 2_200 },
      ]) as JsonValue,
    );
    await harness.tick();

    expect(harness.session.getSnapshot().connection.status).toBe('disconnected');
    expect(harness.session.getSnapshot().approval).toBeNull();
    expect(session.getState()).toEqual({ grants: [], approvals: [], ledger: [] });
  });
});
