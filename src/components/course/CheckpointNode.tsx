// A distinct diamond-shaped marker for a checkpoint assessment on the path.
//
// Checkpoints are informational assessment events: they never gate progression.
//
// British English throughout.

import { m as motion } from 'motion/react';
import type { CourseAssessment } from '../../db/types';
import { FlagIcon } from '../ui/icons';
import { formatDate } from '../../utils/datetime';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

interface CheckpointNodeProps {
  assessment: CourseAssessment;
  onClick?: () => void;
}

export function CheckpointNode({ assessment, onClick }: CheckpointNodeProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* A square rotated 45deg reads as a diamond, distinct from the round lesson nodes. */}
      <motion.button
        type="button"
        onClick={onClick}
        transition={m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 28 * m }}
        className="flex h-12 w-12 rotate-45 items-center justify-center rounded-md border-2 border-accent/60 bg-accent-soft text-accent-ink transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={`Open checkpoint: ${assessment.name}`}
      >
        <span className="-rotate-45">
          <FlagIcon width={20} height={20} />
        </span>
      </motion.button>
      <span className="max-w-[7rem] text-center text-xs font-medium leading-tight text-ink-soft">
        {assessment.name}
        <span className="mt-0.5 block text-[0.65rem] text-ink-faint">
          {formatDate(assessment.examDate, assessment.timeZone)}
        </span>
      </span>
    </div>
  );
}
