import { buildAiInstructionBundle, AI_TEACHING_INSTRUCTION_VERSION } from '../instructions';
import { MAX_AI_TOOL_INPUT_BYTES, type AiRunState } from '../protocol';
import { createAiToolSession, type AiToolSession, type AiToolWireResponse } from '../toolSession';
import { normaliseJsonValue } from '../toolSession/state';
import { HOSTED_PROTOCOL_VERSION, type HostedEvent, type HostedRequest } from '../hostedProtocol';
import type { ReplacementParticipant } from '../../db/replacementLifecycle';
import { appendConversationItems } from './relayEvents';
import { budgetHostedRequest } from './hostedRequestBudget';
import { HOSTED_ACCESS_STORAGE_KEY, createHostedTransport, type HostedTransport } from './hostedTransport';
import {
  HOSTED_SESSION_STORAGE_KEY,
  loadHostedState,
  saveHostedState,
  type HostedSessionStorage,
} from './hostedPersistence';
import type { AiConversationItem, AiSession, AiSessionCommandResult, AiSessionSnapshot } from './types';

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

export interface HostedAiSessionOptions {
  transport?: HostedTransport;
  storage?: HostedSessionStorage;
  toolSession?: AiToolSession;
  now?: () => number;
  createId?: (prefix: string) => string;
  getInstructions?: () => ReturnType<typeof buildAiInstructionBundle>;
  acquireOwnership?: () => Promise<(() => void) | null>;
}

export interface HostedAiSession extends AiSession {
  readonly provider: 'hosted';
  readonly replacementParticipant: ReplacementParticipant;
}

async function browserOwnership(): Promise<(() => void) | null> {
  if (!navigator.locks) return null;
  let finish: (() => void) | null = null;
  let resolveAcquired: (release: (() => void) | null) => void;
  const acquired = new Promise<(() => void) | null>((resolve) => { resolveAcquired = resolve; });
  void navigator.locks.request('lacuna-hosted-ai', { ifAvailable: true }, async (lock) => {
    if (!lock) {
      resolveAcquired(null);
      return;
    }
    await new Promise<void>((resolve) => {
      finish = resolve;
      resolveAcquired(() => finish?.());
    });
  });
  return acquired;
}

function failure(kind: 'unavailable' | 'conflict' | 'internal', message: string) {
  return { ok: false as const, error: { kind, message } };
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Built-in AI is unavailable. Try again later.';
}

function boundedToolResponse(response: AiToolWireResponse): AiToolWireResponse {
  const normalised = normaliseJsonValue(response);
  if (normalised && new TextEncoder().encode(JSON.stringify(normalised)).byteLength <= MAX_AI_TOOL_INPUT_BYTES) {
    return response;
  }
  return { ok: false, error: { kind: 'internal', message: 'The tool result is too large. The action may have committed; do not repeat it.' } };
}

