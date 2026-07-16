// Two-step inline confirmation: a compact "<message> <confirm>/<cancel>" cluster
// that replaces a trigger control in place, so destructive actions never rely on
// window.confirm() (blocks in tests, looks native nowhere). See NoteRow.tsx and
// Settings.tsx's backup-restore list for the hand-rolled versions this replaces.

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
  className?: string;
}

export function ConfirmInline({
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'destructive',
  className,
}: ConfirmInlineProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="mr-1 text-xs text-ink-soft">{message}</span>
      <button
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
        type="button"
        onClick={onCancel}
        className="min-h-9 rounded-lg px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-ink/5"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
