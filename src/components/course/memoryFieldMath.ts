// Pure maths and copy for the Memory Backdrop (MemoryBackdrop.tsx): stable
// per-card hashing for placement, current retrievability for glow strength,
// and the header standfirst sentence. No React, no database — same
// testable-pure convention as src/course/path.ts.
// British English throughout.

import { forgettingCurve } from '../../fsrs/forwardSim';
import { MS_PER_DAY } from '../../fsrs/params';
import type { Card } from '../../db/types';

/** Deterministic 0..1 hash of a card id — stable placement without Math.random. */
export function hashJitter(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
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
