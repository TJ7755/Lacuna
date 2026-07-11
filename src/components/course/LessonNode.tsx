// A circular path node representing a single lesson on the course path.
//
// Presentational only: it renders the visual state passed in and reports clicks,
// but performs no data fetching or unlock logic (that lives in src/course/path.ts).
//
// British English throughout.

import { useEffect, useRef } from 'react';
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
  /** True for the single next-up lesson on the path — the "you are here" marker. */
  current?: boolean;
  /** Shown as a title tooltip while locked, explaining what unlocks the lesson. */
  lockHint?: string;
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

export function LessonNode({ lesson, status, onClick, current, lockHint }: LessonNodeProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const locked = status === 'locked';
  const interactive = !locked && onClick !== undefined;
  const isExtension = lesson.isExtension;
  const here = current && status === 'available';

  // Replay a short settle-in whenever the status itself changes after mount
  // (most notably locked → available or available → completed), so a lesson
  // completing while the page is mounted animates into its new state rather
  // than snapping. Suppressed on the very first render, which the path-wide
  // stagger in CoursePath already animates in.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
  }, []);
  const settleKey = mountedRef.current ? status : 'initial';

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        key={settleKey}
        type="button"
        onClick={interactive ? onClick : undefined}
        disabled={!interactive}
        aria-disabled={locked || undefined}
        aria-label={lesson.name}
        title={locked ? lockHint : undefined}
        initial={mountedRef.current ? { scale: 0.82, opacity: 0.5 } : false}
        animate={{ scale: 1, opacity: 1 }}
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
          // "You are here": a quiet breathing halo on the next lesson to take.
          here && 'path-here-glow',
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
