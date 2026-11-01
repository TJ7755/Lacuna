import { db } from '../../db/schema';
import { completeRevisionWindow, refreshRevisionPlan } from '../../db/revisionPlanRepository';
import { savePracticeMilestoneProgress } from '../../db/practiceNodeRepository';
import type { Card, Course, RevisionPlan } from '../../db/types';
import type { ExamDateContext } from '../../fsrs/examDate';
import type { SessionContext } from '../../fsrs/session';
import {
  createHalfLifeLogisticModel,
  readinessFromPredictions,
} from '../../fsrs/halfLifeLogisticModel';
import { practiceReadiness } from '../../course/studyPools';
import type { SessionSummary } from '../../components/learn/types';
import { ratchetSessionUnlocks } from './sessionUnlocks';

export interface PracticeSession {
  nodeKey: string;
  courseId: string;
  scopeVersion: string;
  scopeCards: Card[];
  course: Course;
  examDateContext: ExamDateContext;
}

export async function persistSessionPracticeMilestone(
  practice: PracticeSession | null,
  cards: Card[],
  completed: boolean,
): Promise<void> {
  if (!practice) return;
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const currentScope = practice.scopeCards.map((card) => cardsById.get(card.id) ?? card);
  const readiness = practiceReadiness(currentScope, practice.course, practice.examDateContext);
  await savePracticeMilestoneProgress(
    practice.nodeKey,
    practice.courseId,
    practice.scopeVersion,
    readiness.securedCardCount,
    readiness.totalCardCount,
    completed,
  );
}

interface CompletionState {
  revisionPlan: RevisionPlan | null;
  initialRevision: number;
  sessionId: string;
  startedAt: number;
  covered: Set<string>;
  improved: Set<string>;
  parked: Set<string>;
  reviewEventIds: string[];
  context: SessionContext | null;
  cards: Card[];
  practice: PracticeSession | null;
  ratchetCourseId: string | null;
  ratchetLessonId: string | null;
}

/** Read live state at the original await boundaries; completion never freezes the refs. */
export async function persistSessionCompletion(
  nextSummary: SessionSummary,
  windowId: string | undefined,
  read: () => CompletionState,
) {
  return db.transaction(
    'rw',
    [
      db.revisionPlans,
      db.courseAssessments,
      db.courses,
      db.concepts,
      db.lessons,
      db.cards,
      db.lessonCards,
      db.lessonCardExposures,
      db.lessonCompletions,
      db.reviewHistory,
      db.practiceNodes,
      db.practiceMilestones,
      db.schedulingPerformance,
      db.coursePerformance,
    ],
    async () => {
      let deliveredSummary = nextSummary;
      const revisionPlan = read().revisionPlan;
      let completedPlan = revisionPlan;
      if (revisionPlan && windowId) {
        const completedAt = Date.now();
        const refreshedPlan = await refreshRevisionPlan(
          revisionPlan.id,
          revisionPlan.input.projection,
          completedAt,
        );
        const evidence = read();
        const updatedPlan = await completeRevisionWindow(
          refreshedPlan.id,
          windowId,
          {
            id: evidence.sessionId,
            windowId,
            startedAt: evidence.startedAt,
            completedAt,
            cardIds: [...evidence.covered],
            reviewEventIds: evidence.reviewEventIds,
            improvedCardIds: [...evidence.improved],
            parkedCardIds: [...evidence.parked],
          },
          completedAt,
        );
        completedPlan = updatedPlan;
        const completed = read();
        const windowDayParts = windowId.split(':');
        const completedWindowDay = windowDayParts[windowDayParts.length - 1];
        const nextWindow = updatedPlan.windows.find(
          (window) => window.status === 'scheduled' && window.day >= completedWindowDay,
        );
        const latestReplan =
          updatedPlan.revision > completed.initialRevision
            ? updatedPlan.replans[updatedPlan.replans.length - 1]
            : undefined;
        const objectiveContext = completed.context?.decks.values().next().value?.oc;
        const model = objectiveContext
          ? createHalfLifeLogisticModel(objectiveContext.ctx.decay)
          : undefined;
        const readinessCards = completed.cards.filter((card) =>
          updatedPlan.scope.eligibleCardIds.includes(card.id),
        );
        const readiness =
          model &&
          updatedPlan.input.projection.projectionMode === 'memory-model' &&
          model.version === updatedPlan.input.projection.memoryModelVersion &&
          readinessCards.every(
            (card) =>
              model.validate({
                card,
                now: completedAt,
                assessmentAt: updatedPlan.input.deadlineAt,
              }).valid,
          )
            ? readinessFromPredictions(
                readinessCards.map((card) =>
                  model.predictRecall({ card, at: updatedPlan.input.deadlineAt }),
                ),
              )
            : null;
        deliveredSummary = {
          ...nextSummary,
          reachedGoal: true,
          revision: {
            cardsCovered: completed.covered.size,
            cardsImproved: completed.improved.size,
            cardsParked: completed.parked.size,
            workNotReached: Math.max(
              0,
              revisionPlan.scope.eligibleCardIds.length - completed.covered.size,
            ),
            ...(readiness?.standardDeviation === undefined
              ? {}
              : {
                  predictedReadiness: readiness.probability,
                  readinessUncertainty: readiness.standardDeviation,
                }),
            ...(nextWindow ? { nextWindowDay: nextWindow.day } : {}),
            ...(latestReplan?.explanation ? { replanExplanation: latestReplan.explanation } : {}),
          },
        };
      }
      const practice = read();
      if (practice.practice) {
        await persistSessionPracticeMilestone(
          practice.practice,
          practice.cards,
          deliveredSummary.reachedGoal,
        );
      }
      const unlock = read();
      if (!revisionPlan && unlock.ratchetCourseId) {
        await ratchetSessionUnlocks(
          deliveredSummary.reachedGoal,
          unlock.ratchetCourseId,
          () => read().ratchetLessonId,
        );
      }
      return { deliveredSummary, completedPlan };
    },
  );
}
