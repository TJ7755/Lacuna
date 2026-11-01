import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, ensurePreMigrationSnapshot, readAllDataFromVersion } from './schema';

// An uncached migration module may arrive after IndexedDB would auto-commit.
vi.mock('./questionSetPracticeNode', async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  return importOriginal();
});

beforeEach(async () => {
  db.close();
  await db.delete();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

it('migrates activity and last-imported selection together without changing authored content or evidence', async () => {
  const node = {
    id: 'activity',
    courseId: 'course',
    type: 'question-set',
    name: 'Questions',
    questionSetId: 'set',
    afterLessonId: 'lesson',
    createdAt: 10,
    updatedAt: 20,
  };
  const snapshot = { questionSetId: 'set', afterLessonId: 'lesson', name: 'Questions' };
  const mapping = {
    id: 'lineage',
    courseId: 'course',
    questionSetPracticeNodeSnapshots: { activity: snapshot },
  };
  const attempt = {
    id: 'attempt',
    questionSetId: 'set',
    receipt: { marker: 'unchanged evidence' },
  };
  const set = { id: 'set', marker: 'unchanged authored content' };
  const legacy = new Dexie('lacuna');
  legacy.version(30).stores({
    practiceNodes: 'id, courseId',
    lineageIdMappings: 'id, courseId',
    questionSetAttempts: 'id',
    questionSets: 'id',
  });
  await legacy.open();
  const cardPractice = {
    id: 'card-practice',
    courseId: 'course',
    type: 'manual',
    name: 'Card review',
    position: 2,
    lessonIds: ['lesson'],
    createdAt: 10,
    updatedAt: 20,
  };
  const unrelatedMapping = {
    id: 'card-lineage',
    courseId: 'course',
    lessonSnapshots: { lesson: { name: 'Existing lesson' } },
  };
  await legacy.table('practiceNodes').bulkAdd([node, cardPractice]);
  await legacy.table('lineageIdMappings').add(unrelatedMapping);
  await legacy.table('lineageIdMappings').add(mapping);
  await legacy.table('questionSetAttempts').add(attempt);
  await legacy.table('questionSets').add(set);
  legacy.close();
  await ensurePreMigrationSnapshot('lacuna', 31, async (version, backup) => {
    expect(version).toBe(31);
    expect(backup.practiceNodes).toEqual(expect.arrayContaining([node, cardPractice]));
  });
  await db.open();
  const { questionSetId: _legacy, ...rest } = node;
  expect(db.verno).toBe(31);
  expect(await db.practiceNodes.get(node.id)).toEqual({ ...rest, questionSetIds: ['set'] });
  expect((await db.lineageIdMappings.get(mapping.id))?.questionSetPracticeNodeSnapshots).toEqual({
    activity: { questionSetIds: ['set'], afterLessonId: 'lesson', name: 'Questions' },
  });
  expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  expect(await db.questionSets.get(set.id)).toEqual(set);
  expect(await db.practiceNodes.get(cardPractice.id)).toEqual(cardPractice);
  expect(await db.lineageIdMappings.get(unrelatedMapping.id)).toEqual(unrelatedMapping);
  expect(await readAllDataFromVersion('lacuna', 31)).toMatchObject({
    app: 'lacuna-v15',
    version: 15,
  });
});

it('aborts all v31 activity changes when a last-imported snapshot has conflicting selections', async () => {
  const node = {
    id: 'activity',
    courseId: 'course',
    type: 'question-set',
    name: 'Questions',
    questionSetId: 'set',
    afterLessonId: 'lesson',
    createdAt: 10,
    updatedAt: 20,
  };
  const mapping = {
    id: 'lineage',
    courseId: 'course',
    questionSetPracticeNodeSnapshots: {
      activity: {
        questionSetId: 'set',
        questionSetIds: ['different-set'],
        afterLessonId: 'lesson',
        name: 'Questions',
      },
    },
  };
  const legacy = new Dexie('lacuna');
  legacy.version(30).stores({ practiceNodes: 'id, courseId', lineageIdMappings: 'id, courseId' });
  await legacy.open();
  await legacy.table('practiceNodes').add(node);
  await legacy.table('lineageIdMappings').add(mapping);
  legacy.close();

  await expect(db.open()).rejects.toThrow(
    'Conflicting singular and plural Question Set selection.',
  );
  const original = new Dexie('lacuna');
  await original.open();
  try {
    expect(original.verno).toBe(30);
    expect(await original.table('practiceNodes').get(node.id)).toEqual(node);
    expect(await original.table('lineageIdMappings').get(mapping.id)).toEqual(mapping);
  } finally {
    original.close();
  }
});
