import { db } from './schema';
import { addReviewHistoryInBatches } from './addReviewHistoryInBatches';
import type { SessionHistoryEntry } from './types';
import type { PreparedBackup } from './backupPreparation';

/** Apply prepared rows within the caller-owned atomic write transaction. */
export async function replaceBackup(prepared: PreparedBackup): Promise<void> {
  const {
    backup,
    incomingQuestions,
    incomingQuestionSets,
    incomingQuestionSetAttempts,
    notes,
    courses,
    courseAssessments,
    storageProjection,
    agentMemories,
    storedCards,
    hydratedReviewHistory,
    sessionHistory,
    dedupedAssets,
  } = prepared;
  await Promise.all([
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.noteAnnotations.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.practiceNodes.clear(),
    db.practiceMilestones.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.occlusions.clear(),
    db.revisionPlans.clear(),
    db.reviewHistory.clear(),
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.tombstones.clear(),
    db.concepts.clear(),
    db.questions.clear(),
    db.questionConcepts.clear(),
    db.questionAttempts.clear(),
    db.questionSets.clear(),
    db.questionSetAttempts.clear(),
    db.lineageIdMappings.clear(),
    db.pendingMergeReviews.clear(),
    db.agentMemories.clear(),
  ]);
  await db.cards.bulkAdd(storedCards);
  if (dedupedAssets.length) await db.assets.bulkPut(dedupedAssets);
  await db.userPerformance.bulkAdd(backup.userPerformance);
  // Drop incoming auto-increment ids so they are reassigned cleanly.
  await db.sessionHistory.bulkAdd(
    sessionHistory.map(({ id: _id, ...rest }) => rest as SessionHistoryEntry),
  );
  // Restore course-architecture tables if present in the backup.
  if (courses.length > 0) {
    await db.courses.bulkAdd(courses);
  }
  if (backup.lessons && backup.lessons.length > 0) {
    await db.lessons.bulkAdd(backup.lessons);
  }
  if (notes.length > 0) {
    await db.notes.bulkAdd(notes);
  }
  if (backup.lessonCards && backup.lessonCards.length > 0) {
    await db.lessonCards.bulkAdd(backup.lessonCards);
  }
  if (backup.lessonCardExposures && backup.lessonCardExposures.length > 0) {
    await db.lessonCardExposures.bulkAdd(backup.lessonCardExposures);
  }
  if (backup.lessonCompletions && backup.lessonCompletions.length > 0) {
    await db.lessonCompletions.bulkAdd(backup.lessonCompletions);
  }
  if (backup.practiceNodes && backup.practiceNodes.length > 0) {
    await db.practiceNodes.bulkAdd(backup.practiceNodes);
  }
  if (backup.practiceMilestones && backup.practiceMilestones.length > 0) {
    await db.practiceMilestones.bulkAdd(backup.practiceMilestones);
  }
  if (courseAssessments.length > 0) {
    await db.courseAssessments.bulkAdd(courseAssessments);
  }
  if (backup.sequences && backup.sequences.length > 0) {
    await db.sequences.bulkAdd(backup.sequences);
  }
  if (backup.occlusions && backup.occlusions.length > 0) {
    await db.occlusions.bulkAdd(backup.occlusions);
  }
  if (backup.revisionPlans && backup.revisionPlans.length > 0) {
    await db.revisionPlans.bulkAdd(backup.revisionPlans);
  }
  if (hydratedReviewHistory.length > 0) {
    await addReviewHistoryInBatches(hydratedReviewHistory);
  }
  if (storageProjection.schedulingUnits.length > 0) {
    await db.schedulingUnits.bulkPut(storageProjection.schedulingUnits);
  }
  if (storageProjection.coursePerformance.length > 0) {
    await db.coursePerformance.bulkPut(storageProjection.coursePerformance);
  }
  if (storageProjection.schedulingPerformance.length > 0) {
    await db.schedulingPerformance.bulkPut(storageProjection.schedulingPerformance);
  }
  if (backup.tombstones && backup.tombstones.length > 0) {
    await db.tombstones.bulkAdd(backup.tombstones);
  }
  if (incomingQuestions.concepts.length > 0) {
    await db.concepts.bulkAdd(incomingQuestions.concepts);
  }
  if (incomingQuestions.questions.length > 0) {
    await db.questions.bulkAdd(incomingQuestions.questions);
  }
  if (incomingQuestions.questionConcepts.length > 0) {
    await db.questionConcepts.bulkAdd(incomingQuestions.questionConcepts);
  }
  if (incomingQuestions.questionAttempts.length > 0) {
    await db.questionAttempts.bulkAdd(incomingQuestions.questionAttempts);
  }
  if (incomingQuestionSets.length > 0) {
    await db.questionSets.bulkAdd(incomingQuestionSets);
  }
  if (incomingQuestionSetAttempts.length > 0) {
    await db.questionSetAttempts.bulkAdd(incomingQuestionSetAttempts);
  }
  if (backup.lineageIdMappings && backup.lineageIdMappings.length > 0) {
    await db.lineageIdMappings.bulkAdd(backup.lineageIdMappings);
  }
  if (backup.pendingMergeReviews && backup.pendingMergeReviews.length > 0) {
    await db.pendingMergeReviews.bulkAdd(backup.pendingMergeReviews);
  }
  if (agentMemories.length > 0) await db.agentMemories.bulkAdd(agentMemories);
}
