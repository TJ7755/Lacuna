import { describe, expect, it, vi } from 'vitest';
import type { RelayClient } from '../relayClient';
import type { JsonValue } from '../protocol';
import {
  AI_RELAY_EMPTY_GENERATION,
  type RelayEnvelope,
  type RelayTerminalMailbox,
} from '../relayProtocol';
import {
  createRelayAiSession,
  type RelaySessionCrypto,
  type RelaySessionStorage,
  type RelaySessionTimers,
} from './relay';

const CREATED = {
  sessionId: 'A'.repeat(20),
  pairingCode: 'AAAA-AAAA-AAAA-AAAA-AAAA',
  browserToken: 'ab'.repeat(32),
  expiresAt: 60_000,
};

function harness() {
  let poll: (() => Promise<void>) | null = null;
  let currentTime = 1_000;
  const cancelPolling = vi.fn();
  const relay: RelayClient = {
    create: vi.fn().mockResolvedValue(CREATED),
    peer: vi.fn().mockResolvedValue(null),
    pull: vi.fn().mockResolvedValue(null),
    push: vi.fn().mockResolvedValue({ generation: '"browser-1"' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const values = new Map<string, string>();
  const storage: RelaySessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const encryptionKey = {} as CryptoKey;
  const crypto: RelaySessionCrypto = {
    createKeyPair: vi
      .fn()
      .mockResolvedValue({ publicKey: 'browser-public', privateKey: 'browser-private' }),
    deriveKey: vi.fn().mockResolvedValue(encryptionKey),
    seal: vi.fn().mockImplementation(async (_key: CryptoKey, value: JsonValue) => envelope(value)),
    open: vi.fn(),
  };
  const timers: RelaySessionTimers = {
    repeat: vi.fn((task) => {
      poll = task;
      return cancelPolling;
    }),
  };
  let nextId = 0;
  const session = createRelayAiSession({
    relay,
    storage,
    crypto,
    timers,
    now: () => currentTime,
    createId: (prefix) => `${prefix}-${++nextId}`,
  });
  return {
    session,
    relay,
    storage,
    crypto,
    timers,
    cancelPolling,
    setNow: (value: number) => {
      currentTime = value;
    },
    tick: async () => {
      if (!poll) throw new Error('Polling was not scheduled.');
      await poll();
    },
  };
}

describe('relay AI session', () => {
  it('creates and persists a visible pairing session', async () => {
    const { session, relay, timers } = harness();
    const listener = vi.fn();
    session.subscribe(listener);

    await expect(session.pair()).resolves.toEqual({
      ok: true,
      data: { code: CREATED.pairingCode, expiresAt: CREATED.expiresAt },
    });

    expect(relay.create).toHaveBeenCalledWith('browser-public');
    expect(session.getSnapshot().connection).toEqual({
      status: 'pairing',
      code: CREATED.pairingCode,
      expiresAt: CREATED.expiresAt,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(timers.repeat).toHaveBeenCalledOnce();
  });

  it('expires an unclaimed pairing code and clears its local credentials', async () => {
    const { session, relay, storage, tick, setNow, cancelPolling } = harness();
    await session.pair();
    setNow(CREATED.expiresAt);

    await expect(tick()).resolves.toBeUndefined();

    expect(relay.peer).not.toHaveBeenCalled();
    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Pairing code expired. Connect the terminal again.',
    });
    expect(storage.getItem('lacuna-ai-relay-session-v1')).toBeNull();
    expect(cancelPolling).toHaveBeenCalledOnce();
  });

  it('derives the mailbox key when the terminal claims the pairing code', async () => {
    const { session, relay, crypto, tick } = harness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent', version: '1.2.3' },
      expiresAt: 60_000,
    });

    await session.pair();
    await tick();

    expect(crypto.deriveKey).toHaveBeenCalledWith('browser-private', 'terminal-public');
    expect(session.getSnapshot().connection).toEqual({
      status: 'connected',
      connectionId: CREATED.sessionId,
      client: { name: 'Terminal agent', version: '1.2.3' },
      lastActivityAt: 1_000,
    });
  });

  it('encrypts and persists a queued browser mailbox message', async () => {
    const { session, relay, crypto, tick } = harness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    await expect(session.send('Explain the testing effect.')).resolves.toEqual({
      ok: true,
      data: { messageId: 'message-1' },
    });

    expect(crypto.seal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        version: 1,
        revision: 1,
        terminalRevisionSeen: 0,
        messages: [
          {
            messageId: 'message-1',
            conversationId: 'conversation-2',
            content: 'Explain the testing effect.',
            createdAt: 1_000,
            delivery: 'queued',
          },
        ],
      }),
    );
    expect(relay.push).toHaveBeenCalledWith(
      { sessionId: CREATED.sessionId, browserToken: CREATED.browserToken },
      expect.any(Uint8Array),
      AI_RELAY_EMPTY_GENERATION,
    );
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({
        kind: 'user',
        id: 'message-1',
        content: 'Explain the testing effect.',
        delivery: 'queued',
      }),
    ]);
  });

  it('applies claimed and reply events exactly once', async () => {
    const { session, relay, crypto, tick } = harness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    vi.mocked(relay.push)
      .mockResolvedValueOnce({ generation: '"browser-1"' })
      .mockResolvedValueOnce({ generation: '"browser-2"' });
    await session.pair();
    await tick();
    await session.send('Explain the testing effect.');

    const mailbox: RelayTerminalMailbox = {
      version: 1,
      revision: 2,
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
          content: 'The testing effect is improved recall caused by retrieval practice.',
          createdAt: 1_200,
        },
      ],
    };
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-2"',
    });
    vi.mocked(crypto.open).mockResolvedValue(mailbox as JsonValue);

    await tick();
    const afterFirstPoll = session.getSnapshot();
    await tick();

    expect(session.getSnapshot()).toBe(afterFirstPoll);
    expect(afterFirstPoll.items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'completed' }),
      expect.objectContaining({
        kind: 'assistant',
        content: 'The testing effect is improved recall caused by retrieval practice.',
      }),
    ]);
    expect(afterFirstPoll.run).toEqual(
      expect.objectContaining({ status: 'completed', runId: 'run-1', completedAt: 1_200 }),
    );
    expect(relay.push).toHaveBeenCalledTimes(2);
  });

  it('pushes Stop before resolving and applies the terminal acknowledgement', async () => {
    const { session, relay, crypto, tick } = harness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    vi.mocked(relay.push)
      .mockResolvedValueOnce({ generation: '"browser-1"' })
      .mockResolvedValueOnce({ generation: '"browser-2"' });
    await session.pair();
    await tick();
    await session.send('Stop after claiming this.');
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
    await session.send('Compare it with rereading.');

    let releasePush!: (value: { generation: string }) => void;
    vi.mocked(relay.push).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePush = resolve;
        }),
    );
    let settled = false;
    const stopping = session.stop('run-1').then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(relay.push).toHaveBeenCalledTimes(4));

    expect(settled).toBe(false);
    expect(crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [expect.objectContaining({ runId: 'run-1', delivery: 'stop_requested' })],
      }),
    );

    releasePush({ generation: '"browser-3"' });
    await expect(stopping).resolves.toEqual({ ok: true, data: undefined });
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'stop_requested', runId: 'run-1' }),
    );
    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Compare it with rereading.',
        queuedFollowUp: null,
      }),
    );

    vi.mocked(relay.push).mockResolvedValueOnce({ generation: '"browser-4"' });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 2,
      events: [
        {
          eventId: 'event-stop',
          type: 'stop_acknowledged',
          runId: 'run-1',
          stoppedAt: 1_300,
        },
      ],
    });
    await tick();

    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'stopped', stoppedAt: 1_300 }),
    );
    expect(session.getSnapshot().activity).toEqual(
      expect.objectContaining({ status: 'completed', summary: 'Stopped' }),
    );
  });

  it('moves a claimed follow-up from the queue into the transcript', async () => {
    const { session, relay, crypto, tick } = harness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
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
      version: 1,
      revision: 1,
      events: [
        {
          eventId: 'event-claim-1',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    await session.send('Now compare it with rereading.');

    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 3,
      events: [
        {
          eventId: 'event-reply-1',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'Retrieval practice strengthens later recall.',
          createdAt: 1_200,
        },
        {
          eventId: 'event-claim-2',
          type: 'claimed',
          messageId: 'message-3',
          runId: 'run-2',
          claimedAt: 1_300,
          leaseExpiresAt: 30_000,
        },
      ],
    });
    await tick();

    expect(session.getSnapshot().queuedFollowUp).toBeNull();
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'completed' }),
      expect.objectContaining({ kind: 'assistant' }),
      expect.objectContaining({
        kind: 'user',
        id: 'message-3',
        content: 'Now compare it with rereading.',
        delivery: 'claimed',
      }),
    ]);
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'active', runId: 'run-2', messageId: 'message-3' }),
    );
  });

  it('restores pairing, credentials, private key, transcript and processed events after reload', async () => {
    const first = harness();
    await first.session.pair();

    let pairingPoll: (() => Promise<void>) | null = null;
    let nextId = 0;
    const pairingReload = createRelayAiSession({
      relay: first.relay,
      storage: first.storage,
      crypto: first.crypto,
      timers: {
        repeat: (task) => {
          pairingPoll = task;
          return vi.fn();
        },
      },
      now: () => 2_000,
      createId: (prefix) => `${prefix}-${++nextId}`,
    });
    expect(pairingReload.getSnapshot().connection).toEqual({
      status: 'pairing',
      code: CREATED.pairingCode,
      expiresAt: CREATED.expiresAt,
    });

    vi.mocked(first.relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await runScheduled(pairingPoll, 'Reloaded pairing did not resume polling.');
    expect(first.crypto.deriveKey).toHaveBeenCalledWith('browser-private', 'terminal-public');
    await pairingReload.send('First message.');

    const completedMailbox: RelayTerminalMailbox = {
      version: 1,
      revision: 2,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 2_100,
          leaseExpiresAt: 30_000,
        },
        {
          eventId: 'event-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'First reply.',
          createdAt: 2_200,
        },
      ],
    };
    vi.mocked(first.relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-2"',
    });
    vi.mocked(first.crypto.open).mockResolvedValue(completedMailbox as JsonValue);
    await runScheduled(pairingPoll, 'Reloaded pairing did not resume polling.');
    await pairingReload.send('Pending after reload.');

    let connectedPoll: (() => Promise<void>) | null = null;
    const connectedReload = createRelayAiSession({
      relay: first.relay,
      storage: first.storage,
      crypto: first.crypto,
      timers: {
        repeat: (task) => {
          connectedPoll = task;
          return vi.fn();
        },
      },
      now: () => 3_000,
      createId: (prefix) => `restored-${prefix}`,
    });
    const restoredSnapshot = connectedReload.getSnapshot();
    expect(restoredSnapshot.connection).toEqual(
      expect.objectContaining({ status: 'connected', connectionId: CREATED.sessionId }),
    );
    expect(restoredSnapshot.items).toEqual([
      expect.objectContaining({ kind: 'user', content: 'First message.', delivery: 'completed' }),
      expect.objectContaining({ kind: 'assistant', content: 'First reply.' }),
      expect.objectContaining({
        kind: 'user',
        content: 'Pending after reload.',
        delivery: 'queued',
      }),
    ]);

    await runScheduled(connectedPoll, 'Reloaded connection did not resume polling.');

    expect(connectedReload.getSnapshot()).toBe(restoredSnapshot);
    expect(
      connectedReload.getSnapshot().items.filter((item) => item.kind === 'assistant'),
    ).toHaveLength(1);
    expect(first.relay.pull).toHaveBeenLastCalledWith({
      sessionId: CREATED.sessionId,
      browserToken: CREATED.browserToken,
    });
    expect(first.crypto.deriveKey).toHaveBeenLastCalledWith('browser-private', 'terminal-public');
  });

  it('discards structurally corrupt device-local state instead of crashing', () => {
    const source = harness();
    const storageKey = 'lacuna-ai-relay-session-v1';
    source.storage.setItem(storageKey, JSON.stringify({ version: 1 }));

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
    });

    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' }, items: [] }),
    );
    expect(source.storage.getItem(storageKey)).toBeNull();
  });

  it('starts disconnected when device-local storage is unavailable', () => {
    const source = harness();
    const unavailableStorage: RelaySessionStorage = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: () => {
        throw new Error('storage blocked');
      },
    };

    expect(() =>
      createRelayAiSession({
        relay: source.relay,
        storage: unavailableStorage,
        crypto: source.crypto,
        timers: source.timers,
      }),
    ).not.toThrow();
  });

  it('contains polling transport failures without rejecting the timer task', async () => {
    const { session, relay, tick } = harness();
    await session.pair();
    vi.mocked(relay.peer).mockRejectedValue(new Error('relay unavailable'));

    await expect(tick()).resolves.toBeUndefined();
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'pairing', code: CREATED.pairingCode }),
    );
  });

  it('does not overlap slow polling turns', async () => {
    const { session, relay, tick } = harness();
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

  it('returns an internal result instead of throwing when relay revocation fails', async () => {
    const { session, relay } = harness();
    await session.pair();
    vi.mocked(relay.revoke).mockRejectedValue(new Error('revoke unavailable'));

    await expect(session.resetConnection()).resolves.toEqual({
      ok: false,
      error: { kind: 'internal', message: 'The AI connection could not be revoked.' },
    });
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'pairing', code: CREATED.pairingCode }),
    );
  });

  it('applies an explicit terminal disconnect once and stops polling', async () => {
    const { session, relay, crypto, tick, cancelPolling } = harness();
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
    const { session, storage, cancelPolling } = harness();
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

function envelope(value: JsonValue): RelayEnvelope {
  return {
    version: 1,
    nonce: btoa('nonce-12byte').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''),
    ciphertext: btoa(JSON.stringify(value).padEnd(16, '.'))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, ''),
  };
}

async function runScheduled(
  task: (() => Promise<void>) | null,
  missingMessage: string,
): Promise<void> {
  if (!task) throw new Error(missingMessage);
  await task();
}
