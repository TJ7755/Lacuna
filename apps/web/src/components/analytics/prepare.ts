// Pure data-shaping helpers for the analytics charts.

import { startOfDay } from '../../utils/datetime';
import { isLeech } from '../../fsrs/leech';
import type { Card, Course, ReviewLog, SessionHistoryEntry } from '../../db/types';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';

/** DST-safe day offset: add/subtract whole days from a local-midnight epoch. */
function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return startOfDay(d.getTime());
}

interface CardReview {
  card: Card;
  log: ReviewLog;
}

function reviewsForCards(
  cards: Card[],
  reviewHistory?: readonly ReviewHistoryEntry[],
): CardReview[] {
  if (reviewHistory === undefined) {
    return cards.flatMap((card) => card.history.map((log) => ({ card, log })));
  }
  const cardIds = new Set(cards.map((card) => card.id));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return reviewHistory.flatMap((log) => {
    if (!cardIds.has(log.cardId)) return [];
    const card = cardsById.get(log.cardId);
    return card ? [{ card, log }] : [];
  });
}

export interface TrajectoryPoint {
  day: number;
  label: string;
  retrievability: number;
  /** Courses averaged into this point; the cross-course series only. */
  courses?: number;
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
    if (s === null || !Number.isFinite(s)) buckets[0].count++;
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

/** Daily review counts over the past `days` days, drawn from canonical review events. */
export function reviewVolume(
  cards: Card[],
  days = 30,
  now = Date.now(),
  reviewHistory?: readonly ReviewHistoryEntry[],
): VolumePoint[] {
  const today = startOfDay(now);
  const counts = new Map<number, number>();
  for (const { log } of reviewsForCards(cards, reviewHistory)) {
    const day = startOfDay(log.timestamp);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const points: VolumePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    points.push({
      day,
      label: new Date(day).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      }),
      reviews: Number.isFinite(counts.get(day) ?? 0) ? (counts.get(day) ?? 0) : 0,
    });
  }
  return points;
}

export interface ForecastPoint {
  day: number;
  label: string;
  due: number;
  newCards: number;
}

/**
 * Uncapped card availability over the next `days` days. Overdue cards fold into
 * today; burial defers both new cards and reviews. Dashboard totals can differ:
 * they apply source budgets and omit currently buried new cards.
 */
export function forecastSeries(cards: Card[], days = 30, now = Date.now()): ForecastPoint[] {
  const today = startOfDay(now);
  const buckets = new Map<number, { due: number; newCards: number }>();
  for (let i = 0; i < days; i++) {
    buckets.set(addDays(today, i), { due: 0, newCards: 0 });
  }
  for (const card of cards) {
    if (card.suspended) continue;
    const effectiveDue = Math.max(card.due ?? now, card.buriedUntil ?? 0);
    const bucket = buckets.get(Math.max(startOfDay(effectiveDue), today));
    if (!bucket) continue;
    if (card.due === null) {
      bucket.newCards++;
    } else {
      bucket.due++;
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, bucket]) => ({
      day,
      label: new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      due: Number.isFinite(bucket.due) ? bucket.due : 0,
      newCards: Number.isFinite(bucket.newCards) ? bucket.newCards : 0,
    }));
}

export interface StudyTimePoint {
  day: number;
  label: string;
  minutes: number;
}

/** Daily study time (minutes) over the past `days` days. */
export function studyTimeSeries(
  cards: Card[],
  days = 30,
  now = Date.now(),
  reviewHistory?: readonly ReviewHistoryEntry[],
): StudyTimePoint[] {
  const today = startOfDay(now);
  const counts = new Map<number, number>();
  for (const { log } of reviewsForCards(cards, reviewHistory)) {
    const day = startOfDay(log.timestamp);
    counts.set(day, (counts.get(day) ?? 0) + log.responseTimeSec);
  }
  const points: StudyTimePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const seconds = counts.get(day) ?? 0;
    points.push({
      day,
      label: new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      // Unrounded: rounding each day to whole minutes erased short sessions.
      minutes: Number.isFinite(seconds) ? seconds / 60 : 0,
    });
  }
  return points;
}

/** Whole minutes across a series; any study at all reads as at least 1 minute. */
export function totalStudyMinutes(points: readonly StudyTimePoint[]): number {
  const total = points.reduce((sum, point) => sum + point.minutes, 0);
  return total > 0 ? Math.max(1, Math.round(total)) : 0;
}

