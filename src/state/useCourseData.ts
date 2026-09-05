// Reactive data hooks for the Course / Lesson model. Mirrors useData.ts exactly:
// useLiveQuery, undefined-while-loading convention, same dependency-array style.
// Read-only — no write operations live here.

import { computeCourseSummaries, type CourseSummary } from './courseSummaries';
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
  LessonCardLink,
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
import {
  findBackingDeck,
  findBackingDecks,
  performanceForCourseBackingDecks,
} from '../db/backingDecks';

export { computeCourseSummaries, type CourseSummary, type CourseSummaryProgress } from './courseSummaries';
export { useSidebarData, useCourseDashboardData } from './ShellCourseData';

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
