import { createRelayMailboxTransport } from './relayMailboxTransport';
import { createRelayPolling } from './relayPolling';
import {
  recoverDisconnectedState,
  mailboxGenerationReason,
  isExpiredPairing,
  type RelaySessionState,
} from './relaySessionState';
import type { RelayClient } from '../relayClient';
import {
  createRelayKeyPair,
  deriveRelayEncryptionKey,
  openRelayJson,
  sealRelayJson,
  type RelayKeyPair,
} from '../relayCrypto';
import { MAX_AI_MESSAGE_LENGTH, type AiInstructionBundle, type JsonValue } from '../protocol';
import {
  AI_RELAY_EMPTY_GENERATION,
  AI_RELAY_PROTOCOL_VERSION,
  MAX_AI_RELAY_MAILBOX_ENTRIES,
  type RelayBrowserMailbox,
  type RelayEnvelope,
} from '../relayProtocol';
import { createAiToolSession, type AiToolSession } from '../toolSession';
import { buildAiInstructionBundle } from '../instructions';
import type { ReplacementParticipant } from '../../db/replacementLifecycle';
import type { AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';
import { appendConversationItems } from './relayEvents';
import {
  createRelaySessionPersistence,
  type RelaySessionPersistence,
  type RelaySessionStorage,
} from './relayPersistence';

export type { RelaySessionStorage } from './relayPersistence';
export { AI_CONNECTION_QUIET_AFTER_MS } from './relaySessionState';

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
  /** Replaces storage-backed persistence; `storage` is then unused. */
  persistence?: RelaySessionPersistence;
  timers?: RelaySessionTimers;
  crypto?: RelaySessionCrypto;
  now?: () => number;
  createId?: (prefix: string) => string;
  toolSession?: AiToolSession;
  getInstructions?: () => AiInstructionBundle;
}

export interface RelayAiSession extends AiSession {
  /** Production-only coordination seam; React continues to depend on `AiSession`. */
  readonly replacementParticipant: ReplacementParticipant;
}

export function clearPersistedRelayAiDeviceState(
  storage: RelaySessionStorage = globalThis.localStorage,
): void {
  createRelaySessionPersistence(storage).clear();
}

