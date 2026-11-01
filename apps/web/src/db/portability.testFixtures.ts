import { db } from './schema';
import type { BackupFile } from './types';

export async function reset() {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
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
    db.agentMemories.clear(),
    db.tombstones.clear(),
  ]);
}

export async function waitForSessionHistory(eventId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await db.sessionHistory.where('eventId').equals(eventId).count()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for session history ${eventId}.`);
}

export function preV22Backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 9,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    ...overrides,
  };
}
