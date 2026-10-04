import { availableCards } from '../fsrs/eligibility';
import { courseForecast, type CourseForecast } from '../fsrs/courseForecast';
import type { Card, Course, Lesson } from '../db/types';

/**
 * Exam-day forecasts for every active course, over the same core cards the course
 * summaries use: extension-lesson cards are left out and only available cards count.
 */
export function dashboardForecasts(
  courses: readonly Course[],
  lessons: readonly Lesson[],
  cards: readonly Card[],
  now: number,
): Record<string, CourseForecast> {
  const extensionLessonIds = new Set(lessons.filter((l) => l.isExtension).map((l) => l.id));
  const byCourse = new Map<string, Card[]>();
  for (const card of cards) {
    if (!card.courseId) continue;
    if (card.primaryLessonId && extensionLessonIds.has(card.primaryLessonId)) continue;
    const list = byCourse.get(card.courseId);
    if (list) list.push(card);
    else byCourse.set(card.courseId, [card]);
  }
  const forecasts: Record<string, CourseForecast> = {};
  for (const course of courses) {
    if (course.archived) continue;
    forecasts[course.id] = courseForecast(
      availableCards(byCourse.get(course.id) ?? [], now),
      course,
      now,
      { samples: 40 },
    );
  }
  return forecasts;
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
