import { useState, type ComponentProps } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Card, Course, Occlusion, Sequence } from '@lacuna/core/db/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { baseItemId } from '../../db/sequenceGeneration';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import { originFrom } from '../../utils/editorOrigin';
import { ExpandingSheet } from '../ui/ExpandingSheet';
import { Button } from '../ui/Button';
import { CardContent } from './CardContent';
import { cardScheduleLabel } from './lessonCardRow';
import { ScheduleChip } from './ScheduleChip';
import { renderLineAsEnglish } from '../../items/markSchemeCompiler';
import type { CardList } from './CardList';
import { plainFront } from './lessonCardRow';

export function LessonCardDocument({
  card,
  course,
  lessonId,
  position,
  count,
  editable,
  sequences,
  occlusions,
  selection,
}: {
  card: Card;
  course: Course;
  lessonId: string;
  position: number;
  count: number;
  editable: boolean;
  sequences: Sequence[];
  occlusions: Occlusion[];
  selection?: Parameters<NonNullable<ComponentProps<typeof CardList>['renderCards']>>[0];
}) {
  const [enlarged, setEnlarged] = useState<{ side: 'front' | 'back'; anchor: HTMLElement } | null>(
    null,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const occlusion = card.occlusionRegionId
    ? occlusionForRegionId(occlusions, card.occlusionRegionId)
    : undefined;
  const sequence = card.sequenceItemId
    ? sequences.find((owner) =>
        owner.items.some((item) => item.id === baseItemId(card.sequenceItemId!)),
      )
    : undefined;
  const generated = Boolean(card.occlusionRegionId || card.sequenceItemId);
  const linked = selection?.linkedCardIds?.has(card.id);
  const ownerPath = occlusion
    ? `occlusion/${occlusion.id}`
    : sequence
      ? `sequence/${sequence.id}`
      : null;

  return (
    <article
      id={`lesson-card-${card.id}`}
      data-lesson-card={card.id}
      aria-label={`Card ${position} of ${count}`}
      tabIndex={-1}
      className="lesson-card-document relative rounded-3xl bg-surface p-5 card-surface outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <header className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-ink-soft">
          {selection?.selectMode && !generated && !linked && (
            <label className="grid min-h-11 min-w-11 place-items-center">
              <input
                type="checkbox"
                aria-label={`Select card: ${plainFront(card)}`}
                checked={selection.selected.has(card.id)}
                onChange={() => selection.onToggle(card.id)}
                className="size-5 accent-accent"
              />
            </label>
          )}
          <span>
            {position} of {count}
          </span>
          <ScheduleChip schedule={cardScheduleLabel(card, Date.now())} />
        </div>
        {editable && !selection?.selectMode && (!generated || ownerPath) && (
          <Button
            data-card-edit
            variant="ghost"
            size="sm"
            onClick={() =>
              void navigate(
                generated
                  ? `/course/${course.id}/${ownerPath}/edit`
                  : `/course/${course.id}/lesson/${lessonId}/cards/${card.id}/edit`,
                {
                  state: originFrom(location, generated ? 'Lesson cards' : 'Back to lesson cards'),
                },
              )
            }
          >
            {occlusion ? 'Edit diagram' : sequence ? 'Edit sequence' : 'Edit'}
          </Button>
        )}
        {editable && linked && selection?.onUnlinkCard && (
          <Button variant="ghost" size="sm" onClick={() => selection.onUnlinkCard?.(card)}>
            Remove from lesson
          </Button>
        )}
      </header>
      <div className="grid gap-5 min-[900px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {(['front', 'back'] as const).map((side) => (
          <section
            key={side}
            aria-label={side === 'front' ? 'Front' : 'Back'}
            className={
              side === 'back'
                ? 'min-w-0 border-t border-line pt-4 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-5 min-[900px]:pt-0'
                : 'min-w-0'
            }
          >
            <div className="mb-1.5 text-xs text-ink-soft">
              {side === 'front' ? 'Front' : 'Back'}
            </div>
            {occlusion ? (
              <>
                <CardContent card={card} side={side} occlusion={occlusion} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={(event) => setEnlarged({ side, anchor: event.currentTarget })}
                >
                  Enlarge diagram
                </Button>
              </>
            ) : side === 'back' && card.payload ? (
              <StructuredAnswer card={card} />
            ) : (
              <CardContent card={card} side={side} enlargeImages />
            )}
          </section>
        ))}
      </div>
      <AnimatePresence>
        {enlarged && occlusion && (
          <ExpandingSheet
            autoFocusSelector="[data-dialog-close]"
            anchor={enlarged.anchor}
            onClose={() => setEnlarged(null)}
            closeLabel="Close diagram"
            maxWidth={1100}
            face={(id) => (
              <h2 id={id} className="p-6 pr-16 font-display text-xl">
                {occlusion.name}
              </h2>
            )}
          >
            <div className="p-6 pt-0">
              <CardContent card={card} side={enlarged.side} occlusion={occlusion} />
            </div>
          </ExpandingSheet>
        )}
      </AnimatePresence>
    </article>
  );
}

function StructuredAnswer({ card }: { card: Card }) {
  const payload = card.payload;
  if (payload?.kind === 'working')
    return (
      <ol className="list-decimal space-y-3 pl-5">
        {payload.scheme.map((line, index) => (
          <li key={index}>{renderLineAsEnglish(line)}</li>
        ))}
      </ol>
    );
  if (payload?.kind !== 'numeric') return null;
  const answer = payload.answer;
  return (
    <p>
      {answer.kind === 'matches-one-of'
        ? `One of: ${answer.values.join('; ')}`
        : answer.kind === 'within'
          ? `${answer.value} (tolerance: ${answer.tolerance})`
          : answer.value}
    </p>
  );
}
