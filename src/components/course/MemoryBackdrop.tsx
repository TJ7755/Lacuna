// The Memory Backdrop — the course/lesson pages' ambient visualisation.
//
// Rather than a boxed chart, every card in scope becomes a small point of
// light scattered across the page background, behind the content cards:
//   - filled and bright = well remembered (glow follows current predicted
//     retrievability, so fading memories literally dim towards the paper),
//   - hollow rings      = cards never studied,
//   - breathing lights  = due for review right now.
// Placement is deterministic (hashed from the card id) so the constellation
// is stable between visits and drifts, very slowly, in place. Hovering a
// light expands it into a small squircle naming the card, its state, and (for
// studied cards) a MiniCurve preview of its personal forgetting curve out to
// its due date, or a month-long fallback for cards without one; clicking
// opens the card (when `onOpenCard` is given). The layer is hidden from
// assistive tech — the same cards remain reachable through the lists.
// The maths lives in memoryFieldMath.ts. British English throughout.

import { useState } from 'react';
import { curvePoints, hashJitter, plainFront, retrievabilityNow } from './memoryFieldMath';
import { MiniCurve } from '../ui/MiniCurve';
import { MS_PER_DAY } from '../../fsrs/params';
import type { Card } from '../../db/types';

interface MemoryBackdropProps {
  cards: Card[];
  /** Forgetting-curve decay exponent for the course (see decayOf). */
  decay?: number;
  /**
   * Per-card decay lookup, for backdrops spanning multiple courses whose FSRS
   * parameters differ (e.g. the dashboard). Takes precedence over the scalar
   * `decay` when supplied; single-course pages can keep using `decay`.
   */
  decayFor?: (card: Card) => number;
  now: number;
  /** Opens a card for editing when a light is clicked. */
  onOpenCard?: (card: Card) => void;
}

/** Enough to feel alive without turning the page into static. */
const MAX_LIGHTS = 72;

export function MemoryBackdrop({ cards, decay, decayFor, now, onOpenCard }: MemoryBackdropProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Deterministic sample for very large courses: hash order, not slice order,
  // so the chosen lights do not all come from the oldest cards.
  const sample =
    cards.length > MAX_LIGHTS
      ? [...cards].sort((a, b) => hashJitter(a.id) - hashJitter(b.id)).slice(0, MAX_LIGHTS)
      : cards;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {sample.map((card, i) => {
        const unseen = card.lastReviewed === null || card.state === 0;
        const dueNow = !unseen && card.due !== null && card.due <= now;
        const cardDecay = decayFor ? decayFor(card) : (decay ?? 0);
        const r = retrievabilityNow(card, cardDecay, now);
        const x = 2 + hashJitter(card.id, 1) * 96;
        const y = 4 + hashJitter(card.id, 2) * 92;
        const size = 7 + hashJitter(card.id, 3) * 5;
        const hovered = hoveredId === card.id;
        return (
          <span
            key={card.id}
            className={`pointer-events-auto absolute rounded-full ${
              dueNow ? 'backdrop-light-due' : 'backdrop-light'
            } ${onOpenCard ? 'cursor-pointer' : ''}`}
            onMouseEnter={() => setHoveredId(card.id)}
            onMouseLeave={() => setHoveredId((id) => (id === card.id ? null : id))}
            onClick={onOpenCard ? () => onOpenCard(card) : undefined}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              translate: '-50% -50%',
              scale: hovered ? '1.6' : '1',
              animationDelay: `${Math.min(i * 60, 2400)}ms`,
              // Entrance duration, then a per-light drift period (due lights
              // breathe on their class's own rhythm instead of drifting).
              ...(dueNow
                ? undefined
                : {
                    animationDuration: `1200ms, ${(8 + hashJitter(card.id, 4) * 8).toFixed(1)}s`,
                  }),
              ...(unseen
                ? { border: '1.5px solid hsl(var(--ink-faint) / 0.35)' }
                : {
                    backgroundColor: `hsl(var(--accent) / ${0.14 + 0.4 * r})`,
                    boxShadow: `0 0 ${6 + 10 * r}px ${1 + 2 * r}px hsl(var(--accent) / ${0.08 + 0.28 * r})`,
                  }),
            }}
          >
            {hovered && (
              <LightDetail
                card={card}
                unseen={unseen}
                dueNow={dueNow}
                r={r}
                decay={cardDecay}
                now={now}
                above={y > 20}
                xPct={x}
                clickable={onOpenCard !== undefined}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The squircle a hovered light expands into: card front plus memory state. */
/** Cards with no due date shown yet fall back to a month-long curve preview. */
const FALLBACK_HORIZON_DAYS = 30;

function LightDetail({
  card,
  unseen,
  dueNow,
  r,
  decay,
  now,
  above,
  xPct,
  clickable,
}: {
  card: Card;
  unseen: boolean;
  dueNow: boolean;
  r: number;
  decay: number;
  now: number;
  above: boolean;
  /** Light's horizontal page position — used to keep the squircle on screen. */
  xPct: number;
  clickable: boolean;
}) {
  let state: string;
  if (unseen) state = 'Not yet studied';
  else if (dueNow) state = 'Due now';
  else {
    const days = Math.max(Math.ceil(((card.due ?? now) - now) / MS_PER_DAY), 1);
    state = `${Math.round(r * 100)}% retained · due in ${days} day${days === 1 ? '' : 's'}`;
  }
  const horizon = card.due !== null && card.due > now
    ? card.due
    : now + FALLBACK_HORIZON_DAYS * MS_PER_DAY;
  const curve = unseen ? null : curvePoints(card, decay, now, horizon, 140, 28);
  return (
    <span
      className={`backdrop-light-detail absolute left-1/2 z-10 block w-40 rounded-xl border border-line bg-surface-raised p-2.5 shadow-md shadow-black/10 ${
        above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
      }`}
      style={{ translate: xPct < 12 ? '-12%' : xPct > 88 ? '-88%' : '-50%' }}
    >
      <span className="block text-xs leading-snug text-ink">{plainFront(card.front, 60)}</span>
      <span className="mt-0.5 block text-[11px] text-ink-faint">
        {state}
        {clickable && ' · click to open'}
      </span>
      {curve && <MiniCurve points={curve} width={140} height={28} />}
    </span>
  );
}
