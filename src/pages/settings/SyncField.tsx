import { fieldLabelClassName, Input } from '../../components/ui/Field';

export function SyncField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
  placeholder?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-11 text-sm placeholder:text-ink-faint"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
