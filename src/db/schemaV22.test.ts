import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';

const v21Stores = {
  decks: 'id, createdAt, examDate, folderId',
  folders: 'id, parentId, createdAt',
  cards: 'id, deckId, courseId, primaryLessonId, schedulingUnitId, type, lastReviewed',
  reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, schedulingUnitId, timestamp',
  schedulingUnits: 'id, kind, courseId, lessonId',
};

async function createV21Database(cardSchedulingUnitId: string): Promise<void> {
  const legacy = new Dexie('lacuna');
  legacy.version(21).stores(v21Stores);
  await legacy.open();
  await legacy.table('decks').add({
    id: 'deck-1',
    name: 'Legacy deck',
    createdAt: 1,
    examDate: 10,
  });
  await legacy.table('folders').add({
    id: 'folder-1',
    name: 'Legacy folder',
    parentId: null,
    createdAt: 1,
  });
  await legacy.table('schedulingUnits').add({
    id: 'unit-1',
    kind: 'course',
    courseId: 'course-1',
    lessonId: null,
  });
  await legacy.table('cards').add({
    id: 'card-1',
    deckId: 'deck-1',
    schedulingUnitId: cardSchedulingUnitId,
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 1,
  });
  await legacy.table('reviewHistory').bulkAdd([
    {
      id: 'review:event-2',
      eventId: 'event-2',
      cardId: 'card-1',
      deckId: 'deck-1',
      schedulingUnitId: 'unit-1',
      timestamp: 20,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: 1,
      stabilityAfter: 2,
      difficultyBefore: 5,
      difficultyAfter: 5,
      retrievabilityAtReview: 0.8,
    },
    {
      id: 'review:event-1',
      eventId: 'event-1',
      cardId: 'card-1',
      deckId: 'deck-1',
      schedulingUnitId: 'unit-1',
      timestamp: 10,
      grade: 2,
      responseTimeSec: 4,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    },
  ]);
  legacy.close();
}

describe('schema v22 legacy-store removal', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  it('aborts the upgrade and leaves v21 readable when a card has a dangling unit', async () => {
    await createV21Database('missing-unit');

    await expect(db.open()).rejects.toThrow(
      'Cannot remove legacy storage: card card-1 has no valid scheduling unit',
    );
    db.close();

    const unchanged = new Dexie('lacuna');
    unchanged.version(21).stores(v21Stores);
    await unchanged.open();
    expect(unchanged.verno).toBe(21);
    expect(await unchanged.table('decks').get('deck-1')).toMatchObject({ name: 'Legacy deck' });
    expect(await unchanged.table('folders').get('folder-1')).toMatchObject({
      name: 'Legacy folder',
    });
    expect(await unchanged.table('cards').get('card-1')).toMatchObject({
      schedulingUnitId: 'missing-unit',
    });
    expect(await unchanged.table('reviewHistory').toArray()).toHaveLength(2);
    unchanged.close();
  });

  it('drops only the legacy stores and preserves review events byte-for-byte', async () => {
    await createV21Database('unit-1');
    const before = new Dexie('lacuna');
    before.version(21).stores(v21Stores);
    await before.open();
    const reviewEvents = await before.table('reviewHistory').toArray();
    before.close();

    await db.open();

    expect(db.tables.map((table) => table.name)).not.toContain('decks');
    expect(db.tables.map((table) => table.name)).not.toContain('folders');
    expect(await db.reviewHistory.toArray()).toEqual(reviewEvents);
  });
});
