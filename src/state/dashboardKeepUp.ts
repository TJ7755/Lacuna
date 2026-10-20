import type { ReviewHistoryEntry } from '../db/reviewHistory';
import type { Card, Course } from '../db/types';
import type { ForecastPoint } from '../fsrs/courseForecast';
import { keepUpProjection } from '../fsrs/keepUpProjection';

export interface KeepUpRequest {
  id: number;
  entries: [Course, Card[]][];
  history: ReviewHistoryEntry[];
  now: number;
}

export interface KeepUpResponse {
  id: number;
  projections: Record<string, ForecastPoint[]>;
}

const HOUR = 3_600_000;
const keepUpCache = new Map<string, { key: string; value: ForecastPoint[] }>();

/** Clears the keep-up cache; for tests. */
export function clearKeepUpCache(): void {
  keepUpCache.clear();
}

/**
 * Future exam-day estimates for each course's forecast cards (from `forecastCards`),
 * cached independently of the chart's past window. It runs in a worker so the FSRS
 * engine stays out of Today's initial bundle and the simulation off the main thread.
 */
export function dashboardKeepUpProjections(
  entries: readonly (readonly [Course, Card[]])[],
  history: readonly ReviewHistoryEntry[],
  now: number,
): Record<string, ForecastPoint[]> {
  const projections: Record<string, ForecastPoint[]> = {};
  const active = new Set(entries.map(([course]) => course.id));
  for (const id of keepUpCache.keys()) if (!active.has(id)) keepUpCache.delete(id);
  for (const [course, courseCards] of entries) {
    if (course.examDate === undefined || course.examDate <= now || courseCards.length === 0)
      continue;
    const ids = new Set(courseCards.map((card) => card.id));
    const key = JSON.stringify([
      Math.floor(now / HOUR),
      course.examDate,
      course.fsrsParameters,
      courseCards.map((card) => [
        card.id,
        card.stability,
        card.difficulty,
        card.lastReviewed,
        card.due,
        card.state,
        card.reps,
        card.lapses,
        card.scheduledDays,
        card.learningSteps,
      ]),
      history.filter((entry) => ids.has(entry.cardId)),
    ]);
    const hit = keepUpCache.get(course.id);
    const value = hit?.key === key ? hit.value : keepUpProjection(courseCards, course, now);
    keepUpCache.set(course.id, { key, value });
    projections[course.id] = value;
  }
  return projections;
}
