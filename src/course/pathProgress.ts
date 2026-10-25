import type {
  Card,
  Course,
  CourseAssessment,
  LessonCardExposure,
  LessonCompletion,
} from '../db/types';
import { MS_PER_DAY } from '../fsrs/params';
import type { LessonStatus, PathNode } from './pathTypes';

/**
 * Derives the display status of a lesson from lesson-scoped teaching progress.
 *
 *  - `locked`: the lesson is not yet unlocked.
 *  - `completed`: unlocked, and every member card has an exposure for this
 *    lesson, or a cardless lesson has an explicit completion record.
 *  - `available`: unlocked but not yet completed.
 *
 * `lessonCards` must include both primary cards and explicitly linked cards.
 */
export function lessonStatus(
  unlocked: boolean,
  lessonId: string,
  lessonCards: Card[],
  exposures: LessonCardExposure[],
  completions: LessonCompletion[],
  learnFirst = true,
): LessonStatus {
  if (!unlocked) return 'locked';
  if (lessonCards.length === 0) {
    return completions.some((completion) => completion.lessonId === lessonId)
      ? 'completed'
      : 'available';
  }
  if (!learnFirst) return lessonCards.every((card) => card.state !== 0) ? 'completed' : 'available';
  const exposedIds = new Set(
    exposures
      .filter((exposure) => exposure.lessonId === lessonId)
      .map((exposure) => exposure.cardId),
  );
  return lessonCards.every((card) => exposedIds.has(card.id)) ? 'completed' : 'available';
}

/**
 * Computes curriculum position for the "Lesson X of N" display (addendum J).
 *
 *  - `total`: count of non-extension lesson nodes.
 *  - `reached`: count of non-extension lesson nodes whose status is `completed`
 *    or `available` (i.e. the student has reached this point in the curriculum).
 *
 * This is purely pacing — it has nothing to do with mastery or FSRS retention.
 * Mastery is a separate metric (`progressValue`) derived from the card pool.
 */
export function pathPosition(nodes: PathNode[]): { reached: number; total: number } {
  let total = 0;
  let reached = 0;

  for (const node of nodes) {
    if (node.nodeType !== 'lesson') continue;
    if (node.lesson.isExtension) continue;
    total++;
    if (node.status === 'completed' || node.status === 'available') reached++;
  }

  return { reached, total };
}

/**
 * Nearest upcoming exam date for a course: considers `course.examDate` and all
 * explicit checkpoint assessments, and returns the soonest one still in
 * the future. Falls back to `course.examDate` even if it has already passed,
 * so the header always has something to show. Shared by CoursePath and
 * LessonView so both headers agree on "the" exam date.
 */
export function nearestExamDate(
  course: Course,
  assessments: CourseAssessment[],
  now: number = Date.now(),
): number | undefined {
  const futureDates = [
    course.examDate,
    ...assessments
      .filter((assessment) => assessment.kind === 'checkpoint')
      .map((assessment) => assessment.examDate),
  ].filter((date): date is number => date !== undefined && date > now);
  return futureDates.length > 0 ? Math.min(...futureDates) : course.examDate;
}

/** An exam within this many days is flagged as urgent (pulsing header marker). */
export const EXAM_URGENT_DAYS = 3;

/**
 * Whether `nearestExam` (as returned by `nearestExamDate`) is both still
 * upcoming and within `EXAM_URGENT_DAYS` of `now`. Shared by CoursePath and
 * LessonView so both headers agree on when to flag urgency.
 */
export function examIsUrgent(nearestExam: number | undefined, now: number = Date.now()): boolean {
  return (
    nearestExam !== undefined &&
    nearestExam > now &&
    nearestExam - now <= EXAM_URGENT_DAYS * MS_PER_DAY
  );
}
