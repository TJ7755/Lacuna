import type { CDPSession, Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Diagnostic-only observer; never included in the production application. */
export function installLagProbe() {
  const target = window as unknown as { __lacunaLag?: {
    start: number; frames: number[]; longTasks: { start: number; duration: number }[];
    events: { name: string; inputDelayMs: number; durationMs: number }[];
    reset: () => void;
  } };
  if (target.__lacunaLag) return;
  let previous = performance.now();
  const state = {
    start: previous,
    frames: [] as number[],
    longTasks: [] as { start: number; duration: number }[],
    events: [] as { name: string; inputDelayMs: number; durationMs: number }[],
    transactions: [] as { stores: string[]; mode: string; start: number; duration: number; outcome: string }[],
    reset() {
      state.start = previous = performance.now();
      state.frames = []; state.longTasks = []; state.events = [];
      state.transactions = [];
    },
  };
  target.__lacunaLag = state;
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args) {
    const transaction = originalTransaction.apply(this, args);
    const start = performance.now();
    const finish = (event: Event) => {
      if (start >= state.start) state.transactions.push({
        stores: Array.from(transaction.objectStoreNames), mode: transaction.mode,
        start: start - state.start, duration: performance.now() - start, outcome: event.type,
      });
    };
    transaction.addEventListener('complete', finish, { once: true });
    transaction.addEventListener('abort', finish, { once: true });
    return transaction;
  };
  const frame = (now: number) => {
    // A queued frame timestamp can precede a reset performed later in that frame.
    if (now >= previous) {
      state.frames.push(now - previous);
      previous = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime >= state.start)
          state.longTasks.push({ start: entry.startTime - state.start, duration: entry.duration });
      }
    }).observe({ type: 'longtask' });
  }
  if (PerformanceObserver.supportedEntryTypes.includes('event')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEventTiming;
        if (event.startTime >= state.start)
          state.events.push({ name: event.name, inputDelayMs: event.processingStart - event.startTime,
            durationMs: event.duration });
      }
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  }
}

export async function readLagProbe(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __lacunaLag?: {
      frames: number[]; longTasks: { start: number; duration: number }[];
      events: { name: string; inputDelayMs: number; durationMs: number }[];
    } }).__lacunaLag;
    if (!state) throw new Error('Lag observer is missing.');
    return { ...state, reset: undefined,
      mountedCardRows: document.querySelectorAll('[data-card-id]').length,
      domElements: document.querySelectorAll('*').length,
      visibility: document.visibilityState,
      motionSpeed: localStorage.getItem('lacuna.motionSpeed') ?? 'normal',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

export async function startDiagnosticTrace(cdp: CDPSession) {
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-v8.cpu_profiler',
    transferMode: 'ReturnAsStream',
  });
}

export async function saveDiagnosticTrace(cdp: CDPSession, file: string) {
  const complete = new Promise<{ stream?: string }>((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await complete;
  if (!stream) throw new Error('Chromium did not return a trace stream.');
  const chunks: Buffer[] = [];
  try {
    for (;;) {
      const part = await cdp.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'));
      if (part.eof) break;
    }
  } finally {
    await cdp.send('IO.close', { handle: stream });
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.concat(chunks));
}
