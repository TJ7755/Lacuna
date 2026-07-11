// Pure FSRS-derived display maths and copy shared across course/lesson pages:
// current retrievability (used by SearchPage), a per-card forgetting-curve
// sample and cloze-stripped preview text (curvePoints/plainFront — currently
// unused here but kept exported for upcoming hover-squircle UI elsewhere), and
// the header standfirst sentence. No React, no database — same testable-pure
// convention as src/course/path.ts.
// British English throughout.

import { forgettingCurve } from '../../fsrs/forwardSim';
import { MS_PER_DAY } from '../../fsrs/params';
import type { Card } from '../../db/types';

/**
 * Current (this instant, not exam-day) predicted retrievability of a card.
 * Unseen cards have no memory state, so 0.
 */
export function retrievabilityNow(card: Card, decay: number, now: number): number {
  if (card.stability === null || card.lastReviewed === null) return 0;
  const days = Math.max(now - card.lastReviewed, 0) / MS_PER_DAY;
  return forgettingCurve(days, card.stability, decay);
}

/**
 * Sample a card's personal forgetting curve from now until `horizon` (a
 * timestamp) as SVG polyline points within a `width` x `height` box (y = 0 at
 * R = 1, y = height at R = 0). Returns null for unseen cards, which have no
 * curve to draw.
 */
export function curvePoints(
  card: Card,
  decay: number,
  now: number,
  horizon: number,
  width: number,
  height: number,
  samples = 24,
): string | null {
  if (card.stability === null || card.lastReviewed === null) return null;
  const elapsed = Math.max(now - card.lastReviewed, 0) / MS_PER_DAY;
  const spanDays = Math.max((horizon - now) / MS_PER_DAY, 0.01);
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * spanDays;
    const r = forgettingCurve(elapsed + t, card.stability, decay);
    pts.push(`${((i / samples) * width).toFixed(1)},${((1 - r) * height).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Cloze notation reads badly in a hover card; show the concealed text instead. */
export function plainFront(front: string, max = 80): string {
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
 * memory is holding, and how long remains. The backdrop carries the detail.
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
