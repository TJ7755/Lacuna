// Live preview of the card being authored, in the study-card style: a white
// rounded surface with centred text that flips vertically (rotateX, as in Learn
// mode's FlipCard, but without gestures) between question and answer. Saving
// pops a tick onto the card. Preview-only: nothing here edits the card.

import { AnimatePresence, m as motion } from 'motion/react';
import { CardContent } from './CardContent';
import { PillToggleGroup } from './PillToggleGroup';
import { CheckIcon } from '../ui/icons';
import { motionTransition, scaledSpring } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { CardType } from '../../db/types';

export type PreviewSide = 'front' | 'back';

const SIDE_OPTIONS = [
  { value: 'front', label: 'Question' },
  { value: 'back', label: 'Answer' },
] as const;

const SURFACE =
  'shadow-card';

function Face({
  type,
  front,
  back,
  side,
}: {
  type: CardType;
  front: string;
  back: string;
  side: PreviewSide;
}) {
  // A cloze card keeps its whole sentence in front; the back reveals the blanks.
  const text = side === 'front' || type === 'cloze' ? front : back;
  return (
    <div className="flex min-h-[15rem] w-full items-center justify-center p-8 text-center text-lg leading-relaxed text-ink md:text-xl">
      {text.trim() ? (
        <CardContent
          card={{ id: 'preview', type, front, back, sequenceItemId: undefined, occlusionRegionId: undefined }}
          side={side}
          className="w-full max-w-prose"
        />
      ) : (
        <span aria-hidden="true" className="text-ink-faint">
          &mdash;
        </span>
      )}
    </div>
  );
}

export function CardPreview({
  type,
  front,
  back,
  side,
  onSideChange,
  canFlip,
  saved,
}: {
  type: CardType;
  front: string;
  back: string;
  side: PreviewSide;
  onSideChange: (side: PreviewSide) => void;
  /** False for structured items, whose answer is checked rather than revealed. */
  canFlip: boolean;
  /** Pops a confirmation tick while true. */
  saved: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const shownSide = canFlip ? side : 'front';

  return (
    <section aria-labelledby="card-preview-heading" className="flex flex-col gap-3.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2
          id="card-preview-heading"
          className="font-display text-lg font-semibold tracking-tight text-ink"
        >
          Preview
        </h2>
        {canFlip && (
          <PillToggleGroup
            label="Preview side"
            size="sm"
            options={SIDE_OPTIONS}
            value={side}
            onChange={onSideChange}
          />
        )}
      </div>

      <div className="relative" style={{ perspective: 1200 }}>
        <motion.div
          initial={false}
          animate={{ rotateX: shownSide === 'back' ? 180 : 0 }}
          transition={m > 0 ? motionTransition('local', m, 'emphasised') : { duration: 0 }}
          onClick={canFlip ? () => onSideChange(side === 'front' ? 'back' : 'front') : undefined}
          style={{ transformStyle: 'preserve-3d' }}
          className={`grid rounded-3xl bg-surface ${SURFACE} ${canFlip ? 'cursor-pointer' : ''}`}
        >
          <div
            className="rounded-3xl bg-surface [grid-area:1/1]"
            style={{ backfaceVisibility: 'hidden' }}
            aria-hidden={shownSide !== 'front'}
          >
            <Face type={type} front={front} back={back} side="front" />
          </div>
          <div
            className="rounded-3xl bg-surface [grid-area:1/1]"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
            aria-hidden={shownSide !== 'back'}
          >
            <Face type={type} front={front} back={back} side="back" />
          </div>
        </motion.div>

        <AnimatePresence>
          {saved && (
            <motion.span
              aria-hidden="true"
              initial={m > 0 ? { scale: 0, rotate: -20, opacity: 0 } : false}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={m > 0 ? { scale: 0.6, opacity: 0 } : undefined}
              transition={scaledSpring(m, 520, 16)}
              className="pointer-events-none absolute -right-2 -top-2 grid h-12 w-12 place-items-center rounded-full bg-positive text-white shadow-[0_8px_20px_-8px_hsl(var(--positive)/0.7)]"
            >
              <CheckIcon width={24} height={24} strokeWidth={2.6} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
