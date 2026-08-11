import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  findBackingDeck,
  performanceForCourse,
} from './backingDecks';
import { createCourse, createLesson } from './repository';
import type { Card } from './types';

async function reset(): Promise<void> {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.courseAssessments.clear(),
  ]);
}

describe('backing deck adapter', () => {
  beforeEach(reset);

  it('owns one scheduling deck for a lesson', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    const first = await ensureLessonBackingDeck(course.id, lesson.id);
    const second = await ensureLessonBackingDeck(course.id, lesson.id);

    expect(second).toBe(first);
    expect(await db.decks.get(first)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: lesson.id,
      name: 'Cells',
    });
  });

  it('owns one scheduling deck for unassigned course cards', async () => {
    const course = await createCourse('Biology');

    const first = await ensureCourseBankBackingDeck(course.id);
    const second = await ensureCourseBankBackingDeck(course.id);

    expect(second).toBe(first);
    expect(await db.decks.get(first)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: null,
      name: 'Biology — Question bank',
    });
  });

  it('loads one performance row per backing deck for the requested course', async () => {
    const course = await createCourse('Biology');
    const otherCourse = await createCourse('Chemistry');
    await db.userPerformance.bulkPut([
      { deckId: 'deck-1', runningMeanResponseTime: 5, runningStdDevResponseTime: 1, m2: 1, totalCorrectReviews: 2 },
      { deckId: 'deck-2', runningMeanResponseTime: 6, runningStdDevResponseTime: 1, m2: 1, totalCorrectReviews: 2 },
      { deckId: 'other-deck', runningMeanResponseTime: 7, runningStdDevResponseTime: 1, m2: 1, totalCorrectReviews: 2 },
    ]);
    const cards = [
      { id: 'one', courseId: course.id, deckId: 'deck-1' },
      { id: 'two', courseId: course.id, deckId: 'deck-1' },
      { id: 'three', courseId: course.id, deckId: 'deck-2' },
      { id: 'four', courseId: otherCourse.id, deckId: 'other-deck' },
    ] as Card[];

    const performance = await performanceForCourse(course.id, cards);

    expect(performance.map((row) => row.deckId).sort()).toEqual(['deck-1', 'deck-2']);
  });

  it('finds a legacy lesson deck from a primary card in the same course', async () => {
    const course = await createCourse('Biology');
    const otherCourse = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    const otherDeckId = await ensureLessonBackingDeck(otherCourse.id, lesson.id);
    await db.decks.update(deckId, { backingCourseId: undefined, backingLessonId: undefined });
    await db.decks.update(otherDeckId, { backingCourseId: undefined, backingLessonId: undefined });
    // Insert the wrong-course row first so the course filter is genuinely exercised.
    await db.cards.add({
      id: 'card-other',
      deckId: otherDeckId,
      courseId: otherCourse.id,
      primaryLessonId: lesson.id,
      type: 'front_back',
      front: 'C',
      back: 'D',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });
    await db.cards.add({
      id: 'card-course',
      deckId,
      courseId: course.id,
      primaryLessonId: lesson.id,
      type: 'front_back',
      front: 'A',
      back: 'B',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });

    expect((await findBackingDeck(course.id, lesson.id))?.id).toBe(deckId);
  });

  it('finds a lesson deck from a linked-only course card', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const linkedLesson = await createLesson(course.id, 'Revision');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    await db.decks.update(deckId, { backingCourseId: undefined, backingLessonId: undefined });
    await db.cards.add({
      id: 'linked-card',
      deckId,
      courseId: course.id,
      primaryLessonId: linkedLesson.id,
      type: 'front_back',
      front: 'A',
      back: 'B',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });
    await db.lessonCards.add({ id: 'link', lessonId: lesson.id, cardId: 'linked-card', createdAt: 1 });

    expect((await findBackingDeck(course.id, lesson.id))?.id).toBe(deckId);
  });
});
