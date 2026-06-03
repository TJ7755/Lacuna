// Pure data-shaping helpers for the analytics charts.

import { startOfDay } from '../../utils/datetime';
import type { Card, SessionHistoryEntry } from '../../db/types';

export interface TrajectoryPoint {
  day: number;
  label: string;
  retrievability: number;
}

/**
 * Aggregate per-card SessionHistory snapshots into one point per calendar day
 * (the last snapshot of each day), keeping the trajectory line legible.
 */
export function trajectorySeries(history: SessionHistoryEntry[]): TrajectoryPoint[] {
  const lastPerDay = new Map<number, SessionHistoryEntry>();
  for (const entry of history) {
    const day = startOfDay(entry.timestamp);
    const existing = lastPerDay.get(day);
    if (!existing || entry.timestamp >= existing.timestamp) {
      lastPerDay.set(day, entry);
    }
  }
  return [...lastPerDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, entry]) => ({
      day,
      label: new Date(day).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      }),
      retrievability: Math.round(entry.averagePredictedRetrievability * 100),
    }));
}

export interface StabilityBucket {
  range: string;
  count: number;
}

/** Group cards by stability range for the stability profile chart. */
export function stabilityProfile(cards: Card[]): StabilityBucket[] {
  const buckets: StabilityBucket[] = [
    { range: 'New', count: 0 },
    { range: '< 1 day', count: 0 },
    { range: '1–7 days', count: 0 },
    { range: '7–30 days', count: 0 },
    { range: '30+ days', count: 0 },
  ];
  for (const card of cards) {
    const s = card.stability;
    if (s === null) buckets[0].count++;
    else if (s < 1) buckets[1].count++;
    else if (s < 7) buckets[2].count++;
    else if (s < 30) buckets[3].count++;
    else buckets[4].count++;
  }
  return buckets;
}

export interface VolumePoint {
  day: number;
  label: string;
  reviews: number;
}

/** Daily review counts over the past `days` days, drawn from card review logs. */
export function reviewVolume(cards: Card[], days = 30, now = Date.now()): VolumePoint[] {
  const today = startOfDay(now);
  const counts = new Map<number, number>();
  for (const card of cards) {
    for (const log of card.history) {
      const day = startOfDay(log.timestamp);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  const points: VolumePoint[] = [];
  const dayMs = 86_400_000;
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * dayMs;
    points.push({
      day,
      label: new Date(day).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      }),
      reviews: counts.get(day) ?? 0,
    });
  }
  return points;
}
