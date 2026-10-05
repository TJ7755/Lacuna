import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';

interface FieldContextValue {
  id: string;
  errorId?: string;
}

const FieldContext = createContext<FieldContextValue | null>(null);

interface FieldProps {
  label: ReactNode;
  /** Explanatory text shown beneath the control. */
  hint?: ReactNode;
  /** Validation message; marks the control invalid and describes it. */
  error?: ReactNode;
  className?: string;
  /** The control, usually an `Input`, which takes its id from this field. */
  children: ReactNode;
}

/**
 * A labelled form control with optional hint and error text. The label wraps its
 * control, so any child (an `Input`, `Select` or textarea) is associated without
 * id wiring; `Input` still takes the field's id so other elements can refer to it.
 */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <FieldContext.Provider value={{ id, errorId }}>
      <label className={cn('block text-sm text-ink-soft', className)}>
        {label}
        {children}
        {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
        {error && (
          <span id={errorId} role="alert" className="mt-1 block text-xs text-negative">
            {error}
          </span>
        )}
      </label>
    </FieldContext.Provider>
  );
}

export const inputClassName =
  'mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent';

/** The standard text input. Inside a `Field` it is labelled and described by that field. */
export function Input({ className, id, ...props }: ComponentProps<'input'>) {
  const field = useContext(FieldContext);
  return (
    <input
      id={id ?? field?.id}
      aria-invalid={field?.errorId ? true : undefined}
      aria-describedby={field?.errorId}
      {...props}
      className={cn(inputClassName, className)}
    />
  );
}
