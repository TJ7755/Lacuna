// The Memory Backdrop — the course/lesson pages' ambient visualisation.
//
// Rather than a boxed chart, every card in scope becomes a small point of
// light scattered across the page background, behind the content cards:
//   - filled and bright = well remembered (glow follows current predicted
//     retrievability, so fading memories literally dim towards the paper),
//   - hollow rings      = cards never studied,
//   - breathing lights  = due for review right now.
// Placement is deterministic (hashed from the card id) so the constellation
// is stable between visits and drifts, very slowly, in place. Decorative:
// hidden from assistive tech and pointer-transparent. The maths lives in
// memoryFieldMath.ts. British English throughout.

import { hashJitter, retrievabilityNow } from './memoryFieldMath';
import type { Card } from '../../db/types';

interface MemoryBackdropProps {
  cards: Card[];
  /** Forgetting-curve decay exponent for the course (see decayOf). */
  decay: number;
  now: number;
}

/** Enough to feel alive without turning the page into static. */
const MAX_LIGHTS = 72;

export function MemoryBackdrop({ cards, decay, now }: MemoryBackdropProps) {
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
        const r = retrievabilityNow(card, decay, now);
        const x = 2 + hashJitter(card.id, 1) * 96;
        const y = 4 + hashJitter(card.id, 2) * 92;
        const size = 7 + hashJitter(card.id, 3) * 5;
        return (
          <span
            key={card.id}
            className={`absolute rounded-full ${dueNow ? 'backdrop-light-due' : 'backdrop-light'}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              translate: '-50% -50%',
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
          />
        );
      })}
    </div>
  );
}
