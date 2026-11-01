import 'fake-indexeddb/auto';
import { expect, vi } from 'vitest';
import { db } from './schema';

export async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.noteAnnotations.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.userPerformance.clear(),
    db.sessionHistory.clear(),
    db.sequences.clear(),
    db.reviewHistory.clear(),
    db.revisionPlans.clear(),
    db.concepts.clear(),
    db.questions.clear(),
    db.questionConcepts.clear(),
    db.questionAttempts.clear(),
    db.lineageIdMappings.clear(),
    db.pendingMergeReviews.clear(),
    db.tombstones.clear(),
  ]);
}

export async function waitForSessionHistory(eventId: string): Promise<void> {
  await vi.waitFor(async () => {
    expect(await db.sessionHistory.where('eventId').equals(eventId).count()).toBeGreaterThan(0);
  });
}
