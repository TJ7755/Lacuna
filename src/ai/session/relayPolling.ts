import type { RelayMailbox } from '../relayClient';
import type { RelayAiSessionOptions, RelaySessionCrypto } from './relay';
import type { RelaySessionState } from './relaySessionState';
import type { AiSessionSnapshot } from './types';
import type { AiToolSession } from '../toolSession';
import {
  MAX_AI_RELAY_MAILBOX_ENTRIES,
  relayTerminalMailboxSchema,
  type RelayBrowserMailbox,
  type RelayTerminalEvent,
  type RelayToolResponse,
} from '../relayProtocol';
import { applyTerminalEvent, expireClaimLease } from './relayEvents';
import {
  applyToolEffects,
  recoverDisconnectedState,
  mailboxGenerationReason,
  isExpiredPairing,
  markQuietConnection,
} from './relaySessionState';

interface RelayPollingOperations {
  options: Pick<RelayAiSessionOptions, 'relay'>;
  crypto: RelaySessionCrypto;
  now: () => number;
  toolSession: AiToolSession;
  serialise<T>(operation: () => Promise<T>): Promise<T>;
  expirePairing(): void;
  publish(next: Omit<AiSessionSnapshot, 'revision'>): void;
  getEncryptionKey(epoch: number): Promise<CryptoKey | null>;
  pushMailbox(mailbox: RelayBrowserMailbox, epoch: number): Promise<string | null>;
  disconnectMailboxGeneration(reason: string, current?: AiSessionSnapshot): void;
  stopPolling(): void;
}

