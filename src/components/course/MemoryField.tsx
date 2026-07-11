// The Memory Field — the course/lesson hero visualisation.
//
// Every card is a small glowing mark in a shared time field running from the
// "now" line (left) to the exam line (right):
//   - horizontal position  = when the card next comes due (sqrt-compressed),
//   - glow strength        = current predicted retrievability (fading memories
//                            literally fade towards the paper),
//   - dashed hollow marks  = cards never studied, adrift in the fog gutter
//                            left of the now line,
//   - pulsing marks on the now line = due for review right now.
// Hovering or focusing a mark shows the card's front and its personal
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
  fieldTicks,
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
  if (cardCount === 0) return 36; // just room for the "No cards yet" line
  return Math.min(56 + Math.ceil(Math.sqrt(cardCount)) * 10, 116);
}

const CURVE_W = 168;
const CURVE_H = 44;

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
  const ticks = fieldTicks(now, examDate);
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

      <div className="relative px-5 pb-5 pt-4">
        {/* Chart area — the fog gutter and the now/exam lines span exactly the
            labels + bands + ticks, sharing the marks' coordinate space, and
            stop before the Study row and legend. */}
        <div className="relative">
          {/* Fog gutter — unmapped territory left of the now line. */}
          <div
            className="absolute inset-y-0 left-0 border-r border-dashed border-line-strong/60 bg-ink/[0.025]"
            style={{ width: `${NOW_X}%` }}
            aria-hidden="true"
          />
          {/* Exam line. */}
          <div
            className="absolute inset-y-0 w-px bg-line-strong"
            style={{ left: `${EXAM_X}%` }}
            aria-hidden="true"
          />
          {/* Now line — where studying happens. */}
          <div
            className="absolute inset-y-0 w-px bg-accent/70"
            style={{ left: `${NOW_X}%` }}
            aria-hidden="true"
          />

          {/* Axis labels. */}
          <div className="relative mb-3 h-4 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            <span
              className="absolute ml-2 whitespace-nowrap text-accent"
              style={{ left: `${NOW_X}%` }}
            >
              Now
            </span>
            <span
              className="absolute mr-2 whitespace-nowrap"
              style={{ right: `${100 - EXAM_X}%` }}
            >
              Exam · {formatDate(examDate, timeZone)}
            </span>
          </div>

          {/* Bands. */}
          <div className="flex flex-col gap-1">
          {bands.map((band) => {
            const marks = buildFieldMarks(band.cards, decay, now, examDate);
            return (
              <div key={band.id}>
                {band.label !== undefined && (
                  <div
                    className="flex items-baseline gap-2"
                    style={{ paddingLeft: `${NOW_X}%` }}
                  >
                    {band.onOpen ? (
                      <button
                        type="button"
                        onClick={band.onOpen}
                        className="min-h-8 pl-2 text-sm font-medium text-ink transition-colors hover:text-accent"
                      >
                        {band.label}
                      </button>
                    ) : (
                      <span className="pl-2 text-sm font-medium text-ink">{band.label}</span>
                    )}
                    <span className="text-xs tabular-nums text-ink-faint">
                      {band.cards.length} card{band.cards.length === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
                <div className="relative" style={{ height: bandHeight(band.cards.length) }}>
                  {marks.length === 0 && (
                    <p
                      className="absolute top-1/2 -translate-y-1/2 pl-2 text-xs text-ink-faint"
                      style={{ left: `${NOW_X}%` }}
                    >
                      No cards yet.
                    </p>
                  )}
                  {marks.map((mark) => {
                    const idx = markIndex++;
                    const alpha = 0.3 + 0.7 * mark.r;
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
                          'absolute h-[11px] w-[5px] rounded-[2px] p-0',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                          mark.dueNow ? 'field-mark-due' : 'field-mark',
                          mark.unseen &&
                            'border border-dashed border-ink-faint/60 bg-transparent',
                          onOpenCard ? 'cursor-pointer' : 'cursor-default',
                        )}
                        style={{
                          left: `${mark.x}%`,
                          top: `${mark.y * 100}%`,
                          translate: '0 -50%',
                          scale: active ? '1.6' : '1',
                          animationDelay: `${Math.min(idx * 16, 640)}ms`,
                          ...(mark.unseen
                            ? undefined
                            : {
                                backgroundColor: `hsl(var(--accent) / ${alpha})`,
                                boxShadow: mark.dueNow
                                  ? undefined // the breathe animation owns it
                                  : `0 0 ${2 + 7 * mark.r}px hsl(var(--accent) / ${0.15 + 0.45 * mark.r})`,
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

          {/* Duration ticks along the bottom of the field. */}
          <div className="relative mt-1 h-4 font-mono text-[10px] text-ink-faint">
            {ticks.map((tick) => (
              <span
                key={tick.label}
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${tick.x}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        {/* Study action, anchored at the now line — the place work happens. */}
        <div
          className="mt-4 flex flex-wrap items-center gap-3"
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
          <p className="text-xs text-ink-faint">
            {totalCards === 0
              ? 'Add cards to light up the field.'
              : dueCount > 0
                ? `${dueCount} card${dueCount === 1 ? '' : 's'} waiting at the line.`
                : 'Nothing due — study ahead.'}
          </p>
        </div>

        {/* Legend — how to read the field. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-[9px] w-[4px] rounded-[1.5px]"
              style={{
                backgroundColor: 'hsl(var(--accent) / 0.9)',
                boxShadow: '0 0 5px hsl(var(--accent) / 0.5)',
              }}
              aria-hidden="true"
            />
            bright = strong memory
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-[9px] w-[4px] rounded-[1.5px]"
              style={{ backgroundColor: 'hsl(var(--accent) / 0.3)' }}
              aria-hidden="true"
            />
            faint = fading
          </span>
          {anyUnseen && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-[9px] w-[4px] rounded-[1.5px] border border-dashed border-ink-faint/60"
                aria-hidden="true"
              />
              not yet studied
            </span>
          )}
          <span>position = next review, from now to the exam</span>
        </div>
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
      className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-lg shadow-black/10"
      style={{
        left: `${left}%`,
        ...(below ? { top: `${mark.y * 100}%`, marginTop: 14 } : { bottom: `${100 - mark.y * 100}%`, marginBottom: 14 }),
      }}
    >
      <p className="mb-1 text-xs leading-snug text-ink">{plainFront(mark.card.front)}</p>
      <p className="mb-2 text-[11px] text-ink-faint">
        {dueText(mark, now, timeZone)}
        {!mark.unseen && (
          <span className="ml-1.5 font-mono text-accent-ink">
            R {Math.round(mark.r * 100)}%
          </span>
        )}
      </p>
      {points && (
        <svg
          width={CURVE_W}
          height={CURVE_H}
          viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
          className="block"
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
          <polyline
            points={points}
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth={1.5}
          />
          {/* Exam-day endpoint. */}
          <circle cx={CURVE_W} cy={lastYPx(points)} r={2.5} fill="hsl(var(--accent))" />
        </svg>
      )}
      {points && (
        <p className="mt-1 font-mono text-[10px] text-ink-faint">
          forgetting curve → exam day
        </p>
      )}
    </div>
  );
}

/** y-pixel of the final polyline sample (the exam-day endpoint). */
function lastYPx(points: string): number {
  const last = points.slice(points.lastIndexOf(' ') + 1);
  return Number(last.split(',')[1]);
}
