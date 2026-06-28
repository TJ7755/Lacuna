// A circular path node representing a single lesson on the course path.
//
// Presentational only: it renders the visual state passed in and reports clicks,
// but performs no data fetching or unlock logic (that lives in src/course/path.ts).
//
// British English throughout.

import { m as motion } from 'motion/react';
import type { Lesson } from '../../db/types';
import type { LessonStatus } from '../../course/path';
import { CheckIcon, SparklesIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

interface LessonNodeProps {
  lesson: Lesson;
  status: LessonStatus;
  onClick?: () => void;
}

/** Per-status styling for the circular node. */
const circleByStatus: Record<LessonStatus, string> = {
  // Completed: filled with the accent, high contrast tick.
  completed: 'bg-accent text-accent-fg border-accent shadow-sm shadow-accent/25',
  // Available: outlined and interactive, accent on hover.
  available:
    'bg-surface-raised text-accent border-accent/60 hover:border-accent hover:shadow-sm hover:shadow-accent/20',
  // Locked: greyed and inert.
  locked: 'bg-surface text-ink-faint border-line',
};

export function LessonNode({ lesson, status, onClick }: LessonNodeProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const locked = status === 'locked';
  const interactive = !locked && onClick !== undefined;
  const isExtension = lesson.isExtension;

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={interactive ? onClick : undefined}
        disabled={!interactive}
        aria-disabled={locked || undefined}
        aria-label={lesson.name}
        whileTap={interactive ? { scale: 0.94 } : undefined}
        whileHover={interactive ? { scale: 1.05 } : undefined}
        transition={{ type: 'spring', stiffness: 600, damping: 28 * (m || 1) }}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-full border-2',
          'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
          interactive ? 'cursor-pointer' : 'cursor-default',
          // Extension nodes use a dashed border to read as off-path enrichment.
          isExtension && !locked && 'border-dashed',
          circleByStatus[status],
        )}
      >
        {status === 'completed' ? (
          <CheckIcon width={24} height={24} />
        ) : isExtension ? (
          <SparklesIcon width={22} height={22} />
        ) : (
          <span className="text-base font-semibold tabular-nums">
            {lesson.orderIndex + 1}
          </span>
        )}
      </motion.button>
      <span
        className={cn(
          'max-w-[7rem] text-center text-xs font-medium leading-tight',
          locked ? 'text-ink-faint' : 'text-ink-soft',
        )}
      >
        {lesson.name}
        {isExtension && (
          <span className="mt-0.5 block text-[0.65rem] uppercase tracking-wide text-ink-faint">
            Extension
          </span>
        )}
      </span>
    </div>
  );
}
