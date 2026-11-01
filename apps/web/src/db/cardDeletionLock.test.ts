import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { createCard, deleteCards } from './cardRepository';
import type { Card } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seedCard(target: 'bank' | 'lesson', locked = false) {
  const course = await createCourse('French', { schedulingMode: 'steady' });
  const lesson = await createLesson(course.id, 'Greetings');
  const card = await createCard(target === 'bank' ? course.id : lesson.id, 'front_back', 'Q', 'A');
  await db.lessonCards.add({
    id: `link-${card.id}`,
    lessonId: lesson.id,
    cardId: card.id,
    createdAt: 1,
    updatedAt: 1,
  });
  await db.lessonCardExposures.add({
    lessonId: lesson.id,
    cardId: card.id,
    taughtAt: 1,
    updatedAt: 1,
  });
  await db.reviewHistory.add({
    id: `review-${card.id}`,
    cardId: card.id,
    courseId: course.id,
    timestamp: 100,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  });
  await db.courses.update(course.id, {
    distributedCopy: {
      lineageId: `lineage-${course.id}`,
      revision: 1,
      locked,
      autoAcceptUpdates: false,
    },
  });
  return { card, course };
}

async function snapshot() {
  return {
    cards: await db.cards.toArray(),
    history: await db.reviewHistory.toArray(),
    links: await db.lessonCards.toArray(),
    exposures: await db.lessonCardExposures.toArray(),
    tombstones: await db.tombstones.toArray(),
  };
}

describe('Card deletion authoring lock', () => {
  it.each(['bank', 'lesson'] as const)(
    'rejects deletion from a locked Course %s without changing dependent records',
    async (target) => {
      const { card } = await seedCard(target, true);
      const before = await snapshot();

      await expect(deleteCards([card.id])).rejects.toThrow(/locked/i);

      expect(await snapshot()).toEqual(before);
    },
  );

  it('rejects the whole mixed Course batch before deleting an editable Card', async () => {
    const ordinary = await seedCard('bank');
    await db.courses.update(ordinary.course.id, { distributedCopy: undefined });
    const locked = await seedCard('lesson', true);
    await db.tombstones.add({ table: 'cards', recordId: 'earlier-deletion', deletedAt: 1 });
    const before = await snapshot();

    await expect(deleteCards([ordinary.card.id, locked.card.id])).rejects.toThrow(/locked/i);

    expect(await snapshot()).toEqual(before);
  });

  it.each(['ordinary', 'detached', 'legacy'] as const)(
    'still deletes %s Cards and their dependent records',
    async (kind) => {
      let card: Card;
      if (kind === 'legacy') {
        card = await createCard('legacy-unit', 'front_back', 'Q', 'A');
      } else {
        const seeded = await seedCard('lesson');
        card = seeded.card;
        if (kind === 'ordinary') {
          await db.courses.update(seeded.course.id, { distributedCopy: undefined });
        }
      }

      await deleteCards([card.id]);

      expect(await db.cards.count()).toBe(0);
      expect(await db.reviewHistory.count()).toBe(0);
      expect(await db.lessonCards.count()).toBe(0);
      expect(await db.lessonCardExposures.count()).toBe(0);
      expect(await db.tombstones.get(['cards', card.id])).toBeDefined();
    },
  );
});
