// A pill-track segmented control whose white pill slides to the pressed option.
// Options are aria-pressed buttons, so it suits both mode switches (lesson
// Study / Edit) and pickers (card type, preview side). Same look as CourseTabs.

import { useId } from 'react';
import { LayoutGroup, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';

export interface PillToggleOption<T extends string> {
  value: T;
  label: string;
  /** Accessible name when it should differ from the visible label. */
  ariaLabel?: string;
}

export function PillToggleGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: readonly PillToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const groupId = useId();

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-ink/[0.06] p-1',
        className,
      )}
    >
      <LayoutGroup id={groupId}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              aria-label={option.ariaLabel}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                size === 'md' ? 'min-h-11 px-4 text-sm' : 'min-h-9 px-3.5 text-sm',
                active ? 'text-ink' : 'text-ink-soft hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="pill-toggle-active"
                  aria-hidden="true"
                  transition={scaledSpring(multiplier, 320, 28)}
                  className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.08)]"
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </LayoutGroup>
    </div>
  );
}
