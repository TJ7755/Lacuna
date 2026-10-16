// Two-step inline confirmation: a contained consequence-and-actions panel
// that replaces a trigger control in place, so destructive actions never rely on
// window.confirm() (blocks in tests, looks native nowhere). See NoteRow.tsx and
// Settings.tsx's backup-restore list for the hand-rolled versions this replaces.

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { buttonClassName } from './buttonStyles';
import { motionTransition } from './motion';
import { dialogKeyDown } from '../../hooks/dialogKeys';

export interface ConfirmInlineProps {
  /** Short prompt shown before the buttons, e.g. "Delete?" or "Replace all data?". */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  /** Preserve caller-owned busy states, including work that does not return a promise. */
  disabled?: boolean;
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
  return motionTransition('feedback', multiplier);
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** Retain the visual exit without retaining its interactive controls. */
const SwapSurface = forwardRef<HTMLDivElement, ComponentProps<typeof motion.div>>(
  function SwapSurface(props, ref) {
    const present = useIsPresent();
    return (
      <motion.div
        {...props}
        ref={ref}
        inert={!present}
        aria-hidden={!present || undefined}
        style={{ ...props.style, pointerEvents: present ? props.style?.pointerEvents : 'none' }}
      />
    );
  },
);

export function ConfirmInline({
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'destructive',
  disabled = false,
  announce = false,
  focusOnMount,
  className,
}: ConfirmInlineProps) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const present = useIsPresent();

  useEffect(() => {
    if (!present) return;
    if (!rootRef.current?.contains(document.activeElement)) {
      openerRef.current = document.activeElement as HTMLElement | null;
    }
    if (focusOnMount === 'confirm') confirmRef.current?.focus();
    if (focusOnMount === 'cancel') cancelRef.current?.focus();
  }, [focusOnMount, present]);

  const confirm = () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    try {
      const result = onConfirm();
      if (result) {
        setPending(true);
        // Leave rejection handling with the caller; only release our pending guard.
        return result.finally(() => {
          inFlight.current = false;
          setPending(false);
        });
      }
      inFlight.current = false;
    } catch (error) {
      inFlight.current = false;
      throw error;
    }
  };

  const cancel = () => {
    if (inFlight.current || disabled) return;
    const focused = document.activeElement;
    const returnFocus = rootRef.current?.contains(focused);
    onCancel();
    const opener = openerRef.current;
    if (
      returnFocus &&
      document.activeElement === focused &&
      opener?.isConnected &&
      !opener.closest('[inert]')
    )
      opener.focus();
  };

  return (
    <div
      ref={rootRef}
      aria-busy={pending || disabled}
      className={cn(
        '@container w-full min-w-0 max-w-full rounded-2xl border p-4',
        variant === 'destructive' ? 'border-negative/20 bg-negative/5' : 'border-line bg-surface',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          dialogKeyDown({ onCancel: cancel })(event);
        }
      }}
    >
      <div className="flex flex-col gap-3 @min-[32rem]:flex-row @min-[32rem]:items-center">
        <span
          role={announce ? 'status' : undefined}
          aria-live={announce ? 'polite' : undefined}
          className="min-w-0 flex-1 text-sm text-ink-soft"
          style={{ overflowWrap: 'anywhere' }}
        >
          {message}
        </span>
        <div className="flex max-w-full flex-wrap gap-2 @min-[32rem]:shrink-0">
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            disabled={pending || disabled}
            style={{ transitionDuration: `${150 * multiplier}ms` }}
            className={cn(
              buttonClassName(variant === 'destructive' ? 'danger' : 'primary', 'sm'),
              'max-w-full break-words',
            )}
          >
            {confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            disabled={pending || disabled}
            style={{ transitionDuration: `${150 * multiplier}ms` }}
            className={buttonClassName('secondary', 'sm')}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
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
      layout="position"
      transition={inlineConfirmTiming(multiplier)}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center',
        active && 'w-full',
        swapClassName,
      )}
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
          <SwapSurface
            key="confirmation"
            initial={multiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={multiplier > 0 ? { opacity: 0 } : undefined}
            transition={inlineConfirmTiming(multiplier)}
            className="flex w-full min-w-0 max-w-full items-center"
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
          </SwapSurface>
        ) : (
          <SwapSurface
            key="trigger"
            data-confirm-trigger=""
            initial={multiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={multiplier > 0 ? { opacity: 0 } : undefined}
            transition={inlineConfirmTiming(multiplier)}
            className="flex min-w-0 max-w-full items-center"
          >
            {children}
          </SwapSurface>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
