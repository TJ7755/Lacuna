// Primary "start studying" action for LessonView, placed alongside the header
// rather than buried under the notes/cards editor sections (study is the
// page's main job; CRUD is secondary — see LessonView.tsx).

import { Button } from '../ui/Button';
import { PlayIcon } from '../ui/icons';
import { cn } from '../ui/cn';

interface LessonStudyCTAProps {
  /** Cards due for review right now, within this lesson. */
  dueCount: number;
  /** Total cards in the lesson — a lesson with none has nothing to study. */
  totalCards: number;
  onClick: () => void;
  className?: string;
}

/**
 * A substantial call-to-action card that routes to the lesson's learn session.
 * Three states:
 *  - No cards at all: disabled, points at the cards section below.
 *  - Cards but none due: still clickable ("study ahead" — the learn route
 *    falls back to unseen/new cards per the lesson's sessionFilter even when
 *    nothing is strictly due, see LearnMode.tsx).
 *  - Cards due: primary emphasis with a due-count badge.
 */
export function LessonStudyCTA({ dueCount, totalCards, onClick, className }: LessonStudyCTAProps) {
  const hasCards = totalCards > 0;
  const hasDue = dueCount > 0;

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col items-stretch justify-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface p-6 text-center',
        className,
      )}
    >
      <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={!hasCards}
          onClick={onClick}
          className="relative w-full min-w-40"
        >
          <PlayIcon width={18} height={18} />
          Study
          {hasDue && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fg/20 px-1.5 text-xs font-semibold tabular-nums">
              {dueCount}
            </span>
          )}
        </Button>
        <p className="text-xs text-ink-faint">
          {!hasCards
            ? 'Add cards to begin studying.'
            : hasDue
              ? `${dueCount} card${dueCount === 1 ? '' : 's'} due today.`
              : 'Nothing due — study ahead.'}
        </p>
      </div>
    </div>
  );
}
