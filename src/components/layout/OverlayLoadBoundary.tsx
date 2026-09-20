import type { ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ErrorBoundary } from './ErrorBoundary';

function UnavailableOverlay({ label, onClose }: { label: string; onClose: () => void }) {
  const ref = useFocusTrap(true);
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-label={`${label} unavailable`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl">
        <h2 className="font-display text-xl text-ink">{label} could not load</h2>
        <p className="mb-5 mt-2 text-sm text-ink-soft">Reconnect and reload to try again.</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

export function OverlayLoadBoundary({
  children,
  label,
  open = true,
  onClose,
}: {
  children: ReactNode;
  label: string;
  open?: boolean;
  onClose: () => void;
}) {
  return (
    <ErrorBoundary
      label={label}
      fallback={open ? <UnavailableOverlay label={label} onClose={onClose} /> : null}
    >
      {children}
    </ErrorBoundary>
  );
}
