// Parse large Anki archives away from the UI thread. The result is structured-cloned
// back to the importer; media buffers are transferred rather than copied again.

import {
  parseApkgBuffer,
  type ApkgImportResult,
  type ApkgParseOptions,
} from '../db/apkgImport';

interface ApkgWorkerRequest {
  buffer: ArrayBuffer;
  options: ApkgParseOptions;
  wasmUrl: string;
}

type ApkgWorkerResponse =
  | { type: 'done'; result: ApkgImportResult }
  | { type: 'error'; message: string };

const ctx = globalThis as unknown as {
  postMessage: (message: ApkgWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<ApkgWorkerRequest>) => void) | null;
};

ctx.onmessage = (event) => {
  void parseApkgBuffer(event.data.buffer, event.data.options, event.data.wasmUrl)
    .then((result) => {
      const transfers = [...result.media.values()].map((bytes) => bytes.buffer as ArrayBuffer);
      ctx.postMessage({ type: 'done', result }, transfers);
    })
    .catch((error: unknown) => {
      ctx.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
};
