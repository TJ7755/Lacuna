import 'fake-indexeddb/auto';
import { db } from './schema';

export async function clearAll(): Promise<void> {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.revisionPlans.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.reviewHistory.clear(),
  ]);
}
