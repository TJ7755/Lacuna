// The Memory Field — the course/lesson hero visualisation.
//
// Every card is a soft point of light in a shared time field running from the
// "now" line (left) to the exam line (right):
//   - horizontal position = when the card next comes due (sqrt-compressed),
//   - glow strength       = current predicted retrievability (fading memories
//                           literally fade towards the paper),
//   - hollow rings        = cards never studied, adrift left of the now line,
//   - breathing lights on the now line = due for review right now.
// Hovering or focusing a light shows the card's front and its personal
// forgetting curve projected to exam day. All layout maths lives in
// memoryFieldMath.ts; this file is rendering and interaction only.
// British English throughout.

import { useState } from 'react';
import { Button } from '../ui/Button';
import { PlayIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { formatDate } from '../../utils/datetime';
import { MS_PER_DAY } from '../../fsrs/params';
import {
  NOW_X,
  EXAM_X,
  buildFieldMarks,
  curvePoints,
  plainFront,
  type FieldMark,
} from './memoryFieldMath';
import type { Card } from '../../db/types';

export interface FieldBand {
  id: string;
  /** Band heading (lesson name). Omit for a single-band (lesson-page) field. */
  label?: string;
  cards: Card[];
  /** Makes the band heading a link into the lesson. */
  onOpen?: () => void;
}

interface MemoryFieldProps {
  bands: FieldBand[];
  /** Forgetting-curve decay exponent for the course (see decayOf). */
  decay: number;
  examDate: number;
  timeZone?: string;
  now: number;
  dueCount: number;
  onStudy: () => void;
  /** Opens a card for editing when a mark is clicked. */
  onOpenCard?: (card: Card) => void;
  className?: string;
}

/** Band height grows gently with card count so dense lessons get more air. */
function bandHeight(cardCount: number): number {
  if (cardCount === 0) return 44; // just room for the "No cards yet" line
  return Math.min(64 + Math.ceil(Math.sqrt(cardCount)) * 12, 136);
}

const CURVE_W = 192;
const CURVE_H = 48;

export function MemoryField({
  bands,
  decay,
  examDate,
  timeZone,
  now,
  dueCount,
  onStudy,
  onOpenCard,
  className,
}: MemoryFieldProps) {
  // At most one tooltip at a time, keyed by band and card id.
  const [hovered, setHovered] = useState<{ bandId: string; mark: FieldMark } | null>(null);

  const totalCards = bands.reduce((sum, b) => sum + b.cards.length, 0);
  const anyUnseen = bands.some((b) =>
    b.cards.some((c) => c.lastReviewed === null || c.state === 0),
  );
  // Stagger counter across all bands so the whole field resolves as one wave.
  let markIndex = 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-line bg-surface',
        className,
      )}
    >
      <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />

      <div className="relative p-6 md:p-8">
        {/* Chart area — the now/exam lines span exactly the labels + bands,
            sharing the marks' coordinate space, and stop before the Study row. */}
        <div className="relative">
          {/* Exam line — a soft rule that fades out at both ends. */}
          <div
            className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-line-strong/70 to-transparent"
            style={{ left: `${EXAM_X}%` }}
            aria-hidden="true"
          />
          {/* Now line — where studying happens. */}
          <div
            className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-accent/50 to-transparent"
            style={{ left: `${NOW_X}%` }}
            aria-hidden="true"
          />

          {/* Axis labels. */}
          <div className="relative mb-5 h-5 text-xs text-ink-faint">
            <span
              className="absolute ml-2.5 whitespace-nowrap font-medium text-accent"
              style={{ left: `${NOW_X}%` }}
            >
              Now
            </span>
            <span className="absolute mr-2.5 whitespace-nowrap" style={{ right: `${100 - EXAM_X}%` }}>
              Exam · {formatDate(examDate, timeZone)}
            </span>
          </div>

          {/* Bands. */}
          <div className="flex flex-col gap-2">
            {bands.map((band) => {
              const marks = buildFieldMarks(band.cards, decay, now, examDate);
              return (
                <div key={band.id}>
                  {band.label !== undefined && (
                    <div
                      className="flex items-baseline gap-2.5"
                      style={{ paddingLeft: `${NOW_X}%` }}
                    >
                      {band.onOpen ? (
                        <button
                          type="button"
                          onClick={band.onOpen}
                          className="min-h-8 pl-2.5 font-display text-lg text-ink transition-colors hover:text-accent"
                        >
                          {band.label}
                        </button>
                      ) : (
                        <span className="pl-2.5 font-display text-lg text-ink">{band.label}</span>
                      )}
                      <span className="text-sm tabular-nums text-ink-faint">
                        {band.cards.length} card{band.cards.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                  <div className="relative" style={{ height: bandHeight(band.cards.length) }}>
                    {marks.length === 0 && (
                      <p
                        className="absolute top-1/2 -translate-y-1/2 pl-2.5 text-sm text-ink-faint"
                        style={{ left: `${NOW_X}%` }}
                      >
                        No cards yet.
                      </p>
                    )}
                    {marks.map((mark) => {
                      const idx = markIndex++;
                      const alpha = 0.35 + 0.65 * mark.r;
                      const active =
                        hovered?.bandId === band.id && hovered.mark.card.id === mark.card.id;
                      return (
                        <button
                          key={mark.card.id}
                          type="button"
                          aria-label={markAriaLabel(mark, now, timeZone)}
                          onClick={onOpenCard ? () => onOpenCard(mark.card) : undefined}
                          onMouseEnter={() => setHovered({ bandId: band.id, mark })}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered({ bandId: band.id, mark })}
                          onBlur={() => setHovered(null)}
                          className={cn(
                            'absolute rounded-full p-0',
                            mark.dueNow ? 'h-3 w-3' : 'h-2.5 w-2.5',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                            mark.dueNow ? 'field-mark-due' : 'field-mark',
                            mark.unseen && 'border-[1.5px] border-ink-faint/40 bg-transparent',
                            onOpenCard ? 'cursor-pointer' : 'cursor-default',
                          )}
                          style={{
                            left: `${mark.x}%`,
                            top: `${mark.y * 100}%`,
                            translate: '0 -50%',
                            scale: active ? '1.5' : '1',
                            animationDelay: `${Math.min(idx * 16, 640)}ms`,
                            ...(mark.unseen
                              ? undefined
                              : {
                                  backgroundColor: `hsl(var(--accent) / ${alpha})`,
                                  boxShadow: mark.dueNow
                                    ? undefined // the breathe animation owns it
                                    : `0 0 ${5 + 9 * mark.r}px ${1 + 2 * mark.r}px hsl(var(--accent) / ${0.12 + 0.35 * mark.r})`,
                                }),
                          }}
                        />
                      );
                    })}
                    {hovered?.bandId === band.id && (
                      <MarkTooltip
                        mark={hovered.mark}
                        decay={decay}
                        now={now}
                        examDate={examDate}
                        timeZone={timeZone}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Study action, anchored at the now line — the place work happens. */}
        <div
          className="mt-6 flex flex-wrap items-center gap-4"
          style={{ marginLeft: `calc(${NOW_X}% - 12px)` }}
        >
          <Button variant="primary" size="lg" disabled={totalCards === 0} onClick={onStudy}>
            <PlayIcon width={18} height={18} />
            Study
            {dueCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fg/20 px-1.5 text-xs font-semibold tabular-nums">
                {dueCount}
              </span>
            )}
          </Button>
          <p className="text-sm text-ink-faint">
            {totalCards === 0
              ? 'Add cards to light up the field.'
              : dueCount > 0
                ? `${dueCount} card${dueCount === 1 ? '' : 's'} waiting at the line.`
                : 'Nothing due — study ahead.'}
          </p>
        </div>

        {/* One quiet reading note instead of a legend strip. */}
        {totalCards > 0 && (
          <p className="mt-5 max-w-prose text-sm leading-relaxed text-ink-faint">
            Every light is a card, drifting from now towards exam day — bright while well
            remembered, dimming as it fades{anyUnseen ? ', hollow before its first study' : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

function markAriaLabel(mark: FieldMark, now: number, timeZone?: string): string {
  const front = plainFront(mark.card.front, 60);
  if (mark.unseen) return `${front} — not yet studied`;
  if (mark.dueNow) return `${front} — due now`;
  return `${front} — ${Math.round(mark.r * 100)}% retrievability, due ${formatDate(mark.card.due ?? now, timeZone)}`;
}

function dueText(mark: FieldMark, now: number, timeZone?: string): string {
  if (mark.unseen) return 'Not yet studied';
  if (mark.dueNow) return 'Due now';
  const days = Math.ceil(((mark.card.due ?? now) - now) / MS_PER_DAY);
  return `Due ${formatDate(mark.card.due ?? now, timeZone)} (${days} day${days === 1 ? '' : 's'})`;
}

/** Hover card: the card's front, its status, and its forgetting curve to exam day. */
function MarkTooltip({
  mark,
  decay,
  now,
  examDate,
  timeZone,
}: {
  mark: FieldMark;
  decay: number;
  now: number;
  examDate: number;
  timeZone?: string;
}) {
  const points = curvePoints(mark.card, decay, now, examDate, CURVE_W, CURVE_H);
  // Keep the tooltip inside the field near either edge.
  const left = Math.min(Math.max(mark.x, 16), 84);
  const below = mark.y < 0.45;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-xl border border-line bg-surface-raised p-4 shadow-lg shadow-black/10"
      style={{
        left: `${left}%`,
        ...(below
          ? { top: `${mark.y * 100}%`, marginTop: 14 }
          : { bottom: `${100 - mark.y * 100}%`, marginBottom: 14 }),
      }}
    >
      <p className="mb-1 text-sm leading-snug text-ink">{plainFront(mark.card.front)}</p>
      <p className="mb-3 text-xs text-ink-faint">
        {dueText(mark, now, timeZone)}
        {!mark.unseen && (
          <span className="ml-1.5 text-accent-ink">{Math.round(mark.r * 100)}% retained</span>
        )}
      </p>
      {points && (
        <>
          <svg
            width={CURVE_W}
            height={CURVE_H}
            viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
            className="block w-full"
            aria-hidden="true"
          >
            {/* Mastery threshold (R = 0.90). */}
            <line
              x1={0}
              y1={CURVE_H * 0.1}
              x2={CURVE_W}
              y2={CURVE_H * 0.1}
              stroke="hsl(var(--line-strong))"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <polyline points={points} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
            {/* Exam-day endpoint. */}
            <circle cx={CURVE_W} cy={lastYPx(points)} r={2.5} fill="hsl(var(--accent))" />
          </svg>
          <p className="mt-1.5 text-[11px] text-ink-faint">Forgetting curve to exam day</p>
        </>
      )}
    </div>
  );
}

/** y-pixel of the final polyline sample (the exam-day endpoint). */
function lastYPx(points: string): number {
  const last = points.slice(points.lastIndexOf(' ') + 1);
  return Number(last.split(',')[1]);
}
