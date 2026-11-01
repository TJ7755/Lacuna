import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../specifications/links', async (importOriginal) => {
  // Model a first chunk load that lasts longer than an idle IndexedDB transaction.
  await new Promise((resolve) => setTimeout(resolve, 40));
  return importOriginal();
});

import { importCardsToDestination } from './cardImport';
import { db } from './schema';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('imports a new specification-linked Course atomically on a cold validation load', async () => {
  const specificationRef = { specificationId: 'science', tier: 'higher' };
  const result = await importCardsToDestination(
    { kind: 'course', title: 'Science', options: { schedulingMode: 'steady', specificationRef } },
    {
      kind: 'text',
      cards: [{ type: 'front_back', front: 'Question', back: 'Answer' }],
      reverse: false,
    },
  );
  expect(await db.courses.get(result.courseId)).toMatchObject({ specificationRef });
  expect(await db.lessons.where('courseId').equals(result.courseId).count()).toBe(1);
  expect(await db.cards.where('courseId').equals(result.courseId).count()).toBe(1);
});
