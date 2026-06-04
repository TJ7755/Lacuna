// Web Worker that runs FSRS parameter optimisation off the main thread so a long
// replay never blocks the UI. It posts progress updates and a final result; the
// caller (see src/state/useOptimiser.ts) owns confirmation and persistence.

import { optimiseParameters, type OptimiseResult } from '../fsrs/optimise';
import { initOptimizer } from '@open-spaced-repetition/binding/dynamic-wasi';
import wasmUrl from '@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasm32-wasi.wasm?url';
import WasiWorker from '@open-spaced-repetition/binding-wasm32-wasi/wasi-worker-browser.mjs?worker';
import type { Card } from '../db/types';

export interface OptimiseRequest {
  cards: Card[];
  requestRetention: number;
}

export type OptimiseMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; result: OptimiseResult }
  | { type: 'error'; message: string };

const ctx = globalThis as unknown as {
  postMessage: (message: OptimiseMessage) => void;
  onmessage: ((event: MessageEvent<OptimiseRequest>) => void) | null;
};

let bindingPromise: Promise<Awaited<ReturnType<typeof initOptimizer>>> | null = null;

function loadBinding() {
  bindingPromise ??= initOptimizer({
    wasm: wasmUrl,
    worker: () => new WasiWorker(),
  });
  return bindingPromise;
}

ctx.onmessage = async (event: MessageEvent<OptimiseRequest>) => {
  try {
    const { cards, requestRetention } = event.data;
    const binding = await loadBinding();
    const result = await optimiseParameters(cards, binding, {
      requestRetention,
      onProgress: (value) => ctx.postMessage({ type: 'progress', value }),
    });
    ctx.postMessage({ type: 'done', result });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
