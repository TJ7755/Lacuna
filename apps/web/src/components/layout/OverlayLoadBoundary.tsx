import { AnimatePresence, useIsPresent } from 'motion/react';
import { DialogPanel } from '../ui/DialogPanel';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ErrorBoundary } from './ErrorBoundary';

function UnavailableOverlay({ label, onClose }: { label: string; onClose: () => void }) {
  const present = useIsPresent();
  const ref = useFocusTrap(present);
  return (
    <DialogPanel
      trapRef={ref}
      role="alertdialog"
      label={`${label} unavailable`}
      overlayClassName="z-[60]"
      className="max-w-sm overflow-y-auto p-6"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <h2 className="font-display text-xl text-ink">{label} could not load</h2>
      <p className="mb-5 mt-2 text-sm text-ink-soft">Reconnect and reload to try again.</p>
      <Button onClick={onClose}>Close</Button>
    </DialogPanel>
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
      fallback={
        <AnimatePresence>
          {open && <UnavailableOverlay label={label} onClose={onClose} />}
        </AnimatePresence>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