export function createRelayPolling(
  state: Pick<
    RelaySessionState,
    'persisted' | 'snapshot' | 'encryptionKey' | 'pollingEpoch' | 'pollInFlightEpoch'
  >,
  {
    options,
    crypto,
    now,
    toolSession,
    serialise,
    expirePairing,
    publish,
    getEncryptionKey,
    pushMailbox,
    disconnectMailboxGeneration,
    stopPolling,
  }: RelayPollingOperations,
) {
  async function poll(epoch: number): Promise<void> {
    if (epoch !== state.pollingEpoch || state.pollInFlightEpoch === epoch) return;
    state.pollInFlightEpoch = epoch;
    try {
      const connection = state.persisted;
      const pulled: RelayMailbox | null =
        connection?.peerPublicKey &&
        state.snapshot.connection.status !== 'disconnected' &&
        !isExpiredPairing(state.snapshot, now())
          ? await options.relay.pull(connection.credentials)
          : null;
      await serialise(() =>
        epoch === state.pollingEpoch ? pollOnce(epoch, pulled) : Promise.resolve(),
      );
    } catch (error) {
      const reason = mailboxGenerationReason(error);
      if (epoch === state.pollingEpoch && reason) {
        disconnectMailboxGeneration(reason);
      }
      // A later poll retries transient transport, persistence and crypto failures.
    } finally {
      if (state.pollInFlightEpoch === epoch) state.pollInFlightEpoch = null;
    }
  }

  async function pollOnce(epoch: number, pulled: RelayMailbox | null): Promise<void> {
    if (
      epoch !== state.pollingEpoch ||
      !state.persisted ||
      state.snapshot.connection.status === 'disconnected'
    ) {
      return;
    }
    if (isExpiredPairing(state.snapshot, now())) {
      expirePairing();
      return;
    }
    if (!state.persisted.peerPublicKey) {
      const connection = state.persisted;
      const peer = await options.relay.peer(connection.credentials);
      if (epoch !== state.pollingEpoch || state.persisted !== connection || !peer) return;
      const derivedKey = await crypto.deriveKey(
        connection.keyPair.privateKey,
        peer.terminalPublicKey,
      );
      if (epoch !== state.pollingEpoch || state.persisted !== connection) return;
      state.encryptionKey = derivedKey;
      state.persisted = { ...connection, peerPublicKey: peer.terminalPublicKey };
      publish({
        ...state.snapshot,
        connection: {
          status: 'connected',
          connectionId: state.persisted.credentials.sessionId,
          client: peer.client,
          lastActivityAt: now(),
        },
      });
      return;
    }
    const processed = new Set(state.persisted.processedEventIds);
    let queuedFollowUpMessageId = state.persisted.queuedFollowUpMessageId;
    let nextSnapshot = state.snapshot;
    let messages = [...state.persisted.browserMailbox.messages];
    let toolResponses = [...state.persisted.browserMailbox.toolResponses];
    let mailboxChanged = false;

    if (epoch !== state.pollingEpoch) return;
    let terminalRevisionSeen = state.persisted.terminalRevisionSeen;
    let terminalActivitySeen = false;
    const events: RelayTerminalEvent[] = [];
    if (pulled) {
      const envelope = JSON.parse(new TextDecoder().decode(pulled.bytes)) as unknown;
      const key = await getEncryptionKey(epoch);
      if (!key || epoch !== state.pollingEpoch) return;
      const opened = await crypto.open(key, envelope);
      if (epoch !== state.pollingEpoch) return;
      const terminalMailbox = relayTerminalMailboxSchema.parse(opened);
      terminalActivitySeen = terminalMailbox.revision > terminalRevisionSeen;
      terminalRevisionSeen = Math.max(terminalRevisionSeen, terminalMailbox.revision);
      if (
        toolResponses.length > 0 &&
        terminalMailbox.browserRevisionSeen >= state.persisted.browserMailbox.revision
      ) {
        toolResponses = [];
        mailboxChanged = true;
      }
      events.push(...terminalMailbox.events.filter((event) => !processed.has(event.eventId)));
    }
    const activeRun = nextSnapshot.run?.status === 'active' ? nextSnapshot.run : null;
    const timelyReply =
      activeRun !== null &&
      events.some(
        (event) =>
          event.type === 'reply' &&
          event.runId === activeRun.runId &&
          event.messageId === activeRun.messageId &&
          event.createdAt < activeRun.leaseExpiresAt,
      );
    const expired = timelyReply ? null : expireClaimLease(nextSnapshot, messages, now());
    if (expired) ({ snapshot: nextSnapshot, messages } = expired);

    const connectionBeforeEvents = nextSnapshot.connection;
    if (
      terminalActivitySeen &&
      (nextSnapshot.connection.status === 'connected' || nextSnapshot.connection.status === 'quiet')
    ) {
      nextSnapshot = {
        ...nextSnapshot,
        connection: { ...nextSnapshot.connection, status: 'connected', lastActivityAt: now() },
      };
    } else {
      nextSnapshot = markQuietConnection(nextSnapshot, now());
    }
    const connectionChanged = nextSnapshot.connection !== connectionBeforeEvents;
    if (!expired && events.length === 0 && !mailboxChanged && !terminalActivitySeen) {
      if (connectionChanged) publish(nextSnapshot);
      return;
    }

    for (const event of events) {
      const beforeEvent = nextSnapshot;
      if (event.type === 'tool_call') {
        const outcome = await toolSession.invoke({
          connectionId: state.persisted.credentials.sessionId,
          runId: event.runId,
          runStatus:
            nextSnapshot.connection.status === 'disconnected'
              ? 'disconnected'
              : nextSnapshot.run?.runId === event.runId
                ? nextSnapshot.run.status
                : 'expired',
          callId: event.callId,
          toolName: event.toolName,
          input: event.input,
        });
        const response: RelayToolResponse = outcome.response.ok
          ? {
              runId: event.runId,
              callId: event.callId,
              respondedAt: now(),
              ok: true,
              result: outcome.response.result,
              ...(outcome.effects.receipt ? { receipt: outcome.effects.receipt } : {}),
            }
          : {
              runId: event.runId,
              callId: event.callId,
              respondedAt: now(),
              ok: false,
              error: outcome.response.error,
            };
        toolResponses = [
          ...toolResponses.filter(
            (candidate) => candidate.runId !== event.runId || candidate.callId !== event.callId,
          ),
          response,
        ].slice(-MAX_AI_RELAY_MAILBOX_ENTRIES);
        nextSnapshot = applyToolEffects(nextSnapshot, event, outcome);
      } else {
        ({ snapshot: nextSnapshot, messages } = applyTerminalEvent(nextSnapshot, messages, event));
      }
      if (event.type === 'claimed' && event.messageId === queuedFollowUpMessageId) {
        queuedFollowUpMessageId = null;
      }
      if (
        event.type === 'disconnected' &&
        (beforeEvent.run?.status === 'active' ||
          beforeEvent.run?.status === 'stop_requested' ||
          beforeEvent.queuedFollowUp !== null)
      ) {
        const recovered = recoverDisconnectedState(nextSnapshot);
        nextSnapshot = {
          ...nextSnapshot,
          ...recovered,
          activity: nextSnapshot.activity,
        };
        queuedFollowUpMessageId = null;
      }
      if (event.type === 'disconnected') {
        toolSession.clear();
        nextSnapshot = { ...nextSnapshot, approval: null };
      }
      processed.add(event.eventId);
      if (processed.size > MAX_AI_RELAY_MAILBOX_ENTRIES) {
        const oldest = processed.values().next().value;
        if (oldest !== undefined) processed.delete(oldest);
      }
    }
    const browserMailbox: RelayBrowserMailbox = {
      ...state.persisted.browserMailbox,
      revision: state.persisted.browserMailbox.revision + 1,
      messages,
      toolResponses,
      terminalRevisionSeen,
    };
    let browserGeneration: string | null;
    try {
      browserGeneration = await pushMailbox(browserMailbox, epoch);
    } catch (error) {
      const reason = mailboxGenerationReason(error);
      if (epoch === state.pollingEpoch && reason) {
        disconnectMailboxGeneration(reason, nextSnapshot);
        return;
      }
      throw error;
    }
    if (browserGeneration === null || epoch !== state.pollingEpoch) return;
    state.persisted = {
      ...state.persisted,
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
  return { poll };
}
