import { useMemo } from 'react';
import type { useCoursePathRecords } from '../../state/useCourseStudyFlowRecords';
import { dueReviewPool } from '../../fsrs/eligibility';
import { progressValue } from '../../fsrs/objective';
import { buildDeckSecondsMap } from '../../fsrs/stats';
import { makeExamDateContext } from '../../fsrs/examDate';
import { buildPath } from '../../course/path';
import { coreCourseCards, lessonCardMembershipByLesson } from '../../course/lessonMembership';
import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import { buildCoursePracticeStates, courseMeanReviewSeconds } from '../../course/studyFlowSnapshot';
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
  const coreMastery = useMemo(() => {
    if (!records?.course) return 0;
    // The Path already computes the due pool and progress through its Study snapshot.
    const { course, lessons, cards, assessments, links, concepts } = records;
    const extensionLessonIds = new Set(
      lessons.filter((lesson) => lesson.isExtension).map(({ id }) => id),
    );
    return progressValue(
      coreCourseCards(cards, extensionLessonIds),
      course,
      Date.now(),
      makeExamDateContext(course, lessons, assessments, links, concepts),
    );
  }, [records]);
  const archived = course?.archived === true;
  const authoring = course ? !archived && isLessonAuthoringMode(course) : false;
  const dataLoaded =
    course !== undefined &&
    lessons !== undefined &&
    assessments !== undefined &&
    courseCards !== undefined &&
    practiceNodes !== undefined &&
    lessonLinks !== undefined &&
    exposures !== undefined &&
    lessonCompletions !== undefined &&
    practiceMilestones !== undefined &&
    perf !== undefined;

  // Complete lesson membership includes both primary and explicitly linked cards.
  // Hooks below must run unconditionally (Rules of Hooks), so they tolerate
  // not-yet-loaded data via fallbacks and are only consumed once `dataLoaded`.
  const lessonCardsById = useMemo(
    () => lessonCardMembershipByLesson(lessons ?? [], courseCards ?? [], lessonLinks ?? []),
    [courseCards, lessonLinks, lessons],
  );

  const now = Date.now();
  const nodes = useMemo(
    () =>
      course && lessons && assessments && practiceNodes
        ? buildPath(
            // Automatic Practice stops belong to Study and have no row on the Path.
            { ...course, autoPractice: false },
            lessons,
            assessments,
            lessonCardsById,
            practiceNodes,
            undefined,
            undefined,
            now,
            {
              exposures: exposures ?? [],
              lessonCompletions: lessonCompletions ?? [],
              practiceMilestones: practiceMilestones ?? [],
            },
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
      exposures,
      lessonCompletions,
      practiceMilestones,
    ],
  );

  const examDateContext = useMemo(
    () =>
      course && lessons && assessments
        ? makeExamDateContext(course, lessons, assessments, lessonLinks, concepts)
        : undefined,
    [course, lessons, assessments, lessonLinks, concepts],
  );

  const dueReviewCardIds = useMemo(
    () =>
      new Set(course ? dueReviewPool(courseCards ?? [], course, now).map((card) => card.id) : []),
    [course, courseCards, now],
  );
  const practiceByKey = useMemo(
    () =>
      course && examDateContext && nodes.some((node) => node.nodeType === 'practice-manual')
        ? buildCoursePracticeStates({
            course,
            nodes,
            cards: courseCards ?? [],
            links: lessonLinks ?? [],
            exposures: exposures ?? [],
            examDateContext,
            meanReviewSeconds: courseMeanReviewSeconds(
              courseCards ?? [],
              buildDeckSecondsMap(perf ?? []),
            ),
            practiceMilestones,
            now,
          }).practiceByKey
        : undefined,
    [
      course,
      courseCards,
      examDateContext,
      exposures,
      lessonLinks,
      nodes,
      perf,
      practiceMilestones,
      now,
    ],
  );
  const practiceProgressByKey = useMemo(() => {
    const result = new Map<string, PracticeNodeProgress>();
    for (const practice of practiceByKey?.values() ?? []) {
      result.set(practice.nodeKey, {
        fraction: practice.totalCount > 0 ? practice.securedCount / practice.totalCount : 0,
        eligibleCount: practice.eligibleCount,
        completed: practice.completed,
        scopeVersion: practice.scopeVersion,
        assessment: practice.assessmentOptions[0],
      });
    }
    return result;
  }, [practiceByKey]);
  const visibleNodes = useMemo(
    () =>
      nodes.filter((node) => {
        if (node.nodeType !== 'practice-manual') return true;
        const practice = practiceByKey?.get(node.nodeKey);
        return authoring || practice?.active === true || practice?.completed === true;
      }),
    [authoring, nodes, practiceByKey],
  );

  const data = {
    course,
    lessons,
    courseCards,
    concepts,
    assessments,
    practiceNodes,
    lessonLinks,
    coreMastery,
    archived,
    authoring,
    dataLoaded,
    lessonCardsById,
    now,
    nodes,
    examDateContext,
    dueReviewCardIds,
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
        practiceNodes,
        lessonLinks,
      }
    : { ...data, dataLoaded };
}
