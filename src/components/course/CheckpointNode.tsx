// A distinct diamond-shaped marker for a checkpoint (a CourseExamDate) on the path.
//
// Checkpoints are informational assessment events: they never gate progression
// (addendum G). Presentational only — shows the checkpoint name and its date.
// It has no hover/tap affordance (unlike LessonNode/PracticeNode) since it
// carries no click handler; only its entrance animation is shared with them.
//
// British English throughout.

import { m as motion } from 'motion/react';
import type { CourseExamDate } from '../../db/types';
import { FlagIcon } from '../ui/icons';
import { formatDate } from '../../utils/datetime';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

interface CheckpointNodeProps {
  examDate: CourseExamDate;
}

export function CheckpointNode({ examDate }: CheckpointNodeProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* A square rotated 45deg reads as a diamond, distinct from the round lesson nodes. */}
      <motion.div
        transition={m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 28 * m }}
        className="flex h-12 w-12 rotate-45 items-center justify-center rounded-md border-2 border-accent/60 bg-accent-soft text-accent-ink"
        role="img"
        aria-label={`Checkpoint: ${examDate.name}`}
      >
        <span className="-rotate-45">
          <FlagIcon width={20} height={20} />
        </span>
      </motion.div>
      <span className="max-w-[7rem] text-center text-xs font-medium leading-tight text-ink-soft">
        {examDate.name}
        <span className="mt-0.5 block text-[0.65rem] text-ink-faint">
          {formatDate(examDate.examDate, examDate.timeZone)}
        </span>
      </span>
    </div>
  );
}
