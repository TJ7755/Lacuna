import type { Transaction } from 'dexie';
import Dexie from 'dexie';
import type {
  SessionHistoryEntry,
  CourseAssessment,
  LessonCardLink,
  LessonCardExposure,
  PracticeNode,
  PracticeMilestone,
  RevisionPlan,
  LineageIdMapping,
  PendingMergeReview,
  CoursePerformance,
  SchedulingPerformance,
  Tombstone,
} from '@lacuna/core/db/types';
import { type ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';

export async function upgradeQuestionStorage(tx: Transaction): Promise<void> {
  const cards = await tx.table('cards').toArray();
  const reviewHistory = (await tx.table('reviewHistory').toArray()) as ReviewHistoryEntry[];
  const lessonCardLinks = (await tx.table('lessonCards').toArray()) as LessonCardLink[];
  const exposures = (await tx.table('lessonCardExposures').toArray()) as LessonCardExposure[];
  const lineageMappings = (await tx.table('lineageIdMappings').toArray()) as LineageIdMapping[];
  const pendingReviews = (await tx.table('pendingMergeReviews').toArray()) as PendingMergeReview[];

  // A structured Card participating in unresolved distributed-course state cannot
  // be translated without also changing the lineage protocol. Preserve it as a
  // compatibility Card until that merge is resolved instead of losing the work.
  const protectedCardIds = new Set(lineageMappings.flatMap((mapping) => mapping.cardIds));
  for (const pending of pendingReviews) {
    pending.diff.creates.cards.forEach((card) => protectedCardIds.add(card.id));
    pending.diff.updates.cards.forEach((update) => protectedCardIds.add(update.id));
    pending.diff.removals.cardIds.forEach((id) => protectedCardIds.add(id));
    pending.diff.conflicts.forEach((conflict) => {
      if (conflict.kind === 'card') protectedCardIds.add(conflict.entityId);
    });
  }

  // The question migration carries the expression verifier and mathjs. It is
  // needed only when v24 actually upgrades an existing database, not on every
  // launch. Dexie.waitFor keeps the versionchange transaction alive while the
  // optional module is fetched.
  const { migrateQuestionModeContent } = await Dexie.waitFor(import('../questions/domain'));
  const migration = migrateQuestionModeContent({
    cards,
    reviewHistory,
    lessonCardLinks,
    protectedCardIds,
  });

  await tx.table('concepts').bulkPut(migration.concepts);
  await tx.table('questions').bulkPut(migration.questions);
  await tx.table('questionConcepts').bulkPut(migration.questionConcepts);
  await tx.table('questionAttempts').bulkPut(migration.attempts);
  await tx.table('cards').bulkPut(migration.cards);

  const removed = new Set(migration.removedCardIds);
  const removedReviews = reviewHistory.filter((entry) => removed.has(entry.cardId));
  const removedExposures = exposures.filter((entry) => removed.has(entry.cardId));
  const removedLinks = lessonCardLinks.filter((entry) => removed.has(entry.cardId));
  await tx.table('cards').bulkDelete(migration.removedCardIds);
  await tx.table('reviewHistory').bulkDelete(migration.removedReviewHistoryIds);
  await tx.table('lessonCards').bulkDelete(removedLinks.map((entry) => entry.id));
  await tx
    .table('lessonCardExposures')
    .bulkDelete(removedExposures.map((entry) => [entry.lessonId, entry.cardId]));

  const removedEventIds = new Set(
    removedReviews.flatMap((entry) => (entry.eventId ? [entry.eventId] : [])),
  );
  if (removedEventIds.size > 0) {
    await tx
      .table('sessionHistory')
      .filter(
        (entry: SessionHistoryEntry) =>
          typeof entry.eventId === 'string' && removedEventIds.has(entry.eventId),
      )
      .delete();
  }

  if (removed.size > 0) {
    await tx
      .table('courseAssessments')
      .toCollection()
      .modify((assessment: CourseAssessment) => {
        assessment.excludedCardIds = (assessment.excludedCardIds ?? []).filter(
          (id) => !removed.has(id),
        );
      });
    await tx
      .table('revisionPlans')
      .toCollection()
      .modify((plan: RevisionPlan) => {
        if (!plan.scope || !Array.isArray(plan.cardStates)) return;
        plan.scope.excludedCardIds = (plan.scope.excludedCardIds ?? []).filter(
          (id) => !removed.has(id),
        );
        plan.scope.eligibleCardIds = (plan.scope.eligibleCardIds ?? []).filter(
          (id) => !removed.has(id),
        );
        plan.scope.unavailableCardIds = (plan.scope.unavailableCardIds ?? []).filter(
          (id) => !removed.has(id),
        );
        plan.cardStates = plan.cardStates.filter((state) => !removed.has(state.cardId));
        if (plan.pendingReplan?.scope && Array.isArray(plan.pendingReplan.cardStates)) {
          plan.pendingReplan.scope.excludedCardIds = (
            plan.pendingReplan.scope.excludedCardIds ?? []
          ).filter((id) => !removed.has(id));
          plan.pendingReplan.scope.eligibleCardIds = (
            plan.pendingReplan.scope.eligibleCardIds ?? []
          ).filter((id) => !removed.has(id));
          plan.pendingReplan.scope.unavailableCardIds = (
            plan.pendingReplan.scope.unavailableCardIds ?? []
          ).filter((id) => !removed.has(id));
          plan.pendingReplan.cardStates = plan.pendingReplan.cardStates.filter(
            (state) => !removed.has(state.cardId),
          );
        }
      });
  }

  const affectedCourseIds = new Set(
    cards.flatMap((card) => (removed.has(card.id) && card.courseId ? [card.courseId] : [])),
  );
  const affectedSchedulingUnitIds = new Set(
    cards.flatMap((card) =>
      removed.has(card.id) && card.schedulingUnitId ? [card.schedulingUnitId] : [],
    ),
  );
  const removedMilestones = (
    (await tx.table('practiceMilestones').toArray()) as PracticeMilestone[]
  ).filter((milestone) => affectedCourseIds.has(milestone.courseId));
  await tx
    .table('practiceMilestones')
    .bulkDelete(removedMilestones.map((milestone) => milestone.nodeKey));

  const remainingReviews = reviewHistory.filter((entry) => !removed.has(entry.cardId));
  const performance = (entries: ReviewHistoryEntry[]) => {
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
  };
  await tx
    .table('coursePerformance')
    .toCollection()
    .modify((row: CoursePerformance) => {
      if (!affectedCourseIds.has(row.courseId)) return;
      Object.assign(
        row,
        performance(remainingReviews.filter((entry) => entry.courseId === row.courseId)),
      );
    });
  await tx
    .table('schedulingPerformance')
    .toCollection()
    .modify((row: SchedulingPerformance) => {
      if (!affectedSchedulingUnitIds.has(row.schedulingUnitId)) return;
      Object.assign(
        row,
        performance(
          remainingReviews.filter((entry) => entry.schedulingUnitId === row.schedulingUnitId),
        ),
      );
    });

  const tombstones: Tombstone[] = [
    ...migration.removedCardIds.map((id) => {
      const source = cards.find((card) => card.id === id);
      return {
        table: 'cards',
        recordId: id,
        deletedAt: source?.updatedAt ?? source?.createdAt ?? 0,
      };
    }),
    ...removedLinks.map((entry) => ({
      table: 'lessonCards',
      recordId: entry.id,
      deletedAt: entry.updatedAt ?? entry.createdAt,
    })),
    ...removedExposures.map((entry) => ({
      table: 'lessonCardExposures',
      recordId: `${entry.lessonId}:${entry.cardId}`,
      deletedAt: entry.updatedAt ?? entry.taughtAt,
    })),
    ...removedMilestones.map((entry) => ({
      table: 'practiceMilestones',
      recordId: entry.nodeKey,
      deletedAt: entry.updatedAt,
    })),
  ];
  await tx.table('tombstones').bulkPut(tombstones);
}

export async function upgradeQuestionSetActivities(tx: Transaction): Promise<void> {
  const { parseQuestionSetPracticeNode, normalisePracticeNodeLineage } = await Dexie.waitFor(
    import('./questionSetPracticeNode'),
  );
  await tx
    .table<PracticeNode, string>('practiceNodes')
    .toCollection()
    .modify((node, ref) => {
      if (node.type === 'question-set') ref.value = parseQuestionSetPracticeNode(node);
    });
  await tx
    .table<LineageIdMapping, string>('lineageIdMappings')
    .toCollection()
    .modify((mapping, ref) => {
      ref.value = normalisePracticeNodeLineage(mapping);
    });
}
