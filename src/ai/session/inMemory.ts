import type { AiSession, AiSessionSnapshot } from './types';

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

function identifier(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createInMemoryAiSession(
  initial: Partial<AiSessionSnapshot> = {},
): AiSession {
  let snapshot: AiSessionSnapshot = { ...EMPTY_SNAPSHOT, ...initial };
  const listeners = new Set<() => void>();

  function publish(next: Omit<AiSessionSnapshot, 'revision'>) {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
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
      listeners.clear();
    },
    async pair() {
      if (snapshot.connection.status !== 'disconnected') {
        return {
          ok: false,
          error: { kind: 'conflict', message: 'AI is already connecting or connected.' },
        };
      }
      const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
      const code = raw.match(/.{1,4}/g)?.join('-') ?? raw;
      const expiresAt = Date.now() + 10 * 60_000;
      publish({ ...snapshot, connection: { status: 'pairing', code, expiresAt } });
      return { ok: true, data: { code, expiresAt } };
    },
    async send(content) {
      if (snapshot.connection.status === 'disconnected') {
        return {
          ok: false,
          error: { kind: 'unavailable', message: 'AI is not connected.' },
        };
      }
      const messageId = identifier('message');
      const conversationId = snapshot.conversationId ?? identifier('conversation');
      const now = Date.now();
      if (snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested') {
        publish({ ...snapshot, queuedFollowUp: content });
      } else {
        publish({
          ...snapshot,
          conversationId,
          items: [
            ...snapshot.items,
            { kind: 'user', id: messageId, content, createdAt: now, delivery: 'queued' },
          ],
        });
      }
      return { ok: true, data: { messageId } };
    },
    async stop(runId) {
      if (!snapshot.run || snapshot.run.runId !== runId || snapshot.run.status !== 'active') {
        return {
          ok: false,
          error: { kind: 'conflict', message: 'That AI run is no longer active.' },
        };
      }
      const now = Date.now();
      publish({
        ...snapshot,
        draft: snapshot.queuedFollowUp ?? snapshot.draft,
        queuedFollowUp: null,
        run: { ...snapshot.run, status: 'stop_requested', stopRequestedAt: now },
        activity: {
          runId,
          status: 'stop_requested',
          summary: 'Stop requested',
          updatedAt: now,
        },
      });
      return { ok: true, data: undefined };
    },
    async decide(approvalId, approved) {
      const approval = snapshot.approval;
      if (!approval || approval.approvalId !== approvalId || approval.status !== 'pending') {
        return {
          ok: false,
          error: { kind: 'conflict', message: 'That approval is no longer pending.' },
        };
      }
      publish({
        ...snapshot,
        approval: {
          ...approval,
          status: approved ? 'approved' : 'rejected',
          decidedAt: Date.now(),
        },
      });
      return { ok: true, data: undefined };
    },
    async resetConnection() {
      publish({
        ...snapshot,
        connection: { status: 'disconnected' },
        run: null,
        activity: null,
        approval: null,
      });
      return { ok: true, data: undefined };
    },
  };
}
