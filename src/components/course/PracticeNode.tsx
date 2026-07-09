// A diamond-shaped marker for a practice session on the path (addendum 2 §H).
//
// Distinct from CheckpointNode (also diamond, but flag icon + accent-soft fill):
// practice nodes use a cards icon and a dashed border, so their visual language
// reads as "review session", not "assessment event". Presentational only.
//
// British English throughout.

import type { PracticePathNode } from '../../course/path';
import { CardsIcon } from '../ui/icons';

interface PracticeNodeProps {
  node: PracticePathNode;
  onClick?: () => void;
}

export function PracticeNode({ node, onClick }: PracticeNodeProps) {
  const name = node.practiceNode?.name ?? 'Practice';
  const interactive = onClick !== undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* A square rotated 45deg reads as a diamond, distinct from the round lesson nodes. */}
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-label={`Practice: ${name}`}
        className="flex h-12 w-12 rotate-45 items-center justify-center rounded-md border-2 border-dashed border-accent/50 bg-surface-raised text-accent transition-colors duration-150 hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-default"
      >
        <span className="-rotate-45">
          <CardsIcon width={18} height={18} />
        </span>
      </button>
      <span className="max-w-[7rem] text-center text-xs font-medium leading-tight text-ink-soft">
        {name}
      </span>
    </div>
  );
}
