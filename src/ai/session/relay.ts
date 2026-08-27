import type { RelayClient, RelayBrowserCredentials } from '../relayClient';
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
  relayBrowserMailboxSchema,
  relayTerminalMailboxSchema,
  type RelayBrowserMailbox,
  type RelayBrowserMessage,
  type RelayEnvelope,
  type RelayTerminalEvent,
} from '../relayProtocol';
import type { AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';

const STORAGE_KEY = 'lacuna-ai-relay-session-v1';
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

export interface RelaySessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

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

interface PersistedRelaySession {
  version: 1;
  snapshot: AiSessionSnapshot;
  credentials: RelayBrowserCredentials;
  keyPair: RelayKeyPair;
  peerPublicKey: string | null;
  browserGeneration: string;
  browserMailbox: RelayBrowserMailbox;
  terminalRevisionSeen: number;
  processedEventIds: string[];
}

export function createRelayAiSession(options: RelayAiSessionOptions): AiSession {
  const storage = options.storage ?? globalThis.localStorage;
  const timers = options.timers ?? browserTimers();
  const crypto = options.crypto ?? browserCrypto();
  const now = options.now ?? Date.now;
  const createId = options.createId ?? ((prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`);
  const listeners = new Set<() => void>();
  let persisted = readPersisted(storage);
  let snapshot = persisted?.snapshot ?? EMPTY_SNAPSHOT;
  let encryptionKey: CryptoKey | null = null;
  let cancelPolling: (() => void) | null = null;
  let pollInFlight = false;

  if (isExpiredPairing(snapshot, now())) expirePairing();
  else if (persisted && snapshot.connection.status !== 'disconnected') startPolling();

  function persist(): void {
    try {
      if (persisted) storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      else storage.removeItem(STORAGE_KEY);
    } catch {
      // The active in-memory session remains usable when browser storage is unavailable.
    }
  }

  function publish(next: Omit<AiSessionSnapshot, 'revision'>): void {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    if (persisted) persisted = { ...persisted, snapshot };
    persist();
    listeners.forEach((listener) => listener());
  }

  function startPolling(): void {
    if (cancelPolling) return;
    cancelPolling = timers.repeat(poll, POLL_INTERVAL_MS);
  }

  function expirePairing(): void {
    cancelPolling?.();
    cancelPolling = null;
    persisted = null;
    encryptionKey = null;
    snapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      connection: { status: 'disconnected', reason: PAIRING_EXPIRED_REASON },
    };
    removePersisted(storage);
    listeners.forEach((listener) => listener());
  }

  async function poll(): Promise<void> {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      await pollOnce();
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
    const pulled = await options.relay.pull(persisted.credentials);
    if (!pulled) return;
    const envelope = JSON.parse(new TextDecoder().decode(pulled.bytes)) as unknown;
    const opened = await crypto.open(await getEncryptionKey(), envelope);
    const terminalMailbox = relayTerminalMailboxSchema.parse(opened);
    const processed = new Set(persisted.processedEventIds);
    const events = terminalMailbox.events.filter((event) => !processed.has(event.eventId));
    if (events.length === 0) return;

    let nextSnapshot = snapshot;
    let messages = [...persisted.browserMailbox.messages];
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
      terminalRevisionSeen: terminalMailbox.revision,
    };
    const browserGeneration = await pushMailbox(browserMailbox);
    persisted = {
      ...persisted,
      browserMailbox,
      browserGeneration,
      terminalRevisionSeen: terminalMailbox.revision,
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
    async pair() {
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
          version: 1,
          snapshot: { ...snapshot, connection },
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
    },
    async send(content) {
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
      const active = snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested';
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
    },
    async stop(runId) {
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
    },
    async decide() {
      return conflict('That approval is no longer pending.');
    },
    async resetConnection() {
      if (persisted) {
        try {
          await options.relay.revoke(persisted.credentials);
        } catch {
          return internal('The AI connection could not be revoked.');
        }
      }
      cancelPolling?.();
      cancelPolling = null;
      persisted = null;
      encryptionKey = null;
      publish({ ...snapshot, connection: { status: 'disconnected' }, run: null, activity: null });
      return { ok: true, data: undefined };
    },
  };
}

function applyTerminalEvent(
  snapshot: AiSessionSnapshot,
  messages: RelayBrowserMessage[],
  event: RelayTerminalEvent,
): { snapshot: AiSessionSnapshot; messages: RelayBrowserMessage[] } {
  if (event.type === 'claimed') {
    const message = messages.find((candidate) => candidate.messageId === event.messageId);
    if (!message) return { snapshot, messages };
    const existingItem = snapshot.items.some(
      (item) => item.kind === 'user' && item.id === event.messageId,
    );
    const items = existingItem
      ? snapshot.items.map((item) =>
          item.kind === 'user' && item.id === event.messageId
            ? { ...item, delivery: 'claimed' as const }
            : item,
        )
      : [
          ...snapshot.items,
          {
            kind: 'user' as const,
            id: message.messageId,
            content: message.content,
            createdAt: message.createdAt,
            delivery: 'claimed' as const,
          },
        ];
    return {
      snapshot: {
        ...snapshot,
        items,
        queuedFollowUp: existingItem ? snapshot.queuedFollowUp : null,
        run: {
          status: 'active',
          runId: event.runId,
          conversationId: message.conversationId,
          messageId: event.messageId,
          claimedAt: event.claimedAt,
          leaseExpiresAt: event.leaseExpiresAt,
        },
        activity: {
          runId: event.runId,
          status: 'working',
          summary: 'Working',
          updatedAt: event.claimedAt,
        },
      },
      messages: messages.map((candidate) =>
        candidate.messageId === event.messageId && candidate.delivery === 'queued'
          ? { ...candidate, delivery: 'claimed' as const, runId: event.runId }
          : candidate,
      ),
    };
  }

  if (event.type === 'reply') {
    if (snapshot.run?.runId !== event.runId || snapshot.run.messageId !== event.messageId) {
      return { snapshot, messages };
    }
    return {
      snapshot: {
        ...snapshot,
        items: [
          ...snapshot.items.map((item) =>
            item.kind === 'user' && item.id === event.messageId
              ? { ...item, delivery: 'completed' as const }
              : item,
          ),
          {
            kind: 'assistant',
            id: `assistant-${event.eventId}`,
            content: event.content,
            createdAt: event.createdAt,
            sources: [],
          },
        ],
        run: { ...snapshot.run, status: 'completed', completedAt: event.createdAt },
        activity: {
          runId: event.runId,
          status: 'completed',
          summary: 'Done',
          updatedAt: event.createdAt,
        },
      },
      messages: messages.filter((message) => message.messageId !== event.messageId),
    };
  }

  if (event.type === 'stop_acknowledged') {
    if (snapshot.run?.runId !== event.runId || snapshot.run.status !== 'stop_requested') {
      return { snapshot, messages };
    }
    return {
      snapshot: {
        ...snapshot,
        items: snapshot.items.map((item) =>
          item.kind === 'user' && item.id === snapshot.run?.messageId
            ? { ...item, delivery: 'stopped' as const }
            : item,
        ),
        run: { ...snapshot.run, status: 'stopped', stoppedAt: event.stoppedAt },
        activity: {
          runId: event.runId,
          status: 'completed',
          summary: 'Stopped',
          detail: 'Further AI bridge actions are blocked. Completed changes remain.',
          updatedAt: event.stoppedAt,
        },
      },
      messages: messages.filter(
        (message) => !('runId' in message) || message.runId !== event.runId,
      ),
    };
  }

  const activeRun =
    snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested'
      ? { ...snapshot.run, status: 'expired' as const, expiredAt: event.disconnectedAt }
      : snapshot.run;
  return {
    snapshot: {
      ...snapshot,
      connection: { status: 'disconnected', reason: event.reason },
      run: activeRun,
      activity: {
        runId: snapshot.run?.runId ?? 'connection',
        status: 'failed',
        summary: event.reason ?? 'Terminal disconnected',
        updatedAt: event.disconnectedAt,
      },
    },
    messages,
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

function readPersisted(storage: RelaySessionStorage): PersistedRelaySession | null {
  let encoded: string | null;
  try {
    encoded = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!encoded) return null;
  try {
    const value = JSON.parse(encoded) as unknown;
    if (!isPersistedRelaySession(value)) {
      removePersisted(storage);
      return null;
    }
    return value;
  } catch {
    removePersisted(storage);
    return null;
  }
}

function removePersisted(storage: RelaySessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Browser storage may be disabled or unavailable.
  }
}

function isPersistedRelaySession(value: unknown): value is PersistedRelaySession {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!isSnapshot(value.snapshot)) return false;
  if (
    !isRecord(value.credentials) ||
    typeof value.credentials.sessionId !== 'string' ||
    typeof value.credentials.browserToken !== 'string'
  ) {
    return false;
  }
  if (
    !isRecord(value.keyPair) ||
    typeof value.keyPair.publicKey !== 'string' ||
    typeof value.keyPair.privateKey !== 'string'
  ) {
    return false;
  }
  return (
    (value.peerPublicKey === null || typeof value.peerPublicKey === 'string') &&
    typeof value.browserGeneration === 'string' &&
    relayBrowserMailboxSchema.safeParse(value.browserMailbox).success &&
    Number.isInteger(value.terminalRevisionSeen) &&
    typeof value.terminalRevisionSeen === 'number' &&
    value.terminalRevisionSeen >= 0 &&
    Array.isArray(value.processedEventIds) &&
    value.processedEventIds.every((eventId) => typeof eventId === 'string')
  );
}

function isSnapshot(value: unknown): value is AiSessionSnapshot {
  if (!isRecord(value) || !Number.isInteger(value.revision) || !isRecord(value.connection)) {
    return false;
  }
  const status = value.connection.status;
  const validConnection =
    status === 'disconnected' ||
    (status === 'pairing' &&
      typeof value.connection.code === 'string' &&
      typeof value.connection.expiresAt === 'number') ||
    ((status === 'connected' || status === 'quiet') &&
      typeof value.connection.connectionId === 'string' &&
      isRecord(value.connection.client) &&
      typeof value.connection.client.name === 'string' &&
      typeof value.connection.lastActivityAt === 'number');
  return (
    validConnection &&
    Array.isArray(value.items) &&
    value.items.every(isRecord) &&
    (value.conversationId === null || typeof value.conversationId === 'string') &&
    (value.run === null || isRecord(value.run)) &&
    (value.activity === null || isRecord(value.activity)) &&
    (value.approval === null || isRecord(value.approval)) &&
    typeof value.draft === 'string' &&
    (value.queuedFollowUp === null || typeof value.queuedFollowUp === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
