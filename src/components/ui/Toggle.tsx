import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { scaledSpring } from './motion';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, ariaLabel, id, disabled }: ToggleProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex items-center gap-3 select-none',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{ transitionDuration: `${200 * multiplier}ms` }}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-lg border border-black/5 shadow-inner transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
          checked ? 'bg-accent' : 'bg-ink/20',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 grid h-[22px] w-[22px] place-items-center rounded-md border border-black/10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={scaledSpring(multiplier, 360, 26)}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex gap-0.5 transition-colors',
              checked ? 'text-accent' : 'text-ink-faint',
            )}
          >
            <span className="h-2 w-0.5 rounded-sm bg-current" />
            <span className="h-2 w-0.5 rounded-sm bg-current" />
          </span>
        </motion.span>
      </button>
      {label && <span className="text-sm text-ink-soft">{label}</span>}
    </label>
  );
}
