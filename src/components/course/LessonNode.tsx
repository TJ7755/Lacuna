// A circular path node representing a single lesson on the course path.
//
// Presentational only: it renders the visual state passed in and reports clicks,
// but performs no data fetching or unlock logic (that lives in src/course/path.ts).
//
// British English throughout.

import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import type { Lesson } from '../../db/types';
import type { LessonStatus } from '../../course/path';
import { CheckIcon, SparklesIcon } from '../ui/icons';
import { MiniRing } from '../ui/MiniRing';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { LessonReorderInteraction } from './useLessonPathReorder';

/** Hover-revealed lesson stats — see CoursePath's detailForLesson. Mastery is
 *  shown as a small MiniRing alongside its percentage. */
export interface LessonNodeDetail {
  cardCount: number;
  dueCount: number;
  masteryPct: number;
}

interface LessonNodeProps {
  lesson: Lesson;
  status: LessonStatus;
  onClick?: () => void;
  /** True for the single next-up lesson on the path — the "you are here" marker. */
  current?: boolean;
  /** Shown as a title tooltip while locked, explaining what unlocks the lesson. */
  lockHint?: string;
  /** When provided, hovering/focusing the circle expands it into a detail squircle. */
  detail?: LessonNodeDetail;
  /** Allows a curriculum-locked lesson to open for authoring without changing its status. */
  authoring?: boolean;
  /** Edit-mode path reordering handlers. Course Settings remains the fallback. */
  reorder?: LessonReorderInteraction;
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

export function LessonNode({
  lesson,
  status,
  onClick,
  current,
  lockHint,
  detail,
  authoring = false,
  reorder,
}: LessonNodeProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const locked = status === 'locked';
  const interactive = (!locked || authoring) && onClick !== undefined;
  const isExtension = lesson.isExtension;
  const here = current && status === 'available';

  // Hover/focus morphs the circle into a detail squircle (locked nodes stay
  // inert circles — their hint lives in the title tooltip instead).
  const [hovered, setHovered] = useState(false);
  const expanded = hovered && interactive && detail !== undefined && !reorder?.lifted;

  // Replay a short settle-in whenever the status itself changes after mount
  // (most notably locked → available or available → completed), so a lesson
  // completing while the page is mounted animates into its new state rather
  // than snapping. Suppressed on the very first render, which the path-wide
  // stagger in CoursePath already animates in.
  //
  // `settleKey` is state, not a plain derived value, so it only ever changes
  // in response to a genuine status transition (detected against `prevStatus`
  // in the effect below) — an unrelated re-render leaves it untouched and so
  // never remounts the node or replays the pop.
  const prevStatusRef = useRef(status);
  const [settleKey, setSettleKey] = useState<LessonStatus | 'initial'>('initial');
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      setSettleKey(status);
    }
  }, [status]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Fixed 14x14 slot so the expansion overlays neighbours instead of
          shoving the path about; the button itself morphs within it. */}
      <div className="relative h-14 w-14">
        <motion.button
          ref={reorder?.registerElement}
          key={settleKey}
          type="button"
          onClick={interactive ? onClick : undefined}
          disabled={!interactive}
          aria-disabled={(locked && !authoring) || undefined}
          aria-label={locked && authoring ? `${lesson.name}, locked for study` : lesson.name}
          aria-describedby={reorder?.enabled ? 'lesson-path-reorder-instructions' : undefined}
          aria-keyshortcuts={reorder?.enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
          aria-roledescription={reorder?.enabled ? 'sortable lesson' : undefined}
          title={
            locked
              ? authoring
                ? 'Locked for study; open to edit'
                : lockHint
              : undefined
          }
          onPointerDown={reorder?.onPointerDown}
          onPointerMove={reorder?.onPointerMove}
          onPointerUp={reorder?.onPointerUp}
          onPointerCancel={reorder?.onPointerCancel}
          onClickCapture={reorder?.onClickCapture}
          onKeyDown={reorder?.onKeyDown}
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          initial={settleKey !== 'initial' ? { scale: 0.82, opacity: 0.5 } : false}
          animate={{
            scale: 1,
            opacity: 1,
            width: expanded ? 200 : 56,
            height: expanded ? 84 : 56,
            borderRadius: expanded ? 22 : 28,
          }}
          style={{ x: '-50%', y: '-50%' }}
          whileTap={interactive ? { scale: 0.96 } : undefined}
          whileHover={interactive && !detail ? { scale: 1.05 } : undefined}
          transition={
            m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 * m }
          }
          className={cn(
            'absolute left-1/2 top-1/2 flex items-center justify-center border-2',
            'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
            interactive ? 'cursor-pointer' : 'cursor-default',
            reorder?.enabled && 'select-none',
            reorder?.lifted && 'z-20 cursor-grabbing opacity-70 shadow-lg shadow-accent/20',
            expanded && 'z-10 shadow-lg shadow-black/10',
            // Extension nodes use a dashed border to read as off-path enrichment.
            isExtension && !locked && 'border-dashed',
            // "You are here": a quiet breathing halo on the next lesson to take.
            here && !expanded && 'path-here-glow',
            circleByStatus[status],
          )}
        >
          {expanded && detail ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 * m, delay: 0.06 * m }}
              className="flex w-full min-w-0 flex-col items-center gap-0.5 px-4"
            >
              <span className="max-w-full truncate text-sm font-semibold">{lesson.name}</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs opacity-80">
                {detail.cardCount} card{detail.cardCount === 1 ? '' : 's'}
                {detail.dueCount > 0 && ` · ${detail.dueCount} due`}
                {' · '}
                <MiniRing value={detail.masteryPct / 100} size={14} strokeWidth={2} />
                {detail.masteryPct}%
              </span>
            </motion.span>
          ) : status === 'completed' ? (
            <CheckIcon width={24} height={24} />
          ) : isExtension ? (
            <SparklesIcon width={22} height={22} />
          ) : (
            <span className="text-base font-semibold tabular-nums">
              {lesson.orderIndex + 1}
            </span>
          )}
        </motion.button>
      </div>
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
