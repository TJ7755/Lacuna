import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  type Listener = (event: unknown, value: unknown) => void;
  const listeners = new Map<string, Set<Listener>>();
  const send = vi.fn();
  const invoke = vi.fn();
  let exposed: unknown;
  return {
    listeners,
    send,
    invoke,
    exposeInMainWorld: vi.fn((_name: string, value: unknown) => {
      exposed = value;
    }),
    api: () => exposed as {
      onOpenHelp(callback: () => void): () => void;
      ai: {
        requestRestart(): Promise<void>;
        onRestartRequested(callback: () => void): () => void;
        listen(
          onRequest: (channelId: string, request: { type: string }) => Promise<unknown>,
          onDisconnected: (channelId: string) => void,
        ): () => void;
      };
    },
    emit(channel: string, value: unknown) {
      for (const listener of listeners.get(channel) ?? []) listener({}, value);
    },
  };
});

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    send: electron.send,
    invoke: electron.invoke,
    on(channel: string, listener: (event: unknown, value: unknown) => void) {
      const channelListeners = electron.listeners.get(channel) ?? new Set();
      channelListeners.add(listener);
      electron.listeners.set(channel, channelListeners);
    },
    removeListener(channel: string, listener: (event: unknown, value: unknown) => void) {
      electron.listeners.get(channel)?.delete(listener);
    },
  },
}));

await import('../../electron/preload');

describe('Electron preload AI request lifecycle', () => {
  beforeEach(() => {
    electron.send.mockClear();
    electron.invoke.mockReset();
  });

  it('returns a request result accepted before its listener remounts', async () => {
    let finishRequest: ((value: unknown) => void) | undefined;
    const stop = electron.api().ai.listen(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
      vi.fn(),
    );
    electron.emit('ai:request', {
      channelId: 'channel-1',
      id: 'request-1',
      request: { type: 'claim_message' },
    });

    stop();
    finishRequest?.({ ok: true, data: { type: 'message_claim', message: null } });
    await Promise.resolve();

    expect(electron.send).toHaveBeenCalledWith('ai:reply', {
      channelId: 'channel-1',
      id: 'request-1',
      result: { ok: true, data: { type: 'message_claim', message: null } },
    });
  });

  it('requests a trusted runtime restart and removes its restart listener', async () => {
    electron.invoke.mockResolvedValue(undefined);
    const onRestart = vi.fn();
    const stopListening = electron.api().ai.onRestartRequested(onRestart);

    await electron.api().ai.requestRestart();
    electron.emit('ai:restart-requested', undefined);
    stopListening();
    electron.emit('ai:restart-requested', undefined);

    expect(electron.invoke).toHaveBeenCalledWith('ai:restart-renderer');
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('forwards native Help commands and removes its listener', () => {
    const onOpenHelp = vi.fn();
    const stopListening = electron.api().onOpenHelp(onOpenHelp);

    electron.emit('navigation:open-help', undefined);
    stopListening();
    electron.emit('navigation:open-help', undefined);

    expect(onOpenHelp).toHaveBeenCalledOnce();
  });
});
