import {
  LACUNA_AI_PROTOCOL_VERSION,
  type AiBridgeRequest,
  type AiBridgeResult,
  type AiInstructionBundle,
  type AiRunState,
} from '../protocol';
import type { AiToolSession, AiToolInvokeResult } from '../toolSession';
import type { LocalAiSessionTimers } from './local';
import type { LocalSessionState } from './localSessionState';
import type { AiSessionSnapshot } from './types';
import {
  DEFAULT_CLAIM_LEASE_MS,
  stoppedOrConflict,
  unavailableBridge,
  conflictBridge,
} from './localSessionState';
import { appendConversationItems } from './relayEvents';

interface LocalRequestOperations {
  timers: LocalAiSessionTimers;
  now(): number;
  createId(prefix: string): string;
  waitForClaim(
    channelId: string,
    request: Extract<AiBridgeRequest, { type: 'claim_message' }>,
  ): Promise<AiBridgeResult>;
  getInstructions(): AiInstructionBundle;
  toolSession: AiToolSession;
  completedReplies: Map<string, string>;
  completedReplyKey(runId: string, messageId: string): string;
  rememberCompletedReply(runId: string, messageId: string, content: string): void;
  publish(next: Omit<AiSessionSnapshot, 'revision'>): void;
  connectedRequestFailure(channelId: string, connectionId: string): AiBridgeResult | null;
  noteActivity(): void;
  claimNext(connectionId: string, leaseMs: number): AiBridgeResult | null;
  expireRun(runId: string): void;
  recoverDisconnectedState(reason?: string): void;
  applyToolEffects(runId: string, outcome: AiToolInvokeResult): void;
}

export function createLocalRequestHandler(
  state: Pick<
    LocalSessionState,
    | 'snapshot'
    | 'active'
    | 'ownerChannelId'
    | 'ownerConnectedAt'
    | 'messages'
    | 'pendingClaim'
    | 'cancelLeaseExpiry'
  >,
  {
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
  }: LocalRequestOperations,
) {
  async function handleRequest(
    channelId: string,
    request: AiBridgeRequest,
  ): Promise<AiBridgeResult> {
    try {
      if (!state.active) return unavailableBridge('Lacuna AI is disabled.');
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
        if (state.ownerChannelId || state.snapshot.connection.status !== 'disconnected') {
          return {
            ok: false,
            error: { kind: 'conflict', message: 'An AI companion is already connected.' },
          };
        }
        toolSession.clear();
        state.ownerChannelId = channelId;
        const connectedAt = now();
        state.ownerConnectedAt = connectedAt;
        const connectionId = createId('connection');
        publish({
          ...state.snapshot,
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
          const claimed = state.snapshot.run
            ? state.messages.find(
                (message) =>
                  message.delivery === 'claimed' && message.runId === state.snapshot.run?.runId,
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
          if (
            state.snapshot.run?.status === 'active' ||
            state.snapshot.run?.status === 'stop_requested'
          ) {
            return { ok: true, data: { type: 'message_claim', message: null } };
          }
          if (state.pendingClaim) {
            return {
              ok: false,
              error: { kind: 'conflict', message: 'A message wait is already pending.' },
            };
          }
          return await waitForClaim(channelId, request);
        }
        case 'list_pending':
          return {
            ok: true,
            data: {
              type: 'pending_messages',
              messages: state.messages
                .filter((message) => message.delivery === 'queued')
                .map(
                  ({
                    instructions: _instructions,
                    delivery: _delivery,
                    runId: _runId,
                    ...message
                  }) => message,
                ),
            },
          };
        case 'get_run':
          return state.snapshot.run?.runId === request.runId
            ? { ok: true, data: { type: 'run_state', run: state.snapshot.run } }
            : conflictBridge('That AI run is no longer available.');
        case 'renew_lease': {
          const run = state.snapshot.run;
          if (!run || run.runId !== request.runId || run.status !== 'active') {
            return stoppedOrConflict(request.runId, run);
          }
          const renewedAt = now();
          if (renewedAt >= run.leaseExpiresAt) {
            expireRun(run.runId);
            return conflictBridge('That AI run lease has expired.');
          }
          const leaseMs = request.leaseMs ?? DEFAULT_CLAIM_LEASE_MS;
          const leaseExpiresAt = renewedAt + leaseMs;
          const renewedRun: AiRunState = { ...run, leaseExpiresAt };
          state.cancelLeaseExpiry?.();
          state.cancelLeaseExpiry = timers.schedule(() => expireRun(run.runId), leaseMs);
          publish({ ...state.snapshot, run: renewedRun });
          return {
            ok: true,
            data: { type: 'lease_renewed', runId: run.runId, leaseExpiresAt },
          };
        }
        case 'acknowledge_stop': {
          const run = state.snapshot.run;
          if (!run || run.runId !== request.runId || run.status !== 'stop_requested') {
            return conflictBridge('That AI run is not awaiting Stop acknowledgement.');
          }
          const stoppedAt = now();
          state.cancelLeaseExpiry?.();
          state.cancelLeaseExpiry = null;
          state.messages = state.messages.filter((message) => message.runId !== request.runId);
          publish({
            ...state.snapshot,
            items: state.snapshot.items.map((item) =>
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
          const run = state.snapshot.run;
          if (!run || run.runId !== request.runId || run.status !== 'active') {
            return stoppedOrConflict(request.runId, run);
          }
          publish({
            ...state.snapshot,
            activity: {
              runId: run.runId,
              status: request.activity.status === 'working' ? 'working' : 'completed',
              summary:
                request.activity.summary ??
                (request.activity.status === 'idle' ? 'Idle' : 'Working'),
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
            state.snapshot.run?.runId === request.runId ? state.snapshot.run.status : 'expired';
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
          const completedContent = completedReplies.get(
            completedReplyKey(request.runId, request.messageId),
          );
          if (completedContent !== undefined) {
            return completedContent === request.reply.content
              ? {
                  ok: true,
                  data: { type: 'reply_recorded', messageId: request.messageId },
                }
              : conflictBridge('That AI reply was already recorded with different content.');
          }
          const run = state.snapshot.run;
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
          state.cancelLeaseExpiry?.();
          state.cancelLeaseExpiry = null;
          state.messages = state.messages.filter(
            (message) => message.messageId !== request.messageId,
          );
          rememberCompletedReply(request.runId, request.messageId, request.reply.content);
          publish({
            ...state.snapshot,
            items: appendConversationItems(
              state.snapshot.items.map((item) =>
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
          const connection = state.snapshot.connection;
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
                  connectedAt: state.ownerConnectedAt ?? connection.lastActivityAt,
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
  return { handleRequest };
}
