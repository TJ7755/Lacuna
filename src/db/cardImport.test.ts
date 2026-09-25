import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './courseRepository';
import { importCardsToDestination } from './cardImport';

beforeEach(async () => {
  await db.delete();
  await db.open();
});
const drafts = [
  { type: 'front_back' as const, front: 'bonjour', back: 'hello', tags: ['French'] },
  { type: 'cloze' as const, front: '{{c1::Paris}} is in France', back: '' },
];

describe('card import destinations', () => {
  it('creates a named course and lesson with independent reverses sharing the original concept', async () => {
    const result = await importCardsToDestination(
      { kind: 'course', title: 'French', options: { schedulingMode: 'steady' } },
      { kind: 'text', cards: drafts, reverse: true },
    );
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(3);
    const original = cards.find((c) => c.front === 'bonjour')!;
    const reverse = cards.find((c) => c.front === 'hello')!;
    expect(reverse).toMatchObject({
      back: 'bonjour',
      conceptId: original.conceptId,
      tags: ['French'],
      reps: 0,
    });
    expect(reverse.id).not.toBe(original.id);
    expect(cards.every((c) => c.primaryLessonId === result.lesson!.id)).toBe(true);
    expect((await db.courses.get(result.courseId))?.name).toBe('French');
    expect(result.lesson?.name).toBe('Lesson 1');
  });
  it('preserves authored answer modes on generated reverses', async () => {
    await importCardsToDestination(
      { kind: 'course', title: 'French', options: { schedulingMode: 'steady' } },
      { kind: 'text', cards: [{ ...drafts[0], answerMode: 'type' }], reverse: true },
    );
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.answerMode === 'type')).toBe(true);
  });
  it('creates a lesson inside an existing course', async () => {
    const course = await createCourse('Languages', { schedulingMode: 'steady' });
    const result = await importCardsToDestination(
      { kind: 'lesson', courseId: course.id, title: 'Greetings' },
      { kind: 'text', cards: drafts, reverse: false },
    );
    expect(result.lesson?.name).toBe('Greetings');
    expect(await db.courses.count()).toBe(1);
    expect(await db.cards.count()).toBe(2);
  });
  it('rolls back a new destination if card validation fails', async () => {
    await expect(
      importCardsToDestination(
        { kind: 'course', title: 'Failed', options: { schedulingMode: 'steady' } },
        {
          kind: 'text',
          cards: [{ ...drafts[0], payload: { kind: 'invalid' } as never }],
          reverse: true,
        },
      ),
    ).rejects.toThrow();
    expect(await db.courses.count()).toBe(0);
    expect(await db.lessons.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
});

it('rolls back all destination records on a storage write failure', async () => {
  const fail = () => {
    throw new Error('Disk full');
  };
  db.cards.hook('creating', fail);
  try {
    await expect(
      importCardsToDestination(
        { kind: 'course', title: 'Failure', options: { schedulingMode: 'steady' } },
        { kind: 'text', cards: drafts, reverse: true },
      ),
    ).rejects.toThrow('Disk full');
    expect(await db.courses.count()).toBe(0);
    expect(await db.lessons.count()).toBe(0);
    expect(await db.concepts.count()).toBe(0);
  } finally {
    db.cards.hook('creating').unsubscribe(fail);
  }
});

it('imports Anki scheduling into a newly named lesson', async () => {
  const course = await createCourse('French', { schedulingMode: 'steady' });
  const result = await importCardsToDestination(
    { kind: 'lesson', courseId: course.id, title: 'Anki lesson' },
    {
      kind: 'apkg',
      result: {
        deckName: 'Source',
        cards: [
          {
            id: 'source',
            type: 'front_back',
            front: 'Q',
            back: 'A',
            stability: 5,
            difficulty: 3,
            state: 2,
            reps: 4,
            lapses: 1,
            lastReviewed: 1000,
            due: 2000,
            scheduledDays: 5,
            learningSteps: 0,
            history: [],
            schedulingUnitId: 'source',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        media: new Map(),
        skippedCards: 0,
        skippedNotes: 0,
      },
    },
  );
  expect((await db.cards.toArray())[0]).toMatchObject({
    courseId: course.id,
    primaryLessonId: result.lesson!.id,
    schedulingUnitId: result.lesson!.id,
    stability: 5,
    difficulty: 3,
    reps: 4,
    lapses: 1,
  });
});
