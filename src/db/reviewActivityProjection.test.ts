import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveQuery, type DBCore, type Middleware } from 'dexie';
import { db } from './schema';
import type { ReviewHistoryEntry } from './reviewHistory';

function entry(id: string, cardId: string, timestamp: number): ReviewHistoryEntry {
  return {
    id,
    cardId,
    timestamp,
    grade: 3,
    responseTimeSec: 1,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

describe('review activity projection middleware', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('tracks add, put, delete and duplicate timestamps', async () => {
    await db.reviewHistory.bulkAdd([entry('one', 'card-1', 100), entry('two', 'card-1', 100)]);
    expect(await db.reviewActivity.get('card-1')).toEqual({
      cardId: 'card-1',
      timestamps: [100, 100],
    });

    await db.reviewHistory.put(entry('one', 'card-2', 200));
    expect(await db.reviewActivity.get('card-1')).toEqual({ cardId: 'card-1', timestamps: [100] });
    expect(await db.reviewActivity.get('card-2')).toEqual({ cardId: 'card-2', timestamps: [200] });

    await db.reviewHistory.delete('two');
    expect(await db.reviewActivity.get('card-1')).toBeUndefined();
  });

  it('serialises concurrent writes in one transaction', async () => {
    await db.transaction('rw', db.reviewHistory, async () => {
      await Promise.all([
        db.reviewHistory.add(entry('one', 'card-1', 100)),
        db.reviewHistory.add(entry('two', 'card-1', 200)),
      ]);
    });

    expect((await db.reviewActivity.get('card-1'))?.timestamps).toEqual([100, 200]);
  });

  it('projects only successful rows from a partially failed bulk add', async () => {
    await db.reviewHistory.add(entry('existing', 'card-1', 50));

    await expect(
      db.reviewHistory.bulkAdd([
        entry('one', 'card-1', 100),
        entry('existing', 'card-1', 150),
        entry('three', 'card-2', 300),
      ]),
    ).rejects.toMatchObject({ name: 'BulkError' });

    expect((await db.reviewActivity.get('card-1'))?.timestamps).toEqual([50, 100]);
    expect((await db.reviewActivity.get('card-2'))?.timestamps).toEqual([300]);
  });

  it('uses the last successful value when bulk put repeats a primary key', async () => {
    await db.reviewHistory.add(entry('same', 'card-1', 50));

    await db.reviewHistory.bulkPut([entry('same', 'card-1', 100), entry('same', 'card-2', 200)]);

    expect(await db.reviewActivity.get('card-1')).toBeUndefined();
    expect(await db.reviewActivity.get('card-2')).toEqual({
      cardId: 'card-2',
      timestamps: [200],
    });
  });

  it('removes activity once when bulk delete repeats a primary key', async () => {
    await db.reviewHistory.add(entry('same', 'card-1', 50));

    await db.reviewHistory.bulkDelete(['same', 'same']);

    expect(await db.reviewActivity.get('card-1')).toBeUndefined();
  });

  it('aborts the transaction when a caught projection write fails', async () => {
    db.close();
    const failureMiddleware: Middleware<DBCore> = {
      stack: 'dbcore',
      name: 'FailReviewActivityWrites',
      level: 0.25,
      create(core) {
        return {
          ...core,
          table(name) {
            const table = core.table(name);
            return name === 'reviewActivity'
              ? {
                  ...table,
                  mutate() {
                    return Promise.reject(new Error('forced projection failure'));
                  },
                }
              : table;
          },
        };
      },
    };
    db.use(failureMiddleware);
    await db.open();

    try {
      await expect(
        db.transaction('rw', db.reviewHistory, async () => {
          await db.reviewHistory.add(entry('one', 'card-1', 100)).catch(() => undefined);
        }),
      ).rejects.toBeDefined();
      expect(await db.reviewHistory.get('one')).toBeUndefined();
    } finally {
      db.close();
      db.unuse({ stack: 'dbcore', name: 'FailReviewActivityWrites' });
      await db.open();
    }
  });

  it('tracks range deletion and clear', async () => {
    await db.reviewHistory.bulkAdd([
      entry('a', 'card-1', 100),
      entry('b', 'card-1', 200),
      entry('c', 'card-2', 300),
    ]);
    await db.reviewHistory.where(':id').between('a', 'b', true, true).delete();
    expect(await db.reviewActivity.get('card-1')).toBeUndefined();
    expect(await db.reviewActivity.get('card-2')).toBeDefined();

    await db.reviewHistory.clear();
    expect(await db.reviewActivity.count()).toBe(0);
  });

  it('tracks collection modifications through the middleware stack', async () => {
    await db.reviewHistory.bulkAdd([entry('a', 'card-1', 100), entry('b', 'card-1', 200)]);

    await db.reviewHistory.where('cardId').equals('card-1').modify({ timestamp: 400 });

    expect((await db.reviewActivity.get('card-1'))?.timestamps).toEqual([400, 400]);
  });

  it('rolls back canonical and derived writes when the transaction aborts', async () => {
    await expect(
      db.transaction('rw', db.reviewHistory, async (tx) => {
        await db.reviewHistory.add(entry('one', 'card-1', 100));
        tx.abort();
      }),
    ).rejects.toBeDefined();

    expect(await db.reviewHistory.count()).toBe(0);
    expect(await db.reviewActivity.count()).toBe(0);
  });

  it('invalidates live queries after derived writes', async () => {
    const values: number[] = [];
    const subscription = liveQuery(() => db.reviewActivity.count()).subscribe((count) =>
      values.push(count),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await db.reviewHistory.add(entry('one', 'card-1', 100));
    await new Promise((resolve) => setTimeout(resolve, 0));
    subscription.unsubscribe();

    expect(values).toEqual([0, 1]);
  });
});
