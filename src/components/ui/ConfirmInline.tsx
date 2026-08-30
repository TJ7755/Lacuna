// Two-step inline confirmation: a compact "<message> <confirm>/<cancel>" cluster
// that replaces a trigger control in place, so destructive actions never rely on
// window.confirm() (blocks in tests, looks native nowhere). See NoteRow.tsx and
// Settings.tsx's backup-restore list for the hand-rolled versions this replaces.

import { useEffect, useRef } from 'react';
import { cn } from './cn';

interface ConfirmInlineProps {
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
