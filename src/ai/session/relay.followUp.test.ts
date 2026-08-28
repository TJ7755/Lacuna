import { describe, expect, it, vi } from 'vitest';
import { createRelayAiSession } from './relay';
import { TERMINAL_PUBLIC_KEY, relaySessionHarness } from './relay.testHarness';

describe('relay AI session follow-up identity', () => {
  it('retains message B when A is claimed and C becomes the active-run follow-up', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Message A');
    await session.send('Message B');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 2,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim-a',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-a',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();

    await session.send('Message C');

    expect(crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          expect.objectContaining({ messageId: 'message-1', delivery: 'claimed' }),
          expect.objectContaining({ messageId: 'message-3', content: 'Message B' }),
          expect.objectContaining({ messageId: 'message-4', content: 'Message C' }),
        ],
      }),
    );
  });

  it('replaces and stops the identified follow-up after reload without removing message B', async () => {
    const first = relaySessionHarness();
    vi.mocked(first.relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await first.session.pair();
    await first.tick();
    await first.session.send('Message A');
    await first.session.send('Message B');
    vi.mocked(first.relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(first.crypto.open).mockResolvedValue({
      version: 2,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim-a',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-a',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await first.tick();
    await first.session.send('Message C');
    first.session.dispose();
    const stored = JSON.parse(first.storage.getItem('lacuna-ai-relay-session-v1')!) as {
      connection: { queuedFollowUpMessageId?: string };
    };
    delete stored.connection.queuedFollowUpMessageId;
    first.storage.setItem('lacuna-ai-relay-session-v1', JSON.stringify(stored));

    let sequence = 0;
    const restored = createRelayAiSession({
      relay: first.relay,
      storage: first.storage,
      crypto: first.crypto,
      timers: { repeat: () => vi.fn() },
      now: () => 1_200,
      createId: (prefix) => `restored-${prefix}-${++sequence}`,
    });
    await restored.send('Message D');

    expect(first.crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          expect.objectContaining({ messageId: 'message-1', delivery: 'claimed' }),
          expect.objectContaining({ messageId: 'message-3', content: 'Message B' }),
          expect.objectContaining({ messageId: 'restored-message-1', content: 'Message D' }),
        ],
      }),
    );

    await restored.stop('run-a');

    expect(first.crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          expect.objectContaining({ messageId: 'message-1', delivery: 'stop_requested' }),
          expect.objectContaining({ messageId: 'message-3', content: 'Message B' }),
        ],
      }),
    );
    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({ draft: 'Message D', queuedFollowUp: null }),
    );
  });
});
