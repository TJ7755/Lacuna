import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './courseRepository';
import { checkDuplicate, checkDuplicatesBatch, createCard } from './cardRepository';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('does not confuse colon-separated question and answer content with an existing Card', async () => {
  const course = await createCourse('Duplicates');
  await createCard(course.id, 'front_back', 'A:B', 'C');
  const draft = { type: 'front_back' as const, front: 'A', back: 'B:C' };
  expect(await checkDuplicate(course.id, draft.type, draft.front, draft.back)).toBeUndefined();
  expect(await checkDuplicatesBatch(course.id, [draft])).toEqual(new Set());
});

it('keeps distinct colon-containing Cards within one batch but still detects real duplicates', async () => {
  const course = await createCourse('Duplicates');
  expect(
    await checkDuplicatesBatch(course.id, [
      { type: 'front_back', front: 'A:B', back: 'C' },
      { type: 'front_back', front: 'A', back: 'B:C' },
      { type: 'front_back', front: ' a:b ', back: ' c ' },
    ]),
  ).toEqual(new Set([2]));
});
