// Reactive data hooks for the Course / Lesson model. Mirrors useData.ts exactly:
// useLiveQuery, undefined-while-loading convention, same dependency-array style.
// Read-only — no write operations live here.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { hydrateCardsWithHistory, listReviewHistoryForCourse } from '../db/reviewHistoryRead';
import { listCourseDailySessionHistory } from '../db/sessionHistoryRead';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import type {
  Card,
  Course,
  CourseAssessment,
  CourseRecord,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  Occlusion,
  PendingMergeReview,
  PracticeNode,
  Sequence,
  SessionHistoryEntry,
  SchedulingUnitRecord,
  UserPerformance,
} from '../db/types';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import { availableCards, dueCards, studyPool } from '../fsrs/eligibility';
import { computeStudyStats, buildDeckSecondsMap, type StudyStats } from '../fsrs/stats';
import { lessonCardMembership } from '../course/studyPools';
import { lessonTaught } from '../course/unlock';
import { startOfDay } from '../utils/datetime';
import {
  findBackingDeck,
  findBackingDecks,
  performanceForCourseBackingDecks,
} from '../db/backingDecks';

// ---------------------------------------------------------------------------
// Individual record hooks
// ---------------------------------------------------------------------------

function hydrateCourses(records: CourseRecord[], assessments: CourseAssessment[]): Course[] {
  return records.map((record) =>
    hydrateCourse(record, finalAssessmentForCourse(record.id, assessments)),
  );
}

export function useCourses(): Course[] | undefined {
  return useLiveQuery(async () => {
    const [records, assessments] = await Promise.all([
      db.courses.orderBy('createdAt').toArray(),
      db.courseAssessments.toArray(),
    ]);
    return hydrateCourses(records, assessments);
  }, []);
}

export function useCourse(courseId: string | undefined): Course | null | undefined {
  return useLiveQuery<Course | null>(async () => {
    if (!courseId) return null;
    const [record, assessments] = await Promise.all([
      db.courses.get(courseId),
      db.courseAssessments.where('courseId').equals(courseId).toArray(),
    ]);
    return record ? hydrateCourse(record, finalAssessmentForCourse(courseId, assessments)) : null;
  }, [courseId]);
}

export function useLessons(courseId: string | undefined): Lesson[] | undefined {
  return useLiveQuery(
    () => (courseId ? db.lessons.where('courseId').equals(courseId).sortBy('orderIndex') : []),
    [courseId],
  );
}

export function useLesson(lessonId: string | undefined): Lesson | null | undefined {
  return useLiveQuery<Lesson | null>(
    () => (lessonId ? db.lessons.get(lessonId).then((lesson) => lesson ?? null) : null),
    [lessonId],
  );
}

/** Resolve the hidden scheduling deck for a lesson without exposing deck discovery to pages. */
export function useLessonBackingDeck(
  courseId: string | undefined,
  lessonId: string | undefined,
): SchedulingUnitRecord | undefined {
  return useLiveQuery(
    () => (courseId && lessonId ? findBackingDeck(courseId, lessonId) : undefined),
    [courseId, lessonId],
  );
}

/** Resolve the hidden scheduling deck for cards not assigned to a lesson. */
export function useCourseBankBackingDeck(
  courseId: string | undefined,
): SchedulingUnitRecord | undefined {
  return useLiveQuery(() => (courseId ? findBackingDeck(courseId, null) : undefined), [courseId]);
}

/** Resolve every lesson and unassigned backing deck for Cards in one live query. */
export function useCourseBankBackingDecks(
  courseId: string | undefined,
  lessonIds: readonly string[],
): Map<string | null, SchedulingUnitRecord> | undefined {
  return useLiveQuery(
    () =>
      courseId
        ? findBackingDecks(courseId, lessonIds)
        : new Map<string | null, SchedulingUnitRecord>(),
    [courseId, lessonIds],
  );
}

/** Load calibration rows for a course without exposing its backing deck ids. */
export function useCoursePerformance(
  courseId: string | undefined,
  cards: Card[] | undefined,
): UserPerformance[] | undefined {
  return useLiveQuery(
    () => (courseId && cards ? performanceForCourseBackingDecks(courseId, cards) : []),
    [courseId, cards],
  );
}

export function useSequence(sequenceId: string | undefined): Sequence | null | undefined {
  return useLiveQuery<Sequence | null>(
    () => (sequenceId ? db.sequences.get(sequenceId).then((sequence) => sequence ?? null) : null),
    [sequenceId],
  );
}

/** All sequences for a course, ordered by createdAt (mirrors listSequences). Used by
 *  management surfaces to group/badge generated cards and resolve a card's owning sequence. */
