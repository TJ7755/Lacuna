import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { defaultFsrsParameters } from '../fsrs/params';

beforeEach(async () => {
  await db.delete();
});
afterEach(async () => {
  await db.delete();
});

it.each([1, 8])(
  'round-trips a v%i profile through the current schema and JSON backup',
  async (version) => {
    const legacy = new Dexie('lacuna');
    legacy.version(version).stores({
      decks: version === 1 ? 'id, createdAt, examDate' : 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      ...(version === 8
        ? {
            backups: '++id, createdAt',
            appState: 'key',
            assets: 'hash, createdAt',
            folders: 'id, parentId, createdAt',
          }
        : {}),
    });
    await legacy.open();
    const image = new Uint8Array(readFileSync('public/icons/icon-192.png'));
    const hash = createHash('sha256').update(image).digest('hex');
    const front =
      version === 8 ? `Diagram ![diagram](lacuna-asset://${hash})` : 'Capital of Japan?';
    const history = [
      {
        timestamp: 100,
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        stabilityBefore: null,
        stabilityAfter: 2,
        difficultyBefore: null,
        difficultyAfter: 5,
        retrievabilityAtReview: null,
      },
    ];
    await legacy.table('decks').add({
      id: 'old-deck',
      name: 'Historical course',
      createdAt: 1,
      examDate: 2000,
      ...(version === 8
        ? {
            fsrsVersion: 6,
            fsrsParameters: defaultFsrsParameters(),
            examObjective: 'expectedMarks',
          }
        : {}),
    });
    await legacy.table('cards').add({
      id: 'old-card',
      deckId: 'old-deck',
      type: 'front_back',
      front,
      back: 'Tokyo',
      stability: 2,
      difficulty: 5,
      lastReviewed: 100,
      history,
      createdAt: 1,
      ...(version === 8
        ? {
            reps: 1,
            lapses: 0,
            state: 2,
            due: 1000,
            scheduledDays: 1,
            learningSteps: 0,
            tags: ['geography'],
            suspended: false,
            buriedUntil: null,
          }
        : {}),
    });
    if (version === 8) {
      await legacy
        .table('assets')
        .add({ hash, blob: image, mimeType: 'image/png', width: 192, height: 192, createdAt: 1 });
    }
    legacy.close();

    await db.open();
    const exported = JSON.parse(JSON.stringify(await exportDatabase()));
    expect(validateBackup(exported)).toBe(true);
    expect(exported.courses).toHaveLength(1);
    expect(exported.lessons).toHaveLength(1);
    expect(exported.cards).toHaveLength(1);
    expect(exported.cards[0]).toMatchObject({
      id: 'old-card',
      front,
      back: 'Tokyo',
      stability: 2,
      difficulty: 5,
      lastReviewed: 100,
      reps: 1,
    });
    expect(exported.reviewHistory).toHaveLength(1);
    expect(exported.reviewHistory[0]).toMatchObject(history[0]);
    expect(exported.assets).toHaveLength(version === 8 ? 1 : 0);
    if (version === 8) expect(exported.assets[0].data).toBe(Buffer.from(image).toString('base64'));

    await db.delete();
    await db.open();
    expect(await db.cards.count()).toBe(0);
    await importBackup(exported, 'replace');
    db.close();
    await db.open();
    const restored = JSON.parse(JSON.stringify(await exportDatabase()));
    // Restore deliberately retires legacy-deck units. All live card ownership
    // must already point to the Course/Lesson units before that normalisation.
    const schedulingUnits = exported.schedulingUnits.filter(
      (unit: { id: string; kind: string }) => {
        if (unit.kind !== 'legacy-deck') return true;
        expect(
          exported.cards.some(
            (card: { schedulingUnitId: string }) => card.schedulingUnitId === unit.id,
          ),
        ).toBe(false);
        expect(
          exported.reviewHistory.some(
            (entry: { schedulingUnitId: string }) => entry.schedulingUnitId === unit.id,
          ),
        ).toBe(false);
        return false;
      },
    );
    expect({ ...restored, exportedAt: 0 }).toEqual({ ...exported, schedulingUnits, exportedAt: 0 });
  },
);
