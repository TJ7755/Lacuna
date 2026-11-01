import { describe, expect, it, vi } from 'vitest';
import { ReplacementLifecycle } from '../../db/replacementLifecycle';
import { RelayPushOutcomeUnknownError } from '../relayClient';
import { AI_RELAY_PROTOCOL_VERSION } from '../relayProtocol';
import { createRelayAiSession } from './relay';
import { CREATED, TERMINAL_PUBLIC_KEY, relaySessionHarness } from './relay.testHarness';

describe('relay AI session connection lifecycle', () => {
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

  it('disconnects locally and invalidates polling before relay revocation settles', async () => {
    const { session, relay, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    let releasePull!: (value: null) => void;
    vi.mocked(relay.pull).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePull = resolve;
        }),
    );
    const polling = tick();
    await vi.waitFor(() => expect(relay.pull).toHaveBeenCalledOnce());

    let releaseRevoke!: () => void;
    vi.mocked(relay.revoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRevoke = resolve;
        }),
    );
    const resetting = session.resetConnection();

    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });
    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(relay.revoke).toHaveBeenCalledOnce();

    releasePull(null);
    await polling;
    releaseRevoke();
    await expect(resetting).resolves.toEqual({ ok: true, data: undefined });
  });

  it('cancels pending work before quiescing a manual replacement and preserves the transcript', async () => {
    const { session, relay, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Keep this after a failed replacement.');

    session.replacementParticipant.invalidate();

    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(relay.revoke).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: expect.objectContaining({ status: 'connected' }),
        draft: 'Keep this after a failed replacement.',
        items: [
          expect.objectContaining({
            kind: 'user',
            content: 'Keep this after a failed replacement.',
            delivery: 'stopped',
          }),
        ],
      }),
    );

    await session.replacementParticipant.quiesce();

    expect(relay.revoke).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: { status: 'disconnected' },
        items: [expect.objectContaining({ content: 'Keep this after a failed replacement.' })],
      }),
    );
  });

  it('does not let failed relay revocation block a manual replacement', async () => {
    const { session, relay } = relaySessionHarness();
    const lifecycle = new ReplacementLifecycle();
    lifecycle.register(session.replacementParticipant);
    const applyReplacement = vi.fn(async () => 'applied');
    await session.pair();
    vi.mocked(relay.revoke).mockRejectedValue(new Error('revoke unavailable'));

    await expect(lifecycle.replace('manual', applyReplacement)).resolves.toBe('applied');
    expect(relay.revoke).toHaveBeenCalledOnce();
    expect(applyReplacement).toHaveBeenCalledOnce();
    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });
  });

  it('retains local transcript and tool state when manual replacement fails', async () => {
    const { session, relay, storage, tick } = relaySessionHarness();
    const lifecycle = new ReplacementLifecycle();
    lifecycle.register(session.replacementParticipant);
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Preserve this failed replacement transcript.');

    await expect(
      lifecycle.replace('manual', async () => {
        throw new Error('import failed');
      }),
    ).rejects.toThrow('import failed');

    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ content: 'Preserve this failed replacement transcript.' }),
    ]);
    const saved = JSON.parse(storage.getItem('lacuna-ai-relay-session-v1') ?? 'null') as {
      connection?: { credentials?: unknown; toolSessionState?: unknown };
    };
    expect(saved.connection?.credentials).toBeDefined();
    expect(saved.connection?.toolSessionState).toBeDefined();
  });

  it('does not let a stale key derivation overwrite the replacement connection key', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.create)
      .mockResolvedValueOnce(CREATED)
      .mockResolvedValueOnce({
        ...CREATED,
        sessionId: 'B'.repeat(20),
        pairingCode: 'BBBB-BBBB-BBBB-BBBB-BBBB',
      });
    vi.mocked(relay.peer)
      .mockResolvedValueOnce({
        terminalPublicKey: 'old-terminal-public',
        client: { name: 'Old terminal' },
        expiresAt: 60_000,
      })
      .mockResolvedValueOnce({
        terminalPublicKey: 'replacement-terminal-public',
        client: { name: 'Replacement terminal' },
        expiresAt: 60_000,
      });
    const staleKey = {} as CryptoKey;
    const replacementKey = {} as CryptoKey;
    let releaseStaleDerivation!: (key: CryptoKey) => void;
    vi.mocked(crypto.deriveKey)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseStaleDerivation = resolve;
          }),
      )
      .mockResolvedValueOnce(replacementKey);

    await session.pair();
    const stalePoll = tick();
    await vi.waitFor(() => expect(crypto.deriveKey).toHaveBeenCalledOnce());

    await session.resetConnection();
    await session.pair();
    await tick();
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'connected', connectionId: 'B'.repeat(20) }),
    );

    releaseStaleDerivation(staleKey);
    await stalePoll;
    await session.send('Use the replacement encryption key.');

    expect(vi.mocked(crypto.seal).mock.lastCall?.[0]).toBe(replacementKey);
  });

  it('does not let a detached send failure disconnect the replacement session', async () => {
    const { session, relay, tick } = relaySessionHarness();
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

    let rejectDetachedPush!: (error: unknown) => void;
    vi.mocked(relay.push).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectDetachedPush = reject;
        }),
    );
    const detachedSend = session.send('This belongs to the old connection.');
    await vi.waitFor(() => expect(relay.push).toHaveBeenCalledOnce());

    await session.resetConnection();
    await session.pair();
    await tick();
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'connected', connectionId: 'B'.repeat(20) }),
    );

    rejectDetachedPush(new RelayPushOutcomeUnknownError());
    await expect(detachedSend).resolves.toEqual({
      ok: false,
      error: { kind: 'unavailable', message: 'AI connection was reset.' },
    });
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'connected', connectionId: 'B'.repeat(20) }),
    );
  });

  it('ignores a stale poll callback after terminal disconnect and re-pairing', async () => {
    const { session, relay, crypto, timers } = relaySessionHarness();
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
    const oldPoll = vi.mocked(timers.repeat).mock.calls[0]![0];
    await oldPoll();
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"old-terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-old-disconnect',
          type: 'disconnected',
          disconnectedAt: 1_100,
        },
      ],
    });
    await oldPoll();

    await session.pair();
    const newPoll = vi.mocked(timers.repeat).mock.calls[1]![0];
    await newPoll();
    await session.send('Explain the second pairing.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"new-terminal-2"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-new-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-new',
          claimedAt: 1_200,
          leaseExpiresAt: 20_000,
        },
        {
          eventId: 'event-new-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-new',
          content: 'The second pairing owns this reply.',
          createdAt: 1_300,
        },
      ],
    });
    const pushesBeforeStalePoll = vi.mocked(relay.push).mock.calls.length;

    await oldPoll();

    expect(relay.push).toHaveBeenCalledTimes(pushesBeforeStalePoll);
    await newPoll();
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', delivery: 'completed' }),
      expect.objectContaining({
        kind: 'assistant',
        content: 'The second pairing owns this reply.',
      }),
    ]);
  });

  it('prevents a disposed session poll from overwriting its replacement', async () => {
    const first = relaySessionHarness();
    vi.mocked(first.relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await first.session.pair();
    await first.tick();
    await first.session.send('Message from the old connection.');
    let releasePull!: (value: { bytes: Uint8Array; generation: string }) => void;
    vi.mocked(first.relay.pull).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePull = resolve;
        }),
    );
    const stalePoll = first.tick();
    await vi.waitFor(() => expect(first.relay.pull).toHaveBeenCalledOnce());

    first.session.dispose();
    const replacementTimers = {
      repeat: vi.fn((_task: () => Promise<void>) => vi.fn()),
    };
    const replacement = createRelayAiSession({
      relay: first.relay,
      storage: first.storage,
      crypto: first.crypto,
      timers: replacementTimers,
      now: () => 2_000,
      createId: (prefix) => `replacement-${prefix}`,
    });
    replacement.activate();
    await replacement.resetConnection();
    vi.mocked(first.relay.create).mockResolvedValueOnce({
      ...CREATED,
      sessionId: 'B'.repeat(20),
      pairingCode: 'BBBB-BBBB-BBBB-BBBB-BBBB',
    });
    await replacement.pair();
    const replacementPoll = vi.mocked(replacementTimers.repeat).mock.calls[1]![0];
    await replacementPoll();
    await replacement.send('Message from the replacement connection.');
    const pushesBeforeStaleCompletion = vi.mocked(first.relay.push).mock.calls.length;
    vi.mocked(first.crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-old-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-old',
          claimedAt: 2_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });

    releasePull({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-old"',
    });
    await stalePoll;

    expect(first.relay.push).toHaveBeenCalledTimes(pushesBeforeStaleCompletion);
    const saved = JSON.parse(first.storage.getItem('lacuna-ai-relay-session-v1')!) as {
      connection: { credentials: { sessionId: string } };
    };
    expect(saved.connection.credentials.sessionId).toBe('B'.repeat(20));
  });
});
