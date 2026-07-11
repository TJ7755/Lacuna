// Pure layout and copy maths for the Memory Field visualisation (MemoryField.tsx).
// The field renders every card as a mark positioned by *when it next comes due*
// (now → exam, sqrt-compressed so the near term gets most of the width) and
// coloured by *current predicted retrievability*. No React, no database — same
// testable-pure convention as src/course/path.ts.
// British English throughout.

import { forgettingCurve } from '../../fsrs/forwardSim';
import { MS_PER_DAY } from '../../fsrs/params';
import type { Card } from '../../db/types';

/* ------------------------------------------------------------------------ */
/* Horizontal geometry (all positions are 0..100 percentages of field width) */
/* ------------------------------------------------------------------------ */

/** Where the "now" line sits. Left of this is the fog gutter for unseen cards. */
export const NOW_X = 10;
/** Where the exam line sits. */
export const EXAM_X = 96;

/**
 * Map a due timestamp to a field x-position. Sqrt compression spreads the next
 * few days across most of the width — the near term is where the action is —
 * while months out still register as "far". Due dates past the exam clamp to
 * the exam line (they cannot matter after it).
 */
export function fieldX(due: number, now: number, exam: number): number {
  if (exam <= now) return NOW_X;
  const frac = Math.min(Math.max((due - now) / (exam - now), 0), 1);
  return NOW_X + (EXAM_X - NOW_X) * Math.sqrt(frac);
}

/** Deterministic 0..1 hash of a card id — stable jitter without Math.random. */
export function hashJitter(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/* ------------------------------------------------------------------------ */
/* Per-card mark data                                                        */
/* ------------------------------------------------------------------------ */

export interface FieldMark {
  card: Card;
  /** 0..100, percentage across the field. */
  x: number;
  /** 0..1, vertical position within the band (jittered, deterministic). */
  y: number;
  /** Current predicted retrievability 0..1; 0 for unseen cards. */
  r: number;
  /** Never reviewed — rendered as unresolved fog left of the now line. */
  unseen: boolean;
  /** Due for review right now — clustered on the now line, pulsing. */
  dueNow: boolean;
}

/**
 * Current (this instant, not exam-day) predicted retrievability of a card.
 * Unseen cards have no memory state, so 0.
 */
export function retrievabilityNow(card: Card, decay: number, now: number): number {
  if (card.stability === null || card.lastReviewed === null) return 0;
  const days = Math.max(now - card.lastReviewed, 0) / MS_PER_DAY;
  return forgettingCurve(days, card.stability, decay);
}

/** Fraction of the golden angle — spreads n items evenly but organically. */
function goldenSpread(i: number): number {
  return (i * 0.618034) % 1;
}

/** Build the mark set for one band (one lesson, or a whole course band). */
export function buildFieldMarks(
  cards: Card[],
  decay: number,
  now: number,
  exam: number,
): FieldMark[] {
  // Piles (unseen fog, due-now line) are placed by index within their pile so
  // they spread evenly instead of clumping — hash jitter alone stacks small
  // piles on top of themselves.
  let unseenIdx = 0;
  let dueIdx = 0;
  const unseenTotal = cards.filter((c) => c.lastReviewed === null || c.state === 0).length;

  return cards.map((card) => {
    const unseen = card.lastReviewed === null || card.state === 0;
    const dueNow = !unseen && card.due !== null && card.due <= now;
    let x: number;
    let y: number;
    if (unseen) {
      // Fog gutter: spread across its width, one even step per card.
      const i = unseenIdx++;
      x = 2.5 + (unseenTotal === 1 ? 0.5 : i / Math.max(unseenTotal - 1, 1)) * (NOW_X - 6);
      y = 0.15 + goldenSpread(i) * 0.7;
    } else if (dueNow) {
      // The due pile sits hard on the now line, fanned vertically.
      const i = dueIdx++;
      x = NOW_X + 0.3 + (i % 2) * 0.7;
      y = 0.15 + goldenSpread(i) * 0.7;
    } else {
      // Scheduled cards: position is the real due date; keep clear of both lines.
      x = Math.min(
        Math.max(fieldX(card.due ?? now, now, exam), NOW_X + 1.2),
        EXAM_X - 1.2,
      );
      y = 0.1 + hashJitter(card.id) * 0.8;
    }
    return {
      card,
      x,
      y,
      r: retrievabilityNow(card, decay, now),
      unseen,
      dueNow,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Axis ticks                                                                */
/* ------------------------------------------------------------------------ */

export interface FieldTick {
  x: number;
  label: string;
}

const TICK_CANDIDATES: Array<{ days: number; label: string }> = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
];

/** Duration ticks between now and the exam, kept sparse enough to breathe. */
export function fieldTicks(now: number, exam: number): FieldTick[] {
  const spanDays = (exam - now) / MS_PER_DAY;
  const ticks: FieldTick[] = [];
  let lastX = NOW_X;
  for (const { days, label } of TICK_CANDIDATES) {
    if (days >= spanDays * 0.9) break;
    const x = fieldX(now + days * MS_PER_DAY, now, exam);
    if (x - lastX < 9 || EXAM_X - x < 9) continue; // too crowded to label
    ticks.push({ x, label });
    lastX = x;
  }
  return ticks;
}

/* ------------------------------------------------------------------------ */
/* Forgetting-curve preview (hover tooltip)                                  */
/* ------------------------------------------------------------------------ */

/**
 * Sample a card's personal forgetting curve from now until the exam as SVG
 * polyline points within a `width` x `height` box (y = 0 at R = 1). Returns
 * null for unseen cards, which have no curve to draw.
 */
export function curvePoints(
  card: Card,
  decay: number,
  now: number,
  exam: number,
  width: number,
  height: number,
  samples = 32,
): string | null {
  if (card.stability === null || card.lastReviewed === null) return null;
  const elapsed = Math.max(now - card.lastReviewed, 0) / MS_PER_DAY;
  const spanDays = Math.max((exam - now) / MS_PER_DAY, 0.01);
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * spanDays;
    const r = forgettingCurve(elapsed + t, card.stability, decay);
    pts.push(`${((i / samples) * width).toFixed(1)},${((1 - r) * height).toFixed(1)}`);
  }
  return pts.join(' ');
}

/* ------------------------------------------------------------------------ */
/* Copy                                                                      */
/* ------------------------------------------------------------------------ */

/** Cloze notation reads badly in a tooltip; show the concealed text instead. */
export function plainFront(front: string, max = 90): string {
  const text = front
    .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface StandfirstInput {
  dueCount: number;
  masteryPct: number;
  daysToExam: number;
  totalCards: number;
  unseenCount: number;
}

/**
 * One editorial sentence replacing the old stat-block row: what is fading, how
 * memory is holding, and how long remains. The field carries the detail.
 */
export function fieldStandfirst({
  dueCount,
  masteryPct,
  daysToExam,
  totalCards,
  unseenCount,
}: StandfirstInput): string {
  if (totalCards === 0) return 'No cards yet — add some to start mapping this memory.';
  const days =
    daysToExam <= 0
      ? 'exam day is here'
      : daysToExam === 1
        ? '1 day to go'
        : `${daysToExam} days to go`;
  const due =
    dueCount === 0
      ? 'Nothing due right now'
      : `${dueCount} card${dueCount === 1 ? '' : 's'} fading and due now`;
  const unseen =
    unseenCount > 0
      ? `, ${unseenCount} still unmapped`
      : '';
  return `${due}${unseen}; mastery holding at ${masteryPct}% with ${days}.`;
}
