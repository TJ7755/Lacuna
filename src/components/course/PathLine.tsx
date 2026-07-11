// The connecting segment drawn between two adjacent path nodes.
//
// The `completed` flag tints the segment with the accent for the portion of
// the path the student has cleared; upcoming segments stay neutral. The
// colour change is a plain CSS transition (see `transition-colors` below) so
// a lesson completing while the page is mounted eases into its filled state
// rather than snapping.
//
// On first paint the segment also draws itself in — a short scale reveal
// anchored at its leading edge, staggered by `revealDelay` so the whole path
// reads as progress travelling down the spine rather than appearing at once.
//
// British English throughout.

import { m as motion } from 'motion/react';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

interface PathLineProps {
  /** When true the segment leads into already-cleared content and is accent-tinted. */
  completed?: boolean;
  /** Orientation of the segment; defaults to vertical for a scrolling path. */
  orientation?: 'vertical' | 'horizontal';
  /** Stagger delay (ms) for the initial draw-in, keyed to this segment's position on the path. */
  revealDelay?: number;
  className?: string;
}

export function PathLine({
  completed = false,
  orientation = 'vertical',
  revealDelay = 0,
  className,
}: PathLineProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const vertical = orientation === 'vertical';

  return (
    <motion.div
      aria-hidden="true"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{
        duration: 0.35 * m,
        delay: (revealDelay / 1000) * m,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ transformOrigin: vertical ? 'top' : 'left' }}
      className={cn(
        'rounded-full transition-colors duration-150',
        vertical ? 'h-8 w-1' : 'h-1 w-8',
        completed ? 'bg-accent/60' : 'bg-line',
        className,
      )}
    />
  );
}
