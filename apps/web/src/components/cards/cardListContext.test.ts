import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { createCourse } from '../../db/courseRepository';
import { createLesson } from '../../db/lessonRepository';
import { createCards } from '../../db/cardRepository';
import type { ApkgImportResult } from '../../db/apkgImport';
import { courseCardListContext, type CardListContext } from './cardListContext';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const draft = {
  type: 'front_back' as const,
  front: 'bonjour',
  back: 'hello',
  tags: ['French'],
  answerMode: 'type' as const,
};
const apkg: ApkgImportResult = {
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
};

async function makeContext(target: 'bank' | 'lesson') {
  const course = await createCourse('French', { schedulingMode: 'steady' });
  const lesson = await createLesson(course.id, 'Greetings');
  const unit = (await db.schedulingUnits.get(target === 'bank' ? course.id : lesson.id))!;
  const context = courseCardListContext({
    schedulingConfig: unit,
    courseId: course.id,
    primaryLessonId: target === 'bank' ? null : lesson.id,
    importTargetName: unit.name,
  });
  return { context, course, lesson, unit };
}

async function runImport(context: CardListContext, source: 'text' | 'reverse' | 'apkg') {
  if (source === 'apkg') await context.onApkgImport(apkg);
  else await context.onImport([draft], source === 'reverse');
}

describe('card-list import authoring lock', () => {
  for (const target of ['bank', 'lesson'] as const) {
    it.each(['text', 'reverse', 'apkg'] as const)(
      `rejects a stale ${target} callback importing %s after the course locks`,
      async (source) => {
        const { context, course, unit } = await makeContext(target);
        await createCards(unit.id, [{ ...draft, front: 'Existing card' }]);
        await db.courses.update(course.id, {
          distributedCopy: {
            lineageId: 'published-french',
            revision: 1,
            locked: true,
            autoAcceptUpdates: false,
          },
        });
        const before = {
          cards: await db.cards.toArray(),
          concepts: await db.concepts.toArray(),
          lessons: await db.lessons.toArray(),
          units: await db.schedulingUnits.toArray(),
          history: await db.reviewHistory.toArray(),
          links: await db.lessonCards.toArray(),
        };

        await expect(runImport(context, source)).rejects.toThrow(/locked/i);

        expect(await db.cards.toArray()).toEqual(before.cards);
        expect(await db.concepts.toArray()).toEqual(before.concepts);
        expect(await db.lessons.toArray()).toEqual(before.lessons);
        expect(await db.schedulingUnits.toArray()).toEqual(before.units);
        expect(await db.reviewHistory.toArray()).toEqual(before.history);
        expect(await db.lessonCards.toArray()).toEqual(before.links);
      },
    );

    for (const copy of ['ordinary', 'detached'] as const) {
      it.each(['text', 'reverse', 'apkg'] as const)(
        `keeps ${copy} ${target} ownership and scheduling when importing %s`,
        async (source) => {
          const { context, course, lesson, unit } = await makeContext(target);
          if (copy === 'detached') {
            await db.courses.update(course.id, {
              distributedCopy: {
                lineageId: 'published-french',
                revision: 1,
                locked: false,
                autoAcceptUpdates: false,
              },
            });
          }

          await runImport(context, source);

          const cards = await db.cards.toArray();
          expect(cards).toHaveLength(source === 'reverse' ? 2 : 1);
          for (const card of cards) {
            expect(card).toMatchObject({
              courseId: course.id,
              primaryLessonId: target === 'bank' ? null : lesson.id,
              schedulingUnitId: unit.id,
            });
            if (source === 'apkg') {
              expect(card).toMatchObject({ stability: 5, difficulty: 3, reps: 4, lapses: 1 });
            } else {
              expect(card).toMatchObject({ tags: ['French'], answerMode: 'type', reps: 0 });
            }
          }
          if (source === 'reverse') {
            const original = cards.find((card) => card.front === draft.front)!;
            const reverse = cards.find((card) => card.front === draft.back)!;
            expect(reverse.back).toBe(draft.front);
            expect(reverse.conceptId).toBe(original.conceptId);
            expect(reverse.id).not.toBe(original.id);
          }
          expect(await db.lessons.count()).toBe(1);
          expect(await db.lessonCards.count()).toBe(0);
        },
      );
    }
  }
});
