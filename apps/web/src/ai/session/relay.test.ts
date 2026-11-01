import { describe, expect, it, vi } from 'vitest';
import { AI_RELAY_PROTOCOL_VERSION } from '../relayProtocol';
import { createRelayAiSession } from './relay';
import {
  BROWSER_PRIVATE_KEY,
  BROWSER_PUBLIC_KEY,
  CREATED,
  TERMINAL_PUBLIC_KEY,
  relaySessionHarness,
} from './relay.testHarness';

describe('relay AI session connection lifecycle', () => {
  it('starts restored background polling only after explicit activation', async () => {
    const source = relaySessionHarness();
    await source.session.pair();
    const timers = { repeat: vi.fn((_task: () => Promise<void>) => vi.fn()) };

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers,
      now: () => 1_000,
    });

    expect(timers.repeat).not.toHaveBeenCalled();
    restored.activate();
    restored.activate();
    expect(timers.repeat).toHaveBeenCalledOnce();
  });

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

  it('reports a blocked relay connection as a network failure', async () => {
    const { session, relay } = relaySessionHarness();
    vi.mocked(relay.create).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(session.pair()).resolves.toEqual({
      ok: false,
      error: {
        kind: 'unavailable',
        message:
          'Lacuna could not reach the relay. Check that this network permits relay.getlacuna.app.',
      },
    });
  });

  it('revokes a remote pairing session created after local disposal wins', async () => {
    const { session, relay, storage } = relaySessionHarness();
    let releaseCreate!: (created: typeof CREATED) => void;
    vi.mocked(relay.create).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseCreate = resolve;
        }),
    );

    const pairing = session.pair();
    await vi.waitFor(() => expect(relay.create).toHaveBeenCalledOnce());
    session.dispose();
    releaseCreate(CREATED);

    await expect(pairing).resolves.toEqual({
      ok: false,
      error: { kind: 'unavailable', message: 'AI connection was reset.' },
    });
    expect(relay.revoke).toHaveBeenCalledWith({
      sessionId: CREATED.sessionId,
      browserToken: CREATED.browserToken,
    });
    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });
    expect(storage.getItem('lacuna-ai-relay-session-v1')).toBeNull();
  });

  it('does not block later pairing while cancelled-session revocation is pending', async () => {
    const { session, relay } = relaySessionHarness();
    const replacementCreated = {
      ...CREATED,
      sessionId: 'B'.repeat(20),
      pairingCode: 'BBBB-BBBB-BBBB-BBBB-BBBB',
    };
    let releaseCreate!: (created: typeof CREATED) => void;
    vi.mocked(relay.create)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseCreate = resolve;
          }),
      )
      .mockResolvedValueOnce(replacementCreated);
    let rejectRevoke!: (error: unknown) => void;
    vi.mocked(relay.revoke).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRevoke = reject;
        }),
    );

    const cancelledPairing = session.pair();
    await vi.waitFor(() => expect(relay.create).toHaveBeenCalledOnce());
    session.dispose();
    releaseCreate(CREATED);
    await vi.waitFor(() => expect(relay.revoke).toHaveBeenCalledOnce());

    const replacementPairing = session.pair();
    await vi.waitFor(() => expect(relay.create).toHaveBeenCalledTimes(2));
    await expect(cancelledPairing).resolves.toEqual({
      ok: false,
      error: { kind: 'unavailable', message: 'AI connection was reset.' },
    });
    await expect(replacementPairing).resolves.toEqual({
      ok: true,
      data: {
        code: replacementCreated.pairingCode,
        expiresAt: replacementCreated.expiresAt,
      },
    });

    rejectRevoke(new Error('Relay unavailable'));
    await Promise.resolve();
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
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
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
