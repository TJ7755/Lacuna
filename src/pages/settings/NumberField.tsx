import { useId, useState, type ReactNode } from 'react';
import {
  fieldHintClassName,
  fieldLabelClassName,
  inputFrameClassName,
} from '../../components/ui/Field';

/**
 * A bounded whole-number setting. Typing edits a draft, so a field can be
 * cleared and retyped; the value commits on Enter or blur, Escape restores the
 * saved value, and an empty or out-of-range draft is never saved.
 */
export function NumberField({
  label,
  ariaLabel,
  value,
  suffix,
  hint,
  min,
  max = Number.MAX_SAFE_INTEGER,
  onCommit,
}: {
  label: ReactNode;
  ariaLabel?: string;
  value: number;
  suffix?: string;
  hint?: ReactNode;
  min: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function commit() {
    if (draft === null) return;
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(next) || next < min || next > max) {
      setError(true);
      return;
    }
    setDraft(null);
    setError(false);
    if (next !== value) onCommit(next);
  }

  return (
    <label className={fieldLabelClassName}>
      {label}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          min={min}
          max={max}
          value={draft ?? value}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(false);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape' && draft !== null) {
              event.stopPropagation();
              setDraft(null);
              setError(false);
            }
          }}
          className={`w-full ${inputFrameClassName}`}
        />
        {suffix && <span className="shrink-0 text-xs font-normal text-ink-faint">{suffix}</span>}
      </div>
      {hint && <span className={fieldHintClassName}>{hint}</span>}
      {error && (
        <span id={errorId} role="alert" className="mt-1 block text-xs font-normal text-negative">
          {max === Number.MAX_SAFE_INTEGER
            ? `Enter a whole number of at least ${min}.`
            : `Enter a whole number from ${min} to ${max}.`}
        </span>
      )}
    </label>
  );
}
