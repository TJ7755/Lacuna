// Trust check and handlers for the custom titlebar's window control IPC.

interface WebContentsPort {
  isDestroyed(): boolean;
  mainFrame: unknown;
}

export interface TrustedWindowPort {
  isDestroyed(): boolean;
  webContents: WebContentsPort;
}

interface ControlledWindowPort extends TrustedWindowPort {
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  isMaximized(): boolean;
  close(): void;
}

interface SenderEvent {
  sender: unknown;
  senderFrame: unknown;
}

export interface WindowControlIpcPort {
  on(channel: string, listener: (event: SenderEvent) => void): unknown;
  handle(channel: string, listener: (event: SenderEvent) => unknown): unknown;
}

/** True only for the main window's own webContents and main frame. */
export function isTrustedRendererEvent(
  event: SenderEvent,
  window: TrustedWindowPort | null,
): boolean {
  return (
    !!window &&
    !window.isDestroyed() &&
    !window.webContents.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame
  );
}

export function registerWindowControlHandlers(
  ipc: WindowControlIpcPort,
  getWindow: () => ControlledWindowPort | null,
  logUntrusted: (channel: string) => void = (channel) =>
    console.error(`Rejected untrusted window control request on ${channel}.`),
): void {
  // Fire-and-forget channels have no reply to carry a rejection, so they are logged instead.
  const guarded = (channel: string, act: (window: ControlledWindowPort) => void) => {
    ipc.on(channel, (event) => {
      const window = getWindow();
      if (!window || !isTrustedRendererEvent(event, window)) {
        logUntrusted(channel);
        return;
      }
      act(window);
    });
  };

  guarded('window:minimize', (window) => window.minimize());
  guarded('window:maximize', (window) => {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  guarded('window:close', (window) => window.close());

  ipc.handle('window:isMaximized', (event) => {
    const window = getWindow();
    if (!window || !isTrustedRendererEvent(event, window)) {
      logUntrusted('window:isMaximized');
      throw new Error('Untrusted window state request.');
    }
    return window.isMaximized();
  });
}
