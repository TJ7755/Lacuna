import { availableCards } from '../fsrs/eligibility';
import {
  courseForecast,
  examDayHistory,
  type CourseForecast,
  type ForecastPoint,
} from '../fsrs/courseForecast';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import type { Card, Course, Lesson } from '../db/types';

const HOUR = 3_600_000;

// The forecast is computed once per course and reused until that course's cards, exam
// date or target change, or the hour turns over. Navigation and the dashboard both read
// it, and a review only recomputes the course it touched.
const cache = new Map<string, { key: string; value: CourseForecast }>();

function cacheKey(cards: readonly Card[], course: Course, now: number): string {
  let reviewed = 0;
  let stability = 0;
  for (const card of cards) {
    reviewed += card.lastReviewed ?? 0;
    stability += card.stability ?? 0;
  }
  return [
    Math.floor(now / HOUR),
    course.examDate ?? '',
    course.fsrsParameters?.requestRetention ?? '',
    cards.length,
    reviewed,
    stability.toFixed(4),
  ].join('|');
}

/** Clears the forecast cache; for tests. */
export function clearForecastCache(): void {
  cache.clear();
}

/**
 * Each active course's forecast cards, the same core cards the course summaries use:
 * extension-lesson cards are left out and only available cards count.
 */
function forecastCards(
  courses: readonly Course[],
  lessons: readonly Lesson[],
  cards: readonly Card[],
  now: number,
): [Course, Card[]][] {
  const extensionLessonIds = new Set(lessons.filter((l) => l.isExtension).map((l) => l.id));
  const byCourse = new Map<string, Card[]>();
  for (const card of cards) {
    if (!card.courseId) continue;
    if (card.primaryLessonId && extensionLessonIds.has(card.primaryLessonId)) continue;
    const list = byCourse.get(card.courseId);
    if (list) list.push(card);
    else byCourse.set(card.courseId, [card]);
  }
  return courses
    .filter((course) => !course.archived)
    .map((course) => [course, availableCards(byCourse.get(course.id) ?? [], now)]);
}

/** Exam-day forecasts for every active course. */
export function dashboardForecasts(
  courses: readonly Course[],
  lessons: readonly Lesson[],
  cards: readonly Card[],
  now: number,
): Record<string, CourseForecast> {
  const forecasts: Record<string, CourseForecast> = {};
  for (const [course, courseCards] of forecastCards(courses, lessons, cards, now)) {
    const key = cacheKey(courseCards, course, now);
    const hit = cache.get(course.id);
    if (hit && hit.key === key) {
      forecasts[course.id] = hit.value;
      continue;
    }
    const value = courseForecast(courseCards, course, now);
    cache.set(course.id, { key, value });
    forecasts[course.id] = value;
  }
  return forecasts;
}

/**
 * How each active course's exam-day forecast has moved from `from` to `now`, measured
 * against the same exam as its current forecast. Courses without cards have no line.
 */
export function dashboardForecastHistories(
  courses: readonly Course[],
  lessons: readonly Lesson[],
  cards: readonly Card[],
  history: readonly ReviewHistoryEntry[],
  forecasts: Record<string, CourseForecast>,
  from: number,
  now: number,
): Record<string, ForecastPoint[]> {
  const histories: Record<string, ForecastPoint[]> = {};
  for (const [course, courseCards] of forecastCards(courses, lessons, cards, now)) {
    const forecast = forecasts[course.id];
    if (!forecast || courseCards.length === 0) continue;
    histories[course.id] = examDayHistory(courseCards, history, course, forecast.end, from, now);
  }
  return histories;
}

/**
 * Most urgent first: the nearest exam leads, courses without an exam follow, and
 * within each group the larger workload today comes first.
 */
export function urgencyOrder<T extends { examDate?: number; due: number }>(
  rows: readonly T[],
  now: number,
): T[] {
  const examKey = (row: T) =>
    row.examDate !== undefined && row.examDate > now ? row.examDate : Number.POSITIVE_INFINITY;
  return [...rows].sort((a, b) => examKey(a) - examKey(b) || b.due - a.due);
}
