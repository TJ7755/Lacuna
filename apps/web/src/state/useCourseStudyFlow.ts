import { useMemo } from 'react';
import { useCourseStudyFlowRecords } from './useCourseStudyFlowRecords';
import { availableCards, dueCards } from '../fsrs/eligibility';
import { buildDeckSecondsMap } from '../fsrs/stats';
import { makeExamDateContext } from '../fsrs/examDate';
import { buildPath } from '../course/path';
import { lessonCardMembership } from '../course/lessonMembership';
import { currentAssessmentPracticeContext } from '../course/assessmentPractice';
import {
  buildCourseStudyFlowSnapshot,
  courseMeanReviewSeconds,
  type CourseStudyFlowSnapshot,
} from '../course/studyFlowSnapshot';
import {
  planNextStudyStep,
  type StudyFlowDecision,
  type StudyFlowStep,
} from '../course/studyFlowPlanner';
import type { Card, Course } from '@lacuna/core/db/types';
import { buildStudyProgress, type StudyProgress } from '../course/studyProgress';

interface CourseStudyFlowData {
  course: Course;
  snapshot: CourseStudyFlowSnapshot;
  decision: StudyFlowDecision;
  generation: number;
  /** Each lesson's cards, for previewing what a lesson step involves. */
  lessonCardsById: ReadonlyMap<string, Card[]>;
  /** The course's mean seconds per review, for time estimates. */
  meanReviewSeconds: number;
  progress?: StudyProgress;
}

/** Loads one authoritative course snapshot for both preview and conductor decisions. */
export function useCourseStudyFlow(
  courseId: string | undefined,
  refreshKey = 0,
  enabled = true,
  previousStep?: StudyFlowStep | null,
  sittingStartedAt?: number,
): CourseStudyFlowData | null | undefined {
  const records = useCourseStudyFlowRecords(courseId, refreshKey, enabled, sittingStartedAt);

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
      practiceNodes: records.practiceNodes,
      lessons: records.lessons,
      cards: records.cards,
      concepts: records.concepts,
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
      examDateContext: makeExamDateContext(
        records.course,
        records.lessons,
        records.assessments,
        records.links,
        records.concepts,
      ),
      meanReviewSeconds,
      practiceMilestones: records.milestones,
      now,
    });
    snapshot.hasStudyHistory ||=
      records.questionPractice?.some(
        (item) => item.schedule.lastReviewed !== null || item.unfinished || item.familiarCount > 0,
      ) ?? false;
    snapshot.hasStudyHistory ||=
      records.examSkillPractice?.some(
        (item) => item.schedule.lastReviewed !== null || item.lastPracticeAt !== undefined,
      ) ?? false;
    snapshot.questionScopeLessonIds = records.questionScopeLessonIds;
    snapshot.questionScopeConceptIds = records.questionScopeConceptIds ?? [];
    snapshot.questionOptions = (records.questionPractice ?? [])
      .filter(
        (item) =>
          (item.studyEligible || item.unfinished) &&
          ((item.studyUnseenCount ?? 0) > 0 || item.unfinished),
      )
      .map((item) => ({
        conceptId: item.conceptId,
        name: item.name,
        needs: item.needs,
        unfinished: item.unfinished,
        examDate: item.examDate,
        repairLessonId: item.needs?.knowledge
          ? nodes.find(
              (node) =>
                node.nodeType === 'lesson' &&
                node.status !== 'locked' &&
                lessonCardsById.get(node.id)?.some((card) => card.conceptId === item.conceptId),
            )?.id
          : undefined,
      }))
      .sort(
        (a, b) =>
          Number(Boolean(b.unfinished)) - Number(Boolean(a.unfinished)) ||
          Number(
            Boolean(b.needs?.knowledge || b.needs?.techniques.length || b.needs?.application),
          ) -
            Number(
              Boolean(a.needs?.knowledge || a.needs?.techniques.length || a.needs?.application),
            ) ||
          (a.examDate ?? Infinity) - (b.examDate ?? Infinity) ||
          (a.conceptId ?? '').localeCompare(b.conceptId ?? ''),
      );
    snapshot.questionOptions.push(
      ...(records.examSkillPractice ?? [])
        .filter((item) => (item.studyEligible && item.unseenCount > 0) || item.unfinished)
        .map((item) => ({
          techniqueId: item.techniqueId,
          name: item.name,
          examDate: item.examDate,
          unfinished: item.unfinished,
        })),
    );
    snapshot.questionPracticeExhausted =
      Boolean(
        records.questionPractice?.some((item) => item.availableCount > 0) ||
        records.examSkillPractice?.some((item) => item.availableCount > 0),
      ) &&
      !records.examSkillPractice?.some(
        (item) => (item.studyEligible && item.unseenCount > 0) || item.unfinished,
      ) &&
      !records.questionPractice?.some(
        (item) => (item.studyEligible && (item.studyUnseenCount ?? 0) > 0) || item.unfinished,
      );
    return {
      course: records.course,
      snapshot,
      decision: planNextStudyStep(snapshot, true, previousStep),
      // Until the live query answers the new refresh key, `records` is the previous
      // read: label it with that read's key, or the conductor would plan from stale data.
      generation: records.generation,
      lessonCardsById,
      meanReviewSeconds,
      progress: buildStudyProgress({
        course: records.course,
        lessons: records.lessons,
        cards: records.cards,
        assessments: records.assessments,
        links: records.links,
        concepts: records.concepts ?? [],
        questionPractice: records.questionPractice ?? [],
        questionScopeConceptIds: snapshot.questionScopeConceptIds ?? [],
        dueReviewCardIds: snapshot.dueReviewCardIds,
        availableLessonIds: new Set(
          nodes.flatMap((node) =>
            node.nodeType === 'lesson' && node.status !== 'locked' ? [node.id] : [],
          ),
        ),
        assessmentId: previousStep?.kind === 'practice' ? previousStep.assessmentId : undefined,
        now,
      }),
    };
  }, [records, previousStep]);
}
