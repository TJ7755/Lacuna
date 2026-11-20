import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

let toastIdCounter = 0;
import { AnimatePresence, m as motion } from 'motion/react';
import { cn } from './cn';
import { CheckIcon, CloseIcon, InfoIcon } from './icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { Button } from './Button';
import { motionTransition } from './motion';

type ToastTone = 'neutral' | 'positive' | 'negative';

interface ToastOptions {
  /** Label for an inline action button (e.g. "Undo"). */
  actionLabel?: string;
  /** Invoked when the action button is pressed; the toast then dismisses. */
  onAction?: () => void;
  /** Explicit lifetime in milliseconds; overrides the default persistent error notice. */
  duration?: number;
  /** Errors stay until dismissed by default; false opts back into the usual timer. */
  persistent?: boolean;
  /** Invoked on Escape dismissal, action activation or expiry. */
  onDismiss?: () => void;
  /** Replaces an existing toast with the same key instead of leaving stale actions stacked. */
  replaceKey?: string;
  /** Keep the action available when newer notifications would crowd it out. */
  keepVisible?: boolean;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  replaceKey?: string;
  keepVisible?: boolean;
  duration: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    let pendingDismissal: ReturnType<typeof setTimeout>;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.isComposing) return;
      const overlaySelector = '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]';
      if (document.querySelector(overlaySelector)) return;
      // A new task runs after every native listener; microtasks can run between listeners.
      clearTimeout(pendingDismissal);
      pendingDismissal = setTimeout(() => {
        if (event.defaultPrevented || document.querySelector(overlaySelector)) return;
        const latest = toasts.at(-1)!;
        const surface = stackRef.current?.querySelector(`[data-toast-id="${latest.id}"]`);
        if (surface?.contains(document.activeElement) && previousFocus.current?.isConnected) {
          previousFocus.current.focus({ preventScroll: true });
        }
        latest.onDismiss?.();
        dismiss(latest.id);
      }, 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(pendingDismissal);
    };
  }, [toasts, dismiss]);

  const MAX_TOASTS = 5;

  const notify = useCallback(
    (message: string, tone: ToastTone = 'neutral', options?: ToastOptions) => {
      const id = ++toastIdCounter;
      const persistent =
        options?.persistent ?? (tone === 'negative' && options?.duration === undefined);
      const duration = persistent
        ? Infinity
        : (options?.duration ?? (options?.actionLabel ? 6000 : 3500));
      setToasts((prev) => {
        const next = [
          ...prev.filter(
            (toast) => !options?.replaceKey || toast.replaceKey !== options.replaceKey,
          ),
          {
            id,
            message,
            tone,
            actionLabel: options?.actionLabel,
            onAction: options?.onAction,
            onDismiss: options?.onDismiss,
            replaceKey: options?.replaceKey,
            keepVisible: options?.keepVisible,
            duration,
          },
        ];
        // Keep an action with a time-sensitive consequence visible for its full lifetime.
        if (next.length > MAX_TOASTS) {
          const oldestDismissable = next.findIndex((toast) => !toast.keepVisible);
          next.splice(Math.max(0, oldestDismissable), 1);
        }
        return next;
      });
      // Dismissal is managed by ToastBar via requestAnimationFrame so it can be paused on hover.
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        ref={stackRef}
        onFocusCapture={(event) => {
          const from = event.relatedTarget;
          if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
            previousFocus.current = from;
          }
        }}
        className="toast-stack fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] flex flex-col items-end gap-2"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastBar
              key={t.replaceKey ? `replace:${t.replaceKey}` : t.id}
              toast={t}
              onDismiss={() => dismiss(t.id)}
              motionMultiplier={m}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastBar({
  toast,
  onDismiss,
  motionMultiplier,
}: {
  toast: ToastItem;
  onDismiss: () => void;
  motionMultiplier?: number;
}) {
  const m = motionMultiplier ?? 1;
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const remainingRef = useRef<number>(toast.duration === Infinity ? 1 : toast.duration);
  const onDismissRef = useRef(onDismiss);
  const isPersistent = toast.duration === Infinity;

  // Keep the latest onDismiss without causing re-runs.
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const { onDismiss: onDismissProp, duration: toastDuration } = toast;

  const resume = useCallback(() => {
    if (isPersistent || hoveredRef.current || focusedRef.current) return;
    cancelAnimationFrame(rafRef.current);
    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startRef.current;
      const currentRemaining = Math.max(0, remainingRef.current - elapsed);
      if (currentRemaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDismissProp?.();
        onDismissRef.current();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [isPersistent, onDismissProp]);

  const pause = useCallback(() => {
    if (!rafRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const elapsed = performance.now() - startRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
  }, []);

  useEffect(() => {
    remainingRef.current = isPersistent ? 1 : toastDuration;
    if (isPersistent) {
      return;
    }
    resume();
    return () => cancelAnimationFrame(rafRef.current);
  }, [resume, isPersistent, toast.id, toastDuration]);

  const toneClasses = {
    positive: 'text-positive',
    negative: 'text-negative',
    neutral: 'text-ink',
  } as const;

  return (
    <motion.div
      data-toast-id={toast.id}
      layout={m > 0 ? 'position' : undefined}
      initial={m > 0 ? { opacity: 0, x: 12 } : false}
      animate={{ opacity: 1, x: 0 }}
      exit={m > 0 ? { opacity: 0, x: 12 } : undefined}
      transition={motionTransition('feedback', m)}
      className="relative w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-surface px-4 py-0.5 text-sm leading-5 text-ink card-surface"
      onMouseEnter={() => {
        hoveredRef.current = true;
        pause();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        resume();
      }}
      onFocus={() => {
        focusedRef.current = true;
        pause();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focusedRef.current = false;
        resume();
      }}
    >
      <div className="flex min-h-12 w-full items-center gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3 py-2.5">
          <span className={cn('mt-0.5 shrink-0', toneClasses[toast.tone])} aria-hidden="true">
            {toast.tone === 'positive' && <CheckIcon width={16} height={16} />}
            {toast.tone === 'negative' && <CloseIcon width={16} height={16} />}
            {toast.tone === 'neutral' && <InfoIcon width={16} height={16} />}
          </span>
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
        </div>
        {isPersistent && toast.actionLabel && (
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Dismiss"
              onClick={() => {
                toast.onDismiss?.();
                onDismiss();
              }}
              className="min-h-12 min-w-12 shrink-0"
            >
              <CloseIcon width={14} height={14} />
            </Button>
          </div>
        )}
        {toast.actionLabel && (
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                toast.onAction?.();
                toast.onDismiss?.();
                onDismiss();
              }}
              className="min-h-12 min-w-12 shrink-0"
            >
              <span className="text-accent-ink">{toast.actionLabel}</span>
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
