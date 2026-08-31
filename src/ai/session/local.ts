import {
  LACUNA_AI_PROTOCOL_VERSION,
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_WAIT_MS,
  type AiBridgeRequest,
  type AiBridgeResult,
  type AiClaimedMessage,
  type AiInstructionBundle,
  type AiRunState,
  type AiUserMessage,
} from '../protocol';
import { buildAiInstructionBundle } from '../instructions';
import { createAiToolSession, type AiToolInvokeResult, type AiToolSession } from '../toolSession';
import type { ReplacementParticipant } from '../../db/replacementLifecycle';
import { appendConversationItems } from './relayEvents';
import type { AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';

const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000;

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

interface LocalMessage extends AiUserMessage {
  instructions: AiInstructionBundle;
  delivery: 'queued' | 'claimed';
  runId?: string;
}

export interface LocalAiRequestSource {
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

interface PendingClaim {
  channelId: string;
  connectionId: string;
  leaseMs: number;
  resolve: (result: AiBridgeResult) => void;
  cancelTimeout: () => void;
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
  let snapshot = EMPTY_SNAPSHOT;
  let active = false;
  let ownerChannelId: string | null = null;
  let ownerConnectedAt: number | null = null;
  let messages: LocalMessage[] = [];
  let pendingClaim: PendingClaim | null = null;
  let cancelLeaseExpiry: (() => void) | null = null;
  let stopListening: (() => void) | null = null;

  function publish(next: Omit<AiSessionSnapshot, 'revision'>): void {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  }

  function connectedRequestFailure(channelId: string, connectionId: string): AiBridgeResult | null {
    if (!active || snapshot.connection.status === 'disconnected') {
      return unavailableBridge('Lacuna AI is disabled or disconnected.');
    }
    if (
      (snapshot.connection.status !== 'connected' && snapshot.connection.status !== 'quiet') ||
      ownerChannelId !== channelId ||
      snapshot.connection.connectionId !== connectionId
    ) {
      return {
        ok: false,
        error: { kind: 'forbidden', message: 'This companion does not own the AI session.' },
      };
    }
    return null;
  }

  function noteActivity(): void {
    if (snapshot.connection.status !== 'connected' && snapshot.connection.status !== 'quiet') return;
    publish({
      ...snapshot,
      connection: { ...snapshot.connection, status: 'connected', lastActivityAt: now() },
    });
  }

  function claimNext(connectionId: string, leaseMs: number): AiBridgeResult | null {
    if (snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested') return null;
    const message = messages.find((candidate) => candidate.delivery === 'queued');
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
    const existingItem = snapshot.items.some(
      (item) => item.kind === 'user' && item.id === message.messageId,
    );
    const items = existingItem
      ? snapshot.items.map((item) =>
          item.kind === 'user' && item.id === message.messageId
            ? { ...item, delivery: 'claimed' as const }
            : item,
        )
      : appendConversationItems(snapshot.items, {
          kind: 'user',
          id: message.messageId,
          content: message.content,
          createdAt: message.createdAt,
          delivery: 'claimed',
        });
    publish({
      ...snapshot,
      items,
      queuedFollowUp: existingItem ? snapshot.queuedFollowUp : null,
      run,
      activity: { runId, status: 'working', summary: 'Working', updatedAt: claimedAt },
    });
    cancelLeaseExpiry?.();
    cancelLeaseExpiry = timers.schedule(() => expireRun(runId), leaseMs);
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
    cancelLeaseExpiry = null;
    const run = snapshot.run;
    if (
      !run ||
      run.runId !== runId ||
      (run.status !== 'active' && run.status !== 'stop_requested')
    )
      return;
    const expiredAt = now();
    if (run.status === 'stop_requested') {
      messages = messages.filter((message) => message.runId !== runId);
      toolSession.clear();
      publish({
        ...snapshot,
        items: snapshot.items.map((item) =>
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
    const message = messages.find(
      (candidate) => candidate.runId === runId && candidate.delivery === 'claimed',
    );
    if (message) {
      message.delivery = 'queued';
      delete message.runId;
    }
    publish({
      ...snapshot,
      items: appendConversationItems(
        snapshot.items.map((item) =>
          item.kind === 'user' && item.id === run.messageId
            ? { ...item, delivery: 'queued' as const }
            : item,
        ),
        {
          kind: 'error',
          id: createId('error'),
          error: {
            kind: 'internal',
            message: 'The terminal did not finish before the run lease expired. The message was queued again.',
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

  function resolvePendingClaim(result: AiBridgeResult): void {
    const pending = pendingClaim;
    if (!pending) return;
    pendingClaim = null;
    pending.cancelTimeout();
    pending.resolve(result);
  }

  function offerPendingMessage(): void {
    const pending = pendingClaim;
    if (!pending) return;
    const claimed = claimNext(pending.connectionId, pending.leaseMs);
    if (claimed) resolvePendingClaim(claimed);
  }

  function recoverDisconnectedState(reason?: string): void {
    const interrupted =
      snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested'
        ? snapshot.run
        : null;
    const interruptedMessage = interrupted
      ? messages.find((message) => message.messageId === interrupted.messageId)
      : undefined;
    const recoveredDraft =
      snapshot.queuedFollowUp ?? (snapshot.draft || interruptedMessage?.content || '');
    cancelLeaseExpiry?.();
    cancelLeaseExpiry = null;
    resolvePendingClaim(unavailableBridge('The local AI companion disconnected.'));
    toolSession.clear();
    ownerChannelId = null;
    ownerConnectedAt = null;
    messages = [];
    publish({
      ...snapshot,
      connection: { status: 'disconnected', ...(reason ? { reason } : {}) },
      items: snapshot.items.map((item) =>
        item.kind === 'user' && (item.delivery === 'queued' || item.delivery === 'claimed')
          ? { ...item, delivery: 'stopped' as const }
          : item,
      ),
      run: interrupted ? { ...interrupted, status: 'expired', expiredAt: now() } : snapshot.run,
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

  async function handleRequest(
    channelId: string,
    request: AiBridgeRequest,
  ): Promise<AiBridgeResult> {
    try {
      if (!active) return unavailableBridge('Lacuna AI is disabled.');
      if (request.type === 'connect') {
        if (request.protocolVersion !== LACUNA_AI_PROTOCOL_VERSION) {
          return {
            ok: false,
            error: {
              kind: 'version_mismatch',
              message: 'The local AI companion protocol version is not supported.',
              supportedVersion: LACUNA_AI_PROTOCOL_VERSION,
            },
          };
        }
        if (ownerChannelId || snapshot.connection.status !== 'disconnected') {
          return { ok: false, error: { kind: 'conflict', message: 'An AI companion is already connected.' } };
        }
        toolSession.clear();
        ownerChannelId = channelId;
        const connectedAt = now();
        ownerConnectedAt = connectedAt;
        const connectionId = createId('connection');
        publish({
          ...snapshot,
          connection: {
            status: 'connected',
            connectionId,
            client: request.client,
            lastActivityAt: connectedAt,
          },
          approval: null,
        });
        return {
          ok: true,
          data: {
            type: 'connection',
            connectionId,
            client: request.client,
            connectedAt,
          },
        };
      }

      const failure = connectedRequestFailure(channelId, request.connectionId);
      if (failure) return failure;
      noteActivity();

      switch (request.type) {
        case 'get_instructions': {
          const claimed = snapshot.run
            ? messages.find(
                (message) =>
                  message.delivery === 'claimed' && message.runId === snapshot.run?.runId,
              )
            : undefined;
          return { ok: true, data: claimed?.instructions ?? getInstructions() };
        }
        case 'claim_message': {
          const claimed = claimNext(
            request.connectionId,
            request.leaseMs ?? DEFAULT_CLAIM_LEASE_MS,
          );
          if (claimed) return claimed;
          if (snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested') {
            return { ok: true, data: { type: 'message_claim', message: null } };
          }
          if (pendingClaim) {
            return { ok: false, error: { kind: 'conflict', message: 'A message wait is already pending.' } };
          }
          return await new Promise<AiBridgeResult>((resolve) => {
            const timeoutMs = request.timeoutMs ?? MAX_AI_WAIT_MS;
            const cancelTimeout = timers.schedule(() => {
              if (pendingClaim?.resolve !== resolve) return;
              pendingClaim = null;
              resolve({ ok: true, data: { type: 'message_claim', message: null } });
            }, timeoutMs);
            pendingClaim = {
              channelId,
              connectionId: request.connectionId,
              leaseMs: request.leaseMs ?? DEFAULT_CLAIM_LEASE_MS,
              resolve,
              cancelTimeout,
            };
          });
        }
        case 'list_pending':
          return {
            ok: true,
            data: {
              type: 'pending_messages',
              messages: messages
                .filter((message) => message.delivery === 'queued')
                .map(({ instructions: _instructions, delivery: _delivery, runId: _runId, ...message }) => message),
            },
          };
        case 'get_run':
          return snapshot.run?.runId === request.runId
            ? { ok: true, data: { type: 'run_state', run: snapshot.run } }
            : conflictBridge('That AI run is no longer available.');
        case 'acknowledge_stop': {
          const run = snapshot.run;
          if (!run || run.runId !== request.runId || run.status !== 'stop_requested') {
            return conflictBridge('That AI run is not awaiting Stop acknowledgement.');
          }
          const stoppedAt = now();
          cancelLeaseExpiry?.();
          cancelLeaseExpiry = null;
          messages = messages.filter((message) => message.runId !== request.runId);
          publish({
            ...snapshot,
            items: snapshot.items.map((item) =>
              item.kind === 'user' && item.id === run.messageId
                ? { ...item, delivery: 'stopped' as const }
                : item,
            ),
            run: { ...run, status: 'stopped', stoppedAt },
            activity: {
              runId: run.runId,
              status: 'completed',
              summary: 'Stopped',
              detail: 'Further AI bridge actions are blocked. Completed changes remain.',
              updatedAt: stoppedAt,
            },
          });
          return { ok: true, data: { type: 'stop_acknowledged', runId: run.runId } };
        }
        case 'set_activity': {
          const run = snapshot.run;
          if (!run || run.runId !== request.runId || run.status !== 'active') {
            return stoppedOrConflict(request.runId, run);
          }
          publish({
            ...snapshot,
            activity: {
              runId: run.runId,
              status: request.activity.status === 'working' ? 'working' : 'completed',
              summary: request.activity.summary ?? (request.activity.status === 'idle' ? 'Idle' : 'Working'),
              ...(request.activity.status === 'working' && request.activity.detail
                ? { detail: request.activity.detail }
                : {}),
              updatedAt: now(),
            },
          });
          return { ok: true, data: { type: 'activity_recorded', runId: run.runId } };
        }
        case 'invoke_tool': {
          const runStatus =
            snapshot.run?.runId === request.runId ? snapshot.run.status : 'expired';
          const outcome = await toolSession.invoke({
            connectionId: request.connectionId,
            runId: request.runId,
            runStatus,
            callId: request.callId,
            toolName: request.call.name,
            input: request.call.input,
          });
          applyToolEffects(request.runId, outcome);
          return outcome.response.ok
            ? {
                ok: true,
                data: {
                  type: 'tool_result',
                  callId: request.callId,
                  result: outcome.response.result,
                  ...(outcome.effects.receipt ? { receipt: outcome.effects.receipt } : {}),
                },
              }
            : { ok: false, error: outcome.response.error };
        }
        case 'reply': {
          const run = snapshot.run;
          if (
            !run ||
            run.runId !== request.runId ||
            run.messageId !== request.messageId ||
            run.status !== 'active'
          ) {
            return stoppedOrConflict(request.runId, run);
          }
          const completedAt = now();
          if (completedAt >= run.leaseExpiresAt) {
            expireRun(run.runId);
            return conflictBridge('That AI run lease has expired.');
          }
          cancelLeaseExpiry?.();
          cancelLeaseExpiry = null;
          messages = messages.filter((message) => message.messageId !== request.messageId);
          publish({
            ...snapshot,
            items: appendConversationItems(
              snapshot.items.map((item) =>
                item.kind === 'user' && item.id === request.messageId
                  ? { ...item, delivery: 'completed' as const }
                  : item,
              ),
              {
                kind: 'assistant',
                id: createId('assistant'),
                content: request.reply.content,
                createdAt: completedAt,
                sources: request.reply.sources ?? [],
              },
            ),
            run: { ...run, status: 'completed', completedAt },
            activity: {
              runId: run.runId,
              status: 'completed',
              summary: 'Done',
              updatedAt: completedAt,
            },
          });
          return { ok: true, data: { type: 'reply_recorded', messageId: request.messageId } };
        }
        case 'heartbeat': {
          const connection = snapshot.connection;
          if (connection.status !== 'connected' && connection.status !== 'quiet') {
            return unavailableBridge('Lacuna AI is disconnected.');
          }
          return {
            ok: true,
            data: {
              type: 'connection_state',
              state: {
                status: 'connected',
                connection: {
                  type: 'connection',
                  connectionId: connection.connectionId,
                  client: connection.client,
                  connectedAt: ownerConnectedAt ?? connection.lastActivityAt,
                },
                lastActivityAt: connection.lastActivityAt,
              },
            },
          };
        }
        case 'disconnect':
          recoverDisconnectedState();
          return { ok: true, data: { type: 'disconnected' } };
      }
    } catch {
      return { ok: false, error: { kind: 'internal', message: 'The local AI request failed.' } };
    }
  }

  function applyToolEffects(runId: string, outcome: AiToolInvokeResult): void {
    const approval = outcome.effects.approval
      ? outcome.effects.approval
      : outcome.response.ok ||
          !['approval_required', 'approval_pending'].includes(outcome.response.error.kind)
        ? null
        : snapshot.approval;
    const activity = outcome.effects.activity
      ? { runId, ...outcome.effects.activity }
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
    publish({ ...snapshot, approval, activity, items });
  }

  function clearForReplacement(): void {
    cancelLeaseExpiry?.();
    cancelLeaseExpiry = null;
    resolvePendingClaim(unavailableBridge('Lacuna data is being replaced.'));
    toolSession.clear();
    ownerChannelId = null;
    ownerConnectedAt = null;
    messages = [];
    snapshot = { ...EMPTY_SNAPSHOT, revision: snapshot.revision + 1 };
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
      return snapshot;
    },
    activate() {
      if (active) return;
      active = true;
      if (
        snapshot.connection.status === 'disconnected' &&
        snapshot.connection.reason === 'AI was disabled.'
      ) {
        publish({ ...snapshot, connection: { status: 'disconnected' } });
      }
      stopListening = options.source.listen(handleRequest, (channelId) => {
        if (channelId === ownerChannelId) recoverDisconnectedState('Terminal disconnected');
      });
    },
    dispose() {
      if (!active) return;
      active = false;
      stopListening?.();
      stopListening = null;
      recoverDisconnectedState('AI was disabled.');
    },
    async pair() {
      return unavailableCommand(
        'The desktop AI companion connects directly; no pairing code is required.',
      );
    },
    async send(content) {
      if (snapshot.connection.status !== 'connected' && snapshot.connection.status !== 'quiet') {
        return unavailableCommand('AI is not connected.');
      }
      if (snapshot.run?.status === 'stop_requested') {
        return conflictCommand('Wait for AI to stop before sending another message.');
      }
      if (content.trim() === '') return conflictCommand('The AI message cannot be blank.');
      if (content.length > MAX_AI_MESSAGE_LENGTH) return conflictCommand('The AI message is too long.');
      const messageId = createId('message');
      const conversationId = snapshot.conversationId ?? createId('conversation');
      const createdAt = now();
      const message: LocalMessage = {
        messageId,
        conversationId,
        content,
        createdAt,
        instructions: getInstructions(),
        delivery: 'queued',
      };
      const running = snapshot.run?.status === 'active';
      if (running && snapshot.queuedFollowUp) {
        const previous = messages.find(
          (candidate) => candidate.delivery === 'queued' && candidate.content === snapshot.queuedFollowUp,
        );
        if (previous) messages = messages.filter((candidate) => candidate !== previous);
      }
      messages.push(message);
      publish(
        running
          ? { ...snapshot, conversationId, draft: '', queuedFollowUp: content }
          : {
              ...snapshot,
              conversationId,
              draft: '',
              items: appendConversationItems(snapshot.items, {
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
      const run = snapshot.run;
      if (!run || run.runId !== runId || run.status !== 'active') {
        return conflictCommand('That AI run is no longer active.');
      }
      const stopRequestedAt = now();
      toolSession.clear();
      const queued = messages.find(
        (message) => message.delivery === 'queued' && message.content === snapshot.queuedFollowUp,
      );
      if (queued) messages = messages.filter((message) => message !== queued);
      publish({
        ...snapshot,
        draft: snapshot.queuedFollowUp ?? snapshot.draft,
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
      const pendingApproval = snapshot.approval;
      const run = snapshot.run;
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
        snapshot.run?.runId !== run.runId ||
        snapshot.run.status !== 'active' ||
        snapshot.approval?.approvalId !== approvalId ||
        snapshot.approval.status !== 'pending'
      ) {
        return conflictCommand('That approval is no longer pending.');
      }
      publish({
        ...snapshot,
        approval: decision.approval,
        activity:
          decision.effects.activity && snapshot.run
            ? { runId: snapshot.run.runId, ...decision.effects.activity }
            : snapshot.activity,
      });
      return { ok: true, data: undefined };
    },
    async resetConnection() {
      recoverDisconnectedState();
      return { ok: true, data: undefined };
    },
  };
}

function stoppedOrConflict(runId: string, run: AiRunState | null): AiBridgeResult {
  if (run?.runId === runId && run.status !== 'active') {
    return {
      ok: false,
      error: { kind: 'stopped', runId, message: 'Stop was requested for this AI run.' },
    };
  }
  return conflictBridge('That AI run is no longer active.');
}

function unavailableBridge(message: string): AiBridgeResult {
  return {
    ok: false,
    error: { kind: 'unavailable', reason: 'disconnected', message },
  };
}

function conflictBridge(message: string): AiBridgeResult {
  return { ok: false, error: { kind: 'conflict', message } };
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
