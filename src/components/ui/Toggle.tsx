import { m as motion } from 'motion/react';
import { cn } from './cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, id, disabled }: ToggleProps) {
  return (
    <label htmlFor={id} className={cn('inline-flex items-center gap-3 select-none', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-ink/20',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
      {label && <span className="text-sm text-ink-soft">{label}</span>}
    </label>
  );
}
