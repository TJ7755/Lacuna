import { describe, expect, it, vi } from 'vitest';
import { MAX_AI_IDENTIFIER_LENGTH, MAX_AI_MESSAGE_LENGTH, type JsonValue } from '../protocol';
import {
  MAX_AI_RELAY_MAILBOX_ENTRIES,
  type RelayBrowserMessage,
  type RelayTerminalMailbox,
} from '../relayProtocol';
import { applyTerminalEvent } from './relayEvents';
import { relaySessionHarness } from './relay.testHarness';
import type { AiSessionSnapshot } from './types';
import { buildAiInstructionBundle } from '../instructions';

describe('relay AI session bounds', () => {
  it('rejects messages longer than the AI protocol limit', async () => {
    const { session, relay, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    await expect(session.send('x'.repeat(MAX_AI_MESSAGE_LENGTH + 1))).resolves.toEqual({
      ok: false,
      error: { kind: 'conflict', message: 'The AI message is too long.' },
    });
    expect(relay.push).not.toHaveBeenCalled();
  });

  it('does not grow the browser mailbox beyond its protocol limit', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    for (let index = 0; index < MAX_AI_RELAY_MAILBOX_ENTRIES; index += 1) {
      const result = await session.send(`Queued message ${index}`);
      expect(result.ok).toBe(true);
      // Retaining every progressively larger encrypted mailbox makes the spy consume
      // quadratic memory while this test fills the queue to its protocol limit.
      vi.mocked(relay.push).mockClear();
      vi.mocked(crypto.seal).mockClear();
    }

    await expect(session.send('One message too many.')).resolves.toEqual({
      ok: false,
      error: { kind: 'conflict', message: 'The AI message queue is full.' },
    });
    expect(session.getSnapshot().items).toHaveLength(MAX_AI_RELAY_MAILBOX_ENTRIES);
  });

  it('bounds processed terminal event identifiers across compacted mailboxes', async () => {
    const { session, relay, crypto, storage, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    const firstMailbox: RelayTerminalMailbox = {
      version: 3,
      revision: 1,
      browserRevisionSeen: 0,
      events: Array.from({ length: MAX_AI_RELAY_MAILBOX_ENTRIES }, (_, index) => ({
        eventId: `event-${index}`,
        type: 'claimed' as const,
        messageId: `missing-${index}`,
        runId: `run-${index}`,
        claimedAt: 1_100,
        leaseExpiresAt: 20_000,
      })),
    };
    vi.mocked(crypto.open).mockResolvedValue(firstMailbox as JsonValue);
    await tick();
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-new',
          type: 'claimed',
          messageId: 'missing-new',
          runId: 'run-new',
          claimedAt: 1_200,
          leaseExpiresAt: 20_000,
        },
      ],
    });

    await tick();

    const stored = JSON.parse(storage.getItem('lacuna-ai-relay-session-v1') ?? 'null') as {
      connection: { processedEventIds: string[] };
    };
    expect(stored.connection.processedEventIds).toHaveLength(MAX_AI_RELAY_MAILBOX_ENTRIES);
    expect(stored.connection.processedEventIds).toContain('event-new');
  });
});

describe('relay terminal event bounds', () => {
  it('keeps generated assistant identifiers bounded and distinct from user identifiers', () => {
    const collidingUserId = 'e'.repeat(MAX_AI_IDENTIFIER_LENGTH);
    const reduced = applyTerminalEvent(
      activeSnapshot([
        {
          kind: 'user',
          id: collidingUserId,
          content: 'Existing user message.',
          createdAt: 900,
          delivery: 'completed',
        },
      ]),
      [claimedMessage()],
      {
        eventId: collidingUserId,
        type: 'reply',
        messageId: 'message-1',
        runId: 'run-1',
        content: 'Bounded reply.',
        createdAt: 1_200,
      },
    );

    const assistantId = reduced.snapshot.items.at(-1)?.id;
    expect(assistantId?.length).toBeLessThanOrEqual(MAX_AI_IDENTIFIER_LENGTH);
    expect(assistantId).toMatch(/^assistant-/);
    expect(assistantId).not.toBe(collidingUserId);

    const second = applyTerminalEvent(activeSnapshot([]), [claimedMessage()], {
      eventId: `${'e'.repeat(MAX_AI_IDENTIFIER_LENGTH - 1)}f`,
      type: 'reply',
      messageId: 'message-1',
      runId: 'run-1',
      content: 'Another bounded reply.',
      createdAt: 1_300,
    });
    expect(second.snapshot.items.at(-1)?.id).not.toBe(assistantId);
  });

  it('retains only the newest bounded transcript items', () => {
    const items = Array.from({ length: MAX_AI_RELAY_MAILBOX_ENTRIES }, (_, index) => ({
      kind: 'assistant' as const,
      id: `assistant-${index}`,
      content: `Reply ${index}`,
      createdAt: index,
      sources: [],
    }));
    const reduced = applyTerminalEvent(activeSnapshot(items), [claimedMessage()], {
      eventId: 'event-reply',
      type: 'reply',
      messageId: 'message-1',
      runId: 'run-1',
      content: 'Newest reply.',
      createdAt: 2_100,
    });

    expect(reduced.snapshot.items).toHaveLength(MAX_AI_RELAY_MAILBOX_ENTRIES);
    expect(reduced.snapshot.items[0]?.id).toBe('assistant-1');
    expect(reduced.snapshot.items.at(-1)).toEqual(
      expect.objectContaining({ kind: 'assistant', content: 'Newest reply.' }),
    );
  });
});

function activeSnapshot(items: AiSessionSnapshot['items']): AiSessionSnapshot {
  return {
    revision: 1,
    connection: {
      status: 'connected',
      connectionId: 'connection-1',
      client: { name: 'Terminal agent' },
      lastActivityAt: 1_000,
    },
    conversationId: 'conversation-1',
    items,
    run: {
      status: 'active',
      runId: 'run-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      claimedAt: 1_100,
      leaseExpiresAt: 20_000,
    },
    activity: null,
    approval: null,
    draft: '',
    queuedFollowUp: null,
  };
}

function claimedMessage(): RelayBrowserMessage {
  return {
    messageId: 'message-1',
    conversationId: 'conversation-1',
    content: 'Question.',
    createdAt: 1_000,
    instructions: buildAiInstructionBundle({ misconceptionFirstEnabled: true }),
    delivery: 'claimed',
    runId: 'run-1',
  };
}
