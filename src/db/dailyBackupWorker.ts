export type DailyBackupResponse =
  { type: 'stored' } | { type: 'done'; stored: boolean } | { type: 'error'; message: string };

/** Only small status messages cross this boundary; the snapshot stays in the worker. */
export function runDailyBackupWorker(onStored: () => void): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/dailyBackup.worker.ts', import.meta.url), {
      type: 'module',
    });
    const fail = (error: Error) => {
      worker.terminate();
      reject(error);
    };
    worker.onmessage = (event: MessageEvent<DailyBackupResponse>) => {
      if (event.data.type === 'stored') {
        onStored();
      } else {
        worker.terminate();
        if (event.data.type === 'done') resolve(event.data.stored);
        else reject(new Error(event.data.message));
      }
    };
    worker.onerror = (event) => fail(new Error(event.message || 'The daily backup worker failed.'));
    worker.onmessageerror = () =>
      fail(new Error('The daily backup worker returned an unreadable response.'));
    try {
      worker.postMessage(null);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
