import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardLink,
  LessonCardExposure,
  LessonCompletion,
} from '../db/types';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import { availableCards, dueCards, studyPool } from '../fsrs/eligibility';
import { lessonCardMembership } from '../course/studyPools';
import { lessonTaught } from '../course/unlock';
import { startOfDay } from '../utils/datetime';

export interface CourseSummary {
  /** Count of non-extension lessons in the course. */
  lessonCount: number;
  /** Count of core cards (extension-lesson cards excluded). */
  cardCount: number;
  /** Objective-aware progress (0..1): mean predicted R, or fraction secured. */
  mastery: number;
  /** Number of core cards that have never been reviewed. */
  unreviewed: number;
  /** Reviews due now plus brand-new cards admitted by today's cap. */
  eligible: number;
  /** Number of core lessons whose material has been taught. */
  completedLessonCount: number;
  /** Number of core cards reviewed at least once. */
  reviewedCardCount: number;
  /** Unique core cards with at least one review today in the course time zone. */
  reviewedTodayCount: number;
}

export interface CourseSummaryProgress {
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  completions: LessonCompletion[];
}

const EMPTY_SUMMARY_PROGRESS: CourseSummaryProgress = {
  links: [],
  exposures: [],
  completions: [],
};

/**
 * Per-course summary statistics for dashboard and course-header surfaces.
 * Extension-lesson cards are excluded from card-level figures; cards with a null
 * or missing primaryLessonId are included. The orphaned-card-set guard prevents
 * cards from leaking into unrelated course summaries.
 *
 * Pure — accepts only already-loaded arrays so it can be reused by combined hooks
 * and called in tests without a database. Exam dates are optional for backwards-
 * compatible callers; lesson overrides still apply when lessons provide them.
 */
export function computeCourseSummaries(
  courses: Course[],
  lessons: Lesson[],
  cards: Card[],
  assessments: CourseAssessment[] = [],
  now: number = Date.now(),
  progress: CourseSummaryProgress = EMPTY_SUMMARY_PROGRESS,
): Record<string, CourseSummary> {
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Build a set of lesson ids that are extensions, for O(1) exclusion.
  const extensionLessonIds = new Set(lessons.filter((l) => l.isExtension).map((l) => l.id));

  // Count non-extension lessons per course.
  const coreLessonCount: Record<string, number> = {};
  for (const lesson of lessons) {
    if (!lesson.isExtension) {
      coreLessonCount[lesson.courseId] = (coreLessonCount[lesson.courseId] ?? 0) + 1;
    }
  }

  // Group cards by courseId; only cards with a courseId are course-eligible.
  const byCourse: Record<string, Card[]> = {};
  for (const card of cards) {
    if (card.courseId) (byCourse[card.courseId] ??= []).push(card);
  }

  const lessonsByCourse: Record<string, Lesson[]> = {};
  for (const lesson of lessons) {
    (lessonsByCourse[lesson.courseId] ??= []).push(lesson);
  }

  const assessmentsByCourse: Record<string, CourseAssessment[]> = {};
  for (const assessment of assessments) {
    (assessmentsByCourse[assessment.courseId] ??= []).push(assessment);
  }

  const summaries: Record<string, CourseSummary> = {};
  for (const course of courses) {
    const courseCards = byCourse[course.id] ?? [];
    // Exclude cards whose primaryLessonId belongs to an extension lesson.
    // Cards with null or absent primaryLessonId are included.
    const coreCards = courseCards.filter(
      (c) =>
        c.primaryLessonId === null ||
        c.primaryLessonId === undefined ||
        !extensionLessonIds.has(c.primaryLessonId),
    );
    const available = availableCards(coreCards, now);
    const pool = studyPool(coreCards, course, now);
    const readyNow = dueCards(pool, now).length + pool.filter((card) => card.state === 0).length;
    const coreLessons = (lessonsByCourse[course.id] ?? []).filter((lesson) => !lesson.isExtension);
    const completedLessonCount = coreLessons.filter((lesson) =>
      lessonTaught(
        lesson.id,
        lessonCardMembership(lesson.id, courseCards, progress.links),
        progress.exposures,
        progress.completions,
      ),
    ).length;
    const today = startOfDay(now, course.timeZone);
    const examDateContext = makeExamDateContext(
      course,
      lessonsByCourse[course.id] ?? [],
      assessmentsByCourse[course.id] ?? [],
    );
    summaries[course.id] = {
      lessonCount: coreLessonCount[course.id] ?? 0,
      cardCount: coreCards.length,
      mastery: progressValue(available, course, now, examDateContext),
      unreviewed: available.filter((c) => c.lastReviewed === null).length,
      eligible: readyNow,
      completedLessonCount,
      reviewedCardCount: coreCards.filter((card) => card.lastReviewed !== null).length,
      reviewedTodayCount: coreCards.filter((card) =>
        card.history.some((review) => review.timestamp >= today && review.timestamp <= now),
      ).length,
    };
  }

  // Skip orphaned card sets whose course was removed mid-transaction.
  for (const [courseId] of Object.entries(byCourse)) {
    if (!courseById.has(courseId)) continue;
    summaries[courseId] ??= {
      lessonCount: coreLessonCount[courseId] ?? 0,
      cardCount: 0,
      mastery: 0,
      unreviewed: 0,
      eligible: 0,
      completedLessonCount: 0,
      reviewedCardCount: 0,
      reviewedTodayCount: 0,
    };
  }

  return summaries;
}