export interface RetentionByAgePoint {
  ageLabel: string;
  retention: number;
  count: number;
}

/** Observed recall rate for every review, grouped by the card's age at that review. */
export function retentionByAge(
  cards: Card[],
  now = Date.now(),
  reviewHistory?: readonly ReviewHistoryEntry[],
): RetentionByAgePoint[] {
  const dayMs = 86_400_000;
  const buckets = [
    { label: '0–7 days', min: 0, max: 7, total: 0, recalled: 0 },
    { label: '7–30 days', min: 7, max: 30, total: 0, recalled: 0 },
    { label: '30–90 days', min: 30, max: 90, total: 0, recalled: 0 },
    { label: '90–180 days', min: 90, max: 180, total: 0, recalled: 0 },
    { label: '180+ days', min: 180, max: Infinity, total: 0, recalled: 0 },
  ];
  const historyByCard = new Map<string, ReviewLog[]>();
  for (const { card, log } of reviewsForCards(cards, reviewHistory)) {
    if (!Number.isFinite(log.timestamp) || log.timestamp > now) continue;
    const history = historyByCard.get(card.id) ?? [];
    history.push(log);
    historyByCard.set(card.id, history);
  }
  for (const card of cards) {
    const reviews = historyByCard.get(card.id) ?? [];
    if (reviews.length === 0) continue;
    const firstReview = Math.min(...reviews.map((log) => log.timestamp));
    for (const log of reviews) {
      const ageDays = Math.max(0, Math.floor((log.timestamp - firstReview) / dayMs));
      const bucket = buckets.find((candidate) => {
        return ageDays >= candidate.min && ageDays < candidate.max;
      });
      if (bucket) {
        bucket.total++;
        if (log.grade > 1) bucket.recalled++;
      }
    }
  }
  return buckets.map((b) => ({
    ageLabel: b.label,
    retention: b.total > 0 ? Math.round((b.recalled / b.total) * 100) : 0,
    count: b.total,
  }));
}

export interface LeechCount {
  name: string;
  count: number;
}

/** Leech counts per course, sorted descending. */
export function leechCountByCourse(
  cards: Card[],
  courseMap: Map<string, Pick<Course, 'name' | 'leechThreshold'>>,
): LeechCount[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!card.courseId) continue;
    const course = courseMap.get(card.courseId);
    if (!isLeech(card, course?.leechThreshold)) continue;
    const courseName = course?.name ?? 'Unknown';
    counts.set(courseName, (counts.get(courseName) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Cross-course predicted exam-day trajectory: for each calendar day, average the
 * last per-course snapshot recorded that day. Ignores legacy deck-only entries.
 */
export function globalTrajectorySeries(history: SessionHistoryEntry[]): TrajectoryPoint[] {
  const perDayPerCourse = new Map<number, Map<string, SessionHistoryEntry>>();
  for (const entry of history) {
    if (!entry.courseId) continue;
    const day = startOfDay(entry.timestamp);
    let courseMap = perDayPerCourse.get(day);
    if (!courseMap) {
      courseMap = new Map();
      perDayPerCourse.set(day, courseMap);
    }
    const existing = courseMap.get(entry.courseId);
    if (!existing || entry.timestamp >= existing.timestamp) {
      courseMap.set(entry.courseId, entry);
    }
  }
  return [...perDayPerCourse.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, courseMap]) => {
      const values = [...courseMap.values()];
      const avg =
        values.reduce((sum, entry) => sum + entry.averagePredictedRetrievability, 0) /
        values.length;
      return {
        day,
        label: new Date(day).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
        retrievability: Number.isFinite(avg) ? Math.round(avg * 100) : 0,
        courses: values.length,
      };
    });
}

/** Review timestamps grouped by card, in the shape the review heatmap reads. */
export function reviewActivityFromHistory(
  reviewHistory: readonly ReviewHistoryEntry[],
): Map<string, number[]> {
  const activity = new Map<string, number[]>();
  for (const entry of reviewHistory) {
    const list = activity.get(entry.cardId);
    if (list) list.push(entry.timestamp);
    else activity.set(entry.cardId, [entry.timestamp]);
  }
  return activity;
}

/**
 * Observed recall across every review, weighting each age band by its review count.
 * Null when nothing has been reviewed, so callers can show a dash rather than 0%.
 */
export function overallRecall(points: readonly RetentionByAgePoint[]): number | null {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  if (total === 0) return null;
  return Math.round(points.reduce((sum, point) => sum + point.retention * point.count, 0) / total);
}
