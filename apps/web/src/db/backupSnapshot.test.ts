import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from './schema';
import { createCard, createCourse, createLesson } from './repository';
import { exportDatabase, importBackup } from './portability';
import { storeImageBlob } from './assets';
import { createQuestionSetPracticeNode } from './practiceNodeRepository';
import { importQuestionBank } from '../questions/bank';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => vi.restoreAllMocks());

it('exports one restorable snapshot when deletion queues between record and media reads', async () => {
  const course = await createCourse('Concurrent course');
  const asset = await storeImageBlob(
    new Blob(['diagram'], { type: 'image/png' }),
    'image/png',
    1,
    1,
  );
  const card = await createCard(
    course.id,
    'front_back',
    `![Diagram](lacuna-asset://${asset.hash})`,
    'Answer',
  );
  const readConcepts = db.concepts.toArray.bind(db.concepts);
  let deletion: Promise<unknown> | undefined;
  vi.spyOn(db.concepts, 'toArray').mockImplementationOnce(() => {
    // The deletion commits atomically, after the Card read has already been queued.
    deletion = db.transaction('rw!', db.courses, db.cards, db.concepts, db.assets, async () => {
      await db.courses.delete(course.id);
      await db.cards.delete(card.id);
      await db.concepts.delete(card.conceptId!);
      await db.assets.delete(asset.hash);
    });
    // A shared readonly transaction queues the separate writer until all snapshot reads finish.
    return Dexie.currentTransaction
      ? readConcepts()
      : Dexie.Promise.resolve(deletion).then(() => readConcepts());
  });

  try {
    const backup = await exportDatabase();
    expect(backup.cards.map((row) => row.id)).toContain(card.id);
    expect(backup.concepts?.map((row) => row.id)).toContain(card.conceptId);
    expect(backup.assets.map((row) => row.hash)).toContain(asset.hash);
    await deletion;
    await importBackup(backup, 'replace');
    expect(await db.cards.get(card.id)).toMatchObject({ conceptId: card.conceptId });
    expect(await db.assets.get(asset.hash)).toBeDefined();
  } finally {
    await deletion;
  }
});

it('exports canonical ordered activity membership and its last-imported baseline without changing evidence', async () => {
  const course = await createCourse('Physics');
  const lesson = await createLesson(course.id, 'Density');
  const [set] = await importQuestionBank(familyExample, course.id);
  const activity = await createQuestionSetPracticeNode(course.id, [set.id], lesson.id);
  const snapshot = {
    questionSetIds: activity.questionSetIds,
    afterLessonId: lesson.id,
    name: activity.name,
  };
  const mapping = {
    id: 'lineage',
    courseId: course.id,
    lessonIds: [],
    noteIds: [],
    cardIds: [],
    sequenceIds: [],
    lessonSnapshots: {},
    noteSnapshots: {},
    cardSnapshots: {},
    questionSetPracticeNodeIds: [activity.id],
    questionSetPracticeNodeSnapshots: { [activity.id]: snapshot },
  };
  await db.lineageIdMappings.put(mapping);
  const backup = await exportDatabase();
  expect(backup.practiceNodes).toEqual([activity]);
  expect(backup.lineageIdMappings).toEqual([mapping]);
  expect(backup.practiceNodes?.[0]).not.toHaveProperty('questionSetId');
  await importBackup(backup, 'replace');
  expect(await db.practiceNodes.get(activity.id)).toEqual(activity);
  expect(await db.lineageIdMappings.get(mapping.id)).toEqual(mapping);
});
