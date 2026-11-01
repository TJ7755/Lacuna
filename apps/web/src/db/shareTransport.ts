import { decodeShareCode, encodeShareCode, encodeShareQrCode } from './shareCodec';
import { parseSharePayload, type SharePayload } from './sharePayload';

export async function encodeShareDirect(payload: SharePayload): Promise<string> {
  return encodeShareCode(payload);
}

/** Encode a share payload as a Base45 string optimised for QR code density. */
export async function encodeShareQRDirect(payload: SharePayload): Promise<string> {
  return encodeShareQrCode(payload);
}

export async function encodeShareQR(payload: SharePayload): Promise<string> {
  if (canUseShareWorker()) {
    try {
      return await runShareWorker<string>({ type: 'encodeQR', payload });
    } catch {
      // Fall through to direct path if the worker fails.
    }
  }
  return encodeShareQRDirect(payload);
}

export async function decodeShareDirect(code: string): Promise<SharePayload> {
  return parseSharePayload(await decodeShareCode(code));
}

// ---------------------------------------------------------------------------
// Worker offload for encode / decode
// ---------------------------------------------------------------------------

let shareWorker: Worker | null = null;
let shareJobId = 0;
let shareWorkerJobs = 0;

function canUseShareWorker(): boolean {
  return typeof Worker !== 'undefined';
}

function getShareWorker(): Worker {
  if (!shareWorker) {
    shareWorker = new Worker(new URL('../workers/share.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return shareWorker;
}

function releaseShareWorker(worker: Worker): void {
  shareWorkerJobs -= 1;
  if (shareWorkerJobs === 0 && shareWorker === worker) {
    worker.terminate();
    shareWorker = null;
  }
}

function runShareWorker<T>(
  message:
    | { type: 'encode'; payload: SharePayload }
    | { type: 'encodeQR'; payload: SharePayload }
    | { type: 'decode'; code: string },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++shareJobId;
    const w = getShareWorker();
    shareWorkerJobs += 1;
    const TIMEOUT_MS = 30000; // 30 seconds

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    function cleanup() {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      w.removeEventListener('message', messageHandler);
      w.removeEventListener('error', errorHandler);
      w.removeEventListener('messageerror', messageErrorHandler);
      releaseShareWorker(w);
    }

    const messageHandler = (event: MessageEvent) => {
      const data = event.data as {
        type: string;
        result?: T;
        error?: string;
        id?: number;
      };
      if (data.id !== id) return;
      cleanup();
      if (data.type === 'error') {
        reject(new Error(data.error ?? 'Share worker failed.'));
      } else {
        resolve(data.result as T);
      }
    };

    const errorHandler = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(`Share worker failed: ${e.message || 'unknown error'}`));
    };

    const messageErrorHandler = () => {
      cleanup();
      reject(new Error('Share worker received an invalid message.'));
    };

    w.addEventListener('message', messageHandler);
    w.addEventListener('error', errorHandler);
    w.addEventListener('messageerror', messageErrorHandler);
    try {
      w.postMessage({ ...message, id });
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Set timeout to force cleanup if the worker hangs
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Share worker timed out after 30 seconds.'));
    }, TIMEOUT_MS);
  });
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  if (canUseShareWorker()) {
    try {
      return await runShareWorker<string>({ type: 'encode', payload });
    } catch {
      // Fall through to direct path if the worker fails.
    }
  }
  return encodeShareDirect(payload);
}

/** Decode a share code into its payload, throwing a readable error if it is invalid. */
export async function decodeShare(code: string): Promise<SharePayload> {
  if (canUseShareWorker()) {
    try {
      return parseSharePayload(await runShareWorker<unknown>({ type: 'decode', code }));
    } catch {
      // Fall through to direct path if the worker fails.
    }
  }
  return decodeShareDirect(code);
}
