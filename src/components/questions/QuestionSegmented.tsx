import { useId } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';

/** Pill track with a white sliding pill, as on the course tabs. */
export function QuestionSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const pillId = useId();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex gap-0.5 rounded-full bg-ink/[0.06] p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative min-h-11 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              selected ? 'text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId={pillId}
                transition={scaledSpring(multiplier, 500, 36)}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.08)]"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
