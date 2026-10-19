import type { Lesson } from '../db/types';
import { lessonOrder } from './assessmentCoverage';

/** Prior knowledge is an entry preference, never evidence of completion or mastery. */
export function earlierLessonIds(
  startLessonId: string | undefined,
  lessons: readonly Lesson[],
): Set<string> {
  if (!startLessonId) return new Set();
  const start = lessons.find((lesson) => lesson.id === startLessonId && !lesson.isExtension);
  return new Set(
    start
      ? lessons.filter((lesson) => lessonOrder(lesson, start) < 0).map((lesson) => lesson.id)
      : [],
  );
}
