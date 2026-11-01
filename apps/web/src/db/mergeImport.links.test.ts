import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { ShareLesson } from './share';
import { acceptAllMergeReview, importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { coursePayload, lessonOne } from './mergeImport.testFixtures';

describe('mergeImport: bank cards, lesson links and lesson moves', () => {
  const bankCard = { id: 'bank-1', k: 0 as const, f: 'Bank front', b: 'Bank back' };
  const lessonTwo = (overrides: Partial<ShareLesson> = {}) =>
    lessonOne({ i: 'lesson-2', n: 'Genetics', notes: [], cards: [], ...overrides });

  async function autoAccept(courseId: string) {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
  }

  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('adopts linked bank cards and lesson links on first import', async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({
        lessons: [lessonOne(), lessonTwo()],
        bankCards: [bankCard],
        links: [
          { l: 0, c: 'bank-1' },
          { l: 1, c: 'card-1' },
        ],
      }),
    );
    const card = await db.cards.get('bank-1');
    expect(card).toMatchObject({ courseId: course.id, primaryLessonId: null, front: 'Bank front' });
    const links = await db.lessonCards.toArray();
    expect(links.map(({ lessonId, cardId }) => [lessonId, cardId]).sort()).toEqual([
      ['lesson-1', 'bank-1'],
      ['lesson-2', 'card-1'],
    ]);
    expect((await db.lineageIdMappings.get('lineage-1'))?.cardIds).toContain('bank-1');
  });

  it('keeps bank cards and links on an unchanged update, even with auto-accept on', async () => {
    const payload = coursePayload({
      lessons: [lessonOne()],
      bankCards: [bankCard],
      links: [{ l: 0, c: 'bank-1' }],
    });
    const { course } = await importLineageFirstTime(payload);
    await autoAccept(course.id);
    const result = await mergeLineageUpdate(course.id, { ...payload, rv: 2 });
    expect(result).toMatchObject({ appliedUpdates: 0, appliedRemovals: 0, queuedForReview: false });
    expect(await db.cards.get('bank-1')).toBeDefined();
    expect(await db.lessonCards.count()).toBe(1);
  });

  it('applies teacher changes to bank cards and links on update', async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({
        lessons: [lessonOne(), lessonTwo()],
        bankCards: [bankCard],
        links: [{ l: 0, c: 'bank-1' }],
      }),
    );
    await autoAccept(course.id);
    await mergeLineageUpdate(
      course.id,
      coursePayload({
        rv: 2,
        lessons: [lessonOne(), lessonTwo()],
        bankCards: [
          { ...bankCard, f: 'Bank front (revised)' },
          { id: 'bank-2', k: 0, f: 'New', b: 'New' },
        ],
        links: [{ l: 1, c: 'bank-2' }],
      }),
    );
    expect((await db.cards.get('bank-1'))?.front).toBe('Bank front (revised)');
    expect(await db.cards.get('bank-2')).toMatchObject({ primaryLessonId: null });
    const links = await db.lessonCards.toArray();
    expect(links.map(({ lessonId, cardId }) => [lessonId, cardId])).toEqual([
      ['lesson-2', 'bank-2'],
    ]);
  });

  it('moves a note and a card to the lesson the teacher moved them to', async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({ lessons: [lessonOne(), lessonTwo()] }),
    );
    await autoAccept(course.id);
    const moved = lessonOne();
    await mergeLineageUpdate(
      course.id,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({ notes: [], cards: [] }),
          lessonTwo({ notes: moved.notes, cards: moved.cards }),
        ],
      }),
    );
    expect((await db.notes.get('note-1'))?.lessonId).toBe('lesson-2');
    expect(await db.cards.get('card-1')).toMatchObject({
      primaryLessonId: 'lesson-2',
      deckId: 'lesson-2',
      schedulingUnitId: 'lesson-2',
    });
  });

  it('moves a card when the queued update is accepted later', async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({ lessons: [lessonOne(), lessonTwo()] }),
    );
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
    await mergeLineageUpdate(
      course.id,
      coursePayload({
        rv: 2,
        lessons: [lessonOne({ cards: [] }), lessonTwo({ cards: lessonOne().cards })],
      }),
    );
    expect((await db.cards.get('card-1'))?.primaryLessonId).toBe('lesson-1');
    const review = (await db.pendingMergeReviews.where('courseId').equals(course.id).first())!;
    await acceptAllMergeReview(review.id);
    expect((await db.cards.get('card-1'))?.primaryLessonId).toBe('lesson-2');
  });
});
