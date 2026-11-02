// Vendored from @open-spaced-repetition/binding-wasm32-wasi@0.6.0 so production
// builds can silence WASM stdout. Keep this and
// ../assets/fsrs-binding.wasm32-wasi.wasm in sync when updating the binding.

import {
  instantiateNapiModuleSync,
  MessageHandler,
  WASI,
  emnapiAsyncWorkPlugin,
  emnapiTSFNPlugin,
} from '@napi-rs/wasm-runtime';

const errorOutputs = [];

const handler = new MessageHandler({
  onLoad({ wasmModule, wasmMemory }) {
    const wasi = new WASI({
      print: function () {
        // Intentionally no-op: WASM stdout is debug noise that should not leak
        // into production system logs.
      },
      printErr: function () {
        console.error.apply(console, arguments);
        errorOutputs.push([...arguments]);
      },
    });
    return instantiateNapiModuleSync(wasmModule, {
      childThread: true,
      wasi,
      // The wasm links a "basic" emnapi archive (no C async-work /
      // threadsafe-function implementations), so every thread that
      // instantiates it must provide the JavaScript implementations
      // through the emnapi plugins.
      plugins: [emnapiAsyncWorkPlugin, emnapiTSFNPlugin],
      overwriteImports(importObject) {
        importObject.env = {
          ...importObject.env,
          ...importObject.napi,
          ...importObject.emnapi,
          memory: wasmMemory,
        };
      },
    });
  },
  onError(error) {
    postMessage({ type: 'error', error, errorOutputs });
    errorOutputs.length = 0;
  },
});

// When this wasm thread dies, raise the addon's crash flag before emnapi reports
// it, so loader-thread waits on this thread trap instead of hanging. The loader
// posts a view of the flag after instantiating the wasm or creating this worker.
let addonCrashFlag;
const beforeReportError = handler.beforeReportError;
handler.beforeReportError = function (...args) {
  if (addonCrashFlag !== undefined) {
    try {
      Atomics.store(addonCrashFlag, 0, 1);
    } catch {
      // The flag is best-effort; the original error is still reported below.
    }
  }
  return beforeReportError.apply(this, args);
};

globalThis.onmessage = function (e) {
  const data = e && e.data;
  if (data && data.__napiRsAddonCrashFlag instanceof Int32Array) {
    addonCrashFlag = data.__napiRsAddonCrashFlag;
    return;
  }
  handler.handle(e);
};
