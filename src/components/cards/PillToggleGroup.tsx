// A pill-track segmented control whose white pill slides to the pressed option.
// Options are aria-pressed buttons, so it suits both mode switches (lesson
// Study / Edit) and pickers (card type, preview side). Same look as CourseTabs.
// A picker can hold back its rarer options behind a trailing More pill. They are
// appended where More stood, so the pills already shown never move.

import { useId } from 'react';
import { AnimatePresence, LayoutGroup, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { ChevronDownIcon } from '../ui/icons';

export interface PillToggleOption<T extends string> {
  value: T;
  label: string;
  /** Accessible name when it should differ from the visible label. */
  ariaLabel?: string;
  description?: string;
}

export function PillToggleGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
  onMore,
  moreLabel,
}: {
  options: readonly PillToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
  size?: 'sm' | 'md';
  /** Shows a trailing More pill that asks the caller to reveal further options. */
  onMore?: () => void;
  /** Accessible name of the More pill, e.g. "More card types". */
  moreLabel?: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const groupId = useId();
  const pillClass = cn(
    'relative flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink',
    size === 'md'
      ? 'min-h-11 px-4 text-sm'
      : // The pseudo-element reaches over the track's padding to the 44 px minimum.
        "min-h-9 px-3.5 text-sm before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
  );
  // Revealed options settle in where More stood. Static groups never change their
  // options, so for them this is inert.
  const reveal = {
    initial: multiplier > 0 ? { opacity: 0, scale: 0.94 } : false,
    animate: { opacity: 1, scale: 1 },
    exit: multiplier > 0 ? { opacity: 0, scale: 0.94 } : undefined,
    transition: scaledSpring(multiplier, 380, 34),
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-ink/[0.06] p-1',
        className,
      )}
    >
      <LayoutGroup id={groupId}>
        <AnimatePresence initial={false} mode="popLayout">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <motion.button
                key={option.value}
                {...reveal}
                type="button"
                aria-pressed={active}
                aria-label={option.ariaLabel}
                aria-description={option.description}
                title={option.description}
                onClick={() => onChange(option.value)}
                className={cn(pillClass, active ? 'text-ink' : 'text-ink-soft hover:text-ink')}
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
              </motion.button>
            );
          })}
          {onMore && (
            <motion.button
              key="pill-toggle-more"
              {...reveal}
              type="button"
              aria-label={moreLabel}
              aria-expanded={false}
              onClick={onMore}
              className={cn(pillClass, 'gap-1 text-ink-soft hover:text-ink')}
            >
              More
              <ChevronDownIcon width={14} height={14} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
