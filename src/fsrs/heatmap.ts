// Review heatmap data: a contribution-style calendar of reviews per day, built
// from the review logs already stored on each card. Pure and timezone-correct:
// reviews are bucketed by *local* calendar day (via startOfDay), which is what a
// user expects from an Anki-style heatmap.

import { startOfDay } from '../utils/datetime';
import type { Card } from '../db/types';

/** How many weeks of review history the dashboard calendar renders. */
export const REVIEW_HEATMAP_WEEKS = 26;

export interface ReviewHeatmapProjection {
  /** Local day used to anchor the fixed calendar window. */
  today: number;
  /** Review counts only for days inside the rendered 26-week grid. */
  buckets: ReadonlyMap<number, number>;
  /** Whether any review exists, including outside the rendered window. */
  hasReviewHistory: boolean;
}

/** Every review timestamp across the given cards (one per logged review). */
export function reviewTimestamps(cards: Card[]): number[] {
  const out: number[] = [];
  for (const card of cards) for (const log of card.history) out.push(log.timestamp);
  return out;
}

/** Iterate review timestamps without materialising another history-sized array. */
export function* iterateReviewTimestamps(cards: readonly Card[]): Generator<number> {
  for (const card of cards) for (const log of card.history) yield log.timestamp;
}

/** Count reviews per local calendar day. */
export function bucketReviewsByDay(timestamps: number[]): Map<number, number> {
  const buckets = new Map<number, number>();
  for (const t of timestamps) {
    const day = startOfDay(t);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return buckets;
}

/** DST-safe helper: add/subtract days from a local-midnight epoch. */
export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return startOfDay(d.getTime());
}

/** Inclusive day range rendered by the Monday-indexed heatmap grid. */
export function reviewHeatmapRange(now: number): {
  today: number;
  gridStart: number;
  gridEnd: number;
} {
  const today = startOfDay(now);
  const weekday = (new Date(today).getDay() + 6) % 7;
  const gridEnd = addDays(today, 6 - weekday);
  return {
    today,
    gridStart: addDays(gridEnd, -(REVIEW_HEATMAP_WEEKS * 7 - 1)),
    gridEnd,
  };
}

/** Compact the review stream to the exact calendar data retained by the dashboard. */
export function projectReviewHeatmap(
  timestamps: Iterable<number>,
  now: number,
): ReviewHeatmapProjection {
  const { today, gridStart, gridEnd } = reviewHeatmapRange(now);
  const buckets = new Map<number, number>();
  let hasReviewHistory = false;
  for (const timestamp of timestamps) {
    hasReviewHistory = true;
    const day = startOfDay(timestamp);
    if (day < gridStart || day > gridEnd) continue;
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return { today, buckets, hasReviewHistory };
}
