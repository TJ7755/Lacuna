import { useMemo } from 'react';
import type { Card } from '../../db/types';
import type { useCoursePathRecords } from '../../state/useCourseStudyFlowRecords';
import { computeCourseSummaries } from '../../state/courseSummaries';
import { availableCards, dueCards } from '../../fsrs/eligibility';
import { buildDeckSecondsMap } from '../../fsrs/stats';
import { makeExamDateContext } from '../../fsrs/examDate';
import { buildPath } from '../../course/path';
import { lessonCardMembership } from '../../course/lessonMembership';
import {
  currentAssessmentPracticeContext,
  type AssessmentPracticeOption,
} from '../../course/assessmentPractice';
import {
  buildCourseStudyFlowSnapshot,
  courseMeanReviewSeconds,
} from '../../course/studyFlowSnapshot';
import { isLessonAuthoringMode } from '../../course/lessonViewMode';

interface PracticeNodeProgress {
  fraction: number;
  eligibleCount: number;
  completed: boolean;
  scopeVersion: string;
  assessment?: AssessmentPracticeOption;
}

export function useCoursePathData(records: ReturnType<typeof useCoursePathRecords>) {
  const course = records?.course;
  const lessons = records?.lessons;
  const courseCards = records?.cards;
  const concepts = records?.concepts;
  // Match the existing Dexie sort: an undated assessment keeps its relative position.
  const assessments = useMemo(
    () => records?.assessments.slice().sort((a, b) => (a.examDate ?? NaN) - (b.examDate ?? NaN)),
    [records],
  );
  const practiceNodes = records?.practiceNodes;
  const lessonLinks = records?.links;
  const exposures = records?.exposures;
  const lessonCompletions = records?.completions;
  const practiceMilestones = records?.milestones;
  const perf = records?.performance;
  const summary = useMemo(() => {
    if (!records) return undefined;
    if (!records.course) return null;
    return computeCourseSummaries(
      [records.course],
      records.lessons,
      records.cards,
      records.assessments,
      Date.now(),
      { links: records.links, exposures: records.exposures, completions: records.completions },
      undefined,
      records.concepts,
    )[records.course.id];
  }, [records]);
  const archived = course?.archived === true;
  const authoring = course ? !archived && isLessonAuthoringMode(course) : false;
  const dataLoaded =
    course !== undefined &&
    lessons !== undefined &&
    assessments !== undefined &&
    courseCards !== undefined &&
    summary !== undefined &&
    practiceNodes !== undefined &&
    lessonLinks !== undefined &&
    exposures !== undefined &&
    lessonCompletions !== undefined &&
    practiceMilestones !== undefined &&
    perf !== undefined;

  // Complete lesson membership includes both primary and explicitly linked cards.
  // Hooks below must run unconditionally (Rules of Hooks), so they tolerate
  // not-yet-loaded data via fallbacks and are only consumed once `dataLoaded`.
  const lessonCardsById = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const lesson of lessons ?? []) {
      map.set(lesson.id, lessonCardMembership(lesson.id, courseCards ?? [], lessonLinks ?? []));
    }
    return map;
  }, [courseCards, lessonLinks, lessons]);

  // Live review-due count and mean review time, feeding shouldInsertPractice
  // (addendum 2 §H). Deliberately review-only (dueCards): practice-node pacing
  // is about FSRS review pressure, so it ignores mastery, unlike the header's
  // due count (see courseDueReviewCards).
  const now = Date.now();
  const { reviewDueCount, meanReviewSeconds, nearestPracticeAssessmentDate } = useMemo(() => {
    const currentPractice = course
      ? currentAssessmentPracticeContext({
          course,
          assessments: assessments ?? [],
          practiceNodes: practiceNodes ?? [],
          lessons: lessons ?? [],
          cards: courseCards ?? [],
          concepts,
          links: lessonLinks ?? [],
          exposures: exposures ?? [],
          now,
        })
      : { scope: [], assessmentOptions: [] };
    const scope = currentPractice.scope;
    const reviewDueCount = dueCards(availableCards(scope, now), now).length;
    const deckSeconds = buildDeckSecondsMap(perf ?? []);
    const meanReviewSeconds = courseMeanReviewSeconds(courseCards ?? [], deckSeconds);
    const nearestPracticeAssessmentDate = currentPractice.assessmentOptions[0]?.examDate;
    return { reviewDueCount, meanReviewSeconds, nearestPracticeAssessmentDate };
    // `now` is deliberately excluded: recomputation is scoped to data changes
    // (cards/perf), not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assessments,
    course,
    courseCards,
    concepts,
    exposures,
    lessonLinks,
    lessons,
    perf,
    practiceNodes,
  ]);

  const nodes = useMemo(
    () =>
      course && lessons && assessments && practiceNodes
        ? buildPath(
            course,
            lessons,
            assessments,
            lessonCardsById,
            practiceNodes,
            reviewDueCount,
            meanReviewSeconds,
            now,
            {
              exposures: exposures ?? [],
              lessonCompletions: lessonCompletions ?? [],
              practiceMilestones: practiceMilestones ?? [],
            },
            nearestPracticeAssessmentDate,
          )
        : [],
    // `now` is deliberately excluded: recomputation is scoped to data changes,
    // not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      course,
      lessons,
      assessments,
      lessonCardsById,
      practiceNodes,
      reviewDueCount,
      meanReviewSeconds,
      exposures,
      lessonCompletions,
      practiceMilestones,
      nearestPracticeAssessmentDate,
    ],
  );

  const examDateContext = useMemo(
    () =>
      course && lessons && assessments
        ? makeExamDateContext(course, lessons, assessments, lessonLinks, concepts)
        : undefined,
    [course, lessons, assessments, lessonLinks, concepts],
  );

  const studyFlowSnapshot = useMemo(
    () =>
      course && examDateContext
        ? buildCourseStudyFlowSnapshot({
            course,
            nodes,
            cards: courseCards ?? [],
            links: lessonLinks ?? [],
            exposures: exposures ?? [],
            examDateContext,
            meanReviewSeconds,
            practiceMilestones: practiceMilestones ?? [],
            now,
          })
        : null,
    [
      course,
      courseCards,
      examDateContext,
      exposures,
      lessonLinks,
      meanReviewSeconds,
      nodes,
      practiceMilestones,
      now,
    ],
  );
  const practiceProgressByKey = useMemo(() => {
    const result = new Map<string, PracticeNodeProgress>();
    for (const practice of studyFlowSnapshot?.practiceByKey.values() ?? []) {
      result.set(practice.nodeKey, {
        fraction: practice.totalCount > 0 ? practice.securedCount / practice.totalCount : 0,
        eligibleCount: practice.eligibleCount,
        completed: practice.completed,
        scopeVersion: practice.scopeVersion,
        assessment: practice.assessmentOptions[0],
      });
    }
    return result;
  }, [studyFlowSnapshot]);
  const visibleNodes = useMemo(
    () =>
      nodes.filter((node) => {
        if (node.nodeType === 'practice-auto') return false;
        if (node.nodeType !== 'practice-manual') return true;
        const practice = studyFlowSnapshot?.practiceByKey.get(node.nodeKey);
        return authoring || practice?.active === true || practice?.completed === true;
      }),
    [authoring, nodes, studyFlowSnapshot],
  );

  const data = {
    course,
    lessons,
    courseCards,
    concepts,
    assessments,
    practiceNodes,
    lessonLinks,
    summary,
    archived,
    authoring,
    dataLoaded,
    lessonCardsById,
    now,
    nodes,
    examDateContext,
    studyFlowSnapshot,
    practiceProgressByKey,
    visibleNodes,
  };
  return dataLoaded
    ? {
        ...data,
        dataLoaded,
        course,
        lessons,
        assessments,
        courseCards,
        summary,
        practiceNodes,
        lessonLinks,
      }
    : { ...data, dataLoaded };
}
