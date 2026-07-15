// Reactive data hooks for the Course / Lesson model. Mirrors useData.ts exactly:
// useLiveQuery, undefined-while-loading convention, same dependency-array style.
// Read-only — no write operations live here.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type {
  Card,
  Course,
  CourseExamDate,
  Lesson,
  LessonCardLink,
  Note,
  PracticeNode,
  Sequence,
  SessionHistoryEntry,
} from '../db/types';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import { availableCards, studyPool } from '../fsrs/eligibility';
import { computeStudyStats, buildDeckSecondsMap, type StudyStats } from '../fsrs/stats';

// ---------------------------------------------------------------------------
// Individual record hooks
// ---------------------------------------------------------------------------

export function useCourses(): Course[] | undefined {
  return useLiveQuery(() => db.courses.orderBy('createdAt').toArray(), []);
}

export function useCourse(courseId: string | undefined): Course | null | undefined {
  return useLiveQuery<Course | null>(
    () => (courseId ? db.courses.get(courseId).then((course) => course ?? null) : null),
    [courseId],
  );
}

export function useLessons(courseId: string | undefined): Lesson[] | undefined {
  return useLiveQuery(
    () =>
      courseId
        ? db.lessons.where('courseId').equals(courseId).sortBy('orderIndex')
        : [],
    [courseId],
  );
}

/** All lessons across every course, ordered by orderIndex (for the sidebar tree). */
export function useAllLessons(): Lesson[] | undefined {
  return useLiveQuery(() => db.lessons.orderBy('orderIndex').toArray(), []);
}

export function useLesson(lessonId: string | undefined): Lesson | null | undefined {
  return useLiveQuery<Lesson | null>(
    () => (lessonId ? db.lessons.get(lessonId).then((lesson) => lesson ?? null) : null),
    [lessonId],
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
    () =>
      courseId
        ? db.sequences.where('courseId').equals(courseId).sortBy('createdAt')
        : [],
    [courseId],
  );
}

export function useNotes(lessonId: string | undefined): Note[] | undefined {
  return useLiveQuery(
    () =>
      lessonId
        ? db.notes.where('lessonId').equals(lessonId).sortBy('orderIndex')
        : [],
    [lessonId],
  );
}

/** All notes across every lesson (for global search, which has no single lessonId scope). */
export function useAllNotes(): Note[] | undefined {
  return useLiveQuery(() => db.notes.toArray(), []);
}

export function useCourseCards(courseId: string | undefined): Card[] | undefined {
  return useLiveQuery(
    () =>
      courseId ? db.cards.where('courseId').equals(courseId).toArray() : [],
    [courseId],
  );
}

/**
 * Cards that belong to a lesson: those whose primaryLessonId equals the lesson,
 * plus any additionally linked via LessonCardLink, de-duplicated by card id.
 * LessonCardLink is display-only and never introduces an FSRS-eligible duplicate.
 */
export function useLessonCards(lessonId: string | undefined): Card[] | undefined {
  return useLiveQuery(
    async () => {
      if (!lessonId) return [];
      const [links, primaryCards] = await Promise.all([
        db.lessonCards.where('lessonId').equals(lessonId).toArray(),
        db.cards.where('primaryLessonId').equals(lessonId).toArray(),
      ]);
      const linkedCardIds = links.map((l) => l.cardId);
      const linkedCards =
        linkedCardIds.length > 0
          ? await db.cards.where('id').anyOf(linkedCardIds).toArray()
          : [];
      const seen = new Set<string>();
      const result: Card[] = [];
      for (const card of [...primaryCards, ...linkedCards]) {
        if (!seen.has(card.id)) {
          seen.add(card.id);
          result.push(card);
        }
      }
      return result;
    },
    [lessonId],
  );
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
    () =>
      courseId
        ? db.practiceNodes.where('courseId').equals(courseId).toArray()
        : [],
    [courseId],
  );
}

export function useCourseExamDates(courseId: string | undefined): CourseExamDate[] | undefined {
  return useLiveQuery(
    () =>
      courseId
        ? db.courseExamDates.where('courseId').equals(courseId).sortBy('examDate')
        : [],
    [courseId],
  );
}

