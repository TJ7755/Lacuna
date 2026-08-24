import type {
  BackupFile,
  CourseAssessment,
  CoursePerformance,
  LineageIdMapping,
  PendingMergeReview,
  RevisionPlan,
  SchedulingPerformance,
  Tombstone,
} from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import { migrateQuestionModeContent } from './domain';
import type { Concept, QuestionAttempt, QuestionConceptSet, QuestionDefinition } from './types';

export interface QuestionBackupCollections {
  concepts: Concept[];
  questions: QuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  questionAttempts: QuestionAttempt[];
}

export type QuestionNormalisedBackup = BackupFile & QuestionBackupCollections;

function protectedCardIds(
  mappings: readonly LineageIdMapping[],
  pending: readonly PendingMergeReview[],
): Set<string> {
  const protectedIds = new Set(mappings.flatMap((mapping) => mapping.cardIds));
  for (const review of pending) {
    review.diff.creates.cards.forEach((card) => protectedIds.add(card.id));
    review.diff.updates.cards.forEach((card) => protectedIds.add(card.id));
    review.diff.removals.cardIds.forEach((id) => protectedIds.add(id));
    review.diff.conflicts.forEach((conflict) => {
      if (conflict.kind === 'card') protectedIds.add(conflict.entityId);
    });
  }
  return protectedIds;
}

function removeCardIdsFromRevisionPlan(
  plan: RevisionPlan,
  removed: ReadonlySet<string>,
): RevisionPlan {
  const filter = (ids: readonly string[] | undefined): string[] | undefined =>
    ids?.filter((id) => !removed.has(id));
  const scope = plan.scope
    ? {
        ...plan.scope,
        excludedCardIds: filter(plan.scope.excludedCardIds) ?? [],
        eligibleCardIds: filter(plan.scope.eligibleCardIds) ?? [],
        unavailableCardIds: filter(plan.scope.unavailableCardIds) ?? [],
      }
    : plan.scope;
  const pendingReplan = plan.pendingReplan
    ? {
        ...plan.pendingReplan,
        scope: {
          ...plan.pendingReplan.scope,
          excludedCardIds: filter(plan.pendingReplan.scope.excludedCardIds) ?? [],
          eligibleCardIds: filter(plan.pendingReplan.scope.eligibleCardIds) ?? [],
          unavailableCardIds: filter(plan.pendingReplan.scope.unavailableCardIds) ?? [],
        },
        cardStates: plan.pendingReplan.cardStates.filter((state) => !removed.has(state.cardId)),
      }
    : plan.pendingReplan;
  return {
    ...plan,
    scope,
    cardStates: plan.cardStates.filter((state) => !removed.has(state.cardId)),
    pendingReplan,
  };
}

function performance(entries: readonly ReviewHistoryEntry[]): {
  runningMeanResponseTime: number;
  runningStdDevResponseTime: number;
  m2: number;
  totalCorrectReviews: number;
} {
  let count = 0;
  let mean = 0;
  let m2 = 0;
  for (const entry of entries) {
    if (!(entry.correct ?? entry.grade > 1) || !Number.isFinite(entry.responseTimeSec)) continue;
    count += 1;
    const delta = entry.responseTimeSec - mean;
    mean += delta / count;
    m2 += delta * (entry.responseTimeSec - mean);
  }
  return {
    runningMeanResponseTime: mean,
    runningStdDevResponseTime: count > 0 ? Math.sqrt(m2 / count) : 0,
    m2,
    totalCorrectReviews: count,
  };
}

function rebuildCoursePerformance(
  rows: readonly CoursePerformance[],
  reviews: readonly ReviewHistoryEntry[],
  affectedCourseIds: ReadonlySet<string>,
): CoursePerformance[] {
  return rows.map((row) =>
    affectedCourseIds.has(row.courseId)
      ? {
          ...row,
          ...performance(reviews.filter((entry) => entry.courseId === row.courseId)),
        }
      : row,
  );
}

function rebuildSchedulingPerformance(
  rows: readonly SchedulingPerformance[],
  reviews: readonly ReviewHistoryEntry[],
  affectedUnitIds: ReadonlySet<string>,
): SchedulingPerformance[] {
  return rows.map((row) =>
    affectedUnitIds.has(row.schedulingUnitId)
      ? {
          ...row,
          ...performance(
            reviews.filter((entry) => entry.schedulingUnitId === row.schedulingUnitId),
          ),
        }
      : row,
  );
}

