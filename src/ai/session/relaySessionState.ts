import type { PersistedRelayConnection } from './relayPersistence';
import { RelayPushOutcomeUnknownError, RelayStaleGenerationError } from '../relayClient';
import type { AiToolInvokeResult } from '../toolSession';
import type { RelayTerminalEvent } from '../relayProtocol';
import type { AiSessionSnapshot } from './types';
import { appendConversationItems } from './relayEvents';

export const AI_CONNECTION_QUIET_AFTER_MS = 90_000;
const STALE_GENERATION_REASON =
  'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.';
const UNKNOWN_OUTCOME_REASON =
  'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.';

export function recoverDisconnectedState(
  current: AiSessionSnapshot,
): Pick<AiSessionSnapshot, 'items' | 'run' | 'activity' | 'draft' | 'queuedFollowUp'> {
  const interruptedRun =
    current.run?.status === 'active' || current.run?.status === 'stop_requested'
      ? current.run
      : null;
  const interruptedPrompt = interruptedRun
    ? current.items.find((item) => item.kind === 'user' && item.id === interruptedRun.messageId)
    : null;
  const pendingPrompt = current.items.find(
    (item) => item.kind === 'user' && (item.delivery === 'queued' || item.delivery === 'claimed'),
  );
  const interruptedPromptContent =
    interruptedPrompt?.kind === 'user'
      ? interruptedPrompt.content
      : pendingPrompt?.kind === 'user'
        ? pendingPrompt.content
        : '';
  return {
    items: current.items.map((item) =>
      item.kind === 'user' && (item.delivery === 'queued' || item.delivery === 'claimed')
        ? { ...item, delivery: 'stopped' as const }
        : item,
    ),
    run: null,
    activity: null,
    draft: current.queuedFollowUp ?? (current.draft || interruptedPromptContent),
    queuedFollowUp: null,
  };
}

export function applyToolEffects(
  snapshot: AiSessionSnapshot,
  event: Extract<RelayTerminalEvent, { type: 'tool_call' }>,
  outcome: AiToolInvokeResult,
): AiSessionSnapshot {
  const approval = outcome.effects.approval
    ? outcome.effects.approval
    : outcome.response.ok ||
        !['approval_required', 'approval_pending'].includes(outcome.response.error.kind)
      ? null
      : snapshot.approval;
  const activity = outcome.effects.activity
    ? { runId: event.runId, ...outcome.effects.activity }
    : snapshot.activity;
  const receipt = outcome.effects.receipt;
  const items =
    receipt &&
    !snapshot.items.some(
      (item) =>
        item.kind === 'receipt' &&
        (item.receipt.receiptId === receipt.receiptId || item.receipt.callId === receipt.callId),
    )
      ? appendConversationItems(snapshot.items, {
          kind: 'receipt',
          id: receipt.receiptId,
          receipt,
        })
      : snapshot.items;
  return { ...snapshot, approval, activity, items };
}

export function mailboxGenerationReason(error: unknown): string | null {
  if (error instanceof RelayStaleGenerationError) return STALE_GENERATION_REASON;
  if (error instanceof RelayPushOutcomeUnknownError) return UNKNOWN_OUTCOME_REASON;
  return null;
}

export function isExpiredPairing(snapshot: AiSessionSnapshot, now: number): boolean {
  return snapshot.connection.status === 'pairing' && now >= snapshot.connection.expiresAt;
}

export function markQuietConnection(
  snapshot: AiSessionSnapshot,
  currentTime: number,
): AiSessionSnapshot {
  const connection = snapshot.connection;
  if (
    connection.status !== 'connected' ||
    currentTime - connection.lastActivityAt < AI_CONNECTION_QUIET_AFTER_MS ||
    (snapshot.run?.status === 'active' && currentTime < snapshot.run.leaseExpiresAt)
  ) {
    return snapshot;
  }
  return { ...snapshot, connection: { ...connection, status: 'quiet' } };
}

/** Allocated and invalidated only by the current session. */
export interface RelaySessionState {
  persisted: PersistedRelayConnection | null;
  snapshot: AiSessionSnapshot;
  encryptionKey: CryptoKey | null;
  cancelPolling: (() => void) | null;
  pollingEpoch: number;
  active: boolean;
  pollInFlightEpoch: number | null;
  mutationQueue: Promise<void>;
}