/** Session-history snapshots (predicted-retrievability trajectory) for a Course. */
export function useCourseSessionHistory(
  courseId: string | undefined,
): SessionHistoryEntry[] | undefined {
  return useLiveQuery(
    () =>
      courseId
        ? db.sessionHistory.where('courseId').equals(courseId).sortBy('timestamp')
        : [],
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
  /** Core cards a session would serve today (available, new-card cap applied). */
  eligible: number;
}

/**
 * Per-course summary statistics: lesson count, card count, mastery fraction,
 * unreviewed count and eligible count. Extension-lesson cards are excluded from
 * all four numerical summary fields; cards with a null or missing primaryLessonId
 * are included. Mirrors computeDeckSummaries (including the orphaned-card-set guard).
 *
 * Pure — accepts only already-loaded arrays so it can be reused by combined hooks
 * and called in tests without a database. Exam dates are optional for backwards-
 * compatible callers; lesson overrides still apply when lessons provide them.
 */
export function computeCourseSummaries(
  courses: Course[],
  lessons: Lesson[],
  cards: Card[],
  examDates: CourseExamDate[] = [],
  now: number = Date.now(),
): Record<string, CourseSummary> {
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Build a set of lesson ids that are extensions, for O(1) exclusion.
  const extensionLessonIds = new Set(
    lessons.filter((l) => l.isExtension).map((l) => l.id),
  );

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

  const examDatesByCourse: Record<string, CourseExamDate[]> = {};
  for (const examDate of examDates) {
    (examDatesByCourse[examDate.courseId] ??= []).push(examDate);
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
    const examDateContext = makeExamDateContext(
      course,
      lessonsByCourse[course.id] ?? [],
      examDatesByCourse[course.id] ?? [],
    );
    summaries[course.id] = {
      lessonCount: coreLessonCount[course.id] ?? 0,
      cardCount: coreCards.length,
      mastery: progressValue(available, course, now, examDateContext),
      unreviewed: available.filter((c) => c.lastReviewed === null).length,
      eligible: studyPool(coreCards, course, now).length,
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
    const [courses, lessons, cards, examDates] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.cards.toArray(),
      db.courseExamDates.toArray(),
    ]);
    return computeCourseSummaries(courses, lessons, cards, examDates);
  }, []);
}

/**
 * Per-course summary statistics for a single course, scoped to that course's own
 * lessons/cards rather than the whole app (contrast `useCourseSummaries`, which
 * reruns on any write anywhere). Use this wherever only one course's summary is
 * needed, e.g. CoursePath.
 */
export function useCourseSummary(
  courseId: string | undefined,
): CourseSummary | null | undefined {
  return useLiveQuery<CourseSummary | null>(async () => {
    if (!courseId) return null;
    const [course, lessons, cards, examDates] = await Promise.all([
      db.courses.get(courseId),
      db.lessons.where('courseId').equals(courseId).toArray(),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.courseExamDates.where('courseId').equals(courseId).toArray(),
    ]);
    if (!course) return null;
    return computeCourseSummaries([course], lessons, cards, examDates)[courseId];
  }, [courseId]);
}

/**
 * Single aggregated live query for the course dashboard. Returns courses, lessons,
 * all cards, per-course summaries and global study stats in one reactive read so a
 * shared transaction triggers only one re-render instead of five.
 *
 * Study stats use per-deck response-time calibration (keyed by deckId) because
 * computeStudyStats looks up by card.deckId; this matches useDashboardData exactly
 * and keeps the seven-day forecast behaviour identical.
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
    const [courses, lessons, cards, examDates, perf] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.cards.toArray(),
      db.courseExamDates.toArray(),
      db.userPerformance.toArray(),
    ]);
    const summaries = computeCourseSummaries(courses, lessons, cards, examDates);
    const deckSeconds = buildDeckSecondsMap(perf);
    const stats = computeStudyStats(cards, deckSeconds);
    return { courses, lessons, allCards: cards, summaries, stats };
  }, []);
}
