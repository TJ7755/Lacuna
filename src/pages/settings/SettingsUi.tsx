import { SECTION_CARD_SURFACE_CLASS } from '../../components/ui/SectionCard';
// Shared building blocks for the global Settings screen (Direction C): the card
// surface with its staggered arrival, the segmented pill control and the pill
// switch. Every animation is scaled by the motion multiplier and switches off at 0.

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { LayoutGroup, m as motion } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { MOTION_EASING, scaledSpring } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

/** Card surface shared by every settings section: no border, soft layered shadow. */
export const SETTINGS_CARD_CLASS =
  `${SECTION_CARD_SURFACE_CLASS} mb-5 p-6 md:p-7`;

/** Section headings sit in ink with only the icon tinted, so cards read calmly. */
export const SETTINGS_HEADING_ROW_CLASS = 'flex items-center gap-2.5 text-ink [&>svg]:text-accent';

/** Longest stagger, so a long page never leaves later cards waiting. */
const MAX_STAGGER_STEPS = 8;

/** How far each card's arrival is delayed behind the one before it, in seconds. */
export const ARRIVAL_STEP = 0.04;

export function arrivalDelay(index: number, multiplier: number): number {
  return Math.min(index, MAX_STAGGER_STEPS) * ARRIVAL_STEP * multiplier;
}

const ArrivalContext = createContext<{ take: () => number } | null>(null);

/** Hands each card beneath it the next place in the arrival order. */
export function SettingsArrivalProvider({ children }: { children: ReactNode }) {
  const counter = useRef(0);
  const [value] = useState(() => ({ take: () => counter.current++ }));
  return <ArrivalContext.Provider value={value}>{children}</ArrivalContext.Provider>;
}

export function SettingsCard({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const arrival = useContext(ArrivalContext);
  const [index] = useState(() => arrival?.take() ?? 0);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <motion.section
      id={id}
      initial={multiplier > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.3 * multiplier,
        delay: arrivalDelay(index, multiplier),
        ease: MOTION_EASING.emphasised,
      }}
      className={cn(SETTINGS_CARD_CLASS, className)}
    >
      {children}
    </motion.section>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is only an icon or a glyph. */
  ariaLabel?: string;
}

/**
 * Pill track with a white pill that slides (and springs) to the chosen option.
 * A single radiogroup with roving focus: arrows, Home and End move the choice.
 */
export function SegmentedPills<T extends string>({
  label,
  value,
  options,
  onChange,
  describedBy,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  describedBy?: string;
  className?: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const groupId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.findIndex((option) => option.value === value);

  function choose(index: number) {
    onChange(options[index].value);
    buttons.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % options.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = options.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    choose(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className={cn('inline-flex rounded-full bg-ink/[0.06] px-1', className)}
    >
      <LayoutGroup id={groupId}>
        {options.map((option, index) => {
          const active = index === selected;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.ariaLabel}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'relative inline-flex h-11 min-w-11 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'text-ink' : 'text-ink-soft hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="segmented-pill"
                  aria-hidden="true"
                  transition={scaledSpring(multiplier, 520, 36)}
                  className="absolute inset-x-0 inset-y-1 rounded-full bg-surface shadow-[0_1px_3px_hsl(var(--ink)/0.14)]"
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

/** The app-wide pill switch; one implementation lives in components/ui/Toggle. */
export { Toggle as PillSwitch } from '../../components/ui/Toggle';

/** A label on the left and its control on the right; wraps beneath on narrow screens. */
export function SettingRow({
  label,
  labelId,
  children,
  className,
}: {
  label: ReactNode;
  labelId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3', className)}
    >
      <span id={labelId} className="min-w-0 flex-1 basis-48 font-semibold text-ink">
        {label}
      </span>
      {children}
    </div>
  );
}

export { choiceChipClass } from '../../components/ui/choiceChip';
