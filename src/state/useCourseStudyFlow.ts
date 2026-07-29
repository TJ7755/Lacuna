import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { availableCards, dueCards } from '../fsrs/eligibility';
import { buildDeckSecondsMap } from '../fsrs/stats';
import { makeExamDateContext } from '../fsrs/examDate';
import { buildPath } from '../course/path';
import { lessonCardMembership } from '../course/studyPools';
import { currentAssessmentPracticeContext } from '../course/assessmentPractice';
import {
  buildCourseStudyFlowSnapshot,
  courseMeanReviewSeconds,
  type CourseStudyFlowSnapshot,
} from '../course/studyFlowSnapshot';
import { planNextStudyStep, type StudyFlowDecision } from '../course/studyFlowPlanner';
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
} from '../db/types';

interface CourseStudyFlowData {
  course: Course;
  snapshot: CourseStudyFlowSnapshot;
  decision: StudyFlowDecision;
  generation: number;
}

interface CourseStudyFlowRecords {
  course: Course | null;
  lessons: Lesson[];
  cards: Card[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  completions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  milestones: PracticeMilestone[];
  performance: UserPerformance[];
}

/** Loads one authoritative course snapshot for both preview and conductor decisions. */
export function useCourseStudyFlow(
  courseId: string | undefined,
  refreshKey = 0,
): CourseStudyFlowData | null | undefined {
  const records = useLiveQuery<CourseStudyFlowRecords>(async () => {
    if (!courseId) {
      return {
        course: null,
        lessons: [],
        cards: [],
        assessments: [],
        links: [],
        exposures: [],
        completions: [],
        practiceNodes: [],
        milestones: [],
        performance: [],
      };
    }
    const [courseRecord, assessments] = await Promise.all([
      db.courses.get(courseId),
      db.courseAssessments.where('courseId').equals(courseId).toArray(),
    ]);
    if (!courseRecord) {
      return {
        course: null,
        lessons: [],
        cards: [],
        assessments: [],
        links: [],
        exposures: [],
        completions: [],
        practiceNodes: [],
        milestones: [],
        performance: [],
      };
    }
    const course = hydrateCourse(courseRecord, finalAssessmentForCourse(courseId, assessments));
    const [lessons, cards, practiceNodes, milestones] = await Promise.all([
      db.lessons.where('courseId').equals(courseId).sortBy('orderIndex'),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.practiceNodes.where('courseId').equals(courseId).toArray(),
      db.practiceMilestones.where('courseId').equals(courseId).toArray(),
    ]);
    const lessonIds = lessons.map((lesson) => lesson.id);
    const deckIds = [...new Set(cards.map((card) => card.deckId))];
    const [links, exposures, completions, performance] = await Promise.all([
      lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0
        ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
        : [],
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
      deckIds.length > 0 ? db.userPerformance.where('deckId').anyOf(deckIds).toArray() : [],
    ]);
    return {
      course,
      lessons,
      cards,
      assessments,
      links,
      exposures,
      completions,
      practiceNodes,
      milestones,
      performance,
    };
  }, [courseId, refreshKey]);

  return useMemo(() => {
    if (records === undefined) return undefined;
    if (!records.course) return null;
    const now = Date.now();
    const lessonCardsById = new Map(
      records.lessons.map((lesson) => [
        lesson.id,
        lessonCardMembership(lesson.id, records.cards, records.links),
      ]),
    );
    const currentPractice = currentAssessmentPracticeContext({
      course: records.course,
      assessments: records.assessments,
      lessons: records.lessons,
      cards: records.cards,
      links: records.links,
      exposures: records.exposures,
      now,
    });
    const currentPracticeScope = currentPractice.scope;
    const reviewDueCount = dueCards(availableCards(currentPracticeScope, now), now).length;
    const meanReviewSeconds = courseMeanReviewSeconds(
      records.cards,
      buildDeckSecondsMap(records.performance),
    );
    const nearestPracticeAssessmentDate = currentPractice.assessmentOptions[0]?.examDate;
    const nodes = buildPath(
      records.course,
      records.lessons,
      records.assessments,
      lessonCardsById,
      records.practiceNodes,
      reviewDueCount,
      meanReviewSeconds,
      now,
      {
        exposures: records.exposures,
        lessonCompletions: records.completions,
        practiceMilestones: records.milestones,
      },
      nearestPracticeAssessmentDate,
    );
    const snapshot = buildCourseStudyFlowSnapshot({
      course: records.course,
      nodes,
      cards: records.cards,
      links: records.links,
      exposures: records.exposures,
      examDateContext: makeExamDateContext(records.course, records.lessons, records.assessments),
      meanReviewSeconds,
      practiceMilestones: records.milestones,
      now,
    });
    return {
      course: records.course,
      snapshot,
      decision: planNextStudyStep(snapshot),
      generation: refreshKey,
    };
  }, [records, refreshKey]);
}
