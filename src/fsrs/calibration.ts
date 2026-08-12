import type { Card, ReviewLog } from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import { startOfDay } from '../utils/datetime';

export interface PredictionAccuracyPoint {
  day: number;
  label: string;
  brier: number;
  predicted: number;
  actual: number;
  reviews: number;
}

function label(day: number): string {
  return new Date(day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function recalled(log: ReviewLog): 0 | 1 {
  return log.grade > 1 ? 1 : 0;
}

/** Brier score by local day: lower means predicted retrievability matched recall better. */
export function predictionAccuracySeries(
  cards: Card[],
  reviewHistory?: readonly ReviewHistoryEntry[],
): PredictionAccuracyPoint[] {
  const buckets = new Map<
    number,
    { brier: number; predicted: number; actual: number; reviews: number }
  >();

  const cardIds = new Set(cards.map((card) => card.id));
  const events =
    reviewHistory ??
    cards.flatMap((card) => card.history.map((log) => ({ ...log, cardId: card.id })));
  for (const log of events) {
    if (!cardIds.has(log.cardId)) continue;
    if (log.retrievabilityAtReview === null) continue;
    const day = startOfDay(log.timestamp);
    const actual = recalled(log);
    const predicted = Math.max(0, Math.min(1, log.retrievabilityAtReview));
    const bucket = buckets.get(day) ?? { brier: 0, predicted: 0, actual: 0, reviews: 0 };
    bucket.brier += (predicted - actual) ** 2;
    bucket.predicted += predicted;
    bucket.actual += actual;
    bucket.reviews += 1;
    buckets.set(day, bucket);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, bucket]) => ({
      day,
      label: label(day),
      brier: Number((bucket.brier / bucket.reviews).toFixed(4)),
      predicted: Number((bucket.predicted / bucket.reviews).toFixed(4)),
      actual: Number((bucket.actual / bucket.reviews).toFixed(4)),
      reviews: bucket.reviews,
    }));
}
