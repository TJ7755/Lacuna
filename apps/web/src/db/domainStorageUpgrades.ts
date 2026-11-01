import type { Transaction } from 'dexie';
import type {
  LegacyDeckRecord,
  Card,
  UserPerformance,
  CourseRecord,
  CourseAssessment,
  Lesson,
} from './types';
import { type ReviewHistoryEntry } from './reviewHistory';
import { buildDomainStorageMigration } from './storageMigration';

export async function upgradeDomainStorage(tx: Transaction): Promise<void> {
  const migration = buildDomainStorageMigration(
    (await tx.table('courses').toArray()) as CourseRecord[],
    (await tx.table('lessons').toArray()) as Lesson[],
    (await tx.table('courseAssessments').toArray()) as CourseAssessment[],
    (await tx.table('decks').toArray()) as LegacyDeckRecord[],
    (await tx.table('cards').toArray()) as Card[],
    (await tx.table('userPerformance').toArray()) as UserPerformance[],
  );
  await tx.table('schedulingUnits').bulkPut(migration.schedulingUnits);
  await tx.table('coursePerformance').bulkPut(migration.coursePerformance);
  await tx.table('schedulingPerformance').bulkPut(migration.schedulingPerformance);

  await tx
    .table('cards')
    .toCollection()
    .modify((card) => {
      const schedulingUnitId = migration.schedulingUnitByCardId.get(card.id);
      if (schedulingUnitId) card.schedulingUnitId = schedulingUnitId;
    });
  const schedulingUnitIds = new Set(migration.schedulingUnits.map((unit) => unit.id));
  const reviewUnitByEventId = new Map<string, string>();
  for (const entry of (await tx.table('reviewHistory').toArray()) as ReviewHistoryEntry[]) {
    if (entry.eventId) {
      const schedulingUnitId = migration.schedulingUnitByCardId.get(entry.cardId);
      if (schedulingUnitId) reviewUnitByEventId.set(entry.eventId, schedulingUnitId);
    }
  }
  await tx
    .table('reviewHistory')
    .toCollection()
    .modify((entry) => {
      const schedulingUnitId = migration.schedulingUnitByCardId.get(entry.cardId);
      if (schedulingUnitId) entry.schedulingUnitId = schedulingUnitId;
    });
  await tx
    .table('sessionHistory')
    .toCollection()
    .modify((entry) => {
      const schedulingUnitId =
        (entry.eventId ? reviewUnitByEventId.get(entry.eventId) : undefined) ??
        migration.schedulingUnitByDeckId.get(entry.deckId) ??
        (entry.courseId && schedulingUnitIds.has(entry.courseId) ? entry.courseId : undefined);
      if (schedulingUnitId) entry.schedulingUnitId = schedulingUnitId;
    });
}

export async function validateLegacyStorageRemoval(tx: Transaction): Promise<void> {
  const schedulingUnitIds = new Set<string>(
    (await tx.table('schedulingUnits').toCollection().primaryKeys()) as string[],
  );
  const cards = (await tx.table('cards').toArray()) as Card[];
  for (const card of cards) {
    if (!card.schedulingUnitId || !schedulingUnitIds.has(card.schedulingUnitId)) {
      throw new Error(`Cannot remove legacy storage: card ${card.id} has no valid scheduling unit`);
    }
  }
}

export async function upgradeMutationTimestamps(tx: Transaction): Promise<void> {
  const stampFromCreated = async (name: string) => {
    await tx
      .table(name)
      .toCollection()
      .modify((row: { createdAt?: number; updatedAt?: number }) => {
        if (typeof row.updatedAt !== 'number') row.updatedAt = row.createdAt ?? 0;
      });
  };
  await stampFromCreated('courses');
  await stampFromCreated('lessons');
  await stampFromCreated('notes');
  await stampFromCreated('lessonCards');
  await stampFromCreated('practiceNodes');
  await stampFromCreated('courseAssessments');
  await stampFromCreated('sequences');
  await stampFromCreated('occlusions');
  await stampFromCreated('noteAnnotations');
  await stampFromCreated('revisionPlans');
  await tx
    .table('lessonCardExposures')
    .toCollection()
    .modify((row: { taughtAt?: number; updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') row.updatedAt = row.taughtAt ?? 0;
    });
  await tx
    .table('lessonCompletions')
    .toCollection()
    .modify((row: { completedAt?: number; updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') row.updatedAt = row.completedAt ?? 0;
    });
  await tx
    .table('cards')
    .toCollection()
    .modify((row: { createdAt?: number; lastReviewed?: number | null; updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') {
        row.updatedAt = Math.max(row.createdAt ?? 0, row.lastReviewed ?? 0);
      }
    });
  await tx
    .table('schedulingUnits')
    .toCollection()
    .modify((row: { createdAt?: number; lastInteractedAt?: number; updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') {
        row.updatedAt = Math.max(row.createdAt ?? 0, row.lastInteractedAt ?? 0);
      }
    });
  await tx
    .table('coursePerformance')
    .toCollection()
    .modify((row: { updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') row.updatedAt = 0;
    });
  await tx
    .table('schedulingPerformance')
    .toCollection()
    .modify((row: { updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') row.updatedAt = 0;
    });
  await tx
    .table('practiceMilestones')
    .toCollection()
    .modify((row: { updatedAt?: number }) => {
      if (typeof row.updatedAt !== 'number') row.updatedAt = 0;
    });
}
