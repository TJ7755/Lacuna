import { createLocalPendingClaims } from './localPendingClaims';
import { createLocalRequestHandler } from './localRequests';
import type { LocalSessionState, LocalMessage } from './localSessionState';
import { unavailableBridge } from './localSessionState';
import {
  MAX_AI_MESSAGE_LENGTH,
  type AiBridgeRequest,
  type AiBridgeResult,
  type AiClaimedMessage,
  type AiInstructionBundle,
  type AiRunState,
} from '../protocol';
import { buildAiInstructionBundle } from '../instructions';
import { createAiToolSession, type AiToolInvokeResult, type AiToolSession } from '../toolSession';
import type { ReplacementParticipant } from '../../db/replacementLifecycle';
import { appendConversationItems } from './relayEvents';
import type { AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';

const MAX_COMPLETED_REPLIES = 100;

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

export interface LocalAiRequestSource {
  disconnect?(channelId: string): void;
  listen(
    handler: (channelId: string, request: AiBridgeRequest) => Promise<AiBridgeResult>,
    onDisconnected: (channelId: string) => void,
  ): () => void;
}

export interface LocalAiSessionTimers {
  schedule(task: () => void, delayMs: number): () => void;
}

export interface LocalAiSessionOptions {
  source: LocalAiRequestSource;
  now?: () => number;
  createId?: (prefix: string) => string;
  timers?: LocalAiSessionTimers;
  toolSession?: AiToolSession;
  getInstructions?: () => AiInstructionBundle;
}

export interface LocalAiSession extends AiSession {
  readonly replacementParticipant: ReplacementParticipant;
}

export function createLocalAiSession(options: LocalAiSessionOptions): LocalAiSession {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);
  const timers = options.timers ?? browserTimers();
  const getInstructions =
    options.getInstructions ??
    (() => buildAiInstructionBundle({ misconceptionFirstEnabled: true }));
  const toolSession =
    options.toolSession ?? createAiToolSession({ now, createId: () => createId('approval') });
  const listeners = new Set<() => void>();
  const state: LocalSessionState = {
    snapshot: EMPTY_SNAPSHOT,
    active: false,
    ownerChannelId: null,
    ownerConnectedAt: null,
    messages: [],
    pendingClaim: null,
    cancelLeaseExpiry: null,
    stopListening: null,
  };

  const { waitForClaim, resolvePendingClaim, offerPendingMessage } = createLocalPendingClaims(
    state,
    { timers, claimNext },
  );
  const completedReplies = new Map<string, string>();
  const { handleRequest } = createLocalRequestHandler(state, {
    now,
    createId,
    timers,
    waitForClaim,
    getInstructions,
    toolSession,
    completedReplies,
    completedReplyKey,
    rememberCompletedReply,
    publish,
    connectedRequestFailure,
    noteActivity,
    claimNext,
    expireRun,
    recoverDisconnectedState,
    applyToolEffects,
  });

  function completedReplyKey(runId: string, messageId: string): string {
    return `${runId}\u0000${messageId}`;
  }

  function rememberCompletedReply(runId: string, messageId: string, content: string): void {
    completedReplies.set(completedReplyKey(runId, messageId), content);
    while (completedReplies.size > MAX_COMPLETED_REPLIES) {
      completedReplies.delete(completedReplies.keys().next().value as string);
    }
  }

  function publish(next: Omit<AiSessionSnapshot, 'revision'>): void {
    state.snapshot = { ...next, revision: state.snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  }

  function connectedRequestFailure(channelId: string, connectionId: string): AiBridgeResult | null {
    if (!state.active || state.snapshot.connection.status === 'disconnected') {
      return unavailableBridge('Lacuna AI is disabled or disconnected.');
    }
    if (
      (state.snapshot.connection.status !== 'connected' &&
        state.snapshot.connection.status !== 'quiet') ||
      state.ownerChannelId !== channelId ||
      state.snapshot.connection.connectionId !== connectionId
    ) {
      return {
        ok: false,
        error: { kind: 'forbidden', message: 'This companion does not own the AI session.' },
      };
    }
    return null;
  }

  function noteActivity(): void {
    if (
      state.snapshot.connection.status !== 'connected' &&
      state.snapshot.connection.status !== 'quiet'
    )
      return;
    publish({
      ...state.snapshot,
      connection: { ...state.snapshot.connection, status: 'connected', lastActivityAt: now() },
    });
  }

  function claimNext(connectionId: string, leaseMs: number): AiBridgeResult | null {
    if (state.snapshot.run?.status === 'active' || state.snapshot.run?.status === 'stop_requested')
      return null;
    const message = state.messages.find((candidate) => candidate.delivery === 'queued');
    if (!message) return null;
    const claimedAt = now();
    const runId = createId('run');
    const leaseExpiresAt = claimedAt + leaseMs;
    message.delivery = 'claimed';
    message.runId = runId;
    const run: AiRunState = {
      status: 'active',
      runId,
      conversationId: message.conversationId,
      messageId: message.messageId,
      claimedAt,
      leaseExpiresAt,
    };
    const existingItem = state.snapshot.items.some(
      (item) => item.kind === 'user' && item.id === message.messageId,
    );
    const items = existingItem
      ? state.snapshot.items.map((item) =>
          item.kind === 'user' && item.id === message.messageId
            ? { ...item, delivery: 'claimed' as const }
            : item,
        )
      : appendConversationItems(state.snapshot.items, {
          kind: 'user',
          id: message.messageId,
          content: message.content,
          createdAt: message.createdAt,
          delivery: 'claimed',
        });
    publish({
      ...state.snapshot,
      items,
      queuedFollowUp: existingItem ? state.snapshot.queuedFollowUp : null,
      run,
      activity: { runId, status: 'working', summary: 'Working', updatedAt: claimedAt },
    });
    state.cancelLeaseExpiry?.();
    state.cancelLeaseExpiry = timers.schedule(() => expireRun(runId), leaseMs);
    const claimed: AiClaimedMessage = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      runId,
      content: message.content,
      createdAt: message.createdAt,
      claimedAt,
      leaseExpiresAt,
    };
    void connectionId;
    return { ok: true, data: { type: 'message_claim', message: claimed } };
  }

  function expireRun(runId: string): void {
    state.cancelLeaseExpiry = null;
    const run = state.snapshot.run;
    if (!run || run.runId !== runId || (run.status !== 'active' && run.status !== 'stop_requested'))
      return;
    const expiredAt = now();
    if (run.status === 'stop_requested') {
      state.messages = state.messages.filter((message) => message.runId !== runId);
      toolSession.clear();
      publish({
        ...state.snapshot,
        items: state.snapshot.items.map((item) =>
          item.kind === 'user' && item.id === run.messageId
            ? { ...item, delivery: 'stopped' as const }
            : item,
        ),
        run: { ...run, status: 'expired', expiredAt },
        activity: {
          runId,
          status: 'failed',
          summary: 'Stop acknowledgement expired',
          updatedAt: expiredAt,
        },
        approval: null,
      });
      return;
    }
    const message = state.messages.find(
      (candidate) => candidate.runId === runId && candidate.delivery === 'claimed',
    );
    if (message) {
      message.delivery = 'queued';
      delete message.runId;
    }
    publish({
      ...state.snapshot,
      items: appendConversationItems(
        state.snapshot.items.map((item) =>
          item.kind === 'user' && item.id === run.messageId
            ? { ...item, delivery: 'queued' as const }
            : item,
        ),
        {
          kind: 'error',
          id: createId('error'),
          error: {
            kind: 'internal',
            message:
              'The terminal did not finish before the run lease expired. The message was queued again.',
          },
          createdAt: expiredAt,
        },
      ),
      run: { ...run, status: 'expired', expiredAt },
      activity: {
        runId,
        status: 'failed',
        summary: 'Run expired; message queued again',
        updatedAt: expiredAt,
      },
    });
  }

  function recoverDisconnectedState(reason?: string): void {
    const interrupted =
      state.snapshot.run?.status === 'active' || state.snapshot.run?.status === 'stop_requested'
        ? state.snapshot.run
        : null;
    const interruptedMessage = interrupted
      ? state.messages.find((message) => message.messageId === interrupted.messageId)
      : undefined;
    const unclaimedMessage = state.messages.find((message) => message.delivery === 'queued');
    const recoveredDraft =
      state.snapshot.queuedFollowUp ??
      (state.snapshot.draft || interruptedMessage?.content || unclaimedMessage?.content || '');
    state.cancelLeaseExpiry?.();
    state.cancelLeaseExpiry = null;
    resolvePendingClaim(unavailableBridge('The local AI companion disconnected.'));
    toolSession.clear();
    state.ownerChannelId = null;
    state.ownerConnectedAt = null;
    state.messages = [];
    publish({
      ...state.snapshot,
      connection: { status: 'disconnected', ...(reason ? { reason } : {}) },
      items: state.snapshot.items.map((item) =>
        item.kind === 'user' && (item.delivery === 'queued' || item.delivery === 'claimed')
          ? { ...item, delivery: 'stopped' as const }
          : item,
      ),
      run: interrupted
        ? { ...interrupted, status: 'expired', expiredAt: now() }
        : state.snapshot.run,
      activity: interrupted
        ? {
            runId: interrupted.runId,
            status: 'failed',
            summary: reason ?? 'Terminal disconnected',
            updatedAt: now(),
          }
        : null,
      approval: null,
      draft: recoveredDraft,
      queuedFollowUp: null,
    });
  }

  function applyToolEffects(runId: string, outcome: AiToolInvokeResult): void {
    const approval = outcome.effects.approval
      ? outcome.effects.approval
      : outcome.response.ok ||
          !['approval_required', 'approval_pending'].includes(outcome.response.error.kind)
        ? null
        : state.snapshot.approval;
    const activity = outcome.effects.activity
      ? { runId, ...outcome.effects.activity }
      : state.snapshot.activity;
    const receipt = outcome.effects.receipt;
    const items =
      receipt &&
      !state.snapshot.items.some(
        (item) =>
          item.kind === 'receipt' &&
          (item.receipt.receiptId === receipt.receiptId || item.receipt.callId === receipt.callId),
      )
        ? appendConversationItems(state.snapshot.items, {
            kind: 'receipt',
            id: receipt.receiptId,
            receipt,
          })
        : state.snapshot.items;
    publish({ ...state.snapshot, approval, activity, items });
  }

  function clearForReplacement(): void {
    state.cancelLeaseExpiry?.();
    state.cancelLeaseExpiry = null;
    resolvePendingClaim(unavailableBridge('Lacuna data is being replaced.'));
    toolSession.clear();
    state.ownerChannelId = null;
    state.ownerConnectedAt = null;
    state.messages = [];
    completedReplies.clear();
    state.snapshot = { ...EMPTY_SNAPSHOT, revision: state.snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  }

  return {
    replacementParticipant: {
      invalidate: () => recoverDisconnectedState('Lacuna data is being replaced.'),
      quiesce: async () => recoverDisconnectedState('Lacuna data is being replaced.'),
      clear: clearForReplacement,
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
      if (
        state.snapshot.connection.status === 'disconnected' &&
        state.snapshot.connection.reason === 'AI was disabled.'
      ) {
        publish({ ...state.snapshot, connection: { status: 'disconnected' } });
      }
      state.stopListening = options.source.listen(handleRequest, (channelId) => {
        if (channelId === state.ownerChannelId) recoverDisconnectedState('Terminal disconnected');
      });
    },
    dispose() {
      if (!state.active) return;
      state.active = false;
      state.stopListening?.();
      state.stopListening = null;
      recoverDisconnectedState('AI was disabled.');
    },
    async pair() {
      return unavailableCommand(
        'The desktop AI companion connects directly; no pairing code is required.',
      );
    },
    async send(content) {
      if (
        state.snapshot.connection.status !== 'connected' &&
        state.snapshot.connection.status !== 'quiet'
      ) {
        return unavailableCommand('AI is not connected.');
      }
      if (state.snapshot.run?.status === 'stop_requested') {
        return conflictCommand('Wait for AI to stop before sending another message.');
      }
      if (content.trim() === '') return conflictCommand('The AI message cannot be blank.');
      if (content.length > MAX_AI_MESSAGE_LENGTH)
        return conflictCommand('The AI message is too long.');
      const messageId = createId('message');
      const conversationId = state.snapshot.conversationId ?? createId('conversation');
      const createdAt = now();
      const message: LocalMessage = {
        messageId,
        conversationId,
        content,
        createdAt,
        instructions: getInstructions(),
        delivery: 'queued',
      };
      const running = state.snapshot.run?.status === 'active';
      if (running && state.snapshot.queuedFollowUp) {
        const previous = state.messages.find(
          (candidate) =>
            candidate.delivery === 'queued' && candidate.content === state.snapshot.queuedFollowUp,
        );
        if (previous) state.messages = state.messages.filter((candidate) => candidate !== previous);
      }
      state.messages.push(message);
      publish(
        running
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
      offerPendingMessage();
      return { ok: true, data: { messageId } };
    },
    async stop(runId) {
      const run = state.snapshot.run;
      if (!run || run.runId !== runId || run.status !== 'active') {
        return conflictCommand('That AI run is no longer active.');
      }
      const stopRequestedAt = now();
      toolSession.clear();
      const queued = state.messages.find(
        (message) =>
          message.delivery === 'queued' && message.content === state.snapshot.queuedFollowUp,
      );
      if (queued) state.messages = state.messages.filter((message) => message !== queued);
      publish({
        ...state.snapshot,
        draft: state.snapshot.queuedFollowUp ?? state.snapshot.draft,
        queuedFollowUp: null,
        run: { ...run, status: 'stop_requested', stopRequestedAt },
        approval: null,
        activity: {
          runId,
          status: 'stop_requested',
          summary: 'Stop requested',
          updatedAt: stopRequestedAt,
        },
      });
      return { ok: true, data: undefined };
    },
    async decide(approvalId, approved) {
      const pendingApproval = state.snapshot.approval;
      const run = state.snapshot.run;
      if (
        !pendingApproval ||
        pendingApproval.approvalId !== approvalId ||
        pendingApproval.status !== 'pending' ||
        !run ||
        run.status !== 'active'
      ) {
        return conflictCommand('That approval is no longer pending.');
      }
      const decision = await toolSession.decide(approvalId, approved);
      if (!decision.ok) {
        const message =
          decision.error.kind === 'tool' ? decision.error.error.message : decision.error.message;
        return conflictCommand(message);
      }
      if (
        state.snapshot.run?.runId !== run.runId ||
        state.snapshot.run.status !== 'active' ||
        state.snapshot.approval?.approvalId !== approvalId ||
        state.snapshot.approval.status !== 'pending'
      ) {
        return conflictCommand('That approval is no longer pending.');
      }
      publish({
        ...state.snapshot,
        approval: decision.approval,
        activity:
          decision.effects.activity && state.snapshot.run
            ? { runId: state.snapshot.run.runId, ...decision.effects.activity }
            : state.snapshot.activity,
      });
      return { ok: true, data: undefined };
    },
    async resetConnection() {
      const disconnectedChannelId = state.ownerChannelId;
      recoverDisconnectedState();
      if (disconnectedChannelId) options.source.disconnect?.(disconnectedChannelId);
      return { ok: true, data: undefined };
    },
  };
}

type CommandFailure = Extract<AiSessionCommandResult<never>, { ok: false }>;

function unavailableCommand(message: string): CommandFailure {
  return { ok: false, error: { kind: 'unavailable', message } };
}

function conflictCommand(message: string): CommandFailure {
  return { ok: false, error: { kind: 'conflict', message } };
}

function browserTimers(): LocalAiSessionTimers {
  return {
    schedule(task, delayMs) {
      const handle = globalThis.setTimeout(task, delayMs);
      return () => globalThis.clearTimeout(handle);
    },
  };
}
