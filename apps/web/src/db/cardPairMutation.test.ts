import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { reset } from './courseRepository.testFixtures';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import {
  createCard,
  createCardWithReverse,
  createLessonBasicReversedPair,
  saveCardEdit,
} from './cardRepository';
import type { ItemPayload } from '@lacuna/core/db/types';

const scheduling = { reps: 9, stability: 12, difficulty: 3, due: 123456, state: 2 as const };
const numeric: ItemPayload = { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } };
const working: ItemPayload = {
  v: 1,
  kind: 'working',
  scheme: [{ marks: 1, kind: 'waypoint', expression: 'x = 4' }],
};

describe('linked card edits', () => {
  beforeEach(reset);

  async function pair() {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson');
    const result = await createLessonBasicReversedPair(course.id, lesson.id, 'Question', 'Answer');
    await db.cards.update(result.card.id, scheduling);
    await db.cards.update(result.reverse.id, { ...scheduling, reps: 5 });
    return result;
  }

  it('converts an ordinary card to a linked pair without resetting its scheduling', async () => {
    const course = await createCourse('Course');
    const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
    await db.cards.update(card.id, scheduling);
    await saveCardEdit(card.id, {
      type: 'basic_reversed',
      front: 'New question',
      back: 'New answer',
      tags: ['tag'],
    });
    const saved = (await db.cards.get(card.id))!;
    expect(saved.reverseCardId).toEqual(expect.any(String));
    const reverse = await db.cards.get(saved.reverseCardId!);
    expect(saved).toMatchObject(scheduling);
    expect(reverse).toMatchObject({
      type: 'front_back',
      front: 'New answer',
      back: 'New question',
      tags: ['tag'],
      reverseCardId: card.id,
      conceptId: card.conceptId,
      courseId: card.courseId,
      primaryLessonId: card.primaryLessonId,
      schedulingUnitId: card.schedulingUnitId,
      reps: 0,
    });
    expect(await db.cards.count()).toBe(2);
  });

  it.each(['card', 'reverse'] as const)(
    'updates linked content from the %s side and preserves both schedules',
    async (side) => {
      const cards = await pair();
      const edited = cards[side];
      const partner = side === 'card' ? cards.reverse : cards.card;
      await saveCardEdit(edited.id, {
        type: edited.type,
        front: 'Edited front',
        back: 'Edited back',
        tags: ['edited'],
        answerMode: 'type',
        requireCorrectSpelling: true,
      });
      expect(await db.cards.get(edited.id)).toMatchObject({
        ...scheduling,
        reps: side === 'card' ? 9 : 5,
        front: 'Edited front',
        back: 'Edited back',
      });
      expect(await db.cards.get(partner.id)).toMatchObject({
        ...scheduling,
        reps: side === 'card' ? 5 : 9,
        type: partner.type,
        front: 'Edited back',
        back: 'Edited front',
        tags: ['edited'],
        answerMode: 'type',
        requireCorrectSpelling: true,
      });
    },
  );

  it.each([
    ['cloze', undefined],
    ['front_back', numeric],
    ['front_back', working],
    ['front_back', undefined],
  ] as const)(
    'converts the primary to %s (%j) without leaving a broken reverse',
    async (type, payload) => {
      const { card, reverse } = await pair();
      await db.lessonCards.add({
        id: 'link',
        lessonId: 'extra-lesson',
        cardId: reverse.id,
        createdAt: 1,
        updatedAt: 1,
      });
      await db.lessonCardExposures.add({
        lessonId: card.primaryLessonId!,
        cardId: reverse.id,
        taughtAt: 1,
        updatedAt: 1,
      });
      await saveCardEdit(card.id, {
        type,
        front: '{{c1::4}}',
        back: type === 'front_back' && !payload ? 'Answer' : '',
        payload,
      });
      expect(await db.cards.get(card.id)).toMatchObject({
        ...scheduling,
        type,
        payload,
        reverseCardId: null,
      });
      expect(await db.cards.get(reverse.id)).toBeUndefined();
      expect(await db.cards.count()).toBe(1);
      expect(await db.lessonCards.count()).toBe(0);
      expect(await db.lessonCardExposures.count()).toBe(0);
      expect(await db.tombstones.get(['cards', reverse.id])).toBeDefined();
    },
  );

  it('reuses both rows when the reverse becomes the primary direction', async () => {
    const { card, reverse } = await pair();
    await saveCardEdit(reverse.id, {
      type: 'basic_reversed',
      front: 'New prompt',
      back: 'New answer',
    });
    expect(await db.cards.count()).toBe(2);
    expect(await db.cards.get(reverse.id)).toMatchObject({
      ...scheduling,
      reps: 5,
      type: 'basic_reversed',
      reverseCardId: card.id,
      front: 'New prompt',
      back: 'New answer',
    });
    expect(await db.cards.get(card.id)).toMatchObject({
      ...scheduling,
      type: 'front_back',
      reverseCardId: reverse.id,
      front: 'New answer',
      back: 'New prompt',
    });
  });

  it('converts the reverse to a structured item while retaining the edited identity', async () => {
    const { card, reverse } = await pair();
    await saveCardEdit(reverse.id, {
      type: 'front_back',
      front: '2 + 2',
      back: '',
      payload: numeric,
    });
    expect(await db.cards.get(reverse.id)).toMatchObject({
      ...scheduling,
      reps: 5,
      payload: numeric,
      reverseCardId: null,
    });
    expect(await db.cards.get(card.id)).toBeUndefined();
  });

  it('rolls back the edited row when removing its generated partner is refused', async () => {
    const { card, reverse } = await pair();
    await db.cards.update(reverse.id, { sequenceItemId: 'generated' });
    const before = await db.cards.toArray();
    await expect(
      saveCardEdit(card.id, { type: 'cloze', front: '{{c1::4}}', back: '' }),
    ).rejects.toThrow('generated');
    expect(await db.cards.toArray()).toEqual(before);
    expect(await db.tombstones.count()).toBe(0);
  });

  it('does not link independent also-reverse cards merely because they share a Concept', async () => {
    const course = await createCourse('Course');
    const { card, reverse } = await createCardWithReverse(course.id, 'Question', 'Answer');
    await saveCardEdit(reverse.id, { type: 'front_back', front: 'Independent', back: 'Edit' });
    expect(await db.cards.get(card.id)).toEqual(card);
    expect(await db.cards.get(reverse.id)).toMatchObject({ front: 'Independent', back: 'Edit' });
  });

  it('rolls back reverse creation when the edited course is locked', async () => {
    const course = await createCourse('Published');
    const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
    await db.courses.update(course.id, {
      distributedCopy: {
        lineageId: 'published',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    await expect(
      saveCardEdit(card.id, {
        type: 'basic_reversed',
        front: 'Changed question',
        back: 'Changed answer',
      }),
    ).rejects.toThrow('This published course is locked.');
    expect(await db.cards.toArray()).toEqual([card]);
  });
});
