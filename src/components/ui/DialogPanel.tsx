import { m as motion, useIsPresent } from 'motion/react';
import type { ComponentProps, KeyboardEvent, ReactNode, RefObject } from 'react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { CloseIcon } from './icons';
import { ModalBackdrop } from './ModalBackdrop';
import { MOTION_DURATION, MOTION_EASING, scaledSpring } from './motion';

interface DialogPanelProps {
  /** The dialog's accessible name. */
  label: string;
  /** The focus trap's container ref (from `useFocusTrap`). */
  trapRef: RefObject<HTMLDivElement | null>;
  /** Key handling for the whole dialog, including Escape; each caller owns its shortcuts. */
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Called when the backdrop is clicked. Omit to keep the dialog open. */
  onBackdropClick?: () => void;
  backdropProps?: Omit<ComponentProps<typeof ModalBackdrop>, 'onClick'> & {
    'data-testid'?: string;
  };
  /** Width and other panel classes, such as `max-w-md max-h-[90vh]`. */
  className?: string;
  /** Extra overlay classes, such as safe-area padding. */
  overlayClassName?: string;
  /** Animate the panel's size when its content changes. */
  layout?: boolean;
  children: ReactNode;
}

/**
 * A centred modal dialog: a fading overlay with a blurred backdrop and a card-surface panel
 * that springs into place. Motion follows the user's motion-speed setting.
 */
export function DialogPanel({
  label,
  trapRef,
  onKeyDown,
  onBackdropClick,
  backdropProps,
  className,
  overlayClassName,
  layout = false,
  children,
}: DialogPanelProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const present = useIsPresent();
  return (
    <motion.div
      ref={trapRef}
      inert={!present}
      aria-hidden={!present || undefined}
      className={cn('fixed inset-0 z-50 flex flex-col', overlayClassName)}
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={m > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: MOTION_DURATION.feedback * m, ease: MOTION_EASING.standard }}
      onKeyDown={onKeyDown}
    >
      <ModalBackdrop shade={50} {...backdropProps} onClick={onBackdropClick} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={m > 0 ? { opacity: 0, y: 16, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={m > 0 ? { opacity: 0, y: 16, scale: 0.98 } : undefined}
        layout={layout && m > 0 ? 'position' : undefined}
        transition={scaledSpring(m, 320, 30)}
        className={cn(
          // Quick search's modal surface: borderless white, lifted by a soft ink shadow.
          'relative z-10 m-auto flex w-full flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_24px_48px_-16px_hsl(var(--ink)/0.35),0_0_0_1px_hsl(var(--ink)/0.05)]',
          className,
        )}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

interface DialogHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  closeLabel: string;
}

/** A dialog's title row with an optional description and a 44px close button. */
export function DialogHeader({ title, description, onClose, closeLabel }: DialogHeaderProps) {
  return (
    <header className="relative flex items-center justify-between gap-4 border-b border-line px-6 py-4">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-faint">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        title="Close (Esc)"
        data-dialog-close
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <CloseIcon width={18} height={18} />
      </button>
    </header>
  );
}
