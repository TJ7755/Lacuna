import { useMemo } from 'react';
import { useCourseStudyFlowRecords } from './useCourseStudyFlowRecords';
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
import type { Course } from '../db/types';

interface CourseStudyFlowData {
  course: Course;
  snapshot: CourseStudyFlowSnapshot;
  decision: StudyFlowDecision;
  generation: number;
}

/** Loads one authoritative course snapshot for both preview and conductor decisions. */
export function useCourseStudyFlow(
  courseId: string | undefined,
  refreshKey = 0,
): CourseStudyFlowData | null | undefined {
  const records = useCourseStudyFlowRecords(courseId, refreshKey);

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
