import {
  RelayPushOutcomeUnknownError,
  RelayStaleGenerationError,
  type RelayClient,
} from '../relayClient';
import {
  createRelayKeyPair,
  deriveRelayEncryptionKey,
  openRelayJson,
  sealRelayJson,
  type RelayKeyPair,
} from '../relayCrypto';
import { MAX_AI_MESSAGE_LENGTH, type JsonValue } from '../protocol';
import {
  AI_RELAY_EMPTY_GENERATION,
  MAX_AI_RELAY_MAILBOX_ENTRIES,
  relayTerminalMailboxSchema,
  type RelayBrowserMailbox,
  type RelayEnvelope,
} from '../relayProtocol';
import type { AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';
import { appendConversationItems, applyTerminalEvent, expireClaimLease } from './relayEvents';
import {
  createRelaySessionPersistence,
  type PersistedRelayConnection,
  type RelaySessionStorage,
} from './relayPersistence';

export type { RelaySessionStorage } from './relayPersistence';

const POLL_INTERVAL_MS = 1_000;
const PAIRING_EXPIRED_REASON = 'Pairing code expired. Connect the terminal again.';
const STALE_GENERATION_REASON =
  'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.';
const UNKNOWN_OUTCOME_REASON =
  'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.';

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
  let pollingEpoch = 0;
  let active = false;
  let pollInFlightEpoch: number | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();

  if (isExpiredPairing(snapshot, now())) expirePairing();

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
    const epoch = ++pollingEpoch;
    cancelPolling = timers.repeat(() => poll(epoch), POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    pollingEpoch += 1;
    cancelPolling?.();
    cancelPolling = null;
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
    stopPolling();
    persisted = null;
    encryptionKey = null;
    publish({
      ...snapshot,
      connection: { status: 'disconnected', reason: PAIRING_EXPIRED_REASON },
      run: null,
      activity: null,
    });
  }

  async function poll(epoch: number): Promise<void> {
    if (epoch !== pollingEpoch || pollInFlightEpoch === epoch) return;
    pollInFlightEpoch = epoch;
    try {
      await serialise(() => (epoch === pollingEpoch ? pollOnce(epoch) : Promise.resolve()));
    } catch (error) {
      const reason = mailboxGenerationReason(error);
      if (epoch === pollingEpoch && reason) {
        disconnectMailboxGeneration(reason);
      }
      // A later poll retries transient transport, persistence and crypto failures.
    } finally {
      if (pollInFlightEpoch === epoch) pollInFlightEpoch = null;
    }
  }

  async function pollOnce(epoch: number): Promise<void> {
    if (epoch !== pollingEpoch || !persisted || snapshot.connection.status === 'disconnected') {
      return;
    }
    if (isExpiredPairing(snapshot, now())) {
      expirePairing();
      return;
    }
    if (!persisted.peerPublicKey) {
      const connection = persisted;
      const peer = await options.relay.peer(connection.credentials);
      if (epoch !== pollingEpoch || persisted !== connection || !peer) return;
      const derivedKey = await crypto.deriveKey(
        connection.keyPair.privateKey,
        peer.terminalPublicKey,
      );
      if (epoch !== pollingEpoch || persisted !== connection) return;
      encryptionKey = derivedKey;
      persisted = { ...connection, peerPublicKey: peer.terminalPublicKey };
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
    let queuedFollowUpMessageId = persisted.queuedFollowUpMessageId;
    let nextSnapshot = snapshot;
    let messages = [...persisted.browserMailbox.messages];
    const expired = expireClaimLease(nextSnapshot, messages, now(), () => createId('message'));
    if (expired) ({ snapshot: nextSnapshot, messages } = expired);

    const pulled = await options.relay.pull(persisted.credentials);
    if (epoch !== pollingEpoch) return;
    let terminalRevisionSeen = persisted.terminalRevisionSeen;
    const events = [];
    if (pulled) {
      const envelope = JSON.parse(new TextDecoder().decode(pulled.bytes)) as unknown;
      const key = await getEncryptionKey(epoch);
      if (!key || epoch !== pollingEpoch) return;
      const opened = await crypto.open(key, envelope);
      if (epoch !== pollingEpoch) return;
      const terminalMailbox = relayTerminalMailboxSchema.parse(opened);
      terminalRevisionSeen = terminalMailbox.revision;
      events.push(...terminalMailbox.events.filter((event) => !processed.has(event.eventId)));
    }
    if (!expired && events.length === 0) return;

    for (const event of events) {
      ({ snapshot: nextSnapshot, messages } = applyTerminalEvent(nextSnapshot, messages, event));
      if (event.type === 'claimed' && event.messageId === queuedFollowUpMessageId) {
        queuedFollowUpMessageId = null;
      }
      processed.add(event.eventId);
      if (processed.size > MAX_AI_RELAY_MAILBOX_ENTRIES) {
        const oldest = processed.values().next().value;
        if (oldest !== undefined) processed.delete(oldest);
      }
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
    const browserGeneration = await pushMailbox(browserMailbox, epoch);
    if (browserGeneration === null || epoch !== pollingEpoch) return;
    persisted = {
      ...persisted,
      browserMailbox,
      browserGeneration,
      queuedFollowUpMessageId,
      terminalRevisionSeen,
      processedEventIds: [...processed],
    };
    publish(nextSnapshot);
    if (nextSnapshot.connection.status === 'disconnected') {
      stopPolling();
    }
  }

  async function getEncryptionKey(epoch: number): Promise<CryptoKey | null> {
    if (epoch !== pollingEpoch) return null;
    if (encryptionKey) return encryptionKey;
    const connection = persisted;
    if (!connection?.peerPublicKey) throw new Error('AI terminal is not paired.');
    const derivedKey = await crypto.deriveKey(
      connection.keyPair.privateKey,
      connection.peerPublicKey,
    );
    if (epoch !== pollingEpoch || persisted !== connection) return null;
    encryptionKey = derivedKey;
    return derivedKey;
  }

  async function pushMailbox(mailbox: RelayBrowserMailbox, epoch: number): Promise<string | null> {
    if (!persisted) throw new Error('AI terminal is not paired.');
    const key = await getEncryptionKey(epoch);
    if (!key || epoch !== pollingEpoch) return null;
    const envelope = await crypto.seal(key, mailbox as JsonValue);
    if (epoch !== pollingEpoch) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const pushed = await options.relay.push(
      persisted.credentials,
      bytes,
      persisted.browserGeneration,
    );
    if (epoch !== pollingEpoch) return null;
    return pushed.generation;
  }

  function disconnectMailboxGeneration(reason: string): void {
    stopPolling();
    encryptionKey = null;
    publish({
      ...snapshot,
      connection: { status: 'disconnected', reason },
      run: null,
      activity: null,
    });
  }

  function mailboxGenerationFailure(error: unknown): AiSessionCommandFailure | null {
    const reason = mailboxGenerationReason(error);
    if (!reason) return null;
    disconnectMailboxGeneration(reason);
    return conflict(reason);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    activate() {
      if (active) return;
      active = true;
      if (persisted && snapshot.connection.status !== 'disconnected') startPolling();
    },
    dispose() {
      active = false;
      stopPolling();
    },
    pair() {
      const epoch = pollingEpoch;
      return serialise(async () => {
        if (epoch !== pollingEpoch || snapshot.connection.status !== 'disconnected') {
          return conflict('AI is already connecting or connected.');
        }
        try {
          const keyPair = await crypto.createKeyPair();
          const created = await options.relay.create(keyPair.publicKey);
          if (epoch !== pollingEpoch) return unavailable('AI connection was reset.');
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
            queuedFollowUpMessageId: null,
            terminalRevisionSeen: 0,
            processedEventIds: [],
          };
          publish({ ...snapshot, connection });
          if (active) startPolling();
          return { ok: true, data: { code: created.pairingCode, expiresAt: created.expiresAt } };
        } catch {
          return internal('The terminal pairing session could not be created.');
        }
      });
    },
    send(content) {
      const epoch = pollingEpoch;
      return serialise(async () => {
        if (
          epoch !== pollingEpoch ||
          !persisted ||
          (snapshot.connection.status !== 'connected' && snapshot.connection.status !== 'quiet')
        ) {
          return unavailable('AI is not connected.');
        }
        if (content.trim() === '') return conflict('The AI message cannot be blank.');
        if (content.length > MAX_AI_MESSAGE_LENGTH) return conflict('The AI message is too long.');
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
        const replacedFollowUpMessageId = persisted.queuedFollowUpMessageId;
        const messages = active
          ? [
              ...persisted.browserMailbox.messages.filter(
                (item) => item.messageId !== replacedFollowUpMessageId,
              ),
              message,
            ]
          : [...persisted.browserMailbox.messages, message];
        if (messages.length > MAX_AI_RELAY_MAILBOX_ENTRIES) {
          return conflict('The AI message queue is full.');
        }
        const mailbox: RelayBrowserMailbox = {
          ...persisted.browserMailbox,
          revision: persisted.browserMailbox.revision + 1,
          messages,
        };
        try {
          const browserGeneration = await pushMailbox(mailbox, epoch);
          if (browserGeneration === null) return unavailable('AI connection was reset.');
          persisted = {
            ...persisted,
            browserMailbox: mailbox,
            browserGeneration,
            queuedFollowUpMessageId: active ? messageId : persisted.queuedFollowUpMessageId,
          };
          publish(
            active
              ? { ...snapshot, conversationId, queuedFollowUp: content }
              : {
                  ...snapshot,
                  conversationId,
                  items: appendConversationItems(snapshot.items, {
                    kind: 'user',
                    id: messageId,
                    content,
                    createdAt,
                    delivery: 'queued',
                  }),
                },
          );
          return { ok: true, data: { messageId } };
        } catch (error) {
          if (epoch !== pollingEpoch) return unavailable('AI connection was reset.');
          const staleFailure = mailboxGenerationFailure(error);
          if (staleFailure) return staleFailure;
          return internal('The AI message could not be queued.');
        }
      });
    },
    stop(runId) {
      const epoch = pollingEpoch;
      return serialise(async () => {
        if (
          epoch !== pollingEpoch ||
          !persisted ||
          !snapshot.run ||
          snapshot.run.runId !== runId ||
          snapshot.run.status !== 'active'
        ) {
          return conflict('That AI run is no longer active.');
        }
        const stopRequestedAt = now();
        const queuedFollowUpMessageId = persisted.queuedFollowUpMessageId;
        const messages = persisted.browserMailbox.messages
          .filter((message) => message.messageId !== queuedFollowUpMessageId)
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
          const browserGeneration = await pushMailbox(browserMailbox, epoch);
          if (browserGeneration === null) return unavailable('AI connection was reset.');
          persisted = {
            ...persisted,
            browserMailbox,
            browserGeneration,
            queuedFollowUpMessageId: null,
          };
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
        } catch (error) {
          if (epoch !== pollingEpoch) return unavailable('AI connection was reset.');
          const staleFailure = mailboxGenerationFailure(error);
          if (staleFailure) return staleFailure;
          return internal('The stop request could not be sent.');
        }
      });
    },
    async decide() {
      return conflict('That approval is no longer pending.');
    },
    resetConnection() {
      const credentials = persisted?.credentials ?? null;
      const interruptedRun =
        snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested'
          ? snapshot.run
          : null;
      const interruptedPrompt = interruptedRun
        ? snapshot.items.find(
            (item) => item.kind === 'user' && item.id === interruptedRun.messageId,
          )
        : null;
      const interruptedPromptContent =
        interruptedPrompt?.kind === 'user' ? interruptedPrompt.content : '';
      const recoveredDraft =
        snapshot.queuedFollowUp ?? (snapshot.draft || interruptedPromptContent);
      const items = interruptedRun
        ? snapshot.items.map((item) =>
            item.kind === 'user' && item.id === interruptedRun.messageId
              ? { ...item, delivery: 'stopped' as const }
              : item,
          )
        : snapshot.items;

      stopPolling();
      pollInFlightEpoch = null;
      mutationQueue = Promise.resolve();
      persisted = null;
      encryptionKey = null;
      publish({
        ...snapshot,
        connection: { status: 'disconnected' },
        items,
        run: null,
        activity: null,
        draft: recoveredDraft,
        queuedFollowUp: null,
      });

      return (async () => {
        if (!credentials) return { ok: true as const, data: undefined };
        try {
          await options.relay.revoke(credentials);
          return { ok: true as const, data: undefined };
        } catch {
          return internal('The AI connection could not be revoked.');
        }
      })();
    },
  };
}

function mailboxGenerationReason(error: unknown): string | null {
  if (error instanceof RelayStaleGenerationError) return STALE_GENERATION_REASON;
  if (error instanceof RelayPushOutcomeUnknownError) return UNKNOWN_OUTCOME_REASON;
  return null;
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
