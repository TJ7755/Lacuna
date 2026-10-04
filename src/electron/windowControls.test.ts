import { describe, expect, it, vi } from 'vitest';
import { registerWindowControlHandlers } from '../../electron/windowControls';

function setup() {
  const mainFrame = { id: 'main' };
  const webContents = { isDestroyed: () => false, mainFrame };
  const window = {
    isDestroyed: () => false,
    webContents,
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    close: vi.fn(),
  };
  const listeners = new Map<string, (event: unknown) => unknown>();
  const ipc = {
    on: (channel: string, fn: (event: never) => void) => listeners.set(channel, fn as never),
    handle: (channel: string, fn: (event: never) => unknown) => listeners.set(channel, fn as never),
  };
  const logUntrusted = vi.fn();
  registerWindowControlHandlers(ipc, () => window, logUntrusted);
  const trusted = { sender: webContents, senderFrame: mainFrame };
  const otherContents = { isDestroyed: () => false, mainFrame: { id: 'other' } };
  const secondWebContents = { sender: otherContents, senderFrame: otherContents.mainFrame };
  const subFrame = { sender: webContents, senderFrame: { id: 'iframe' } };
  return { window, listeners, logUntrusted, trusted, secondWebContents, subFrame };
}

describe('window control IPC trust', () => {
  it('lets the main frame minimise, maximise, restore and close', () => {
    const { window, listeners, trusted, logUntrusted } = setup();
    listeners.get('window:minimize')!(trusted);
    listeners.get('window:maximize')!(trusted);
    window.isMaximized.mockReturnValue(true);
    listeners.get('window:maximize')!(trusted);
    listeners.get('window:close')!(trusted);
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.maximize).toHaveBeenCalledOnce();
    expect(window.unmaximize).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
    expect(listeners.get('window:isMaximized')!(trusted)).toBe(true);
    expect(logUntrusted).not.toHaveBeenCalled();
  });

  it.each(['secondWebContents', 'subFrame'] as const)(
    'ignores and logs control messages from %s',
    (key) => {
      const ctx = setup();
      const event = ctx[key];
      for (const channel of ['window:minimize', 'window:maximize', 'window:close']) {
        ctx.listeners.get(channel)!(event);
      }
      expect(ctx.window.minimize).not.toHaveBeenCalled();
      expect(ctx.window.maximize).not.toHaveBeenCalled();
      expect(ctx.window.close).not.toHaveBeenCalled();
      expect(ctx.logUntrusted.mock.calls.map((c) => c[0])).toEqual([
        'window:minimize',
        'window:maximize',
        'window:close',
      ]);
    },
  );

  it('rejects window:isMaximized from an untrusted sender', () => {
    const { listeners, secondWebContents, logUntrusted } = setup();
    expect(() => listeners.get('window:isMaximized')!(secondWebContents)).toThrow(/Untrusted/);
    expect(logUntrusted).toHaveBeenCalledWith('window:isMaximized');
  });
});
