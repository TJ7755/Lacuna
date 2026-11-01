import type { Transaction } from 'dexie';
import { makeId } from '../utils/id';
import Dexie from 'dexie';
import type {
  LegacyDeckRecord,
  LegacyFolder,
  Card,
  MediaAsset,
  Lesson,
} from '@lacuna/core/db/types';
import {
  migrateCardRecord,
  migrateDeckRecord,
  buildLessonCardExposureBackfill,
  type LegacyCard,
  type LegacyDeck,
} from './migrations';
import { buildCourseMigration } from './courseMigration';
import {
  buildCourseAssessmentMigration,
  type LegacyAssessmentRecord,
  type LegacyCourseRecord,
} from './assessmentMigration';

export async function upgradeLegacyFsrs(tx: Transaction): Promise<void> {
  await tx
    .table('decks')
    .toCollection()
    .modify((deck) => {
      Object.assign(deck, migrateDeckRecord(deck as LegacyDeck));
    });
  await tx
    .table('cards')
    .toCollection()
    .modify((card) => {
      Object.assign(card, migrateCardRecord(card as LegacyCard));
    });
}

export async function upgradeLegacyCardFlags(tx: Transaction): Promise<void> {
  await tx
    .table('cards')
    .toCollection()
    .modify((card) => {
      Object.assign(card, migrateCardRecord(card as LegacyCard));
    });
}

export async function upgradeLegacyMarkdownAssets(
  tx: Transaction,
  getAsset: (hash: string) => Promise<MediaAsset | undefined>,
): Promise<void> {
  const { extractMarkdownAssets: extract } = await Dexie.waitFor(
    import('./markdownAssetExtraction'),
  );
  const extractMarkdownAssets = (
    markdown: string,
    putAsset: (asset: MediaAsset) => Promise<unknown>,
  ) => extract(markdown, putAsset, getAsset);
  // Process cards in small batches so we never load the whole table into
  // memory at once. Async extraction happens per-card, keeping the upgrade safe.
  const table = tx.table('cards');
  let offset = 0;
  const batchSize = 50;
  for (;;) {
    const batch = await table.offset(offset).limit(batchSize).toArray();
    if (batch.length === 0) break;
    for (const card of batch) {
      const front = await extractMarkdownAssets(card.front ?? '', (asset) =>
        tx.table('assets').put(asset),
      );
      const back = await extractMarkdownAssets(card.back ?? '', (asset) =>
        tx.table('assets').put(asset),
      );
      const migrated = { ...card, front, back };
      Object.assign(migrated, migrateCardRecord(migrated as LegacyCard));
      await table.put(migrated);
    }
    offset += batchSize;
  }
}

export async function upgradeLegacySchedulingControls(tx: Transaction): Promise<void> {
  await tx
    .table('decks')
    .toCollection()
    .modify((deck) => {
      Object.assign(deck, migrateDeckRecord(deck as LegacyDeck));
    });
  await tx
    .table('cards')
    .toCollection()
    .modify((card) => {
      Object.assign(card, migrateCardRecord(card as LegacyCard));
    });
}

export async function upgradeLegacyCourses(tx: Transaction): Promise<void> {
  const decks = (await tx.table('decks').toArray()) as LegacyDeckRecord[];
  const folders = (await tx.table('folders').toArray()) as LegacyFolder[];
  const { courses, lessons, courseIdByDeckId, lessonIdByDeckId } = buildCourseMigration(
    decks,
    folders,
    makeId,
  );

  await tx.table('courses').bulkPut(courses);
  await tx.table('lessons').bulkPut(lessons);

  // Stamp the derived courseId/primaryLessonId onto every card.
  await tx
    .table('cards')
    .toCollection()
    .modify((card) => {
      const courseId = courseIdByDeckId.get(card.deckId);
      if (courseId !== undefined) {
        card.courseId = courseId;
        card.primaryLessonId = lessonIdByDeckId.get(card.deckId) ?? null;
      }
    });

  // Carry the derived courseId onto session history and performance rows.
  await tx
    .table('sessionHistory')
    .toCollection()
    .modify((entry) => {
      const courseId = courseIdByDeckId.get(entry.deckId);
      if (courseId !== undefined) entry.courseId = courseId;
    });
  await tx
    .table('userPerformance')
    .toCollection()
    .modify((perf) => {
      const courseId = courseIdByDeckId.get(perf.deckId);
      if (courseId !== undefined) perf.courseId = courseId;
    });
}

export async function upgradeLessonExposures(tx: Transaction): Promise<void> {
  const exposures = buildLessonCardExposureBackfill((await tx.table('cards').toArray()) as Card[]);
  if (exposures.length > 0) {
    await tx.table('lessonCardExposures').bulkPut(exposures);
  }
}

export async function upgradeTypedCards(tx: Transaction): Promise<void> {
  await tx
    .table('cards')
    .where('type')
    .equals('typing')
    .modify((card) => {
      card.type = 'front_back';
    });
}

export async function upgradeCourseAssessments(tx: Transaction): Promise<void> {
  const migration = buildCourseAssessmentMigration(
    (await tx.table('courses').toArray()) as LegacyCourseRecord[],
    (await tx.table('lessons').toArray()) as Lesson[],
    (await tx.table('courseExamDates').toArray()) as LegacyAssessmentRecord[],
    makeId,
  );
  await tx.table('courses').bulkPut(migration.courses);
  if (migration.assessments.length > 0) {
    await tx.table('courseAssessments').bulkPut(migration.assessments);
  }
}
