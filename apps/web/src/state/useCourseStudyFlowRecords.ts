import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/schema';
import type { Concept } from '@lacuna/core/questions/types';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { performanceForCourseBackingDecks } from '../db/backingDecks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { retainedLiveQuery } from './retainedLiveQuery';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { questionStudyScope } from '../course/questionStudyScope';
import type {
  Course,
  Lesson,
  Card,
  CourseAssessment,
  LessonCardLink,
  LessonCardExposure,
  LessonCompletion,
  PracticeNode,
  PracticeMilestone,
  UserPerformance,
} from '@lacuna/core/db/types';

interface CourseStudyFlowRecords {
  course: Course | null;
  lessons: Lesson[];
  cards: Card[];
  concepts?: Concept[];
  questionPractice?: ConceptPracticeItem[];
  questionScopeConceptIds?: string[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  completions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  milestones: PracticeMilestone[];
  performance: UserPerformance[];
  /** The refresh key this read answered, so callers can tell a stale result from a fresh one. */
  generation: number;
}

/** Shared course reads for the path preview and the active study conductor. */
export function useCourseStudyFlowRecords(
  courseId: string | undefined,
  refreshKey = 0,
  enabled = true,
) {
  const cache = useMemo(
    () => ({
      courseId,
      value: undefined as
        { courseId: string | undefined; records: CourseStudyFlowRecords } | undefined,
      version: 0,
    }),
    [courseId],
  );
  // URL-seeded steps still need an initial snapshot. Once committed, stop observing
  // review writes until the conductor requests fresh planning at the step boundary.
  const live = enabled || cache.value === undefined;
  const result = useLiveQuery(async () => {
    const version = ++cache.version;
    if (!live) return cache.value;
    const value = {
      courseId: cache.courseId,
      records: await readCourseStudyFlowRecords(cache.courseId, refreshKey),
    };
    if (version === cache.version) cache.value = value;
    return value;
  }, [cache, refreshKey, live]);
  return result?.courseId === courseId ? result?.records : undefined;
}

// Presentation retains results; the study conductor keeps its existing fresh-generation contract.
export const useCoursePathRecords = retainedLiveQuery((courseId) =>
  readCourseStudyFlowRecords(courseId),
);

async function readCourseStudyFlowRecords(
  courseId: string | undefined,
  refreshKey = 0,
): Promise<CourseStudyFlowRecords> {
  if (!courseId) {
    return {
      course: null,
      lessons: [],
      cards: [],
      concepts: [],
      assessments: [],
      links: [],
      exposures: [],
      completions: [],
      practiceNodes: [],
      milestones: [],
      performance: [],
      generation: refreshKey,
    };
  }
  const [courseRecord, assessments] = await db.transaction(
    'r',
    [db.courses, db.courseAssessments],
    () =>
      Promise.all([
        db.courses.get(courseId),
        db.courseAssessments.where('courseId').equals(courseId).toArray(),
      ]),
  );
  if (!courseRecord) {
    return {
      course: null,
      lessons: [],
      cards: [],
      concepts: [],
      assessments: [],
      links: [],
      exposures: [],
      completions: [],
      practiceNodes: [],
      milestones: [],
      performance: [],
      generation: refreshKey,
    };
  }
  const course = hydrateCourse(courseRecord, finalAssessmentForCourse(courseId, assessments));
  const [lessons, rawCards, practiceNodes, milestones, concepts, questionSetCount] =
    await Promise.all([
      db.lessons.where('courseId').equals(courseId).sortBy('orderIndex'),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.practiceNodes.where('courseId').equals(courseId).toArray(),
      db.practiceMilestones.where('courseId').equals(courseId).toArray(),
      db.concepts.where('courseId').equals(courseId).toArray(),
      db.questionSets.where('courseId').equals(courseId).count(),
    ]);
  const cards = await hydrateCardsWithHistory(rawCards);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const [links, exposures, completions, performance] = await Promise.all([
    lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
    lessonIds.length > 0 ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray() : [],
    lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
    performanceForCourseBackingDecks(courseId, cards),
  ]);
  const questionScopeConceptIds = questionStudyScope({
    course,
    lessons,
    cards,
    links,
    exposures,
    assessments,
    practiceNodes,
    concepts,
  });
  const questionPractice =
    questionScopeConceptIds.length && questionSetCount > 0
      ? await import('../questions/conceptPractice').then(({ listConceptPractice }) =>
          listConceptPractice(courseId, Date.now(), questionScopeConceptIds),
        )
      : [];
  return {
    course,
    lessons,
    cards,
    concepts,
    questionPractice,
    questionScopeConceptIds,
    assessments,
    links,
    exposures,
    completions,
    practiceNodes,
    milestones,
    performance,
    generation: refreshKey,
  };
}
