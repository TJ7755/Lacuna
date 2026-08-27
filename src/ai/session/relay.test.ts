import { describe, expect, it, vi } from 'vitest';
import { createRelayAiSession } from './relay';
import {
  BROWSER_PRIVATE_KEY,
  BROWSER_PUBLIC_KEY,
  CREATED,
  TERMINAL_PUBLIC_KEY,
  relaySessionHarness,
} from './relay.testHarness';

describe('relay AI session connection lifecycle', () => {
  it('creates and persists a visible pairing session', async () => {
    const { session, relay, timers } = relaySessionHarness();
    const listener = vi.fn();
    session.subscribe(listener);

    await expect(session.pair()).resolves.toEqual({
      ok: true,
      data: { code: CREATED.pairingCode, expiresAt: CREATED.expiresAt },
    });

    expect(relay.create).toHaveBeenCalledWith(BROWSER_PUBLIC_KEY);
    expect(session.getSnapshot().connection).toEqual({
      status: 'pairing',
      code: CREATED.pairingCode,
      expiresAt: CREATED.expiresAt,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(timers.repeat).toHaveBeenCalledOnce();
  });

  it('expires an unclaimed pairing code without discarding the persisted transcript', async () => {
    const { session, relay, storage, crypto, timers, tick, setNow, cancelPolling } =
      relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Keep this conversation.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 1,
      events: [
        {
          eventId: 'event-disconnect',
          type: 'disconnected',
          disconnectedAt: 1_500,
        },
      ],
    });
    await tick();
    vi.mocked(relay.peer).mockResolvedValue(null);
    await session.pair();
    setNow(CREATED.expiresAt);

    await expect(tick()).resolves.toBeUndefined();

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Pairing code expired. Connect the terminal again.',
    });
    expect(cancelPolling).toHaveBeenCalledTimes(2);

    const restored = createRelayAiSession({ relay, storage, crypto, timers });
    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: {
          status: 'disconnected',
          reason: 'Pairing code expired. Connect the terminal again.',
        },
        items: [expect.objectContaining({ content: 'Keep this conversation.' })],
      }),
    );
    await expect(restored.pair()).resolves.toEqual({
      ok: true,
      data: { code: CREATED.pairingCode, expiresAt: CREATED.expiresAt },
    });
  });

  it('derives the mailbox key when the terminal claims the pairing code', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent', version: '1.2.3' },
      expiresAt: 60_000,
    });

    await session.pair();
    await tick();

    expect(crypto.deriveKey).toHaveBeenCalledWith(BROWSER_PRIVATE_KEY, TERMINAL_PUBLIC_KEY);
    expect(session.getSnapshot().connection).toEqual({
      status: 'connected',
      connectionId: CREATED.sessionId,
      client: { name: 'Terminal agent', version: '1.2.3' },
      lastActivityAt: 1_000,
    });
  });

  it('contains polling transport failures without rejecting the timer task', async () => {
    const { session, relay, tick } = relaySessionHarness();
    await session.pair();
    vi.mocked(relay.peer).mockRejectedValue(new Error('relay unavailable'));

    await expect(tick()).resolves.toBeUndefined();
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'pairing', code: CREATED.pairingCode }),
    );
  });

  it('does not overlap slow polling turns', async () => {
    const { session, relay, tick } = relaySessionHarness();
    await session.pair();
    let releasePeer!: (value: null) => void;
    vi.mocked(relay.peer).mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePeer = resolve;
        }),
    );

    const firstPoll = tick();
    const overlappingPoll = tick();
    await vi.waitFor(() => expect(relay.peer).toHaveBeenCalledOnce());

    releasePeer(null);
    await Promise.all([firstPoll, overlappingPoll]);
    expect(relay.peer).toHaveBeenCalledOnce();
  });

  it('serialises Stop behind in-flight terminal event processing', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    vi.mocked(relay.push)
      .mockResolvedValueOnce({ generation: '"browser-1"' })
      .mockResolvedValueOnce({ generation: '"browser-2"' });
    await session.pair();
    await tick();
    await session.send('Stop after this is claimed.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 1,
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
      version: 1,
      revision: 2,
      events: [
        {
          eventId: 'event-unknown-claim',
          type: 'claimed',
          messageId: 'missing-message',
          runId: 'missing-run',
          claimedAt: 1_200,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    let releasePollPush!: (value: { generation: string }) => void;
    vi.mocked(relay.push).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePollPush = resolve;
        }),
    );
    const polling = tick();
    await vi.waitFor(() => expect(relay.push).toHaveBeenCalledTimes(3));

    const stopping = session.stop('run-1');
    await Promise.resolve();
    expect(relay.push).toHaveBeenCalledTimes(3);

    vi.mocked(relay.push).mockResolvedValueOnce({ generation: '"browser-4"' });
    releasePollPush({ generation: '"browser-3"' });
    await polling;
    await expect(stopping).resolves.toEqual({ ok: true, data: undefined });
    expect(relay.push).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(Uint8Array),
      '"browser-3"',
    );
  });

  it('clears the local connection without throwing when relay revocation fails', async () => {
    const { session, relay, storage, crypto, timers } = relaySessionHarness();
    await session.pair();
    vi.mocked(relay.revoke).mockRejectedValue(new Error('revoke unavailable'));

    await expect(session.resetConnection()).resolves.toEqual({
      ok: false,
      error: { kind: 'internal', message: 'The AI connection could not be revoked.' },
    });
    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });

    const restored = createRelayAiSession({ relay, storage, crypto, timers });
    expect(restored.getSnapshot().connection).toEqual({ status: 'disconnected' });
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
      version: 1,
      revision: 1,
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

  it('disposes polling without deleting the persisted session', async () => {
    const { session, storage, cancelPolling } = relaySessionHarness();
    const storageKey = 'lacuna-ai-relay-session-v1';
    await session.pair();
    const before = storage.getItem(storageKey);

    session.dispose();

    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(storage.getItem(storageKey)).toBe(before);
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'pairing', code: CREATED.pairingCode }),
    );
  });
});
