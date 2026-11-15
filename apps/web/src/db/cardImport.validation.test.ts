import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { importCardsToDestination } from './cardImport';
import { prepareCards } from './cardRepository';
import { createCourse } from './courseRepository';
import type { ParsedCard } from './import';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

// This file deliberately does not import the validator: the first structured
// import must load it before the destination transaction starts.
it('commits a structured import with a cold validator load', async () => {
  const result = await importCardsToDestination(
    { kind: 'course', title: 'Structured items', options: { schedulingMode: 'steady' } },
    {
      kind: 'text',
      cards: [
        { type: 'front_back', front: 'Explain', back: '', payload: { v: 1, kind: 'scaffold' } },
      ],
      reverse: true,
    },
  );
  expect(await db.cards.toArray()).toEqual([
    expect.objectContaining({
      courseId: result.courseId,
      primaryLessonId: result.lesson!.id,
      payload: { v: 1, kind: 'scaffold' },
    }),
  ]);
  expect(await db.concepts.count()).toBe(1);
});

it('keeps prepared inputs valid when callers mutate drafts or returned cards', async () => {
  const course = await createCourse('Prepared cards', { schedulingMode: 'steady' });
  const drafts: ParsedCard[] = [
    {
      type: 'front_back' as const,
      front: 'Explain',
      back: '',
      payload: { v: 1, kind: 'scaffold' },
    },
  ];
  const commit = await prepareCards(drafts);
  Object.assign(drafts[0].payload!, { kind: 'invalid' });
  const first = await commit(course.id);
  Object.assign(first[0].payload!, { kind: 'invalid' });
  await commit(course.id);
  const cards = await db.cards.toArray();
  expect(cards).toHaveLength(2);
  expect(cards.every((card) => card.payload?.kind === 'scaffold')).toBe(true);
});
