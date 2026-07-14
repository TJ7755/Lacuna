// A diamond-shaped marker for a practice session on the path (addendum 2 §H).
//
// Distinct from CheckpointNode (also diamond, but flag icon + accent-soft fill):
// practice nodes use a cards icon and a dashed border, so their visual language
// reads as "review session", not "assessment event". Presentational only, save
// for the edit badge: `onEdit` is only ever supplied for `practice-manual` nodes
// (see PathNodeView) — `auto` nodes are system-generated and have nothing to edit.
//
// British English throughout.

import { m as motion } from 'motion/react';
import type { PracticePathNode } from '../../course/path';
import { CardsIcon, EditIcon } from '../ui/icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

interface PracticeNodeProps {
  node: PracticePathNode;
  onClick?: () => void;
  onEdit?: () => void;
  progress?: {
    fraction: number;
    completed: boolean;
  };
}

export function PracticeNode({ node, onClick, onEdit, progress }: PracticeNodeProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const name = node.practiceNode?.name ?? 'Practice';
  const interactive = onClick !== undefined;
  const fraction = Math.max(0, Math.min(progress?.fraction ?? 0, 1));
  const percentage = Math.round(fraction * 100);

  return (
    <div className="group relative flex flex-col items-center gap-2">
      <div className="relative h-14 w-14">
        <svg
          viewBox="0 0 56 56"
          className="pointer-events-none absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          <polygon
            points="28,2 54,28 28,54 2,28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 4"
            className="text-accent/35"
          />
          <polygon
            points="28,2 54,28 28,54 2,28"
            pathLength="1"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="1"
            strokeDashoffset={1 - fraction}
            className="text-accent transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <motion.button
          type="button"
          onClick={onClick}
          disabled={!interactive}
          aria-label={`Practice: ${name}, ${percentage}% secured${progress?.completed ? ', completed' : ''}`}
          whileTap={interactive ? { scale: 0.94 } : undefined}
          whileHover={interactive ? { scale: 1.05 } : undefined}
          transition={
            m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 28 * m }
          }
          className={`absolute left-1 top-1 flex h-12 w-12 rotate-45 items-center justify-center rounded-md bg-surface-raised text-accent transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-default ${progress?.completed ? 'shadow-[0_0_18px_color-mix(in_srgb,var(--color-accent)_32%,transparent)]' : ''}`}
        >
          <span className="-rotate-45">
            <CardsIcon width={18} height={18} />
          </span>
        </motion.button>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${name}`}
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-line-strong bg-surface-raised text-ink-faint opacity-0 shadow-sm transition-opacity duration-150 hover:text-accent focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 touch-visible"
        >
          <EditIcon width={11} height={11} />
        </button>
      )}
      <span className="max-w-[7rem] text-center text-xs font-medium leading-tight text-ink-soft">
        {name}
      </span>
    </div>
  );
}
