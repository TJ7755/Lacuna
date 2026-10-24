import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Locator, Page } from '@playwright/test';
import { measurePointerInteraction } from '../tests/e2e/fixtures/interactionPerformance';

const listeners = new Set<() => void>();
const observers = new Set<object>();
const frames = new Map<number, FrameRequestCallback>();
const timers = new Map<number, () => void>();
let nextId = 0;

class VisibleElement {
  textContent = '';
  parentElement = null;
  getBoundingClientRect() {
    return { width: 10, height: 10 };
  }
}

beforeEach(() => {
  listeners.clear();
  observers.clear();
  frames.clear();
  timers.clear();
  vi.stubGlobal('HTMLElement', VisibleElement);
  vi.stubGlobal('document', { querySelectorAll: () => [new VisibleElement()] });
  vi.stubGlobal('getComputedStyle', () => ({
    display: 'block',
    visibility: 'visible',
    opacity: '1',
  }));
  vi.stubGlobal('window', {
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    setTimeout: (callback: () => void) => {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = ['longtask'];
      observe() {
        observers.add(this);
      }
      disconnect() {
        observers.delete(this);
      }
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__lacunaInteractionMeasurement;
  vi.unstubAllGlobals();
});

function pointerDown() {
  for (const listener of [...listeners]) {
    listeners.delete(listener);
    listener();
  }
}

function runFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now());
}

function harness(click: () => Promise<void>, wait = async () => {}) {
  const page = {
    evaluate: async (callback: (argument: never) => unknown, argument: never) => callback(argument),
    waitForFunction: wait,
  };
  return {
    page,
    measure: () =>
      measurePointerInteraction({
        page: page as unknown as Page,
        trigger: { click } as unknown as Locator,
        acknowledgement: { selector: '#ack' },
        meaningful: { selector: '#ready' },
      }),
  };
}

function expectDisposed() {
  expect({
    listeners: listeners.size,
    observers: observers.size,
    frames: frames.size,
    timers: timers.size,
  }).toEqual({ listeners: 0, observers: 0, frames: 0, timers: 0 });
}

it('releases the observer and pointer listener when clicking fails before pointerdown', async () => {
  const { measure } = harness(async () => {
    throw new Error('click failed');
  });
  await expect(measure()).rejects.toThrow('click failed');
  expectDisposed();
});

it('cancels pending sampling and its deadline when waiting fails after pointerdown', async () => {
  const { measure } = harness(
    async () => pointerDown(),
    async () => {
      throw new Error('wait failed');
    },
  );
  await expect(measure()).rejects.toThrow('wait failed');
  expectDisposed();
});

it('cancels the observer-flush frame when waiting fails after markers appear', async () => {
  const { measure } = harness(
    async () => {
      pointerDown();
      runFrame();
    },
    async () => {
      throw new Error('wait failed');
    },
  );
  await expect(measure()).rejects.toThrow('wait failed');
  expectDisposed();
});

it('cancels the observer-flush timer when waiting fails after the flush frame', async () => {
  const { measure } = harness(
    async () => {
      pointerDown();
      runFrame();
      runFrame();
    },
    async () => {
      throw new Error('wait failed');
    },
  );
  await expect(measure()).rejects.toThrow('wait failed');
  expectDisposed();
});

it('retains the sample and releases resources on success', async () => {
  const { measure } = harness(async () => {
    pointerDown();
    runFrame();
    runFrame();
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
  });
  const sample = await measure();
  expect(sample.acknowledgementMs).toBeGreaterThanOrEqual(0);
  expect(sample.meaningfulMs).toBeGreaterThanOrEqual(0);
  expect(sample.longTasks).toEqual({
    supported: true,
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  });
  expectDisposed();
});

it('preserves the original click failure when the page closes before cleanup', async () => {
  const { page, measure } = harness(async () => {
    throw new Error('click failed');
  });
  const evaluate = page.evaluate;
  let evaluations = 0;
  page.evaluate = async (...args) => {
    if (++evaluations > 1) throw new Error('page closed');
    return evaluate(...args);
  };
  await expect(measure()).rejects.toThrow('click failed');
});

it('disposes a previous measurement before installing its replacement', async () => {
  const dispose = vi.fn();
  vi.stubGlobal('__lacunaInteractionMeasurement', { dispose });
  const { measure } = harness(async () => {
    throw new Error('click failed');
  });
  await expect(measure()).rejects.toThrow('click failed');
  expect(dispose).toHaveBeenCalledOnce();
  expectDisposed();
});
