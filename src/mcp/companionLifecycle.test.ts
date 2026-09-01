import { describe, expect, it, vi } from 'vitest';
import {
  createApplicationShutdownHandler,
  registerCompanionProcessShutdown,
} from '../../electron/companionLifecycle';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('companion process shutdown', () => {
  it('closes once and quits only after close finishes', async () => {
    const closeResult = deferred();
    const close = vi.fn(() => closeResult.promise);
    const quit = vi.fn();
    const stdinListeners = new Map<string, () => void>();
    const signalListeners = new Map<string, () => void>();

    registerCompanionProcessShutdown({
      handle: { close },
      stdin: { once: (event, listener) => stdinListeners.set(event, listener) },
      signals: { once: (event, listener) => signalListeners.set(event, listener) },
      quit,
    });

    stdinListeners.get('end')?.();
    signalListeners.get('SIGTERM')?.();

    expect(close).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    closeResult.resolve();
    await closeResult.promise;
    await Promise.resolve();

    expect(quit).toHaveBeenCalledOnce();
  });
});

describe('application shutdown', () => {
  it('defers quit until the MCP server stops and ignores repeated quit requests', async () => {
    const stopResult = deferred();
    const stop = vi.fn(() => stopResult.promise);
    const quit = vi.fn();
    const preventDefault = vi.fn();
    const handleBeforeQuit = createApplicationShutdownHandler({ stop, quit });

    handleBeforeQuit({ preventDefault });
    handleBeforeQuit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    stopResult.resolve();
    await stopResult.promise;
    await Promise.resolve();

    expect(quit).toHaveBeenCalledOnce();

    handleBeforeQuit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledOnce();
  });
});
