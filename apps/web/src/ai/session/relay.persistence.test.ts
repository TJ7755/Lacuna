import { describe, expect, it, vi } from 'vitest';
import { MAX_AI_IDENTIFIER_LENGTH, type JsonValue } from '../protocol';
import { MAX_AI_RELAY_MAILBOX_ENTRIES, type RelayTerminalMailbox } from '../relayProtocol';
import { createRelayAiSession, type RelaySessionStorage } from './relay';
import {
  BROWSER_PRIVATE_KEY,
  CREATED,
  TERMINAL_PUBLIC_KEY,
  relaySessionHarness,
  runScheduled,
} from './relay.testHarness';

const STORAGE_KEY = 'lacuna-ai-relay-session-v1';

describe('relay AI session persistence', () => {
  it('restores pairing, credentials, private key, transcript and processed events after reload', async () => {
    const first = relaySessionHarness();
    await first.session.pair();
    expect(JSON.parse(first.storage.getItem(STORAGE_KEY)!)).toEqual(
      expect.objectContaining({
        version: 4,
        connection: expect.objectContaining({
          browserMailbox: expect.objectContaining({ version: 3, toolResponses: [] }),
          toolSessionState: { grants: [], approvals: [], ledger: [] },
        }),
      }),
    );

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
    pairingReload.activate();
    expect(pairingReload.getSnapshot().connection).toEqual({
      status: 'pairing',
      code: CREATED.pairingCode,
      expiresAt: CREATED.expiresAt,
    });

    vi.mocked(first.relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await runScheduled(pairingPoll, 'Reloaded pairing did not resume polling.');
    expect(first.crypto.deriveKey).toHaveBeenCalledWith(BROWSER_PRIVATE_KEY, TERMINAL_PUBLIC_KEY);
    await pairingReload.send('First message.');

    const completedMailbox: RelayTerminalMailbox = {
      version: 3,
      revision: 2,
      browserRevisionSeen: 1,
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
    connectedReload.activate();
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
    expect(first.crypto.deriveKey).toHaveBeenLastCalledWith(
      BROWSER_PRIVATE_KEY,
      TERMINAL_PUBLIC_KEY,
    );
  });

  it('discards structurally corrupt device-local state instead of crashing', () => {
    const source = relaySessionHarness();
    source.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }));

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
    });

    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' }, items: [] }),
    );
    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('preserves the transcript while disconnecting a mailbox from the previous protocol', async () => {
    const source = relaySessionHarness();
    await source.session.pair();
    const stored = JSON.parse(source.storage.getItem(STORAGE_KEY)!) as {
      version: number;
      snapshot: { items: unknown[] };
    };
    stored.version = 3;
    stored.snapshot.items = [
      {
        kind: 'user',
        id: 'message-legacy',
        content: 'Preserve this transcript.',
        createdAt: 1_000,
        delivery: 'completed',
      },
    ];
    source.storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
    });

    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: {
          status: 'disconnected',
          reason: 'Reconnect the terminal after the AI protocol update.',
        },
        items: [expect.objectContaining({ content: 'Preserve this transcript.' })],
      }),
    );
  });

  it('discards a persisted transcript containing an invalid item shape', async () => {
    const source = relaySessionHarness();
    await source.session.pair();
    const stored = JSON.parse(source.storage.getItem(STORAGE_KEY)!) as {
      snapshot: { items: unknown[] };
    };
    stored.snapshot.items = [{}];
    source.storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
    });

    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' }, items: [] }),
    );
    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards a connected snapshot without persisted relay connection state', async () => {
    const source = relaySessionHarness();
    vi.mocked(source.relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await source.session.pair();
    await source.tick();
    const stored = JSON.parse(source.storage.getItem(STORAGE_KEY)!) as { connection: unknown };
    stored.connection = null;
    source.storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
    });

    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' }, items: [] }),
    );
    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards corrupt connected credentials even when their session IDs still match', async () => {
    const source = relaySessionHarness();
    vi.mocked(source.relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await source.session.pair();
    await source.tick();
    const stored = JSON.parse(source.storage.getItem(STORAGE_KEY)!) as {
      snapshot: { connection: { connectionId: string } };
      connection: { credentials: { sessionId: string } };
    };
    stored.snapshot.connection.connectionId = 'corrupt-session';
    stored.connection.credentials.sessionId = 'corrupt-session';
    source.storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const restored = createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
      now: () => 1_000,
    });

    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' }, items: [] }),
    );
    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards a processed event ID beyond the relay identifier limit', async () => {
    const source = relaySessionHarness();
    await source.session.pair();
    const stored = JSON.parse(source.storage.getItem(STORAGE_KEY)!) as {
      connection: { processedEventIds: string[] };
    };
    stored.connection.processedEventIds = ['e'.repeat(MAX_AI_IDENTIFIER_LENGTH + 1)];
    source.storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
      now: () => 1_000,
    });

    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards a processed-event collection beyond the relay mailbox entry limit', async () => {
    const source = relaySessionHarness();
    await source.session.pair();
    const stored = JSON.parse(source.storage.getItem(STORAGE_KEY)!) as {
      connection: { processedEventIds: string[] };
    };
    stored.connection.processedEventIds = Array.from(
      { length: MAX_AI_RELAY_MAILBOX_ENTRIES + 1 },
      (_, index) => `event-${index}`,
    );
    source.storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    createRelayAiSession({
      relay: source.relay,
      storage: source.storage,
      crypto: source.crypto,
      timers: source.timers,
      now: () => 1_000,
    });

    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('starts disconnected when device-local storage is unavailable', () => {
    const source = relaySessionHarness();
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

  it('preserves the transcript across reload after resetting the connection', async () => {
    const first = relaySessionHarness();
    vi.mocked(first.relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await first.session.pair();
    await first.tick();
    await first.session.send('Keep this conversation.');

    await expect(first.session.resetConnection()).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    const restored = createRelayAiSession({
      relay: first.relay,
      storage: first.storage,
      crypto: first.crypto,
      timers: first.timers,
    });
    expect(restored.getSnapshot()).toEqual(
      expect.objectContaining({
        connection: { status: 'disconnected' },
        draft: 'Keep this conversation.',
        items: [
          expect.objectContaining({
            kind: 'user',
            content: 'Keep this conversation.',
            delivery: 'stopped',
          }),
        ],
      }),
    );
    expect(first.relay.peer).toHaveBeenCalledOnce();
  });

  it('clears device-local relay state only when a successful manual replacement completes', async () => {
    const source = relaySessionHarness();
    await source.session.pair();
    expect(source.storage.getItem(STORAGE_KEY)).not.toBeNull();

    source.session.replacementParticipant.invalidate();
    await source.session.replacementParticipant.quiesce();

    expect(source.storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(source.session.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' } }),
    );

    await source.session.replacementParticipant.clear();

    expect(source.storage.getItem(STORAGE_KEY)).toBeNull();
    expect(source.session.getSnapshot()).toEqual(
      expect.objectContaining({ connection: { status: 'disconnected' }, items: [] }),
    );
  });
});
