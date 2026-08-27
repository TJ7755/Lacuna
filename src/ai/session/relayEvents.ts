import type { RelayBrowserMessage, RelayTerminalEvent } from '../relayProtocol';
import type { AiSessionSnapshot } from './types';

export interface RelayEventReduction {
  snapshot: AiSessionSnapshot;
  messages: RelayBrowserMessage[];
}

export function expireClaimLease(
  snapshot: AiSessionSnapshot,
  messages: RelayBrowserMessage[],
  expiredAt: number,
  createRetryMessageId: () => string,
): RelayEventReduction | null {
  const run = snapshot.run;
  if (!run || run.status !== 'active' || expiredAt < run.leaseExpiresAt) return null;
  const claimed = messages.find(
    (message) =>
      message.delivery === 'claimed' &&
      message.runId === run.runId &&
      message.messageId === run.messageId,
  );
  if (!claimed) return null;
  const retryMessageId = createRetryMessageId();
  return {
    snapshot: {
      ...snapshot,
      items: snapshot.items.map((item) =>
        item.kind === 'user' && item.id === run.messageId
          ? { ...item, id: retryMessageId, delivery: 'queued' as const }
          : item,
      ),
      run: { ...run, status: 'expired', expiredAt },
      activity: {
        runId: run.runId,
        status: 'failed',
        summary: 'Run expired; message queued again',
        updatedAt: expiredAt,
      },
    },
    messages: messages.map((message) =>
      message === claimed
        ? {
            messageId: retryMessageId,
            conversationId: claimed.conversationId,
            content: claimed.content,
            createdAt: claimed.createdAt,
            delivery: 'queued' as const,
          }
        : message,
    ),
  };
}

export function applyTerminalEvent(
  snapshot: AiSessionSnapshot,
  messages: RelayBrowserMessage[],
  event: RelayTerminalEvent,
): RelayEventReduction {
  if (event.type === 'claimed') {
    const message = messages.find((candidate) => candidate.messageId === event.messageId);
    if (!message || message.delivery !== 'queued') return { snapshot, messages };
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
        candidate === message
          ? { ...candidate, delivery: 'claimed' as const, runId: event.runId }
          : candidate,
      ),
    };
  }

  if (event.type === 'reply') {
    if (
      snapshot.run?.status !== 'active' ||
      snapshot.run.runId !== event.runId ||
      snapshot.run.messageId !== event.messageId
    ) {
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
