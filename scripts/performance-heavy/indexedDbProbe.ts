import type { Page } from '@playwright/test';

interface RequestGroup {
  requests: number;
  successes: number;
  rows: number;
  firstSuccess: number | null;
  lastSuccess: number | null;
  maxGapMs: number;
}

interface TransactionSnapshot {
  id: number;
  stores: string[];
  mode: IDBTransactionMode;
  start: number;
  requests: number;
  successes: number;
  firstSuccess: number | null;
  lastSuccess: number | null;
  cursorCallbacks: number;
  cursorMaxGapMs: number;
  cursorGaps: { at: number; durationMs: number }[];
  groups: Record<string, RequestGroup>;
}

export interface IndexedDbProbeEvent {
  kind: string;
  at: number;
  realm: string;
  timeOrigin?: number;
  workerId?: number;
  name?: string;
  url?: string;
  message?: string;
  transaction?: TransactionSnapshot;
}

interface ProbeGlobal {
  __lacunaIndexedDbEvents?: IndexedDbProbeEvent[];
}

/** Self-contained: its serialised body also runs before the optional worker entry. */
export function installIndexedDbProbe(workerRealm: boolean): void {
  const target = globalThis as typeof globalThis & ProbeGlobal;
  const clock = () => performance.timeOrigin + performance.now();
  const realm = workerRealm ? `worker:${self.name || 'assessment-work'}` : 'page';
  if (!workerRealm) target.__lacunaIndexedDbEvents = [];
  const emit = (event: Omit<IndexedDbProbeEvent, 'realm'>) => {
    const snapshot = { realm, ...event };
    if (workerRealm) self.postMessage({ __lacunaIndexedDbProbe: snapshot });
    else target.__lacunaIndexedDbEvents!.push(structuredClone(snapshot));
  };
  emit({ kind: 'realm-start', at: clock(), timeOrigin: performance.timeOrigin });
  const transactions = new WeakMap<IDBTransaction, TransactionSnapshot>();
  let nextTransaction = 0;
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args) {
    const transaction = originalTransaction.apply(this, args);
    const state: TransactionSnapshot = {
      id: ++nextTransaction,
      stores: [...transaction.objectStoreNames],
      mode: transaction.mode,
      start: clock(),
      requests: 0,
      successes: 0,
      firstSuccess: null,
      lastSuccess: null,
      cursorCallbacks: 0,
      cursorMaxGapMs: 0,
      cursorGaps: [],
      groups: {},
    };
    transactions.set(transaction, state);
    emit({ kind: 'transaction-start', at: state.start, transaction: state });
    const finish = (event: Event) =>
      emit({ kind: `transaction-${event.type}`, at: clock(), transaction: state });
    transaction.addEventListener('complete', finish, { once: true });
    transaction.addEventListener('abort', finish, { once: true });
    return transaction;
  };
  type RequestSource = IDBObjectStore | IDBIndex;
  type RequestMethod = (this: RequestSource, ...args: unknown[]) => IDBRequest<unknown>;
  for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
    const methods = prototype as unknown as Record<string, RequestMethod>;
    for (const method of [
      'get',
      'getAll',
      'getAllKeys',
      'getAllRecords',
      'getKey',
      'count',
      'openCursor',
      'openKeyCursor',
      'put',
      'add',
      'delete',
      'clear',
    ]) {
      const original = methods[method];
      if (typeof original !== 'function') continue;
      methods[method] = function (...args) {
        const request = original.apply(this, args);
        const store = this instanceof IDBIndex ? this.objectStore : this;
        const state = transactions.get(store.transaction);
        if (!state) return request;
        const key = `${store.name}/${this instanceof IDBIndex ? this.name : '(store)'}/${method}`;
        const group = (state.groups[key] ??= {
          requests: 0,
          successes: 0,
          rows: 0,
          firstSuccess: null,
          lastSuccess: null,
          maxGapMs: 0,
        });
        group.requests++;
        state.requests++;
        // Preserve partial batches even when route cancellation terminates the worker.
        if (state.requests === 1 || state.requests % 100 === 0)
          emit({ kind: 'transaction-requests', at: clock(), transaction: state });
        const cursor = method === 'openCursor' || method === 'openKeyCursor';
        request.addEventListener('success', () => {
          const at = clock();
          const gap = group.lastSuccess === null ? 0 : at - group.lastSuccess;
          group.maxGapMs = Math.max(group.maxGapMs, gap);
          group.firstSuccess ??= at;
          group.lastSuccess = at;
          group.successes++;
          group.rows += cursor
            ? Number(request.result !== null)
            : Array.isArray(request.result)
              ? request.result.length
              : Number(method === 'get' && request.result !== undefined);
          state.firstSuccess ??= at;
          state.lastSuccess = at;
          state.successes++;
          if (cursor) {
            state.cursorCallbacks++;
            state.cursorMaxGapMs = Math.max(state.cursorMaxGapMs, gap);
            if (gap > 16 && state.cursorGaps.length < 30)
              state.cursorGaps.push({ at, durationMs: gap });
          }
          if (state.successes === 1 || state.successes % 100 === 0)
            emit({ kind: 'transaction-progress', at, transaction: state });
        });
        return request;
      };
    }
  }
  if (workerRealm) return;
  const OriginalWorker = Worker;
  let nextWorker = 0;
  target.Worker = class extends OriginalWorker {
    private readonly probeId: number;

    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.probeId = ++nextWorker;
      emit({
        kind: 'worker-create',
        at: clock(),
        workerId: this.probeId,
        url: String(url),
        name: options?.name,
      });
      this.addEventListener('message', (event: MessageEvent<unknown>) => {
        const data = event.data as { __lacunaIndexedDbProbe?: IndexedDbProbeEvent } | null;
        if (!data?.__lacunaIndexedDbProbe) return;
        // Diagnostic messages must never reach the application's result handlers.
        event.stopImmediatePropagation();
        target.__lacunaIndexedDbEvents!.push({
          ...data.__lacunaIndexedDbProbe,
          workerId: this.probeId,
        });
      });
      this.addEventListener('error', (event) => {
        emit({ kind: 'worker-error', at: clock(), workerId: this.probeId, message: event.message });
      });
    }

    terminate(): void {
      emit({ kind: 'worker-terminate', at: clock(), workerId: this.probeId });
      super.terminate();
    }
  };
}

export async function readIndexedDbProbe(page: Page): Promise<IndexedDbProbeEvent[]> {
  return page.evaluate(() => {
    const events = (globalThis as ProbeGlobal).__lacunaIndexedDbEvents;
    if (!events) throw new Error('IndexedDB diagnostic probe is missing.');
    return events;
  });
}
