import type { Card, LineVerdict, MarkSchemeLine, ReviewLog } from '../db/types';

type MarksReview = Pick<ReviewLog, 'marksEarned' | 'marksAvailable' | 'lineVerdicts'>;
type MarksCard = Pick<Card, 'payload'> & { history: readonly MarksReview[] };

export interface MarkPerformance {
  reviewedAttempts: number;
  marksEarned: number;
  marksAvailable: number;
  /** Earned marks divided by available marks, or null when there are no marked attempts. */
  attainmentRate: number | null;
}

export interface CriterionPerformance extends MarkPerformance {
  label: string;
  fullyEarnedAttempts: number;
  missedAttempts: number;
}

function validMarkPair(review: MarksReview): review is MarksReview & {
  marksEarned: number;
  marksAvailable: number;
} {
  return (
    typeof review.marksEarned === 'number' &&
    Number.isFinite(review.marksEarned) &&
    review.marksEarned >= 0 &&
    typeof review.marksAvailable === 'number' &&
    Number.isFinite(review.marksAvailable) &&
    review.marksAvailable > 0 &&
    review.marksEarned <= review.marksAvailable
  );
}

function attainmentRate(marksEarned: number, marksAvailable: number): number | null {
  return marksAvailable > 0 ? marksEarned / marksAvailable : null;
}

/** Aggregate machine-awarded marks while ignoring classic and malformed review entries. */
export function aggregateMarkPerformance(cards: readonly MarksCard[]): MarkPerformance {
  let reviewedAttempts = 0;
  let marksEarned = 0;
  let marksAvailable = 0;

  for (const card of cards) {
    for (const review of card.history) {
      if (!validMarkPair(review)) continue;
      reviewedAttempts += 1;
      marksEarned += review.marksEarned;
      marksAvailable += review.marksAvailable;
    }
  }

  return {
    reviewedAttempts,
    marksEarned,
    marksAvailable,
    attainmentRate: attainmentRate(marksEarned, marksAvailable),
  };
}

interface MutableCriterionPerformance {
  label: string;
  reviewedAttempts: number;
  fullyEarnedAttempts: number;
  missedAttempts: number;
  marksEarned: number;
  marksAvailable: number;
}

function validSchemeMarks(line: MarkSchemeLine): number {
  return Number.isFinite(line.marks) && line.marks > 0 ? line.marks : 0;
}

function earnedMarksBySchemeIndex(
  verdicts: readonly LineVerdict[],
  scheme: readonly MarkSchemeLine[],
): Map<number, number> {
  const earned = new Map<number, number>();
  for (const verdict of verdicts) {
    const index = verdict.matchedLineIndex;
    if (index === null || !Number.isInteger(index) || index < 0 || index >= scheme.length) continue;
    if (!Number.isFinite(verdict.marksEarned) || verdict.marksEarned <= 0) continue;
    const maximum = validSchemeMarks(scheme[index]);
    earned.set(index, Math.min(maximum, (earned.get(index) ?? 0) + verdict.marksEarned));
  }
  return earned;
}

/**
 * Group working-item performance by the labels in each card's current mark scheme.
 * Unlabelled criteria are deliberately omitted because they have no stable analytics key.
 */
export function aggregateCriterionPerformance(cards: readonly MarksCard[]): CriterionPerformance[] {
  const totals = new Map<string, MutableCriterionPerformance>();

  for (const card of cards) {
    if (card.payload?.v !== 1 || card.payload.kind !== 'working') continue;
    const scheme = card.payload.scheme;

    for (const review of card.history) {
      if (!validMarkPair(review) || !review.lineVerdicts) continue;
      const earnedByIndex = earnedMarksBySchemeIndex(review.lineVerdicts, scheme);
      const attemptByLabel = new Map<string, { earned: number; available: number }>();

      scheme.forEach((line, index) => {
        const label = line.label?.trim();
        const available = validSchemeMarks(line);
        if (!label || available === 0) return;
        const attempt = attemptByLabel.get(label) ?? { earned: 0, available: 0 };
        attempt.earned += earnedByIndex.get(index) ?? 0;
        attempt.available += available;
        attemptByLabel.set(label, attempt);
      });

      for (const [label, attempt] of attemptByLabel) {
        const total = totals.get(label) ?? {
          label,
          reviewedAttempts: 0,
          fullyEarnedAttempts: 0,
          missedAttempts: 0,
          marksEarned: 0,
          marksAvailable: 0,
        };
        total.reviewedAttempts += 1;
        total.marksEarned += attempt.earned;
        total.marksAvailable += attempt.available;
        if (attempt.earned === attempt.available) total.fullyEarnedAttempts += 1;
        else total.missedAttempts += 1;
        totals.set(label, total);
      }
    }
  }

  return [...totals.values()]
    .map((total) => ({
      ...total,
      attainmentRate: attainmentRate(total.marksEarned, total.marksAvailable),
    }))
    .sort((a, b) => b.missedAttempts - a.missedAttempts || a.label.localeCompare(b.label));
}
