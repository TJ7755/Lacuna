export type ReplacementKind = 'manual' | 'peer' | 'recovery';

/**
 * Device-local state which must be fenced before a manual full replacement. Invalidation is
 * synchronous so no new remote work can enter while already-admitted writes drain. Quiescence may
 * perform remote work. Clearing is deliberately separate and runs only after the replacement has
 * committed successfully.
 */
export interface ReplacementParticipant {
  invalidate(): void;
  quiesce(): void | Promise<void>;
  clear(): void | Promise<void>;
}

export class ReplacementInvalidatedError extends Error {
  constructor() {
    super('A manual database replacement has invalidated this write.');
    this.name = 'ReplacementInvalidatedError';
  }
}

interface QueuedOperation {
  kind: 'write' | ReplacementKind;
  participants: readonly ReplacementParticipant[];
  operation: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Fair shared/exclusive coordination for database writes and snapshot replacement. Consecutive
 * writes may run together. Once peer or recovery application is queued, later writes wait behind
 * it; manual replacement rejects later writes because its session participants are invalidated.
 */
export class ReplacementLifecycle {
  private readonly participants = new Set<ReplacementParticipant>();
  private readonly queue: QueuedOperation[] = [];
  private activeWrites = 0;
  private exclusiveActive = false;
  private manualReplacements = 0;

  register(participant: ReplacementParticipant): () => void {
    this.participants.add(participant);
    return () => this.participants.delete(participant);
  }

  admitWrite<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.manualReplacements > 0) return Promise.reject(new ReplacementInvalidatedError());
    return this.enqueue('write', operation, []);
  }

  replace<T>(kind: ReplacementKind, operation: () => T | Promise<T>): Promise<T> {
    const participants = kind === 'manual' ? [...this.participants] : [];
    if (kind === 'manual') this.manualReplacements += 1;
    try {
      participants.forEach((participant) => participant.invalidate());
    } catch (error) {
      if (kind === 'manual') this.manualReplacements -= 1;
      return Promise.reject(error);
    }
    const pending = this.enqueue(kind, operation, participants);
    if (kind === 'manual') {
      void pending.then(
        () => {
          this.manualReplacements -= 1;
        },
        () => {
          this.manualReplacements -= 1;
        },
      );
    }
    return pending;
  }

  private enqueue<T>(
    kind: QueuedOperation['kind'],
    operation: () => T | Promise<T>,
    participants: readonly ReplacementParticipant[],
  ): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        kind,
        participants,
        operation: () => Promise.resolve().then(operation),
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    this.pump();
    return promise;
  }

  private pump(): void {
    if (this.exclusiveActive) return;

    if (this.activeWrites > 0) {
      while (this.queue[0]?.kind === 'write') this.startWrite();
      return;
    }

    if (this.queue[0]?.kind === 'write') {
      while (this.queue[0]?.kind === 'write') this.startWrite();
      return;
    }

    if (this.queue.length > 0) this.startReplacement();
  }

  private startWrite(): void {
    const queued = this.queue.shift();
    if (!queued || queued.kind !== 'write') return;
    this.activeWrites += 1;
    void queued
      .operation()
      .then(queued.resolve, queued.reject)
      .finally(() => {
        this.activeWrites -= 1;
        this.pump();
      });
  }

  private startReplacement(): void {
    const queued = this.queue.shift();
    if (!queued || queued.kind === 'write') return;
    this.exclusiveActive = true;
    void this.runReplacement(queued)
      .then(queued.resolve, queued.reject)
      .finally(() => {
        this.exclusiveActive = false;
        this.pump();
      });
  }

  private async runReplacement(queued: QueuedOperation): Promise<unknown> {
    await Promise.all(queued.participants.map((participant) => participant.quiesce()));
    const result = await queued.operation();
    await Promise.all(queued.participants.map((participant) => participant.clear()));
    return result;
  }
}

export const replacementLifecycle = new ReplacementLifecycle();
