import { courseLessonOrderPreference, resolveLessonOrder } from '../../course/lessonOrder';
import { db } from '../../db/schema';
import { getCourse, listCourseAssessments } from '../../db/read';
import { hydrateCardsWithHistory } from '../../db/reviewHistoryRead';
import { performanceForCourseBackingDecks } from '../../db/backingDecks';
import { ratchetLessonUnlock } from '../../db/lessonRepository';
import { nextLessonUnlockCondition } from '../../course/unlock';
import {
  buildPath,
  manualPracticeGateKeysAfterLesson,
  manualPracticeGateOutcomeAfterLesson,
} from '../../course/path';
import {
  buildCourseStudyFlowSnapshot,
  courseMeanReviewSeconds,
} from '../../course/studyFlowSnapshot';
import { lessonCardMembership } from '../../course/studyPools';
import { currentAssessmentPracticeContext } from '../../course/assessmentPractice';
import { makeExamDateContext } from '../../fsrs/examDate';
import { availableCards, dueCards } from '../../fsrs/eligibility';
import { buildDeckSecondsMap } from '../../fsrs/stats';

/**
 * Re-evaluate semi-linear lesson unlocks from current course evidence.
 * Runs inside the caller's completion transaction. Read the lesson scope after
 * loading the course and lessons, as the session coordinator did before extraction.
 */
export async function ratchetSessionUnlocks(
  reachedGoal: boolean,
  courseId: string | null,
  getLessonId: () => string | null,
): Promise<void> {
  if (!reachedGoal) return;
  const cId = courseId;
  if (!cId) return;
  const course = await getCourse(cId);
  if (!course || course.unlockMode !== 'semi-linear') return;
  const lessons = await db.lessons.where('courseId').equals(cId).sortBy('orderIndex');
  const coreLessons = resolveLessonOrder(lessons, courseLessonOrderPreference(course)).filter(
    (lesson) => !lesson.isExtension,
  );
  const lId = getLessonId();
  const now = Date.now();
  const lessonIds = coreLessons.map((lesson) => lesson.id);
  const [rawCourseCards, links, exposures, completions, practiceNodes, examDates, milestones] =
    await Promise.all([
      db.cards.where('courseId').equals(cId).toArray(),
      lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0
        ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
        : [],
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
      db.practiceNodes.where('courseId').equals(cId).toArray(),
      listCourseAssessments(cId),
      db.practiceMilestones.where('courseId').equals(cId).toArray(),
    ]);
  const courseCards = await hydrateCardsWithHistory(rawCourseCards);
  const performance = await performanceForCourseBackingDecks(cId, courseCards);
  const lessonCardsById = new Map(
    lessons.map((lesson) => [lesson.id, lessonCardMembership(lesson.id, courseCards, links)]),
  );
  const meanReviewSeconds = courseMeanReviewSeconds(courseCards, buildDeckSecondsMap(performance));
  const currentPractice = currentAssessmentPracticeContext({
    course,
    practiceNodes,
    assessments: examDates,
    lessons,
    cards: courseCards,
    links,
    exposures,
    now,
  });
  const currentPracticeScope = currentPractice.scope;
  const nodes = buildPath(
    course,
    lessons,
    examDates,
    lessonCardsById,
    practiceNodes,
    dueCards(availableCards(currentPracticeScope, now), now).length,
    meanReviewSeconds,
    now,
    {
      exposures,
      lessonCompletions: completions,
      practiceMilestones: milestones,
    },
    currentPractice.assessmentOptions[0]?.examDate,
  );
  const snapshot = buildCourseStudyFlowSnapshot({
    course,
    nodes,
    cards: courseCards,
    links,
    exposures,
    examDateContext: makeExamDateContext(course, lessons, examDates),
    meanReviewSeconds,
    practiceMilestones: milestones,
    now,
  });
  for (let i = 0; i < coreLessons.length - 1; i++) {
    const lessonN = coreLessons[i];
    const lessonN1 = coreLessons[i + 1];
    if (lessonN1.unlockedAt !== undefined) continue;
    if (lId && lessonN.id !== lId) continue;
    const lessonNCards = lessonCardMembership(lessonN.id, courseCards, links);
    const currentPracticeGoalReached = manualPracticeGateOutcomeAfterLesson(
      coreLessons,
      practiceNodes,
      lessonN.id,
      snapshot.activeManualNodeKeys,
      snapshot.completedManualNodeKeys,
    );
    // Recording the final Simple answer can make a manual checkpoint disappear
    // from the freshly rebuilt active path before this completion ratchet runs.
    // Its teacher-authored placement still gates the lesson just completed.
    const practiceGoalReached =
      currentPracticeGoalReached === undefined &&
      lId === lessonN.id &&
      manualPracticeGateKeysAfterLesson(coreLessons, practiceNodes, lessonN.id).some(
        (nodeKey) => (snapshot.practiceByKey.get(nodeKey)?.totalCount ?? 0) > 0,
      )
        ? false
        : currentPracticeGoalReached;
    const lessonComplete =
      course.learnFirst === false
        ? lessonNCards.length === 0
          ? nextLessonUnlockCondition(
              lessonN.id,
              lessonNCards,
              exposures,
              completions,
              practiceGoalReached,
            )
          : lessonNCards.every((card) => card.state !== 0) && practiceGoalReached !== false
        : nextLessonUnlockCondition(
            lessonN.id,
            lessonNCards,
            exposures,
            completions,
            practiceGoalReached,
          );
    if (lessonComplete) {
      await ratchetLessonUnlock(lessonN1.id, now);
    }
  }
}
