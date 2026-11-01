import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { assertValidBackup } from './backupValidation';
import { exportDatabase, importBackup } from './portability';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { schemaV27 } from './migrationFixtures';

beforeEach(async () => {
  await db.delete();
});
afterEach(async () => {
  await db.delete();
});

it.each([27, 28, 29, 30])(
  'round-trips a v%i profile through the current schema and JSON backup',
  async (version) => {
    const legacy = new Dexie('lacuna');
    legacy.version(version).stores({
      ...schemaV27,
      ...(version >= 28
        ? { questionSets: 'id, courseId, *lessonIds, *assessmentIds, updatedAt' }
        : {}),
      ...(version >= 29
        ? { questionSetAttempts: 'id, courseId, questionSetId, status, updatedAt' }
        : {}),
      ...(version >= 30
        ? { concepts: 'id, scopeKey, courseId, updatedAt, *specificationPointIds' }
        : {}),
    });
    await legacy.open();
    const image = new Uint8Array(readFileSync('public/icons/icon-192.png'));
    const hash = createHash('sha256').update(image).digest('hex');
    const front = `Diagram ![diagram](lacuna-asset://${hash})`;
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
    await legacy.table('courses').add({
      id: 'course-1',
      name: 'Historical course',
      description: '',
      unlockMode: 'open',
      autoPractice: false,
      practiceThresholdMinutesFar: 30,
      practiceThresholdMinutesNear: 15,
      practiceUrgentWindowDays: 7,
      practiceMaxGap: 3,
      fsrsVersion: 6,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      createdAt: 1,
    });
    await legacy.table('lessons').add({
      id: 'lesson-1',
      courseId: 'course-1',
      name: 'Lesson',
      isExtension: false,
      orderIndex: 0,
      createdAt: 1,
    });
    await legacy.table('schedulingUnits').add({
      id: 'lesson-1',
      kind: 'lesson',
      name: 'Lesson',
      fsrsVersion: 6,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      courseId: 'course-1',
      lessonId: 'lesson-1',
      createdAt: 1,
    });
    const course = await legacy.table('courses').get('course-1');
    await legacy.table('schedulingUnits').add({
      ...course,
      id: 'course-1',
      kind: 'course',
      courseId: 'course-1',
      lessonId: null,
      updatedAt: 1,
    });
    await legacy.table('schedulingUnits').update('lesson-1', { updatedAt: 1 });
    const performance = {
      m2: 0,
      runningMeanResponseTime: 0,
      runningStdDevResponseTime: 0,
      totalCorrectReviews: 0,
      updatedAt: 0,
    };
    await legacy.table('coursePerformance').add({ ...performance, courseId: 'course-1' });
    await legacy.table('schedulingPerformance').bulkAdd([
      { ...performance, schedulingUnitId: 'course-1', courseId: 'course-1' },
      { ...performance, schedulingUnitId: 'lesson-1', courseId: 'course-1', lessonId: 'lesson-1' },
    ]);
    await legacy.table('courseAssessments').add({
      id: 'final-1',
      courseId: 'course-1',
      name: 'Final',
      kind: 'final',
      afterLessonId: null,
      excludedCardIds: [],
      coverageMode: 'prefix',
      createdAt: 1,
    });
    await legacy.table('cards').add({
      id: 'old-card',
      conceptId: 'concept-1',
      updatedAt: 1,
      courseId: 'course-1',
      primaryLessonId: 'lesson-1',
      schedulingUnitId: 'lesson-1',
      type: 'front_back',
      front,
      back: 'Tokyo',
      stability: 2,
      difficulty: 5,
      lastReviewed: 100,
      history: [],
      createdAt: 1,
      reps: 1,
      lapses: 0,
      state: 2,
      due: 1000,
      scheduledDays: 1,
      learningSteps: 0,
      tags: ['geography'],
      suspended: false,
      buriedUntil: null,
    });
    await legacy
      .table('assets')
      .add({ hash, blob: image, mimeType: 'image/png', width: 192, height: 192, createdAt: 1 });
    await legacy
      .table('reviewHistory')
      .add({ ...history[0], id: 'review-1', cardId: 'old-card', schedulingUnitId: 'lesson-1' });
    legacy.close();

    await db.open();
    const exported = JSON.parse(JSON.stringify(await exportDatabase()));
    assertValidBackup(exported);
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
    expect(exported.reviewHistory![0]).toMatchObject(history[0]);
    expect(exported.assets).toHaveLength(1);
    expect(exported.assets[0].data).toBe(Buffer.from(image).toString('base64'));

    await db.delete();
    await db.open();
    expect(await db.cards.count()).toBe(0);
    await importBackup(exported, 'replace');
    db.close();
    await db.open();
    const restored = JSON.parse(JSON.stringify(await exportDatabase()));
    expect({ ...restored, exportedAt: 0 }).toEqual({ ...exported, exportedAt: 0 });
  },
);

it('refuses a below-floor database on a direct auto-open query', async () => {
  const source = new Dexie('lacuna');
  source.version(26).stores({ cards: 'id' });
  await source.open();
  await source.table('cards').add({ id: 'protected', front: 'Original data' });
  source.close();
  db.close({ disableAutoOpen: false });
  await expect(db.cards.count()).rejects.toThrow();
  const unchanged = new Dexie('lacuna');
  await unchanged.open();
  try {
    expect(unchanged.verno).toBe(26);
    expect(await unchanged.table('cards').get('protected')).toEqual({
      id: 'protected',
      front: 'Original data',
    });
  } finally {
    unchanged.close();
  }
}, 2000);

it('creates the complete current schema directly on a fresh install', async () => {
  await db.open();
  expect(db.verno).toBe(31);
  expect(db.tables.map((table) => table.name).sort()).toEqual(
    [...Object.keys(schemaV27), 'questionSets', 'questionSetAttempts'].sort(),
  );
  expect(
    db.concepts.schema.indexes.find((index) => index.name === 'specificationPointIds')?.multi,
  ).toBe(true);
  expect(await db.cards.count()).toBe(0);
  expect(await db.questionSets.count()).toBe(0);
});
