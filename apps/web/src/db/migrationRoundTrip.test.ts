import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { assertValidBackup } from './backupValidation';
import { exportDatabase, importBackup } from './portability';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { emptyQuestionSchedule, scheduleQuestionReview } from '../questions/scheduler';
import { deriveConceptApplicationSchedules } from '../questions/conceptPractice';
import { parseQuestionSetAttemptRecord } from '../questions/questionSetAttemptCodec';
import { schemaV27 } from './migrationFixtures';

beforeEach(async () => {
  await db.delete();
});
afterEach(async () => {
  await db.delete();
});

// Synthetic supported-schema coverage; this is not a captured production profile.
it.each([27, 28, 29, 30, 31])(
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
    const reviewRows = [
      { ...history[0], id: 'review-1', cardId: 'old-card', schedulingUnitId: 'lesson-1' },
      {
        ...history[0],
        id: 'review-2',
        cardId: 'old-card',
        schedulingUnitId: 'lesson-1',
        timestamp: 200,
        grade: 1,
        responseTimeSec: 12.75,
        distracted: true,
        stabilityBefore: 2,
        stabilityAfter: 0.5,
        difficultyBefore: 5,
        difficultyAfter: 6,
        retrievabilityAtReview: 0.8,
      },
    ];
    await legacy.table('reviewHistory').bulkAdd(reviewRows);
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
    expect(exported.reviewHistory).toHaveLength(2);
    expect(exported.reviewHistory).toEqual(expect.arrayContaining(reviewRows));
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

// Deployment provenance is pinned in the generator. These contain fictional learner data
// written with schema 31 and exported by SHA 191d86a, never by the current exporter.
it.each(['database', 'backup'])(
  'opens historical production %s without losing review timing',
  async (route) => {
    const fixtureRoot = 'tests/fixtures/compatibility/production-191d86a-';
    const backup = JSON.parse(readFileSync(`${fixtureRoot}backup.json`, 'utf8'));
    if (route === 'database') {
      const profile = JSON.parse(readFileSync(`${fixtureRoot}db.json`, 'utf8'));
      const historical = new Dexie('lacuna');
      const tables = profile.tables as Record<
        string,
        { schema: string; rows: Record<string, unknown>[] }
      >;
      historical
        .version(profile.version)
        .stores(
          Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.schema])),
        );
      await historical.open();
      for (const [name, table] of Object.entries(tables)) {
        const rows = table.rows.map((row) =>
          name === 'assets'
            ? { ...row, blob: new Uint8Array(Object.values(row.blob as Record<string, number>)) }
            : row,
        );
        await historical.table(name).bulkAdd(rows);
      }
      historical.close();
      await db.open();
    } else {
      await db.open();
      await importBackup(backup, 'replace');
    }
    db.close();
    await db.open();
    expect(db.verno).toBe(31);
    expect(await db.cards.get('old-card')).toMatchObject({
      front: backup.cards[0].front,
      reps: 1,
      stability: 2,
    });
    expect(await db.reviewHistory.orderBy('timestamp').toArray()).toMatchObject([
      { id: 'review-1', grade: 3, responseTimeSec: 2, distracted: false },
      { id: 'review-2', grade: 1, responseTimeSec: 12.75, distracted: true },
    ]);
    const historicalAttempt = parseQuestionSetAttemptRecord(
      (await db.questionSetAttempts.toArray())[0],
    );
    const snapshot = historicalAttempt.firstMarking![0];
    const conceptId =
      historicalAttempt.receipt.questions[0].answer!.allocations[0].targetConceptIds[0];
    expect(snapshot.gradeMappingVersion).toBe('full-good-otherwise-again-v1');
    // Three out of five historically meant Again, even though new evidence earns Hard.
    expect(deriveConceptApplicationSchedules([historicalAttempt]).get(conceptId)).toEqual(
      scheduleQuestionReview(
        emptyQuestionSchedule(),
        1,
        snapshot.schedulerConfig,
        snapshot.recordedAt,
      ).schedule,
    );
    const currentAttempt = structuredClone(historicalAttempt);
    currentAttempt.id = 'current-fractional-attempt';
    currentAttempt.firstMarking![0].gradeMappingVersion = 'fractional-hard-v2';
    expect(deriveConceptApplicationSchedules([currentAttempt]).get(conceptId)).toEqual(
      scheduleQuestionReview(
        emptyQuestionSchedule(),
        2,
        snapshot.schedulerConfig,
        snapshot.recordedAt,
      ).schedule,
    );
    await db.questionSetAttempts.put(currentAttempt);
    const exported = await exportDatabase();
    await db.delete();
    await db.open();
    await importBackup(exported, 'replace');
    const restored = (await db.questionSetAttempts.toArray()).map(parseQuestionSetAttemptRecord);
    expect(restored.find((attempt) => attempt.id === historicalAttempt.id)).toEqual(
      historicalAttempt,
    );
    expect(restored.find((attempt) => attempt.id === currentAttempt.id)).toEqual(currentAttempt);
    expect(exported.assets[0].data).toBe(backup.assets[0].data);
  },
);