export function useSequences(courseId: string | undefined): Sequence[] | undefined {
  return useLiveQuery(
    () => (courseId ? db.sequences.where('courseId').equals(courseId).sortBy('createdAt') : []),
    [courseId],
  );
}

export function useOcclusion(occlusionId: string | undefined): Occlusion | null | undefined {
  return useLiveQuery<Occlusion | null>(
    () =>
      occlusionId ? db.occlusions.get(occlusionId).then((occlusion) => occlusion ?? null) : null,
    [occlusionId],
  );
}

/** All occlusions for a course, ordered by createdAt (mirrors listOcclusions). Used by
 *  management surfaces to group/badge generated cards and resolve a card's owning occlusion. */
export function useOcclusions(courseId: string | undefined): Occlusion[] | undefined {
  return useLiveQuery(
    () => (courseId ? db.occlusions.where('courseId').equals(courseId).sortBy('createdAt') : []),
    [courseId],
  );
}

export function useNotes(lessonId: string | undefined): Note[] | undefined {
  return useLiveQuery(
    () => (lessonId ? db.notes.where('lessonId').equals(lessonId).sortBy('orderIndex') : []),
    [lessonId],
  );
}

/** The outstanding merge review for a course, if a re-import has queued one (Arc 7 §7.5).
 *  `null` once loaded with nothing pending; `undefined` while loading. */
export function usePendingMergeReview(
  courseId: string | undefined,
): PendingMergeReview | null | undefined {
  return useLiveQuery(async () => {
    if (!courseId) return null;
    return (await db.pendingMergeReviews.where('courseId').equals(courseId).first()) ?? null;
  }, [courseId]);
}

/** The set of course ids that currently have a pending merge review, for the dashboard's
 *  quiet "update available" indicator. One live query rather than one per card. */
export function usePendingUpdateCourseIds(): Set<string> | undefined {
  return useLiveQuery(async () => {
    const reviews = await db.pendingMergeReviews.toArray();
    return new Set(reviews.map((r) => r.courseId));
  }, []);
}

export function useCourseCards(courseId: string | undefined): Card[] | undefined {
  return useLiveQuery(
    async () =>
      courseId
        ? hydrateCardsWithHistory(await db.cards.where('courseId').equals(courseId).toArray())
        : [],
    [courseId],
  );
}

/** Review events for one course through the canonical event-store adapter. */
export function useCourseReviewHistory(
  courseId: string | undefined,
): ReviewHistoryEntry[] | undefined {
  return useLiveQuery(() => (courseId ? listReviewHistoryForCourse(courseId) : []), [courseId]);
}

/**
 * Cards that belong to a lesson: those whose primaryLessonId equals the lesson,
 * plus any additionally linked via LessonCardLink, de-duplicated by card id.
 * LessonCardLink is display-only and never introduces an FSRS-eligible duplicate.
 */
export function useLessonCards(lessonId: string | undefined): Card[] | undefined {
  return useLiveQuery(async () => {
    if (!lessonId) return [];
    const [links, primaryCards] = await Promise.all([
      db.lessonCards.where('lessonId').equals(lessonId).toArray(),
      db.cards.where('primaryLessonId').equals(lessonId).toArray(),
    ]);
    const linkedCardIds = links.map((l) => l.cardId);
    const linkedCards =
      linkedCardIds.length > 0 ? await db.cards.where('id').anyOf(linkedCardIds).toArray() : [];
    const hydratedCards = await hydrateCardsWithHistory([...primaryCards, ...linkedCards]);
    const seen = new Set<string>();
    const result: Card[] = [];
    for (const card of hydratedCards) {
      if (!seen.has(card.id)) {
        seen.add(card.id);
        result.push(card);
      }
    }
    return result;
  }, [lessonId]);
}

/** Explicit display links for one lesson, kept separate from primary card membership. */
export function useLessonCardLinks(lessonId: string | undefined): LessonCardLink[] | undefined {
  return useLiveQuery(
    () => (lessonId ? db.lessonCards.where('lessonId').equals(lessonId).toArray() : []),
    [lessonId],
  );
}

export function usePracticeNodes(courseId: string | undefined): PracticeNode[] | undefined {
  return useLiveQuery(
    () => (courseId ? db.practiceNodes.where('courseId').equals(courseId).toArray() : []),
    [courseId],
  );
}

export function useCourseAssessments(courseId: string | undefined): CourseAssessment[] | undefined {
  return useLiveQuery(
    () =>
      courseId ? db.courseAssessments.where('courseId').equals(courseId).sortBy('examDate') : [],
    [courseId],
  );
}

