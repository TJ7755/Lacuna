import { describe, expect, it, vi } from 'vitest';
import { ReplacementLifecycle } from '../../db/replacementLifecycle';
import { RelayPushOutcomeUnknownError } from '../relayClient';
import { AI_RELAY_PROTOCOL_VERSION } from '../relayProtocol';
import { AI_CONNECTION_QUIET_AFTER_MS, createRelayAiSession } from './relay';
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

  it('marks an inactive terminal quiet and restores connected on its next mailbox revision', async () => {
    const { session, relay, crypto, tick, setNow } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    setNow(1_000 + AI_CONNECTION_QUIET_AFTER_MS);
    await tick();
    expect(session.getSnapshot().connection).toEqual({
      status: 'quiet',
      connectionId: CREATED.sessionId,
      client: { name: 'Terminal agent' },
      lastActivityAt: 1_000,
    });

    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [],
    });
    setNow(1_000 + AI_CONNECTION_QUIET_AFTER_MS + 1_000);
    await tick();

    expect(session.getSnapshot().connection).toEqual({
      status: 'connected',
      connectionId: CREATED.sessionId,
      client: { name: 'Terminal agent' },
      lastActivityAt: 1_000 + AI_CONNECTION_QUIET_AFTER_MS + 1_000,
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
