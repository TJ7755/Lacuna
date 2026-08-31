import { useEffect, useState } from 'react';
import { LacunaIcon } from '../ui/icons';

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
      <path
        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A custom title bar that only appears when running inside the Electron frameless
 * window. macOS keeps its native traffic lights and reserves their leading
 * inset; Windows and Linux render custom controls on the right. The title
 * region is a drag area so the window can be moved by clicking and dragging.
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
      className={`titlebar-drag flex shrink-0 items-center justify-between border-b border-line bg-surface pr-3 select-none ${isMacOS ? 'h-10 pl-20' : 'h-12 pl-3'}`}
    >
      {/* Title area — draggable */}
      <div
        data-testid="titlebar-brand"
        className={`titlebar-drag flex items-center gap-2 text-sm text-ink-soft ${isMacOS ? '-translate-y-[3px]' : ''}`}
      >
        <LacunaIcon width={14} height={14} className="text-accent" />
        <span className="font-display font-medium">Lacuna</span>
      </div>

      {/* Window controls — non-draggable */}
      {!isMacOS && (
        <div className="titlebar-no-drag flex items-center gap-1">
          <button
            type="button"
            onClick={() => api.minimizeWindow()}
            aria-label="Minimise"
            title="Minimise"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-faint transition hover:bg-ink/5 hover:text-ink active:bg-ink/10"
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            onClick={() => api.maximizeWindow()}
            aria-label={isMaximized ? 'Restore' : 'Maximise'}
            title={isMaximized ? 'Restore' : 'Maximise'}
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-faint transition hover:bg-ink/5 hover:text-ink active:bg-ink/10"
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            onClick={() => api.closeWindow()}
            aria-label="Close"
            title="Close"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-faint transition hover:bg-negative/10 hover:text-negative active:bg-negative/15"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
