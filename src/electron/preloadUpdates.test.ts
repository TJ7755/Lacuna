import { beforeEach, expect, it, vi } from 'vitest';
import type { DesktopUpdateState } from './updateTypes';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  expose: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: bridge.expose },
  ipcRenderer: { invoke: bridge.invoke, on: bridge.on, removeListener: bridge.removeListener },
}));
await import('../../electron/preload');
const api = bridge.expose.mock.calls[0][1] as {
  updater: {
    getState(): Promise<DesktopUpdateState>;
    onStateChange(callback: (state: DesktopUpdateState) => void): () => void;
  };
};
const state = {
  phase: 'downloaded',
  mode: 'automatic',
  currentVersion: '0.2.3',
  availableVersion: '0.2.4',
};
beforeEach(() => {
  bridge.invoke.mockReset();
  bridge.on.mockClear();
});
it('preserves release notes across both preload status channels', async () => {
  const value = { ...state, releaseNotes: '- New features' };
  bridge.invoke.mockResolvedValue(value);
  expect(await api.updater.getState()).toEqual(value);
  const callback = vi.fn();
  const stop = api.updater.onStateChange(callback);
  bridge.on.mock.calls[0][1]({}, value);
  expect(callback).toHaveBeenCalledWith(value);
  stop();
  expect(bridge.removeListener).toHaveBeenCalledWith('updater:state', expect.any(Function));
});
it.each([42, {}, ['notes'], 'x'.repeat(64001)])(
  'discards invalid notes without losing valid update status',
  async (releaseNotes) => {
    bridge.invoke.mockResolvedValue({ ...state, releaseNotes });
    expect(await api.updater.getState()).toEqual(state);
  },
);
