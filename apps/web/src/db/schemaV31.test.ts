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
  legacy
    .version(30)
    .stores({
      practiceNodes: 'id, courseId',
      lineageIdMappings: 'id, courseId',
      questionSetAttempts: 'id',
      questionSets: 'id',
    });
  await legacy.open();
  await legacy.table('practiceNodes').add(node);
  await legacy.table('lineageIdMappings').add(mapping);
  await legacy.table('questionSetAttempts').add(attempt);
  await legacy.table('questionSets').add(set);
  legacy.close();
  await ensurePreMigrationSnapshot('lacuna', 31, async (version, backup) => {
    expect(version).toBe(31);
    expect(backup.practiceNodes).toEqual([node]);
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
  expect(await readAllDataFromVersion('lacuna', 31)).toMatchObject({
    app: 'lacuna-v15',
    version: 15,
  });
});
