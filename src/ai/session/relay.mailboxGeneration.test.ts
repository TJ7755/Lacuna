import { describe, expect, it, vi } from 'vitest';
import { RelayPushOutcomeUnknownError, RelayStaleGenerationError } from '../relayClient';
import { AI_RELAY_EMPTY_GENERATION } from '../relayProtocol';
import { createRelayAiSession } from './relay';
import { TERMINAL_PUBLIC_KEY, relaySessionHarness } from './relay.testHarness';

describe('relay AI session messages', () => {
  it('requires reconnect after a stale browser mailbox generation', async () => {
    const { session, relay, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    vi.mocked(relay.push).mockRejectedValueOnce(
      new RelayStaleGenerationError(AI_RELAY_EMPTY_GENERATION),
    );

    await expect(session.send('Do not overwrite another browser writer.')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'conflict',
        message: 'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
      },
    });

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
    });
    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(relay.push).toHaveBeenCalledOnce();
  });

  it('fails closed when a committed mailbox write returns no usable generation', async () => {
    const { session, relay, storage, crypto, timers, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Already verified.');
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayPushOutcomeUnknownError(200));

    await expect(session.send('Do not retry this committed write.')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'conflict',
        message:
          'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
      },
    });

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason:
        'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
    });
    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Do not retry this committed write.',
        queuedFollowUp: null,
        items: [expect.objectContaining({ content: 'Already verified.' })],
      }),
    );
    expect(cancelPolling).toHaveBeenCalledOnce();
    await tick();
    expect(relay.push).toHaveBeenCalledTimes(2);

    session.dispose();
    const restored = createRelayAiSession({ relay, storage, crypto, timers });
    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Do not retry this committed write.',
        queuedFollowUp: null,
        items: [expect.objectContaining({ content: 'Already verified.' })],
      }),
    );
  });

  it('recovers the attempted replacement follow-up when its write outcome is unknown', async () => {
    const { session, relay, storage, crypto, timers, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Explain retrieval practice.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
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
    await session.send('Compare it with rereading.');
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayPushOutcomeUnknownError(200));

    await expect(session.send('Use a concrete example instead.')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'conflict',
        message:
          'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
      },
    });

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Use a concrete example instead.',
        queuedFollowUp: null,
        run: null,
        items: [
          expect.objectContaining({
            content: 'Explain retrieval practice.',
            delivery: 'stopped',
          }),
        ],
      }),
    );
    session.dispose();
    const restored = createRelayAiSession({ relay, storage, crypto, timers });
    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Use a concrete example instead.',
        queuedFollowUp: null,
        items: [expect.objectContaining({ content: 'Explain retrieval practice.' })],
      }),
    );
  });

  it('stops polling after a stale generation while applying terminal events', async () => {
    const { session, relay, crypto, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Claim this message.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
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
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayStaleGenerationError('"browser-1"'));

    await tick();
    await tick();

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
    });
    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(relay.push).toHaveBeenCalledTimes(2);
  });

  it('retains a reduced terminal reply when its acknowledgement outcome is unknown', async () => {
    const { session, relay, crypto, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Explain the testing effect.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-2"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 2,
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
          content: 'Retrieval practice strengthens later recall.',
          createdAt: 1_200,
        },
      ],
    });
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayPushOutcomeUnknownError(200));

    await tick();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: {
          status: 'disconnected',
          reason:
            'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
        },
        items: [
          expect.objectContaining({
            kind: 'user',
            content: 'Explain the testing effect.',
            delivery: 'completed',
          }),
          expect.objectContaining({
            kind: 'assistant',
            content: 'Retrieval practice strengthens later recall.',
          }),
        ],
      }),
    );
    expect(cancelPolling).toHaveBeenCalledOnce();
  });

  it('recovers a reduced terminal claim when its acknowledgement outcome is unknown', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Keep this prompt recoverable.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
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
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayPushOutcomeUnknownError(200));

    await tick();

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: expect.objectContaining({ status: 'disconnected' }),
        draft: 'Keep this prompt recoverable.',
        run: null,
        items: [
          expect.objectContaining({
            kind: 'user',
            content: 'Keep this prompt recoverable.',
            delivery: 'stopped',
          }),
        ],
      }),
    );
  });
});
