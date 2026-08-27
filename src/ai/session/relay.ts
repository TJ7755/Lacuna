import type { RelayClient } from '../relayClient';
import {
  createRelayKeyPair,
  deriveRelayEncryptionKey,
  openRelayJson,
  sealRelayJson,
  type RelayKeyPair,
} from '../relayCrypto';
import type { JsonValue } from '../protocol';
import {
  AI_RELAY_EMPTY_GENERATION,
  relayTerminalMailboxSchema,
  type RelayBrowserMailbox,
  type RelayEnvelope,
} from '../relayProtocol';
import type { AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';
import { applyTerminalEvent, expireClaimLease } from './relayEvents';
import {
  createRelaySessionPersistence,
  type PersistedRelayConnection,
  type RelaySessionStorage,
} from './relayPersistence';

export type { RelaySessionStorage } from './relayPersistence';

const POLL_INTERVAL_MS = 1_000;
const PAIRING_EXPIRED_REASON = 'Pairing code expired. Connect the terminal again.';

const EMPTY_SNAPSHOT: AiSessionSnapshot = {
  revision: 0,
  connection: { status: 'disconnected' },
  conversationId: null,
  items: [],
  run: null,
  activity: null,
  approval: null,
  draft: '',
  queuedFollowUp: null,
};

export interface RelaySessionTimers {
  repeat(task: () => Promise<void>, intervalMs: number): () => void;
}

export interface RelaySessionCrypto {
  createKeyPair(): Promise<RelayKeyPair>;
  deriveKey(privateKey: string, peerPublicKey: string): Promise<CryptoKey>;
  seal(key: CryptoKey, value: JsonValue): Promise<RelayEnvelope>;
  open(key: CryptoKey, envelope: unknown): Promise<JsonValue>;
}

export interface RelayAiSessionOptions {
  relay: RelayClient;
  storage?: RelaySessionStorage;
  timers?: RelaySessionTimers;
  crypto?: RelaySessionCrypto;
  now?: () => number;
  createId?: (prefix: string) => string;
}

export function createRelayAiSession(options: RelayAiSessionOptions): AiSession {
  const storage = options.storage ?? globalThis.localStorage;
  const persistence = createRelaySessionPersistence(storage);
  const timers = options.timers ?? browserTimers();
  const crypto = options.crypto ?? browserCrypto();
  const now = options.now ?? Date.now;
  const createId = options.createId ?? ((prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`);
  const listeners = new Set<() => void>();
  const restored = persistence.load();
  let persisted: PersistedRelayConnection | null = restored?.connection ?? null;
  let snapshot = restored?.snapshot ?? EMPTY_SNAPSHOT;
  let encryptionKey: CryptoKey | null = null;
  let cancelPolling: (() => void) | null = null;
  let pollInFlight = false;
  let mutationQueue: Promise<void> = Promise.resolve();

  if (isExpiredPairing(snapshot, now())) expirePairing();
  else if (persisted && snapshot.connection.status !== 'disconnected') startPolling();

  function persist(): void {
    persistence.save({ snapshot, connection: persisted });
  }

  function publish(next: Omit<AiSessionSnapshot, 'revision'>): void {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    persist();
    listeners.forEach((listener) => listener());
  }

  function startPolling(): void {
    if (cancelPolling) return;
    cancelPolling = timers.repeat(poll, POLL_INTERVAL_MS);
  }

  function serialise<T>(operation: () => Promise<T>): Promise<T> {
    const pending = mutationQueue.then(operation, operation);
    mutationQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  function expirePairing(): void {
    cancelPolling?.();
    cancelPolling = null;
    persisted = null;
    encryptionKey = null;
    publish({
      ...snapshot,
      connection: { status: 'disconnected', reason: PAIRING_EXPIRED_REASON },
      run: null,
      activity: null,
    });
  }

  async function poll(): Promise<void> {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      await serialise(pollOnce);
    } catch {
      // A later poll retries transient transport, persistence and crypto failures.
    } finally {
      pollInFlight = false;
    }
  }

  async function pollOnce(): Promise<void> {
    if (!persisted) return;
    if (isExpiredPairing(snapshot, now())) {
      expirePairing();
      return;
    }
    if (!persisted.peerPublicKey) {
      const peer = await options.relay.peer(persisted.credentials);
      if (!peer) return;
      encryptionKey = await crypto.deriveKey(persisted.keyPair.privateKey, peer.terminalPublicKey);
      persisted = { ...persisted, peerPublicKey: peer.terminalPublicKey };
      publish({
        ...snapshot,
        connection: {
          status: 'connected',
          connectionId: persisted.credentials.sessionId,
          client: peer.client,
          lastActivityAt: now(),
        },
      });
      return;
    }
    const processed = new Set(persisted.processedEventIds);
    let nextSnapshot = snapshot;
    let messages = [...persisted.browserMailbox.messages];
    const expired = expireClaimLease(nextSnapshot, messages, now(), () => createId('message'));
    if (expired) ({ snapshot: nextSnapshot, messages } = expired);

    const pulled = await options.relay.pull(persisted.credentials);
    let terminalRevisionSeen = persisted.terminalRevisionSeen;
    const events = [];
    if (pulled) {
      const envelope = JSON.parse(new TextDecoder().decode(pulled.bytes)) as unknown;
      const opened = await crypto.open(await getEncryptionKey(), envelope);
      const terminalMailbox = relayTerminalMailboxSchema.parse(opened);
      terminalRevisionSeen = terminalMailbox.revision;
      events.push(...terminalMailbox.events.filter((event) => !processed.has(event.eventId)));
    }
    if (!expired && events.length === 0) return;

    for (const event of events) {
      ({ snapshot: nextSnapshot, messages } = applyTerminalEvent(nextSnapshot, messages, event));
      processed.add(event.eventId);
    }
    if (
      nextSnapshot.connection.status === 'connected' ||
      nextSnapshot.connection.status === 'quiet'
    ) {
      nextSnapshot = {
        ...nextSnapshot,
        connection: { ...nextSnapshot.connection, status: 'connected', lastActivityAt: now() },
      };
    }
    const browserMailbox: RelayBrowserMailbox = {
      ...persisted.browserMailbox,
      revision: persisted.browserMailbox.revision + 1,
      messages,
      terminalRevisionSeen,
    };
    const browserGeneration = await pushMailbox(browserMailbox);
    persisted = {
      ...persisted,
      browserMailbox,
      browserGeneration,
      terminalRevisionSeen,
      processedEventIds: [...processed],
    };
    publish(nextSnapshot);
    if (nextSnapshot.connection.status === 'disconnected') {
      cancelPolling?.();
      cancelPolling = null;
    }
  }

  async function getEncryptionKey(): Promise<CryptoKey> {
    if (encryptionKey) return encryptionKey;
    if (!persisted?.peerPublicKey) throw new Error('AI terminal is not paired.');
    encryptionKey = await crypto.deriveKey(persisted.keyPair.privateKey, persisted.peerPublicKey);
    return encryptionKey;
  }

  async function pushMailbox(mailbox: RelayBrowserMailbox): Promise<string> {
    if (!persisted) throw new Error('AI terminal is not paired.');
    const envelope = await crypto.seal(await getEncryptionKey(), mailbox as JsonValue);
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const pushed = await options.relay.push(
      persisted.credentials,
      bytes,
      persisted.browserGeneration,
    );
    return pushed.generation;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    dispose() {
      cancelPolling?.();
      cancelPolling = null;
    },
    pair() {
      return serialise(async () => {
        if (snapshot.connection.status !== 'disconnected') {
          return conflict('AI is already connecting or connected.');
        }
        try {
          const keyPair = await crypto.createKeyPair();
          const created = await options.relay.create(keyPair.publicKey);
          const connection = {
            status: 'pairing' as const,
            code: created.pairingCode,
            expiresAt: created.expiresAt,
          };
          persisted = {
            credentials: {
              sessionId: created.sessionId,
              browserToken: created.browserToken,
            },
            keyPair,
            peerPublicKey: null,
            browserGeneration: AI_RELAY_EMPTY_GENERATION,
            browserMailbox: {
              version: 1,
              revision: 0,
              messages: [],
              terminalRevisionSeen: 0,
            },
            terminalRevisionSeen: 0,
            processedEventIds: [],
          };
          publish({ ...snapshot, connection });
          startPolling();
          return { ok: true, data: { code: created.pairingCode, expiresAt: created.expiresAt } };
        } catch {
          return internal('The terminal pairing session could not be created.');
        }
      });
    },
    send(content) {
      return serialise(async () => {
        if (
          !persisted ||
          (snapshot.connection.status !== 'connected' && snapshot.connection.status !== 'quiet')
        ) {
          return unavailable('AI is not connected.');
        }
        if (content.trim() === '') return conflict('The AI message cannot be blank.');
        const messageId = createId('message');
        const conversationId = snapshot.conversationId ?? createId('conversation');
        const createdAt = now();
        const message = {
          messageId,
          conversationId,
          content,
          createdAt,
          delivery: 'queued' as const,
        };
        const active =
          snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested';
        const messages = active
          ? [
              ...persisted.browserMailbox.messages.filter((item) => item.delivery !== 'queued'),
              message,
            ]
          : [...persisted.browserMailbox.messages, message];
        const mailbox: RelayBrowserMailbox = {
          ...persisted.browserMailbox,
          revision: persisted.browserMailbox.revision + 1,
          messages,
        };
        try {
          const browserGeneration = await pushMailbox(mailbox);
          persisted = { ...persisted, browserMailbox: mailbox, browserGeneration };
          publish(
            active
              ? { ...snapshot, conversationId, queuedFollowUp: content }
              : {
                  ...snapshot,
                  conversationId,
                  items: [
                    ...snapshot.items,
                    {
                      kind: 'user',
                      id: messageId,
                      content,
                      createdAt,
                      delivery: 'queued',
                    },
                  ],
                },
          );
          return { ok: true, data: { messageId } };
        } catch {
          return internal('The AI message could not be queued.');
        }
      });
    },
    stop(runId) {
      return serialise(async () => {
        if (
          !persisted ||
          !snapshot.run ||
          snapshot.run.runId !== runId ||
          snapshot.run.status !== 'active'
        ) {
          return conflict('That AI run is no longer active.');
        }
        const stopRequestedAt = now();
        const messages = persisted.browserMailbox.messages
          .filter((message) => message.delivery !== 'queued')
          .map((message) =>
            message.messageId === snapshot.run?.messageId && message.delivery === 'claimed'
              ? { ...message, delivery: 'stop_requested' as const }
              : message,
          );
        const browserMailbox: RelayBrowserMailbox = {
          ...persisted.browserMailbox,
          revision: persisted.browserMailbox.revision + 1,
          messages,
        };
        try {
          const browserGeneration = await pushMailbox(browserMailbox);
          persisted = { ...persisted, browserMailbox, browserGeneration };
          publish({
            ...snapshot,
            draft: snapshot.queuedFollowUp ?? snapshot.draft,
            queuedFollowUp: null,
            run: { ...snapshot.run, status: 'stop_requested', stopRequestedAt },
            activity: {
              runId,
              status: 'stop_requested',
              summary: 'Stop requested',
              updatedAt: stopRequestedAt,
            },
          });
          return { ok: true, data: undefined };
        } catch {
          return internal('The stop request could not be sent.');
        }
      });
    },
    async decide() {
      return conflict('That approval is no longer pending.');
    },
    resetConnection() {
      return serialise(async () => {
        let revocationFailed = false;
        if (persisted) {
          try {
            await options.relay.revoke(persisted.credentials);
          } catch {
            revocationFailed = true;
          }
        }
        cancelPolling?.();
        cancelPolling = null;
        persisted = null;
        encryptionKey = null;
        publish({ ...snapshot, connection: { status: 'disconnected' }, run: null, activity: null });
        return revocationFailed
          ? internal('The AI connection could not be revoked.')
          : { ok: true, data: undefined };
      });
    },
  };
}

function browserCrypto(): RelaySessionCrypto {
  return {
    createKeyPair: createRelayKeyPair,
    deriveKey: deriveRelayEncryptionKey,
    seal: sealRelayJson,
    open: openRelayJson,
  };
}

function browserTimers(): RelaySessionTimers {
  return {
    repeat(task, intervalMs) {
      const handle = window.setInterval(() => void task(), intervalMs);
      return () => window.clearInterval(handle);
    },
  };
}

function isExpiredPairing(snapshot: AiSessionSnapshot, now: number): boolean {
  return snapshot.connection.status === 'pairing' && now >= snapshot.connection.expiresAt;
}

type AiSessionCommandFailure = Extract<AiSessionCommandResult<never>, { ok: false }>;

function unavailable(message: string): AiSessionCommandFailure {
  return { ok: false, error: { kind: 'unavailable', message } };
}

function conflict(message: string): AiSessionCommandFailure {
  return { ok: false, error: { kind: 'conflict', message } };
}

function internal(message: string): AiSessionCommandFailure {
  return { ok: false, error: { kind: 'internal', message } };
}
