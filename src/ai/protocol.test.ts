import { describe, expect, it } from 'vitest';
import {
  LACUNA_AI_PROTOCOL_VERSION,
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_WAIT_MS,
  isAiApprovalState,
  isAiBridgeError,
  isAiBridgeRequest,
  isSupportedAiProtocolVersion,
  parseAiBridgeRequest,
} from './protocol';

const connectRequest = {
  type: 'connect',
  protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
  client: { name: 'OpenCode', version: '1.0' },
} as const;

describe('AI browser protocol', () => {
  it('parses the versioned connection request without allowing a client-selected connection id', () => {
    expect(parseAiBridgeRequest(connectRequest)).toEqual(connectRequest);
    expect(
      isAiBridgeRequest({
        ...connectRequest,
        client: { ...connectRequest.client, connectionId: 'chosen-by-client' },
      }),
    ).toBe(false);
  });

  it('rejects expanded records and preserves an unsupported version for a version-mismatch reply', () => {
    expect(isAiBridgeRequest({ ...connectRequest, unexpected: true })).toBe(false);
    const unsupported = parseAiBridgeRequest({
      ...connectRequest,
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION + 1,
    });
    if (unsupported.type !== 'connect') throw new Error('Expected a connection request.');
    expect(unsupported).toMatchObject({ type: 'connect', protocolVersion: 2 });
    expect(isSupportedAiProtocolVersion(unsupported.protocolVersion)).toBe(false);
    expect(isSupportedAiProtocolVersion(LACUNA_AI_PROTOCOL_VERSION)).toBe(true);
  });

  it('accepts every request kind used by the single-request bridge seam', () => {
    const connectionId = 'connection-1';
    const runId = 'run-1';
    const messageId = 'message-1';
    const requests = [
      connectRequest,
      { type: 'get_instructions', connectionId },
      { type: 'claim_message', connectionId, timeoutMs: 20_000, leaseMs: 60_000 },
      { type: 'list_pending', connectionId },
      { type: 'get_run', connectionId, runId },
      { type: 'acknowledge_stop', connectionId, runId },
      {
        type: 'set_activity',
        connectionId,
        runId,
        activity: { status: 'working', summary: 'Creating Cards' },
      },
      {
        type: 'invoke_tool',
        connectionId,
        runId,
        callId: 'call-1',
        call: { name: 'lacuna.list_courses', input: {} },
      },
      {
        type: 'reply',
        connectionId,
        runId,
        messageId,
        reply: { content: 'Done.' },
      },
      { type: 'heartbeat', connectionId },
      { type: 'disconnect', connectionId },
    ];

    expect(requests.every(isAiBridgeRequest)).toBe(true);
  });

  it('bounds identifiers, message content and wait durations', () => {
    expect(
      isAiBridgeRequest({ type: 'heartbeat', connectionId: 'x'.repeat(MAX_AI_IDENTIFIER_LENGTH) }),
    ).toBe(true);
    expect(
      isAiBridgeRequest({
        type: 'heartbeat',
        connectionId: 'x'.repeat(MAX_AI_IDENTIFIER_LENGTH + 1),
      }),
    ).toBe(false);
    expect(isAiBridgeRequest({ type: 'heartbeat', connectionId: ' connection-1 ' })).toBe(false);
    expect(
      isAiBridgeRequest({
        type: 'reply',
        connectionId: 'connection-1',
        runId: 'run-1',
        messageId: 'message-1',
        reply: { content: 'x'.repeat(MAX_AI_MESSAGE_LENGTH + 1) },
      }),
    ).toBe(false);
    expect(
      isAiBridgeRequest({
        type: 'claim_message',
        connectionId: 'connection-1',
        timeoutMs: MAX_AI_WAIT_MS + 1,
      }),
    ).toBe(false);
  });

  it('rejects non-JSON tool input and malformed nested records', () => {
    expect(
      isAiBridgeRequest({
        type: 'invoke_tool',
        connectionId: 'connection-1',
        runId: 'run-1',
        callId: 'call-1',
        call: { name: 'lacuna.list_courses', input: { invalid: BigInt(1) } },
      }),
    ).toBe(false);
    let getterCalls = 0;
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, 'value', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'secret';
      },
    });
    expect(
      isAiBridgeRequest({
        type: 'invoke_tool',
        connectionId: 'connection-1',
        runId: 'run-1',
        callId: 'call-1',
        call: { name: 'lacuna.list_courses', input: hostile },
      }),
    ).toBe(false);
    expect(getterCalls).toBe(0);
    expect(
      isAiBridgeRequest({
        type: 'set_activity',
        connectionId: 'connection-1',
        runId: 'run-1',
        activity: { status: 'working', summary: '', extra: true },
      }),
    ).toBe(false);
  });

  it('throws a Zod error from the strict parser while the guard remains boolean', () => {
    const malformed = { type: 'heartbeat', connectionId: '' };
    expect(isAiBridgeRequest(malformed)).toBe(false);
    expect(() => parseAiBridgeRequest(malformed)).toThrow();
  });

  it('represents a timed-out approval as pending rather than requiring a second prompt', () => {
    expect(
      isAiBridgeError({
        kind: 'approval_pending',
        approvalId: 'approval-1',
        approvalKind: 'destructive_call',
        retryAfterMs: 1_000,
        message: 'Approval is still pending in Lacuna.',
      }),
    ).toBe(true);
    expect(
      isAiBridgeError({
        kind: 'approval_required',
        approvalId: 'approval-1',
        approvalKind: 'destructive_call',
        retryAfterMs: 1_000,
        message: 'Approval is still pending in Lacuna.',
      }),
    ).toBe(false);
  });

  it('requires approval decision timestamps only after pending', () => {
    const base = {
      approvalId: 'approval-1',
      kind: 'destructive_call',
      toolName: 'lacuna.delete_card',
      targetLabel: 'Thermodynamics',
      summary: 'Delete one Card',
      requestedAt: 100,
    } as const;

    expect(isAiApprovalState({ ...base, status: 'pending' })).toBe(true);
    expect(isAiApprovalState({ ...base, status: 'pending', decidedAt: 110 })).toBe(false);

    for (const status of ['approved', 'rejected'] as const) {
      expect(isAiApprovalState({ ...base, status })).toBe(false);
      expect(isAiApprovalState({ ...base, status, decidedAt: 110 })).toBe(true);
    }

    expect(isAiApprovalState({ ...base, status: 'consumed', decidedAt: 110 })).toBe(false);
    expect(
      isAiApprovalState({ ...base, status: 'consumed', decidedAt: 110, consumedAt: 120 }),
    ).toBe(true);
    expect(
      isAiApprovalState({ ...base, status: 'consumed', decidedAt: 110, consumedAt: 105 }),
    ).toBe(false);

    expect(isAiApprovalState({ ...base, status: 'expired', decidedAt: 110 })).toBe(false);
    expect(isAiApprovalState({ ...base, status: 'expired', expiredAt: 110 })).toBe(true);
  });
});
