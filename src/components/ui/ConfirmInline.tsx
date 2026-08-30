// Two-step inline confirmation: a compact "<message> <confirm>/<cancel>" cluster
// that replaces a trigger control in place, so destructive actions never rely on
// window.confirm() (blocks in tests, looks native nowhere). See NoteRow.tsx and
// Settings.tsx's backup-restore list for the hand-rolled versions this replaces.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';

export interface ConfirmInlineProps {
  /** Short prompt shown before the buttons, e.g. "Delete?" or "Replace all data?". */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 'destructive' styles the confirm button in the negative colour; 'default' uses accent. */
  variant?: 'destructive' | 'default';
  /** Announce the newly mounted prompt without forcing every inline confirmation to be live. */
  announce?: boolean;
  /** Move focus into a confirmation that replaces its trigger. */
  focusOnMount?: 'confirm' | 'cancel';
  className?: string;
}

interface ConfirmInlineSwapProps extends ConfirmInlineProps {
  active: boolean;
  children: ReactNode;
  /** Class applied to the size-animating wrapper rather than the prompt. */
  swapClassName?: string;
}

export function inlineConfirmTiming(multiplier: number) {
  return { duration: 0.16 * multiplier, ease: [0.16, 1, 0.3, 1] as const };
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

export function ConfirmInline({
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'destructive',
  announce = false,
  focusOnMount,
  className,
}: ConfirmInlineProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusOnMount === 'confirm') confirmRef.current?.focus();
    if (focusOnMount === 'cancel') cancelRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span
        role={announce ? 'status' : undefined}
        aria-live={announce ? 'polite' : undefined}
        className="mr-1 text-xs text-ink-soft"
      >
        {message}
      </span>
      <button
        ref={confirmRef}
        type="button"
        onClick={onConfirm}
        className={cn(
          'min-h-9 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
          variant === 'destructive'
            ? 'text-negative hover:bg-negative/10'
            : 'text-accent hover:bg-accent/10',
        )}
      >
        {confirmLabel}
      </button>
      <button
        ref={cancelRef}
        type="button"
        onClick={onCancel}
        className="min-h-9 rounded-lg px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-ink/5"
      >
        {cancelLabel}
      </button>
    </div>
  );
}

/**
 * Replaces an action cluster with its inline confirmation while preserving
 * spatial continuity. Cancelling restores focus to the remounted trigger.
 */
export function ConfirmInlineSwap({
  active,
  children,
  onCancel,
  focusOnMount,
  announce,
  swapClassName,
  ...confirmationProps
}: ConfirmInlineSwapProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const returnFocusIndex = useRef(0);

  useLayoutEffect(() => {
    if (active || !returnFocus.current) return;
    returnFocus.current = false;
    const trigger = rootRef.current?.querySelector('[data-confirm-trigger]');
    const focusable = trigger?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[returnFocusIndex.current] ?? focusable?.[0])?.focus();
  }, [active]);

  return (
    <motion.div
      ref={rootRef}
      layout="size"
      transition={inlineConfirmTiming(multiplier)}
      className={cn('inline-flex items-center', swapClassName)}
      onClickCapture={(event) => {
        if (active) return;
        const trigger = rootRef.current?.querySelector('[data-confirm-trigger]');
        const target = (event.target as Element).closest<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!trigger || !target || !trigger.contains(target)) return;
        const focusable = Array.from(trigger.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        returnFocusIndex.current = Math.max(focusable.indexOf(target), 0);
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {active ? (
          <motion.div
            key="confirmation"
            initial={multiplier > 0 ? { opacity: 0, scale: 0.98 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={multiplier > 0 ? { opacity: 0, scale: 0.98 } : undefined}
            transition={inlineConfirmTiming(multiplier)}
            className="flex items-center"
          >
            <ConfirmInline
              {...confirmationProps}
              announce={announce ?? true}
              focusOnMount={focusOnMount ?? 'cancel'}
              onCancel={() => {
                returnFocus.current = true;
                onCancel();
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="trigger"
            data-confirm-trigger=""
            initial={multiplier > 0 ? { opacity: 0, scale: 0.98 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={multiplier > 0 ? { opacity: 0, scale: 0.98 } : undefined}
            transition={inlineConfirmTiming(multiplier)}
            className="flex items-center"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
