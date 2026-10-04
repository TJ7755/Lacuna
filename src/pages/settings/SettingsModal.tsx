// Modal used by the Your data cards: the scrim fades, the panel rises with a spring.
// Rendered in a portal so a card's arrival transform can never trap its fixed position.

import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { ModalBackdrop } from '../../components/ui/ModalBackdrop';
import { scaledSpring } from '../../components/ui/motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

function ModalPanel({
  labelledBy,
  role,
  onClose,
  autoFocusSelector,
  multiplier,
  wide,
  children,
}: {
  labelledBy: string;
  wide?: boolean;
  role: 'dialog' | 'alertdialog';
  onClose: () => void;
  autoFocusSelector?: string;
  multiplier: number;
  children: ReactNode;
}) {
  const trapRef = useFocusTrap(true, { autoFocusSelector });

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col p-4"
      initial={multiplier > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={multiplier > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: 0.18 * multiplier }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <ModalBackdrop shade={40} onClick={onClose} />
      <motion.div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={multiplier > 0 ? { opacity: 0, y: 18, scale: 0.97 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={multiplier > 0 ? { opacity: 0, y: 12, scale: 0.98 } : undefined}
        transition={scaledSpring(multiplier, 380, 30)}
        className={cn(
          'relative z-10 m-auto w-full rounded-3xl',
          wide ? 'max-w-lg' : 'max-w-md',
          'max-h-[90vh] overflow-y-auto bg-surface p-6 shadow-[0_24px_64px_-24px_hsl(var(--ink)/0.45)] md:p-7',
        )}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function SettingsModal({
  open,
  labelledBy,
  role = 'dialog',
  onClose,
  autoFocusSelector,
  wide,
  children,
}: {
  open: boolean;
  /** A roomier panel for forms. */
  wide?: boolean;
  labelledBy: string;
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  /** Element to focus on open; defaults to the first focusable control. */
  autoFocusSelector?: string;
  children: ReactNode;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalPanel
          labelledBy={labelledBy}
          role={role}
          onClose={onClose}
          autoFocusSelector={autoFocusSelector}
          multiplier={multiplier}
          wide={wide}
        >
          {children}
        </ModalPanel>
      )}
    </AnimatePresence>,
    document.body,
  );
}
