import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import { createCard, createCourse, createLesson, createNote } from './repository';
import { exportDatabase, importBackup } from './portability';
import { reviewHistoryEntryIdForEvent, type ReviewHistoryEntry } from './reviewHistory';
import type { BackupFile } from './types';

async function backupWithHistory(): Promise<BackupFile> {
  const course = await createCourse('History batches');
  const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
  const backup = await exportDatabase();
  const reviewHistory: ReviewHistoryEntry[] = Array.from({ length: 2_001 }, (_, index) => {
    const eventId = `batch-event-${index}`;
    return {
      id: reviewHistoryEntryIdForEvent(eventId),
      eventId,
      cardId: card.id,
      courseId: course.id,
      schedulingUnitId: card.schedulingUnitId,
      timestamp: index + 1,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
  });
  return { ...backup, reviewHistory };
}

describe('backup application atomicity', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['replace', 'merge'] as const)(
    'retains every review identity across the history batch boundary in %s mode',
    async (mode) => {
      const backup = await backupWithHistory();
      const writes = vi.spyOn(db.reviewHistory, 'bulkAdd');

      await importBackup(backup, mode);

      expect(writes.mock.calls.map(([rows]) => rows.length)).toEqual([2_000, 1]);
      const byId = (left: ReviewHistoryEntry, right: ReviewHistoryEntry) =>
        left.id.localeCompare(right.id);
      expect((await db.reviewHistory.toArray()).sort(byId)).toEqual(
        [...backup.reviewHistory!].sort(byId),
      );
      expect(await db.reviewHistory.count()).toBe(2_001);
      expect((await db.cards.toArray())[0].history).toEqual([]);
    },
  );

  // fake-indexeddb scans index entries while undoing each of the 2,000 inserted rows.
  it.each(['replace', 'merge'] as const)(
    'rolls back every table when a later history batch fails in %s mode',
    async (mode) => {
      const backup = await backupWithHistory();
      const localCourse = await createCourse('Local content');
      const lesson = await createLesson(localCourse.id, 'Local lesson');
      await createNote(lesson.id, 'Local note', 'Keep this content.');
      const before = await Promise.all(db.tables.map((table) => table.toArray()));
      const writeBatch = db.reviewHistory.bulkAdd.bind(db.reviewHistory);
      const writes = vi
        .spyOn(db.reviewHistory, 'bulkAdd')
        .mockImplementationOnce(writeBatch)
        .mockRejectedValueOnce(new Error('Second history batch failed.'));

      await expect(importBackup(backup, mode)).rejects.toThrow('Second history batch failed.');

      expect(writes.mock.calls.map(([rows]) => rows.length)).toEqual([2_000, 1]);
      expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
    },
    30_000,
  );
});
