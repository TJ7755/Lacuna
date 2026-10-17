import { SECTION_CARD_SURFACE_CLASS } from '../../components/ui/SectionCard';
// Shared building blocks for the global Settings screen (Direction C): the card
// surface with its staggered arrival, the segmented pill control and the pill
// switch. Every animation is scaled by the motion multiplier and switches off at 0.

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { m as motion } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { MOTION_EASING } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

/** Card surface shared by every settings section: a flat surface with a hairline border. */
export const SETTINGS_CARD_CLASS =
  `${SECTION_CARD_SURFACE_CLASS} mb-5 p-6 md:p-7`;

/** Section headings sit in ink with only the icon tinted, so cards read calmly. */
export const SETTINGS_HEADING_ROW_CLASS = 'flex items-center gap-2.5 text-ink [&>svg]:text-accent-ink';

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

export { SegmentedPills, type SegmentedOption } from '../../components/ui/SegmentedPills';

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
      <div id={labelId} className="min-w-0 flex-1 basis-48 font-semibold text-ink">
        {label}
      </div>
      {children}
    </div>
  );
}

export { choiceChipClass } from '../../components/ui/choiceChip';
