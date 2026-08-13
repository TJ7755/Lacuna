import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, readAllDataFromVersion } from './schema';

const v22Stores = {
  cards:
    'id, courseId, primaryLessonId, schedulingUnitId, type, lastReviewed, sequenceItemId, occlusionRegionId',
  sessionHistory: '++id, &eventId, sessionId, deckId, courseId, schedulingUnitId, timestamp',
  userPerformance: 'deckId',
  backups: '++id, createdAt',
  appState: 'key',
  assets: 'hash, createdAt',
  courses: 'id, createdAt',
  lessons: 'id, courseId, orderIndex, createdAt',
  notes: 'id, lessonId, orderIndex, createdAt',
  lessonCards: 'id, lessonId, cardId',
  lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
  lessonCompletions: 'lessonId, completedAt',
  noteAnnotations: 'id, noteId, createdAt, updatedAt',
  practiceNodes: 'id, courseId, position, createdAt',
  practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
  courseAssessments: 'id, courseId, kind, examDate, createdAt',
  sequences: 'id, courseId, primaryLessonId, createdAt',
  revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
  lineageIdMappings: 'id, courseId',
  pendingMergeReviews: 'id, courseId',
  occlusions: 'id, courseId, primaryLessonId, createdAt',
  reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, schedulingUnitId, timestamp',
  schedulingUnits: 'id, kind, courseId, lessonId',
  coursePerformance: 'courseId',
  schedulingPerformance: 'schedulingUnitId, courseId, lessonId',
};

async function createV22Database(): Promise<void> {
  const legacy = new Dexie('lacuna');
  legacy.version(22).stores(v22Stores);
  await legacy.open();
  await legacy.table('courses').add({
    id: 'course-1',
    name: 'Biology',
    description: '',
    createdAt: 100,
  });
  await legacy.table('cards').add({
    id: 'card-1',
    schedulingUnitId: 'course-1',
    courseId: 'course-1',
    type: 'front_back',
    front: 'Q',
    back: 'A',
    stability: null,
    difficulty: null,
    lastReviewed: 250,
    reps: 1,
    lapses: 0,
    state: 2,
    due: 300,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: 100,
  });
  await legacy.table('revisionPlans').add({
    id: 'plan-1',
    assessmentId: 'assess-1',
    courseId: 'course-1',
    status: 'active',
    revision: 1,
    createdAt: 100,
    updatedAt: 180,
  });
  await legacy.table('occlusions').add({
    id: 'occ-1',
    courseId: 'course-1',
    primaryLessonId: null,
    name: 'Diagram',
    assetHash: 'hash-1',
    regions: [],
    createdAt: 100,
  });
  await legacy.table('coursePerformance').add({
    courseId: 'course-1',
    runningMeanResponseTime: 4,
    runningStdDevResponseTime: 1,
    m2: 0,
    totalCorrectReviews: 1,
  });
  legacy.close();
}

describe('schema v23 mutation timestamps and tombstones', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  it('backfills updatedAt and adds the tombstones store', async () => {
    await createV22Database();
    await db.open();

    expect(db.tables.map((table) => table.name)).toContain('tombstones');
    expect(await db.tombstones.count()).toBe(0);

    expect(await db.courses.get('course-1')).toMatchObject({ updatedAt: 100 });
    expect(await db.cards.get('card-1')).toMatchObject({ updatedAt: 250 });
    expect(await db.revisionPlans.get('plan-1')).toMatchObject({ updatedAt: 180 });
    expect(await db.occlusions.get('occ-1')).toMatchObject({ updatedAt: 100 });
    expect(await db.coursePerformance.get('course-1')).toMatchObject({ updatedAt: 0 });
  });

  it('includes occlusions in a v22 pre-migration snapshot payload', async () => {
    await createV22Database();
    const payload = await readAllDataFromVersion('lacuna', 22);
    expect(payload.occlusions).toEqual([
      expect.objectContaining({ id: 'occ-1', assetHash: 'hash-1' }),
    ]);
    expect(payload.tombstones).toEqual([]);
  });

  it('leaves a v22 database readable when the v23 upgrade throws', async () => {
    await createV22Database();

    const exploding = new Dexie('lacuna');
    exploding.version(22).stores(v22Stores);
    exploding
      .version(23)
      .stores({ ...v22Stores, tombstones: '[table+recordId], deletedAt' })
      .upgrade(async () => {
        throw new Error('injected v23 failure');
      });

    await expect(exploding.open()).rejects.toThrow('injected v23 failure');
    exploding.close();

    const unchanged = new Dexie('lacuna');
    unchanged.version(22).stores(v22Stores);
    await unchanged.open();
    expect(unchanged.verno).toBe(22);
    expect(await unchanged.table('courses').get('course-1')).toMatchObject({ name: 'Biology' });
    expect(unchanged.tables.map((table) => table.name)).not.toContain('tombstones');
    unchanged.close();
  });
});
