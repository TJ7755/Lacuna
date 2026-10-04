import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';

export type ResultTone = 'right' | 'partial' | 'wrong' | 'undetermined';

const TONE_CLASS: Record<ResultTone, string> = {
  right: 'bg-positive text-white',
  partial: 'bg-warning text-ink',
  wrong: 'bg-negative text-white',
  undetermined: 'bg-ink/10 text-ink-soft',
};

export function resultTone(
  marksEarned: number,
  marksAvailable: number,
  undetermined = false,
): ResultTone {
  if (undetermined) return 'undetermined';
  if (marksEarned >= marksAvailable) return 'right';
  return marksEarned > 0 ? 'partial' : 'wrong';
}

/**
 * The verdict badge. A full-marks answer pops a drawn tick into place; anything else gives a
 * short, gentle shake. Both are skipped when motion is off.
 */
export function ResultMark({ tone, className }: { tone: ResultTone; className?: string }) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const animated = multiplier > 0;
  const shake = tone === 'wrong' || tone === 'partial';
  return (
    <motion.span
      aria-hidden="true"
      data-result-tone={tone}
      initial={animated && !shake ? { scale: 0.4, opacity: 0 } : false}
      animate={
        animated && shake
          ? { x: [0, -7, 6, -4, 3, 0] }
          : { scale: 1, opacity: 1 }
      }
      transition={
        shake
          ? { duration: 0.42 * multiplier, ease: 'easeOut' }
          : scaledSpring(multiplier, 420, 15)
      }
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full',
        TONE_CLASS[tone],
        className,
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tone === 'right' ? (
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={animated ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.32 * multiplier, delay: 0.12 * multiplier, ease: 'easeOut' }}
          />
        ) : tone === 'undetermined' ? (
          <path d="M6 12h12" />
        ) : (
          <path d="M6 6l12 12M18 6L6 18" />
        )}
      </svg>
    </motion.span>
  );
}
