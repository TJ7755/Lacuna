import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './cn';

type ToastTone = 'neutral' | 'positive' | 'negative';

interface ToastOptions {
  /** Label for an inline action button (e.g. "Undo"). */
  actionLabel?: string;
  /** Invoked when the action button is pressed; the toast then dismisses. */
  onAction?: () => void;
  /** Lifetime in milliseconds. Defaults to 3500ms, or 6000ms when an action is shown. */
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'neutral', options?: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [
        ...prev,
        { id, message, tone, actionLabel: options?.actionLabel, onAction: options?.onAction },
      ]);
      const duration =
        options?.duration ?? (options?.actionLabel ? 6000 : 3500);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'flex items-center gap-4 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur bg-surface-raised/95 max-w-xs',
                t.tone === 'positive' && 'border-positive/40 text-positive',
                t.tone === 'negative' && 'border-negative/40 text-negative',
                t.tone === 'neutral' && 'border-line-strong text-ink',
              )}
            >
              <span className="min-w-0 flex-1">{t.message}</span>
              {t.actionLabel && (
                <button
                  type="button"
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                  className="shrink-0 font-medium text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
                >
                  {t.actionLabel}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
