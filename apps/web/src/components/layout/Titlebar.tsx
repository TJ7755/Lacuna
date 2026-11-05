import { useEffect, useState } from 'react';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
}

function MinimizeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
      <path d="M1 6h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
      <path d="M3.5 3.5V1.5h7v7h-2M1.5 3.5h7v7h-7z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Frameless window controls without a separate branded title bar. Windows and
 * Linux float controls over the shell; AppShell clears their height in the page
 * column. macOS retains space for its native traffic lights.
 */
export function Titlebar() {
  const [electron] = useState(() => isElectron());
  const [platform] = useState(() => window.electronAPI?.platform);
  const [isMaximized, setIsMaximized] = useState(false);
  const isMacOS = platform === 'darwin';

  useEffect(() => {
    if (!electron || isMacOS) return;
    const api = window.electronAPI!;
    api
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {
        // Best-effort initial state; ignore errors.
      });
    const unsubscribe = api.onMaximizedChange((maximized) => {
      setIsMaximized(maximized);
    });
    return () => {
      unsubscribe();
    };
  }, [electron, isMacOS]);

  if (!electron) return null;

  const api = window.electronAPI!;

  return (
    <div
      data-titlebar-native-controls={isMacOS ? 'darwin' : undefined}
      className={`titlebar-drag flex select-none ${isMacOS ? 'h-10 shrink-0' : 'absolute inset-x-0 top-0 z-30 h-8 justify-end'}`}
    >
      {/* Window controls — non-draggable */}
      {!isMacOS && (
        <div className="titlebar-no-drag flex items-center">
          <button
            type="button"
            onClick={() => api.minimizeWindow()}
            aria-label="Minimise"
            title="Minimise"
            className="flex h-8 w-12 items-center justify-center text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            onClick={() => api.maximizeWindow()}
            aria-label={isMaximized ? 'Restore' : 'Maximise'}
            title={isMaximized ? 'Restore' : 'Maximise'}
            className="flex h-8 w-12 items-center justify-center text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            onClick={() => api.closeWindow()}
            aria-label="Close"
            title="Close"
            className="flex h-8 w-12 items-center justify-center text-ink-soft transition-colors hover:bg-negative hover:text-white active:bg-negative/90"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