function migrationTombstones(
  input: BackupFile,
  removedCardIds: readonly string[],
  removedLinkIds: ReadonlySet<string>,
  removedExposureIds: ReadonlySet<string>,
  removedMilestoneIds: ReadonlySet<string>,
): Tombstone[] {
  const byCard = new Map(input.cards.map((card) => [card.id, card]));
  const links = new Map((input.lessonCards ?? []).map((link) => [link.id, link]));
  const exposures = new Map(
    (input.lessonCardExposures ?? []).map((row) => [`${row.lessonId}:${row.cardId}`, row]),
  );
  const milestones = new Map((input.practiceMilestones ?? []).map((row) => [row.nodeKey, row]));
  return [
    ...removedCardIds.map((id) => {
      const card = byCard.get(id);
      return {
        table: 'cards' as const,
        recordId: id,
        deletedAt: card?.updatedAt ?? card?.createdAt ?? 0,
      };
    }),
    ...[...removedLinkIds].map((id) => {
      const link = links.get(id);
      return {
        table: 'lessonCards' as const,
        recordId: id,
        deletedAt: link?.updatedAt ?? link?.createdAt ?? 0,
      };
    }),
    ...[...removedExposureIds].map((id) => {
      const exposure = exposures.get(id);
      return {
        table: 'lessonCardExposures' as const,
        recordId: id,
        deletedAt: exposure?.updatedAt ?? exposure?.taughtAt ?? 0,
      };
    }),
    ...[...removedMilestoneIds].map((id) => {
      const milestone = milestones.get(id);
      return {
        table: 'practiceMilestones' as const,
        recordId: id,
        deletedAt: milestone?.updatedAt ?? 0,
      };
    }),
  ];
}

/**
 * Upgrade backup v10 and earlier through the same deterministic adapter as schema v24.
 * Current backups are copied unchanged; attempt evidence is never reconstructed twice.
 */
export function normaliseQuestionBackup(input: BackupFile): QuestionNormalisedBackup {
  if (input.version >= 11) {
    return {
      ...input,
      concepts: [...(input.concepts ?? [])],
      questions: [...(input.questions ?? [])],
      questionConcepts: [...(input.questionConcepts ?? [])],
      questionAttempts: [...(input.questionAttempts ?? [])],
    };
  }

  const migration = migrateQuestionModeContent({
    cards: input.cards,
    reviewHistory: input.reviewHistory,
    lessonCardLinks: input.lessonCards,
    protectedCardIds: protectedCardIds(
      input.lineageIdMappings ?? [],
      input.pendingMergeReviews ?? [],
    ),
  });
  const removed = new Set(migration.removedCardIds);
  const removedLinkIds = new Set(migration.removedLessonCardLinkIds);
  const removedExposureIds = new Set(
    (input.lessonCardExposures ?? [])
      .filter((row) => removed.has(row.cardId))
      .map((row) => `${row.lessonId}:${row.cardId}`),
  );
  const affectedCourseIds = new Set(
    input.cards.flatMap((card) => (removed.has(card.id) && card.courseId ? [card.courseId] : [])),
  );
  const affectedUnitIds = new Set(
    input.cards.flatMap((card) =>
      removed.has(card.id) && card.schedulingUnitId ? [card.schedulingUnitId] : [],
    ),
  );
  const removedMilestoneIds = new Set(
    (input.practiceMilestones ?? [])
      .filter((row) => affectedCourseIds.has(row.courseId))
      .map((row) => row.nodeKey),
  );
  const reviews = (input.reviewHistory ?? []).filter((entry) => !removed.has(entry.cardId));
  const removedEventIds = new Set([
    ...(input.reviewHistory ?? [])
      .filter((entry) => removed.has(entry.cardId))
      .flatMap((entry) => (entry.eventId ? [entry.eventId] : [])),
    ...input.cards
      .filter((card) => removed.has(card.id))
      .flatMap((card) => card.history.flatMap((entry) => (entry.eventId ? [entry.eventId] : []))),
  ]);
  const generatedTombstones = migrationTombstones(
    input,
    migration.removedCardIds,
    removedLinkIds,
    removedExposureIds,
    removedMilestoneIds,
  );

  return {
    ...input,
    version: 11,
    // validateBackup has already constrained every incoming payload to ItemPayload;
    // the pure migration deliberately accepts unknown at its legacy boundary.
    cards: migration.cards as BackupFile['cards'],
    concepts: migration.concepts,
    questions: migration.questions,
    questionConcepts: migration.questionConcepts,
    questionAttempts: migration.attempts,
    reviewHistory: reviews,
    lessonCards: (input.lessonCards ?? []).filter((row) => !removedLinkIds.has(row.id)),
    lessonCardExposures: (input.lessonCardExposures ?? []).filter(
      (row) => !removed.has(row.cardId),
    ),
    sessionHistory: input.sessionHistory.filter(
      (row) => !row.eventId || !removedEventIds.has(row.eventId),
    ),
    practiceMilestones: (input.practiceMilestones ?? []).filter(
      (row) => !removedMilestoneIds.has(row.nodeKey),
    ),
    courseAssessments: input.courseAssessments?.map(
      (assessment): CourseAssessment => ({
        ...assessment,
        excludedCardIds: (assessment.excludedCardIds ?? []).filter((id) => !removed.has(id)),
      }),
    ),
    revisionPlans: input.revisionPlans?.map((plan) => removeCardIdsFromRevisionPlan(plan, removed)),
    coursePerformance: rebuildCoursePerformance(
      input.coursePerformance ?? [],
      reviews,
      affectedCourseIds,
    ),
    schedulingPerformance: rebuildSchedulingPerformance(
      input.schedulingPerformance ?? [],
      reviews,
      affectedUnitIds,
    ),
    tombstones: [...(input.tombstones ?? []), ...generatedTombstones],
  };
}
