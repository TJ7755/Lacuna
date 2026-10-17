import { useId } from 'react';

export function QuestionSetChoices({
  label,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const name = useId();
  return (
    <fieldset className="qs-choices" disabled={disabled} aria-describedby={describedBy}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
