import { m as motion } from 'motion/react';
import { expandingActionSpring } from '../ui/motion';

const ARROW = ['M5 12L19 12', 'M13 6L19 12L13 18'];
const CROSS = ['M6 6L18 18', 'M18 6L12 12L6 18'];

/** Keep the arrow's two strokes alive as they straighten into a close cross. */
export function StudyActionIcon({ open, multiplier }: { open: boolean; multiplier: number }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {ARROW.map((arrow, index) => (
        <motion.path
          key={index}
          initial={multiplier > 0 ? { d: arrow } : false}
          animate={{ d: open ? CROSS[index] : arrow }}
          exit={{ d: arrow }}
          transition={expandingActionSpring(multiplier)}
        />
      ))}
    </svg>
  );
}
