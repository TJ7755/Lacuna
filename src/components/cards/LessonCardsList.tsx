// "Cards in this lesson" — the compact card list beside the lesson's note. Each row
// is a status dot, the card's front on one line and a "type · state" caption. In
// Edit mode a pencil and a New card button fade in; their slots are always laid
// out, so nothing shifts when the mode changes. Bulk management (selecting,
// deleting, importing, linking) lives in LessonCardsSection below.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { PlusIcon, EditIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { motionTransition } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { summariseLessonCard, type CardStatusTone } from './lessonCardRow';
import type { Card } from '../../db/types';

const DOT_CLASS: Record<CardStatusTone, string> = {
  new: 'bg-line-strong',
  learning: 'bg-warning',
  review: 'bg-positive',
  lapsed: 'bg-negative',
  paused: 'bg-ink-faint',
};

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
  className?: string;
}

export function LessonCardsList({
  courseId,
  lessonId,
  cards,
  editable,
  onNavigate,
  footer,
  className,
}: LessonCardsListProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const now = Date.now();
  const visible = cards.slice(0, VISIBLE_ROWS);
  const fade = {
    initial: false as const,
    animate: editable ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 },
    transition: motionTransition('feedback', m),
  };

  return (
    <aside
      aria-labelledby="lesson-cards-heading"
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-3xl bg-surface p-6 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]',
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
        <motion.button
          type="button"
          {...fade}
          tabIndex={editable ? 0 : -1}
          aria-hidden={editable ? undefined : true}
          onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            // The first card is the lesson's next step, so it leads until one exists.
            cards.length === 0
              ? 'bg-accent text-accent-fg hover:brightness-105'
              : 'bg-ink/[0.06] text-ink hover:bg-ink/10',
            !editable && 'pointer-events-none',
          )}
        >
          <PlusIcon width={16} height={16} />
          New card
        </motion.button>
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-sm text-ink-soft">No cards yet.</p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((card) => {
            const row = summariseLessonCard(card, now);
            return (
              <li
                key={card.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink/[0.03]"
              >
                <span
                  aria-hidden="true"
                  className={cn('h-2 w-2 shrink-0 rounded-full', DOT_CLASS[row.tone])}
                />
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="truncate text-ink">{row.front}</span>
                  <span className="text-[13px] text-ink-soft">{row.caption}</span>
                </span>
                <motion.span
                  {...fade}
                  aria-hidden={editable ? undefined : true}
                  className={cn('shrink-0', !editable && 'pointer-events-none')}
                >
                  <Link
                    to={`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`}
                    aria-label="Edit card"
                    tabIndex={editable ? 0 : -1}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
          className="mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-bold text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          All {cards.length} cards
        </Link>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </aside>
  );
}
