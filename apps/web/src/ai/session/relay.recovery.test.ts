import { describe, expect, it, vi } from 'vitest';
import { AI_RELAY_PROTOCOL_VERSION } from '../relayProtocol';
import { createRelayAiSession } from './relay';
import { CREATED, TERMINAL_PUBLIC_KEY, relaySessionHarness } from './relay.testHarness';

describe('relay AI session connection lifecycle', () => {
  it('recovers a claimed prompt into the draft when resetting a dead terminal', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Do not lose this prompt.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();

    await session.resetConnection();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Do not lose this prompt.',
        queuedFollowUp: null,
        run: null,
        items: [
          expect.objectContaining({ content: 'Do not lose this prompt.', delivery: 'stopped' }),
        ],
      }),
    );
  });

  it('clears a recovered draft after resending it through a replacement connection', async () => {
    const { session, relay, storage, crypto, timers, tick } = relaySessionHarness();
    vi.mocked(relay.create)
      .mockResolvedValueOnce(CREATED)
      .mockResolvedValueOnce({
        ...CREATED,
        sessionId: 'B'.repeat(20),
        pairingCode: 'BBBB-BBBB-BBBB-BBBB-BBBB',
      });
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Do not resend this prompt twice.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    await session.resetConnection();
    expect(session.getSnapshot().draft).toBe('Do not resend this prompt twice.');

    await session.pair();
    await tick();
    await expect(session.send(session.getSnapshot().draft)).resolves.toEqual({
      ok: true,
      data: { messageId: 'message-3' },
    });

    expect(session.getSnapshot().draft).toBe('');
    session.dispose();
    const restored = createRelayAiSession({ relay, storage, crypto, timers });
    expect(restored.getSnapshot().draft).toBe('');
  });

  it('recovers a queued follow-up ahead of the claimed prompt when resetting', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Prompt already being handled.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    await session.send('Follow this up after reconnecting.');

    await session.resetConnection();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Follow this up after reconnecting.',
        queuedFollowUp: null,
        items: [
          expect.objectContaining({
            content: 'Prompt already being handled.',
            delivery: 'stopped',
          }),
        ],
      }),
    );
  });

  it('applies an explicit terminal disconnect once and stops polling', async () => {
    const { session, relay, crypto, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-disconnect',
          type: 'disconnected',
          disconnectedAt: 1_500,
          reason: 'Terminal task ended.',
        },
      ],
    });

    await tick();
    const disconnected = session.getSnapshot();
    await tick();

    expect(session.getSnapshot()).toBe(disconnected);
    expect(disconnected.connection).toEqual({
      status: 'disconnected',
      reason: 'Terminal task ended.',
    });
    expect(cancelPolling).toHaveBeenCalledOnce();
  });

  it('recovers a claimed prompt when the terminal explicitly disconnects', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Recover this claimed prompt.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-disconnect',
          type: 'disconnected',
          disconnectedAt: 1_200,
          reason: 'Terminal task ended.',
        },
      ],
    });

    await tick();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: { status: 'disconnected', reason: 'Terminal task ended.' },
        draft: 'Recover this claimed prompt.',
        queuedFollowUp: null,
        run: null,
        activity: expect.objectContaining({
          status: 'failed',
          summary: 'Terminal task ended.',
        }),
        items: [
          expect.objectContaining({
            content: 'Recover this claimed prompt.',
            delivery: 'stopped',
          }),
          expect.objectContaining({
            kind: 'error',
            error: {
              kind: 'unavailable',
              reason: 'disconnected',
              message: 'Terminal task ended.',
            },
          }),
        ],
      }),
    );
  });

  it('retains a completed reply when the terminal disconnects in the same mailbox', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Complete this prompt before disconnecting.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-3"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 3,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
        {
          eventId: 'event-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'The completed reply remains visible.',
          createdAt: 1_200,
        },
        {
          eventId: 'event-disconnect',
          type: 'disconnected',
          disconnectedAt: 1_300,
          reason: 'Terminal task ended.',
        },
      ],
    });

    await tick();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: { status: 'disconnected', reason: 'Terminal task ended.' },
        draft: '',
        run: expect.objectContaining({ status: 'completed', completedAt: 1_200 }),
        items: [
          expect.objectContaining({
            content: 'Complete this prompt before disconnecting.',
            delivery: 'completed',
          }),
          expect.objectContaining({
            kind: 'assistant',
            content: 'The completed reply remains visible.',
          }),
        ],
      }),
    );
  });

  it('recovers a queued follow-up when reply and disconnect arrive together', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Complete the active prompt.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    await session.send('Recover this queued follow-up.');
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 3,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'The active prompt completed.',
          createdAt: 1_200,
        },
        {
          eventId: 'event-disconnect',
          type: 'disconnected',
          disconnectedAt: 1_300,
          reason: 'Terminal task ended.',
        },
      ],
    });

    await tick();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: { status: 'disconnected', reason: 'Terminal task ended.' },
        draft: 'Recover this queued follow-up.',
        queuedFollowUp: null,
        run: null,
        items: [
          expect.objectContaining({
            content: 'Complete the active prompt.',
            delivery: 'completed',
          }),
          expect.objectContaining({
            kind: 'assistant',
            content: 'The active prompt completed.',
          }),
        ],
      }),
    );
  });
});