export function createHostedAiSession(options: HostedAiSessionOptions = {}): HostedAiSession {
  const storage = options.storage ?? globalThis.localStorage;
  const transport = options.transport ?? createHostedTransport();
  const now = options.now ?? Date.now;
  const createId = options.createId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);
  const getInstructions = options.getInstructions ?? (() => buildAiInstructionBundle({ misconceptionFirstEnabled: true }));
  const toolSession = options.toolSession ?? createAiToolSession({ now, createId: () => createId('approval') });
  const restored = loadHostedState(storage);
  if (restored) toolSession.restoreState(restored.toolState);
  let snapshot: AiSessionSnapshot = restored
    ? { ...EMPTY_SNAPSHOT, conversationId: restored.conversationId, items: restored.items,
        draft: restored.draft, queuedFollowUp: restored.queuedFollowUp }
    : EMPTY_SNAPSHOT;
  const listeners = new Set<() => void>();
  let active = false;
  let owner = false;
  let releaseOwnership: (() => void) | null = null;
  let token: string | null = null;
  let tokenExpiresAt = 0;
  let abort: AbortController | null = null;
  let epoch = 0;
  let pendingDecision: ((approved: boolean) => void) | null = null;
  let running: Promise<void> | null = null;
  let invalidated = false;

  function persist(): void {
    if (!owner) return;
    saveHostedState(storage, {
      conversationId: snapshot.conversationId,
      items: [...snapshot.items],
      draft: snapshot.draft,
      queuedFollowUp: snapshot.queuedFollowUp,
      approval: snapshot.approval,
      toolState: toolSession.exportState(),
    });
  }

  function publish(next: Omit<AiSessionSnapshot, 'revision'>): void {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    persist();
    listeners.forEach((listener) => listener());
  }

  function interrupt(): void {
    epoch += 1;
    abort?.abort();
    abort = null;
    pendingDecision?.(false);
    pendingDecision = null;
    const run = snapshot.run;
    if (!run || run.status !== 'active') return;
    const time = now();
    publish({
      ...snapshot,
      items: snapshot.items.map((item) => {
        if (item.kind === 'assistant' && item.progress === 'streaming') return { ...item, progress: 'interrupted' as const };
        if (item.kind === 'user' && item.id === run.messageId) return { ...item, delivery: 'stopped' as const };
        return item;
      }),
      run: { ...run, status: 'stopped', stopRequestedAt: time, stoppedAt: time },
      approval: null,
      activity: { runId: run.runId, status: 'failed', summary: 'Response stopped', updatedAt: time },
      draft: snapshot.queuedFollowUp ?? snapshot.draft,
      queuedFollowUp: null,
    });
  }

  async function connect(credential: string): Promise<AiSessionCommandResult> {
    if (!active || !owner || invalidated) return failure('unavailable', 'This tab does not own built-in AI.');
    try {
      const session = await transport.exchange(credential);
      if (!active || !owner || invalidated) return failure('unavailable', 'Built-in AI was closed.');
      token = session.token;
      tokenExpiresAt = session.expiresAt;
      storage.setItem(HOSTED_ACCESS_STORAGE_KEY, credential);
      publish({ ...snapshot, connection: { status: 'hosted', lastActivityAt: now() } });
      return { ok: true, data: undefined };
    } catch (error) {
      publish({ ...snapshot, connection: { status: 'disconnected', reason: readableError(error) } });
      return failure('unavailable', readableError(error));
    }
  }

  async function freshToken(): Promise<string> {
    if (token && tokenExpiresAt > now() + 60_000) return token;
    const credential = storage.getItem(HOSTED_ACCESS_STORAGE_KEY);
    if (!credential) throw new Error('Enter your AI access code in Settings.');
    const session = await transport.exchange(credential);
    token = session.token;
    tokenExpiresAt = session.expiresAt;
    return token;
  }

  function priorMessages(messageId: string): HostedRequest['messages'] {
    const conversational = snapshot.items
      .filter((item): item is Extract<AiConversationItem, { kind: 'user' | 'assistant' }> =>
        (item.kind === 'user' && item.delivery !== 'stopped') ||
        (item.kind === 'assistant' && item.progress !== 'interrupted' && item.content.length > 0))
      .slice(-12);
    const firstUser = conversational.findIndex((item) => item.kind === 'user');
    const relevant = firstUser < 0 ? [] : conversational.slice(firstUser);
    const messages = relevant.map((item) => ({
      role: item.kind === 'user' ? 'user' as const : 'assistant' as const,
      content: item.content.slice(0, 12_000),
    }));
    if (!relevant.some((item) => item.id === messageId)) throw new Error('The AI message is unavailable.');
    return messages;
  }

  async function runTurn(run: AiRunState & { status: 'active' }, runEpoch: number): Promise<void> {
    const controller = new AbortController();
    abort = controller;
    let messages = priorMessages(run.messageId);
    let assistantId: string | null = null;
    let assistantText = '';
    let step = 0;
    const seenCallIds = new Set<string>();
    let lastPublishAt = 0;
    const current = () => active && owner && !invalidated && epoch === runEpoch && !controller.signal.aborted;
    const reconcileReceipt = (result: Awaited<ReturnType<AiToolSession['invoke']>>) => {
      const receipt = result.effects.receipt;
      if (receipt && !snapshot.items.some((item) => item.kind === 'receipt' && item.receipt.callId === receipt.callId)) {
        publish({ ...snapshot, items: appendConversationItems(snapshot.items, {
          kind: 'receipt', id: createId('receipt'), receipt,
        }) });
      }
    };
    const flushText = () => {
      if (!current() || !assistantText) return;
      const item = snapshot.items.find((candidate) => candidate.id === assistantId);
      if (item?.kind === 'assistant') {
        publish({ ...snapshot, items: snapshot.items.map((candidate) => candidate.id === assistantId && candidate.kind === 'assistant'
          ? { ...candidate, content: assistantText } : candidate) });
      } else {
        assistantId = createId('assistant');
        publish({ ...snapshot, items: appendConversationItems(snapshot.items, {
          kind: 'assistant', id: assistantId, content: assistantText, createdAt: now(),
          sources: [], progress: 'streaming',
        }) });
      }
      lastPublishAt = now();
    };

    try {
      while (step <= 8 && current()) {
        let stepText = '';
        const request: HostedRequest = budgetHostedRequest({
          version: HOSTED_PROTOCOL_VERSION,
          conversationId: run.conversationId,
          runId: run.runId,
          step,
          teaching: {
            instructionVersion: AI_TEACHING_INSTRUCTION_VERSION,
            misconceptionFirstEnabled: getInstructions().misconceptionFirstEnabled,
          },
          messages,
        });
        messages = request.messages;
        const calls: Extract<HostedEvent, { type: 'tool_call' }>[] = [];
        let completed: 'stop' | 'tool_calls' | null = null;
        for await (const event of transport.infer(request, await freshToken(), controller.signal)) {
          if (!current()) return;
          if (event.type === 'text_delta') {
            stepText += event.text;
            assistantText += event.text;
            if (assistantText.length > 50_000) throw new Error('AI response exceeded its limit.');
            if (now() - lastPublishAt >= 50) flushText();
          } else if (event.type === 'tool_call') {
            calls.push(event);
          } else if (event.type === 'completed') {
            completed = event.finishReason;
          } else {
            throw new Error(event.message);
          }
        }
        if (!current()) return;
        flushText();
        if (!completed || (completed === 'tool_calls') !== (calls.length > 0)) {
          throw new Error('AI response ended unexpectedly.');
        }
        for (const call of calls) {
          if (seenCallIds.has(call.callId)) throw new Error('AI repeated a tool call identifier.');
          seenCallIds.add(call.callId);
        }
        if (completed === 'stop') {
          if (!assistantText.trim()) throw new Error('AI returned an empty response.');
          const time = now();
          publish({
            ...snapshot,
            items: snapshot.items.map((item) => item.kind === 'assistant' && item.id === assistantId
              ? { ...item, progress: 'completed' as const } :
              item.kind === 'user' && item.id === run.messageId
                ? { ...item, delivery: 'completed' as const } : item),
            run: { ...run, status: 'completed', completedAt: time },
            activity: { runId: run.runId, status: 'completed', summary: 'Response complete', updatedAt: time },
          });
          return;
        }
        if (stepText) messages = [...messages, { role: 'assistant', content: stepText.slice(-12_000) }];
        for (const call of calls) {
          if (!current()) return;
          const invocation = { connectionId: run.conversationId, runId: run.runId,
            runStatus: 'active' as const, callId: call.callId,
            toolName: call.name, input: call.input };
          let result = await toolSession.invoke(invocation);
          reconcileReceipt(result);
          if (!current()) return;
          if (result.effects.approval?.status === 'pending') {
            publish({ ...snapshot, approval: result.effects.approval,
              activity: { runId: run.runId, status: 'awaiting_approval',
                summary: result.effects.approval.summary, updatedAt: now() } });
            await new Promise<boolean>((resolve) => { pendingDecision = resolve; });
            pendingDecision = null;
            if (!current()) return;
            result = await toolSession.invoke(invocation);
            reconcileReceipt(result);
          }
          if (!current()) return;
          const response = boundedToolResponse(result.response);
          const normalised = normaliseJsonValue(response);
          if (normalised === undefined) throw new Error('The tool returned an invalid result.');
          messages = [...messages,
            { role: 'tool_call', callId: call.callId, name: call.name, input: call.input },
            { role: 'tool_result', callId: call.callId, result: normalised }];
          publish({ ...snapshot, approval: null,
            activity: { runId: run.runId, status: 'working', summary: 'AI is responding', updatedAt: now() },
          });
        }
        step += 1;
      }
      if (current()) throw new Error('The AI tool sequence exceeded its limit.');
    } catch (error) {
      if (!current()) return;
      flushText();
      const time = now();
      const hasReceipt = snapshot.items.some((item) => item.kind === 'receipt' && item.receipt.createdAt >= run.claimedAt);
      publish({
        ...snapshot,
        connection: readableError(error).includes('access code') || readableError(error).includes('revoked')
          ? { status: 'disconnected', reason: readableError(error) } : snapshot.connection,
        items: appendConversationItems(snapshot.items.map((item) => item.kind === 'assistant' && item.id === assistantId
          ? { ...item, progress: 'interrupted' as const } : item), {
          kind: 'error', id: createId('error'), createdAt: time,
          error: { kind: 'internal', message: readableError(error) },
        }),
        run: { ...run, status: 'stopped', stopRequestedAt: time, stoppedAt: time },
        activity: { runId: run.runId, status: 'failed', summary: 'AI could not continue', updatedAt: time },
        draft: hasReceipt ? snapshot.draft : snapshot.items.find((item): item is Extract<AiConversationItem, { kind: 'user' }> =>
          item.kind === 'user' && item.id === run.messageId)?.content ?? '',
      });
    } finally {
      if (abort === controller) abort = null;
    }
  }

  function startRun(content: string, messageId: string): void {
    const time = now();
    const conversationId = snapshot.conversationId ?? createId('conversation');
    const run: AiRunState & { status: 'active' } = {
      status: 'active', runId: createId('run'), conversationId, messageId,
      claimedAt: time, leaseExpiresAt: time + 60_000,
    };
    publish({
      ...snapshot, conversationId, draft: '', queuedFollowUp: null, run,
      items: appendConversationItems(snapshot.items, { kind: 'user', id: messageId,
        content, createdAt: time, delivery: 'claimed' }),
      activity: { runId: run.runId, status: 'working', summary: 'AI is responding', updatedAt: time },
    });
    const runEpoch = ++epoch;
    running = runTurn(run, runEpoch).finally(() => {
      running = null;
      if (snapshot.queuedFollowUp && active && owner && !invalidated && snapshot.run?.status !== 'active') {
        const next = snapshot.queuedFollowUp;
        startRun(next, createId('message'));
      }
    });
  }

  return {
    provider: 'hosted',
    replacementParticipant: {
      invalidate() { invalidated = true; interrupt(); },
      async quiesce() { await running; },
      clear() {
        storage.removeItem(HOSTED_SESSION_STORAGE_KEY);
        toolSession.clear();
        publish({ ...EMPTY_SNAPSHOT, connection: snapshot.connection });
        storage.removeItem(HOSTED_SESSION_STORAGE_KEY);
        invalidated = false;
      },
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return snapshot; },
    activate() {
      if (active) return;
      active = true;
      if (owner) return;
      void (options.acquireOwnership ?? browserOwnership)().then((release) => {
        if (!active || invalidated) { release?.(); return; }
        if (!release) {
          publish({ ...snapshot, connection: { status: 'disconnected', reason: 'Built-in AI is open in another tab.' } });
          return;
        }
        owner = true;
        releaseOwnership = release;
        const saved = storage.getItem(HOSTED_ACCESS_STORAGE_KEY);
        if (saved) void connect(saved);
      });
    },
    dispose() {
      active = false;
      interrupt();
      publish({ ...snapshot, connection: { status: 'disconnected' } });
      token = null;
      const finish = () => {
        if (active) return;
        owner = false;
        releaseOwnership?.();
        releaseOwnership = null;
      };
      if (running) void running.finally(finish);
      else finish();
    },
    pair: async () => failure('conflict', 'Built-in AI uses an access code.'),
    connectHosted: connect,
    async send(content) {
      const trimmed = content.trim();
      if (!trimmed || trimmed.length > 12_000) return failure('conflict', 'Enter a shorter message.');
      if (!active || !owner || snapshot.connection.status !== 'hosted') {
        return failure('unavailable', 'Connect built-in AI first.');
      }
      const messageId = createId('message');
      if (snapshot.run?.status === 'active') {
        publish({ ...snapshot, draft: '', queuedFollowUp: trimmed });
      } else startRun(trimmed, messageId);
      return { ok: true, data: { messageId } };
    },
    async stop(runId) {
      if (snapshot.run?.status !== 'active' || snapshot.run.runId !== runId) {
        return failure('conflict', 'That AI response is no longer active.');
      }
      interrupt();
      return { ok: true, data: undefined };
    },
    async decide(approvalId, approved) {
      if (!snapshot.approval || snapshot.approval.approvalId !== approvalId || snapshot.approval.status !== 'pending') {
        return failure('conflict', 'This approval is no longer available.');
      }
      const decision = await toolSession.decide(approvalId, approved);
      if (!decision.ok) return failure('conflict', 'message' in decision.error ? decision.error.message : 'This approval could not be resolved.');
      publish({ ...snapshot, approval: decision.approval });
      pendingDecision?.(approved);
      return { ok: true, data: undefined };
    },
    async resetConnection() {
      interrupt();
      if (owner) storage.removeItem(HOSTED_ACCESS_STORAGE_KEY);
      token = null;
      publish({ ...snapshot, connection: { status: 'disconnected' } });
      return { ok: true, data: undefined };
    },
  };
}
