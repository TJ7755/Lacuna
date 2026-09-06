import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from './schema';
import { createCard, createCourse } from './repository';
import { exportDatabase, importBackup } from './portability';
import type { ReviewHistoryEntry } from './reviewHistory';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await db.delete();
});

async function largeBackup() {
  const course = await createCourse('Restore workload');
  const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
  const backup = await exportDatabase();
  backup.reviewHistory = Array.from({ length: 2_001 }, (_, index): ReviewHistoryEntry => ({
    id: `restore-event-${index}`,
    cardId: card.id,
    courseId: course.id,
    schedulingUnitId: card.schedulingUnitId,
    timestamp: 1_700_000_000_000 + index,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  }));
  return backup;
}

it.each(['replace', 'merge'] as const)(
  'imports a large history in %s mode without an unbounded batch of writes',
  async (mode) => {
    const backup = await largeBackup();
    const add = db.reviewHistory.bulkAdd.bind(db.reviewHistory);
    const put = db.reviewHistory.bulkPut.bind(db.reviewHistory);
    vi.spyOn(db.reviewHistory, 'bulkAdd').mockImplementation((async (
      rows: ReviewHistoryEntry[],
    ) => {
      expect(rows.length).toBeLessThanOrEqual(2_000);
      return add(rows);
    }) as typeof db.reviewHistory.bulkAdd);
    vi.spyOn(db.reviewHistory, 'bulkPut').mockImplementation((async (
      rows: ReviewHistoryEntry[],
    ) => {
      expect(rows.length).toBeLessThanOrEqual(2_000);
      return put(rows);
    }) as typeof db.reviewHistory.bulkPut);

    await importBackup(backup, mode);
    expect(await db.reviewHistory.count()).toBe(2_001);
  },
);

it('rolls back the whole replacement when a later review batch fails', async () => {
  const backup = await largeBackup();
  const previous = await createCourse('Existing local data');
  const add = db.reviewHistory.bulkAdd.bind(db.reviewHistory);
  let batches = 0;
  vi.spyOn(db.reviewHistory, 'bulkAdd').mockImplementation((async (rows: ReviewHistoryEntry[]) => {
    if (++batches === 2) throw new Error('Storage write failed');
    return add(rows);
  }) as typeof db.reviewHistory.bulkAdd);

  await expect(importBackup(backup, 'replace')).rejects.toThrow('Storage write failed');
  expect(await db.courses.get(previous.id)).toBeDefined();
  expect(await db.reviewHistory.count()).toBe(0);
});
