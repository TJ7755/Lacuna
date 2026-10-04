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

/** Pill-shaped switch whose knob springs between the two ends. Also exported as PillSwitch. */
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
          // The pseudo-element widens the hit area to the 44 px minimum without growing the visual.
          "relative h-7 w-12 shrink-0 rounded-full transition-colors before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          checked ? 'bg-accent' : 'bg-ink/20',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={scaledSpring(multiplier, 520, 24)}
          className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        />
      </button>
      {label && <span className="text-sm text-ink-soft">{label}</span>}
    </label>
  );
}
