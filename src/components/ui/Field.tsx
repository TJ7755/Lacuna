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
      <label className={cn(fieldLabelClassName, className)}>
        {label}
        {children}
        {hint && <span className={fieldHintClassName}>{hint}</span>}
        {error && (
          <span id={errorId} role="alert" className="mt-1 block text-xs font-normal text-negative">
            {error}
          </span>
        )}
      </label>
    </FieldContext.Provider>
  );
}

/**
 * One rule for a label above its control, across Settings and every form: small,
 * semibold ink, matching the setting rows. Hints and controls inside reset to regular.
 */
export const fieldLabelClassName = 'block text-sm font-semibold text-ink';

/** Explanatory text beneath a labelled control. */
export const fieldHintClassName = 'mt-1 block text-xs font-normal text-ink-faint';

/** A text control's frame alone, for controls laid out in a row (`cn` does not merge classes). */
export const inputFrameClassName =
  'rounded-xl border-[1.5px] border-line bg-surface px-3.5 py-2.5 font-normal text-ink outline-none focus:border-accent';

export const inputClassName = `mt-2 w-full ${inputFrameClassName}`;

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
