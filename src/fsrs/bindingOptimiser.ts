// Lazy initialisation of the official FSRS trainer (WASM + WASI worker) for browser
// environments. Imported only from the optimisation Web Worker so the main bundle
// stays light.
//
// IMPORTANT: `@open-spaced-repetition/binding-wasm32-wasi` is vendored locally
// (see ./wasi-worker-browser.mjs and public/fsrs-binding.wasm32-wasi.wasm)
// because the upstream npm package incorrectly declares `cpu: wasm32` and fails
// to install on x64 VMs. Do NOT import from `@open-spaced-repetition/binding`
// (the root package) in browser code — its `browser` entry re-exports from the
// missing wasm32-wasi package and will break the build.

import { initOptimizer } from '@open-spaced-repetition/binding/dynamic-wasi';
import WasiWorker from './wasi-worker-browser.mjs?worker';

const wasmUrl = '/fsrs-binding.wasm32-wasi.wasm';

type BindingModule = Awaited<ReturnType<typeof initOptimizer>>;

let bindingPromise: Promise<BindingModule> | null = null;

/** Initialise (or return) the WASM-backed FSRS trainer module. */
export function getBindingOptimiser(): Promise<BindingModule> {
  if (!bindingPromise) {
    bindingPromise = initOptimizer({
      wasm: wasmUrl,
      worker: () => new WasiWorker(),
    }).catch((err: unknown) => {
      bindingPromise = null;
      throw err;
    });
  }
  return bindingPromise!;
}
