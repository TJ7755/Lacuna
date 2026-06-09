import { useEffect, useState } from 'react';
import { FlaskIcon } from '../ui/icons';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
}

function MinimizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="6" width="10" height="1" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2.5" y="0.5" width="7" height="7" rx="0.5" stroke="currentColor" strokeWidth="1" />
      <path d="M1.5 3.5v7h7" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A custom title bar that only appears when running inside the Electron frameless
 * window. It renders the app title and brand on the left, and window controls
 * (minimise, maximise/restore, close) on the right. The title region is a drag
 * area so the window can be moved by clicking and dragging the bar.
 */
export function Titlebar() {
  const [electron] = useState(() => isElectron());
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!electron) return;
    const api = window.electronAPI!;
    api.isMaximized().then(setIsMaximized).catch(() => {
      // Best-effort initial state; ignore errors.
    });
    const unsubscribe = api.onMaximizedChange((maximized) => {
      setIsMaximized(maximized);
    });
    return () => {
      unsubscribe();
    };
  }, [electron]);

  if (!electron) return null;

  const api = window.electronAPI!;

  return (
    <div className="titlebar-drag flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface px-3 select-none">
      {/* Title area — draggable */}
      <div className="titlebar-drag flex items-center gap-2 text-sm text-ink-soft">
        <FlaskIcon width={14} height={14} className="text-accent" />
        <span className="font-display font-medium">Lacuna</span>
      </div>

      {/* Window controls — non-draggable */}
      <div className="titlebar-no-drag flex items-center gap-1">
        <button
          type="button"
          onClick={() => api.minimizeWindow()}
          aria-label="Minimise"
          title="Minimise"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-ink/5 hover:text-ink"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          onClick={() => api.maximizeWindow()}
          aria-label={isMaximized ? 'Restore' : 'Maximise'}
          title={isMaximized ? 'Restore' : 'Maximise'}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-ink/5 hover:text-ink"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          onClick={() => api.closeWindow()}
          aria-label="Close"
          title="Close"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-negative/10 hover:text-negative"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
