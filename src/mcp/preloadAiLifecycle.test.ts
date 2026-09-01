import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  type Listener = (event: unknown, value: unknown) => void;
  const listeners = new Map<string, Set<Listener>>();
  const send = vi.fn();
  let exposed: unknown;
  return {
    listeners,
    send,
    exposeInMainWorld: vi.fn((_name: string, value: unknown) => {
      exposed = value;
    }),
    api: () => exposed as {
      ai: {
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
    invoke: vi.fn(),
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
});