/** Session-history snapshots (predicted-retrievability trajectory) for a Course. */
export function useCourseSessionHistory(
  courseId: string | undefined,
): SessionHistoryEntry[] | undefined {
  return useLiveQuery(
    () =>
      courseId ? listCourseDailySessionHistory(courseId) : [],
    [courseId],
  );
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

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

/**
 * Per-course summary statistics for the dashboard, recomputed reactively as
 * courses, lessons, cards or exam dates change.
 */
export function useCourseSummaries(): Record<string, CourseSummary> | undefined {
  return useLiveQuery(async () => {
    const [records, lessons, cards, assessments] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.cards.toArray(),
      db.courseAssessments.toArray(),
    ]);
    return computeCourseSummaries(
      hydrateCourses(records, assessments),
      lessons,
      await hydrateCardsWithHistory(cards),
      assessments,
    );
  }, []);
}

/**
 * The always-mounted sidebar's combined data read. Keeping its cards, course summaries,
 * lessons and streak in one live query avoids three independent whole-table reads and three
 * separate recomputations after every review.
 */
export function useSidebarData():
  | {
      courses: Course[];
      lessons: Lesson[];
      summaries: Record<string, CourseSummary>;
      stats: StudyStats;
    }
  | undefined {
  return useLiveQuery(async () => {
    const [records, lessons, cards, assessments] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.cards.toArray(),
      db.courseAssessments.toArray(),
    ]);
    const courses = hydrateCourses(records, assessments);
    const hydratedCards = await hydrateCardsWithHistory(cards);
    const perf = (
      await Promise.all(
        courses.map((course) => performanceForCourseBackingDecks(course.id, hydratedCards)),
      )
    ).flat();
    const summaries = computeCourseSummaries(courses, lessons, hydratedCards, assessments);
    const stats = computeStudyStats(
      hydratedCards,
      buildDeckSecondsMap(perf),
      Date.now(),
      new Set(courses.filter((course) => !course.archived).map((course) => course.id)),
    );
    return { courses, lessons, summaries, stats };
  }, []);
}

/**
 * Per-course summary statistics for a single course, scoped to that course's own
 * lessons/cards rather than the whole app (contrast `useCourseSummaries`, which
 * reruns on any write anywhere). Use this wherever only one course's summary is
 * needed, e.g. CoursePath.
 */
export function useCourseSummary(courseId: string | undefined): CourseSummary | null | undefined {
  return useLiveQuery<CourseSummary | null>(async () => {
    if (!courseId) return null;
    const [record, lessons, cards, assessments] = await Promise.all([
      db.courses.get(courseId),
      db.lessons.where('courseId').equals(courseId).toArray(),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.courseAssessments.where('courseId').equals(courseId).toArray(),
    ]);
    if (!record) return null;
    const course = hydrateCourse(record, finalAssessmentForCourse(courseId, assessments));
    return computeCourseSummaries(
      [course],
      lessons,
      await hydrateCardsWithHistory(cards),
      assessments,
    )[courseId];
  }, [courseId]);
}

/**
 * Single aggregated live query for the course dashboard. Returns courses, lessons,
 * all cards, per-course summaries and global study stats in one reactive read so a
 * shared transaction triggers only one re-render instead of five.
 *
 * Study stats use Course calibration keyed by courseId. Scheduling-unit pacing
 * remains separate and feeds workload planning, not response-time calibration.
 */
export function useCourseDashboardData():
  | {
      courses: Course[];
      lessons: Lesson[];
      allCards: Card[];
      summaries: Record<string, CourseSummary>;
      stats: StudyStats;
    }
  | undefined {
  return useLiveQuery(async () => {
    const [records, lessons, cards, assessments, links, exposures, completions, performance] =
      await Promise.all([
        db.courses.toArray(),
        db.lessons.toArray(),
        db.cards.toArray(),
        db.courseAssessments.toArray(),
        db.lessonCards.toArray(),
        db.lessonCardExposures.toArray(),
        db.lessonCompletions.toArray(),
        db.coursePerformance.toArray(),
      ]);
    const courses = hydrateCourses(records, assessments);
    const hydratedCards = await hydrateCardsWithHistory(cards);
    const summaries = computeCourseSummaries(
      courses,
      lessons,
      hydratedCards,
      assessments,
      Date.now(),
      {
        links,
        exposures,
        completions,
      },
    );
    const courseSeconds = new Map<string, number>();
    for (const row of performance) {
      if (row.totalCorrectReviews > 0 && row.runningMeanResponseTime > 0) {
        courseSeconds.set(row.courseId, row.runningMeanResponseTime);
      }
    }
    const stats = computeStudyStats(
      hydratedCards,
      courseSeconds,
      Date.now(),
      new Set(courses.filter((course) => !course.archived).map((course) => course.id)),
    );
    return { courses, lessons, allCards: hydratedCards, summaries, stats };
  }, []);
}