export function createRelayAiSession(options: RelayAiSessionOptions): RelayAiSession {
  const persistence =
    options.persistence ??
    createRelaySessionPersistence(options.storage ?? globalThis.localStorage);
  const timers = options.timers ?? browserTimers();
  const crypto = options.crypto ?? browserCrypto();
  const now = options.now ?? Date.now;
  const createId = options.createId ?? ((prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`);
  const getInstructions =
    options.getInstructions ??
    (() => buildAiInstructionBundle({ misconceptionFirstEnabled: true }));
  const listeners = new Set<() => void>();
  const restored = persistence.load();
  const state: RelaySessionState = {
    persisted: restored?.connection ?? null,
    snapshot: restored?.snapshot ?? EMPTY_SNAPSHOT,
    encryptionKey: null,
    cancelPolling: null,
    pollingEpoch: 0,
    active: false,
    pollInFlightEpoch: null,
    mutationQueue: Promise.resolve(),
  };

  const toolSession =
    options.toolSession ??
    createAiToolSession(
      {
        now,
        createId: () => createId('approval'),
      },
      state.persisted?.toolSessionState,
    );

  const { getEncryptionKey, pushMailbox } = createRelayMailboxTransport(state, {
    options,
    crypto,
  });
  const { startPolling, stopPolling } = createRelayPolling(state, {
    options,
    crypto,
    timers,
    now,
    toolSession,
    serialise,
    expirePairing,
    publish,
    getEncryptionKey,
    pushMailbox,
    disconnectMailboxGeneration,
  });
  if (isExpiredPairing(state.snapshot, now())) expirePairing();

  function persist(): void {
    if (state.persisted) {
      state.persisted = { ...state.persisted, toolSessionState: toolSession.exportState() };
    }
    persistence.save({ snapshot: state.snapshot, connection: state.persisted });
  }

  function publish(next: Omit<AiSessionSnapshot, 'revision'>): void {
    state.snapshot = { ...next, revision: state.snapshot.revision + 1 };
    persist();
    listeners.forEach((listener) => listener());
  }

  function serialise<T>(operation: () => Promise<T>): Promise<T> {
    const pending = state.mutationQueue.then(operation, operation);
    state.mutationQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  function expirePairing(): void {
    stopPolling();
    toolSession.clear();
    state.persisted = null;
    state.encryptionKey = null;
    publish({
      ...state.snapshot,
      connection: { status: 'disconnected', reason: PAIRING_EXPIRED_REASON },
      run: null,
      activity: null,
      approval: null,
    });
  }

  function disconnectMailboxGeneration(reason: string, current = state.snapshot): void {
    stopPolling();
    toolSession.clear();
    state.encryptionKey = null;
    publish({
      ...current,
      ...recoverDisconnectedState(current),
      connection: { status: 'disconnected', reason },
      approval: null,
    });
  }

  function mailboxGenerationFailure(
    error: unknown,
    current = state.snapshot,
  ): AiSessionCommandFailure | null {
    const reason = mailboxGenerationReason(error);
    if (!reason) return null;
    disconnectMailboxGeneration(reason, current);
    return conflict(reason);
  }

  function invalidateForReplacement(): void {
    stopPolling();
    publish({
      ...state.snapshot,
      ...recoverDisconnectedState(state.snapshot),
      approval: null,
    });
  }

  async function quiesceForReplacement(): Promise<void> {
    const credentials = state.persisted?.credentials ?? null;
    publish({
      ...state.snapshot,
      ...recoverDisconnectedState(state.snapshot),
      connection: { status: 'disconnected' },
      approval: null,
    });
    if (!credentials) return;
    try {
      await options.relay.revoke(credentials);
    } catch {
      // The local session is already invalidated. An unavailable relay must not block a local
      // database replacement; the remote session expires independently.
    }
  }

  function clearReplacementState(): void {
    stopPolling();
    state.pollInFlightEpoch = null;
    state.mutationQueue = Promise.resolve();
    toolSession.clear();
    state.persisted = null;
    state.encryptionKey = null;
    state.snapshot = { ...EMPTY_SNAPSHOT, revision: state.snapshot.revision + 1 };
    persistence.clear();
    listeners.forEach((listener) => listener());
  }

  return {
    replacementParticipant: {
      invalidate: invalidateForReplacement,
      quiesce: quiesceForReplacement,
      clear: clearReplacementState,
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return state.snapshot;
    },
    activate() {
      if (state.active) return;
      state.active = true;
      if (state.persisted && state.snapshot.connection.status !== 'disconnected') startPolling();
    },
    dispose() {
      state.active = false;
      stopPolling();
    },
    pair() {
      const epoch = state.pollingEpoch;
      return serialise(async () => {
        if (epoch !== state.pollingEpoch || state.snapshot.connection.status !== 'disconnected') {
          return conflict('AI is already connecting or connected.');
        }
        try {
          toolSession.clear();
          const keyPair = await crypto.createKeyPair();
          if (epoch !== state.pollingEpoch) return unavailable('AI connection was reset.');
          const created = await options.relay.create(keyPair.publicKey);
          if (epoch !== state.pollingEpoch) {
            void (async () => {
              try {
                await options.relay.revoke({
                  sessionId: created.sessionId,
                  browserToken: created.browserToken,
                });
              } catch {
                // Local disposal already won. An unavailable relay retains the
                // otherwise unreachable session only until its server-side expiry.
              }
            })();
            return unavailable('AI connection was reset.');
          }
          const connection = {
            status: 'pairing' as const,
            code: created.pairingCode,
            expiresAt: created.expiresAt,
          };
          state.persisted = {
            credentials: {
              sessionId: created.sessionId,
              browserToken: created.browserToken,
            },
            keyPair,
            peerPublicKey: null,
            browserGeneration: AI_RELAY_EMPTY_GENERATION,
            browserMailbox: {
              version: AI_RELAY_PROTOCOL_VERSION,
              revision: 0,
              messages: [],
              toolResponses: [],
              terminalRevisionSeen: 0,
            },
            queuedFollowUpMessageId: null,
            terminalRevisionSeen: 0,
            processedEventIds: [],
            toolSessionState: toolSession.exportState(),
          };
          publish({ ...state.snapshot, connection, approval: null });
          if (state.active) startPolling();
          return { ok: true, data: { code: created.pairingCode, expiresAt: created.expiresAt } };
        } catch (error) {
          if (error instanceof TypeError) {
            return unavailable(
              'Lacuna could not reach the relay. Check that this network permits relay.getlacuna.app.',
            );
          }
          return internal('The terminal pairing session could not be created.');
        }
      });
    },
    send(content) {
      const epoch = state.pollingEpoch;
      return serialise(async () => {
        if (
          epoch !== state.pollingEpoch ||
          !state.persisted ||
          (state.snapshot.connection.status !== 'connected' &&
            state.snapshot.connection.status !== 'quiet')
        ) {
          return unavailable('AI is not connected.');
        }
        if (state.snapshot.run?.status === 'stop_requested') {
          return conflict('Wait for AI to stop before sending another message.');
        }
        if (content.trim() === '') return conflict('The AI message cannot be blank.');
        if (content.length > MAX_AI_MESSAGE_LENGTH) return conflict('The AI message is too long.');
        const messageId = createId('message');
        const conversationId = state.snapshot.conversationId ?? createId('conversation');
        const createdAt = now();
        const message = {
          messageId,
          conversationId,
          content,
          createdAt,
          instructions: getInstructions(),
          delivery: 'queued' as const,
        };
        const active = state.snapshot.run?.status === 'active';
        const replacedFollowUpMessageId = state.persisted.queuedFollowUpMessageId;
        const messages = active
          ? [
              ...state.persisted.browserMailbox.messages.filter(
                (item) => item.messageId !== replacedFollowUpMessageId,
              ),
              message,
            ]
          : [...state.persisted.browserMailbox.messages, message];
        if (messages.length > MAX_AI_RELAY_MAILBOX_ENTRIES) {
          return conflict('The AI message queue is full.');
        }
        const mailbox: RelayBrowserMailbox = {
          ...state.persisted.browserMailbox,
          revision: state.persisted.browserMailbox.revision + 1,
          messages,
        };
        try {
          const browserGeneration = await pushMailbox(mailbox, epoch);
          if (browserGeneration === null) return unavailable('AI connection was reset.');
          state.persisted = {
            ...state.persisted,
            browserMailbox: mailbox,
            browserGeneration,
            queuedFollowUpMessageId: active ? messageId : state.persisted.queuedFollowUpMessageId,
          };
          publish(
            active
              ? { ...state.snapshot, conversationId, draft: '', queuedFollowUp: content }
              : {
                  ...state.snapshot,
                  conversationId,
                  draft: '',
                  items: appendConversationItems(state.snapshot.items, {
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
          if (epoch !== state.pollingEpoch) return unavailable('AI connection was reset.');
          const staleFailure = mailboxGenerationFailure(error, {
            ...state.snapshot,
            draft: content,
            queuedFollowUp: null,
          });
          if (staleFailure) return staleFailure;
          return internal('The AI message could not be queued.');
        }
      });
    },
    stop(runId) {
      const epoch = state.pollingEpoch;
      return serialise(async () => {
        if (
          epoch !== state.pollingEpoch ||
          !state.persisted ||
          !state.snapshot.run ||
          state.snapshot.run.runId !== runId ||
          state.snapshot.run.status !== 'active'
        ) {
          return conflict('That AI run is no longer active.');
        }
        const stopRequestedAt = now();
        const queuedFollowUpMessageId = state.persisted.queuedFollowUpMessageId;
        const messages = state.persisted.browserMailbox.messages
          .filter((message) => message.messageId !== queuedFollowUpMessageId)
          .map((message) =>
            message.messageId === state.snapshot.run?.messageId && message.delivery === 'claimed'
              ? { ...message, delivery: 'stop_requested' as const }
              : message,
          );
        const browserMailbox: RelayBrowserMailbox = {
          ...state.persisted.browserMailbox,
          revision: state.persisted.browserMailbox.revision + 1,
          messages,
        };
        try {
          const browserGeneration = await pushMailbox(browserMailbox, epoch);
          if (browserGeneration === null) return unavailable('AI connection was reset.');
          state.persisted = {
            ...state.persisted,
            browserMailbox,
            browserGeneration,
            queuedFollowUpMessageId: null,
          };
          publish({
            ...state.snapshot,
            draft: state.snapshot.queuedFollowUp ?? state.snapshot.draft,
            queuedFollowUp: null,
            run: { ...state.snapshot.run, status: 'stop_requested', stopRequestedAt },
            activity: {
              runId,
              status: 'stop_requested',
              summary: 'Stop requested',
              updatedAt: stopRequestedAt,
            },
          });
          return { ok: true, data: undefined };
        } catch (error) {
          if (epoch !== state.pollingEpoch) return unavailable('AI connection was reset.');
          const staleFailure = mailboxGenerationFailure(error);
          if (staleFailure) return staleFailure;
          return internal('The stop request could not be sent.');
        }
      });
    },
    decide(approvalId, approved) {
      return serialise(async () => {
        const decision = await toolSession.decide(approvalId, approved);
        if (!decision.ok)
          return conflict(
            decision.error.kind === 'tool' ? decision.error.error.message : decision.error.message,
          );
        const activity =
          decision.effects.activity && state.snapshot.run
            ? { runId: state.snapshot.run.runId, ...decision.effects.activity }
            : state.snapshot.activity;
        publish({
          ...state.snapshot,
          approval: decision.approval,
          activity,
        });
        return { ok: true, data: undefined };
      });
    },
    resetConnection() {
      const credentials = state.persisted?.credentials ?? null;
      const recovered = recoverDisconnectedState(state.snapshot);

      stopPolling();
      state.pollInFlightEpoch = null;
      state.mutationQueue = Promise.resolve();
      toolSession.clear();
      state.persisted = null;
      state.encryptionKey = null;
      publish({
        ...state.snapshot,
        ...recovered,
        connection: { status: 'disconnected' },
        approval: null,
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
