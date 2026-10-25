import { CreateButton } from '../ui/CreateButton';
// "Cards in this lesson" — the compact card list beside the lesson's note. Each row
// is the card's front, rendered as on the Cards page so maths shows as maths, with a
// kind icon beside its schedule; an occlusion card leads with its diagram. In
// Edit mode a pencil and a New card button fade in; their slots are always laid
// out, so nothing shifts when the mode changes. Find, in both modes, closes the
// heading row. Bulk management (selecting, deleting, importing, linking) lives in
// LessonCardsSection below.

import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { m as motion } from 'motion/react';
import { PlusIcon, EditIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';
import { motionTransition } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cardScheduleLabel, orderOcclusionSiblings, plainFront } from './lessonCardRow';
import { CardKindIcon } from './CardKindIcon';
import { ScheduleChip } from './ScheduleChip';
import { OcclusionThumbnail } from './OcclusionThumbnail';
import { useOcclusions } from '../../state/useCourseData';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import type { Card } from '../../db/types';

const CardContent = lazy(() =>
  import('./CardContent').then((module) => ({ default: module.CardContent })),
);

/** Rows shown before the list hands over to the full Cards page. */
const VISIBLE_ROWS = 8;

interface LessonCardsListProps {
  courseId: string;
  lessonId: string;
  cards: Card[];
  editable: boolean;
  onNavigate: (path: string) => void;
  /** Optional content under the rows, e.g. the Simple Learn disclosure. */
  footer?: ReactNode;
  /** The lesson's Find control, last in the heading row. */
  find?: ReactNode;
  /** Offered beside an empty View-mode list, where cards can only be added in Edit. */
  onSwitchToEdit?: () => void;
  /** Focus New card on arrival, as the next step after creating a course. */
  focusNewCard?: boolean;
  /** The first task in an otherwise empty lesson. */
  prominentNewCard?: boolean;
  className?: string;
}

export function LessonCardsList({
  courseId,
  lessonId,
  cards,
  editable,
  onNavigate,
  footer,
  find,
  className,
  onSwitchToEdit,
  focusNewCard = false,
  prominentNewCard = false,
}: LessonCardsListProps) {
  const newCardRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusNewCard && editable) newCardRef.current?.focus();
  }, [focusNewCard, editable]);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const now = Date.now();
  const occlusions = useOcclusions(courseId);
  const visible = orderOcclusionSiblings(cards, occlusions ?? []).slice(0, VISIBLE_ROWS);
  const fade = {
    initial: false as const,
    animate: editable ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 },
    transition: motionTransition('feedback', m),
  };

  return (
    <aside
      aria-labelledby="lesson-cards-heading"
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-3xl bg-surface p-6 card-surface',
        className,
      )}
    >
      <div className="mb-1.5 flex min-h-11 items-center justify-between gap-3">
        <h2
          id="lesson-cards-heading"
          className="font-display text-lg font-semibold tracking-tight text-ink"
        >
          Cards in this lesson
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {prominentNewCard && cards.length === 0 && editable ? (
            <Button
              ref={newCardRef}
              variant="primary"
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
            >
              <PlusIcon width={16} height={16} />
              New card
            </Button>
          ) : (
            <CreateButton
              ref={newCardRef}
              type="button"
              {...fade}
              tabIndex={editable ? 0 : -1}
              aria-hidden={editable ? undefined : true}
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
              className={cn(!editable && 'pointer-events-none')}
            >
              <PlusIcon width={16} height={16} />
              New card
            </CreateButton>
          )}
          {cards.length > 0 && find}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="text-sm text-ink-soft">
            {editable ? 'Add a card to start learning.' : 'No cards yet.'}
          </p>
          {!editable && onSwitchToEdit && (
            <Button variant="secondary" size="sm" onClick={onSwitchToEdit}>
              Switch to Edit to add cards
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col">
          {visible.map((card) => {
            const occlusion =
              card.occlusionRegionId && occlusions
                ? occlusionForRegionId(occlusions, card.occlusionRegionId)
                : undefined;
            return (
              <li
                key={card.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink/[0.03]"
              >
                {occlusion && <OcclusionThumbnail card={card} occlusion={occlusion} />}
                <div className="flex min-w-0 flex-1 flex-col leading-snug">
                  <div className="card-row-clamp line-clamp-2 max-h-[3.75rem] text-ink [overflow-wrap:anywhere]">
                    <Suspense fallback={plainFront(card)}>
                      <CardContent card={card} side="front" />
                    </Suspense>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CardKindIcon card={card} />
                  <ScheduleChip schedule={cardScheduleLabel(card, now)} />
                </div>
                <motion.span
                  {...fade}
                  aria-hidden={editable ? undefined : true}
                  className={cn('shrink-0', !editable && 'pointer-events-none')}
                >
                  <Link
                    to={`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`}
                    aria-label="Edit card"
                    tabIndex={editable ? 0 : -1}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                  >
                    <EditIcon width={16} height={16} />
                  </Link>
                </motion.span>
              </li>
            );
          })}
        </ul>
      )}

      {cards.length > VISIBLE_ROWS && (
        <Link
          to={`/course/${courseId}/cards`}
          className="mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-bold text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          All {cards.length} cards
        </Link>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </aside>
  );
}
