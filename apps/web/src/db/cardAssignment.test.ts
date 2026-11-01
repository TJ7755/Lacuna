import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  ensureLessonDeck,
  ensureCourseBankDeck,
  createCourseCard,
  assignCardsToLesson,
  upsertLessonCardExposure,
} from './repository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { reset } from './courseRepository.testFixtures';

describe('assignCardsToLesson', () => {
  beforeEach(reset);

  it('rejects a mixed-course batch without changing cards, exposures or review history', async () => {
    const courseA = await createCourse('Course A');
    const courseB = await createCourse('Course B');
    const lessonA = await createLesson(courseA.id, 'Lesson A');
    const lessonB = await createLesson(courseB.id, 'Lesson B');
    const ownCard = await createLessonCard(courseA.id, lessonA.id, 'front_back', 'own', 'a');
    const foreignCard = await createLessonCard(
      courseB.id,
      lessonB.id,
      'front_back',
      'foreign',
      'b',
    );
    await upsertLessonCardExposure(lessonA.id, ownCard.id, 1);
    await upsertLessonCardExposure(lessonB.id, foreignCard.id, 1);
    await db.reviewHistory.add({
      id: 'review:event:foreign',
      eventId: 'foreign',
      cardId: foreignCard.id,
      deckId: foreignCard.deckId,
      schedulingUnitId: foreignCard.schedulingUnitId,
      courseId: courseB.id,
      primaryLessonId: lessonB.id,
      timestamp: 1,
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    });
    const before = {
      cards: await db.cards.toArray(),
      exposures: await db.lessonCardExposures.toArray(),
      history: await db.reviewHistory.toArray(),
    };

    await expect(
      assignCardsToLesson([ownCard.id, foreignCard.id], courseA.id, lessonA.id),
    ).rejects.toThrow('Card does not belong to the selected Course.');

    expect(await db.cards.toArray()).toEqual(before.cards);
    expect(await db.lessonCardExposures.toArray()).toEqual(before.exposures);
    expect(await db.reviewHistory.toArray()).toEqual(before.history);
  });

  it('rejects a lesson belonging to another course without changing stored rows', async () => {
    const courseA = await createCourse('Course A');
    const courseB = await createCourse('Course B');
    const lessonA = await createLesson(courseA.id, 'Lesson A');
    const lessonB = await createLesson(courseB.id, 'Lesson B');
    const card = await createLessonCard(courseA.id, lessonA.id, 'front_back', 'q', 'a');
    const before = await db.cards.get(card.id);

    await expect(assignCardsToLesson([card.id], courseA.id, lessonB.id)).rejects.toThrow(
      'Lesson does not belong to the selected Course.',
    );

    expect(await db.cards.get(card.id)).toEqual(before);
  });

  it('keeps canonical review-history ownership in sync when assigning a reviewed card', async () => {
    const course = await createCourse('Course');
    const lessonA = await createLesson(course.id, 'Lesson A');
    const lessonB = await createLesson(course.id, 'Lesson B');
    const card = await createLessonCard(course.id, lessonA.id, 'front_back', 'q', 'a');
    const oldDeckId = card.deckId;
    await db.reviewHistory.add({
      id: 'review:event:move',
      eventId: 'move',
      cardId: card.id,
      deckId: oldDeckId,
      schedulingUnitId: oldDeckId,
      courseId: course.id,
      primaryLessonId: lessonA.id,
      timestamp: 1,
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    });

    await assignCardsToLesson([card.id], course.id, lessonB.id);

    const updated = await db.cards.get(card.id);
    const history = await db.reviewHistory.where('cardId').equals(card.id).toArray();
    expect(updated?.deckId).toBe(await ensureLessonDeck(course.id, lessonB.id));
    expect(updated?.primaryLessonId).toBe(lessonB.id);
    expect(history).toEqual([
      expect.objectContaining({ deckId: updated?.deckId, primaryLessonId: lessonB.id }),
    ]);
    const hydrated = await hydrateCardsWithHistory([updated!]);
    expect(hydrated[0].history).toHaveLength(1);
  });

  it('moves unassigned cards into a lesson and updates deckId to match', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    const bankDeckId = card.deckId;

    await assignCardsToLesson([card.id], course.id, lesson.id);

    const updated = await db.cards.get(card.id);
    expect(updated?.primaryLessonId).toBe(lesson.id);
    expect(updated?.deckId).not.toBe(bankDeckId);
    expect(updated?.deckId).toBe(await ensureLessonDeck(course.id, lesson.id));
  });

  it('unassigns a lesson card back to the course bank deck when lessonId is null', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    await assignCardsToLesson([card.id], course.id, null);

    const updated = await db.cards.get(card.id);
    expect(updated?.primaryLessonId).toBeNull();
    expect(updated?.deckId).toBe(await ensureCourseBankDeck(course.id));
  });

  it('reassigns multiple cards from different lessons to the same target lesson', async () => {
    const course = await createCourse('Course');
    const lessonA = await createLesson(course.id, 'Lesson A');
    const lessonB = await createLesson(course.id, 'Lesson B');
    const cardA = await createLessonCard(course.id, lessonA.id, 'front_back', 'qa', 'aa');
    const cardB = await createLessonCard(course.id, lessonB.id, 'front_back', 'qb', 'ab');

    await assignCardsToLesson([cardA.id, cardB.id], course.id, lessonB.id);

    const [updatedA, updatedB] = await Promise.all([
      db.cards.get(cardA.id),
      db.cards.get(cardB.id),
    ]);
    expect(updatedA?.primaryLessonId).toBe(lessonB.id);
    expect(updatedB?.primaryLessonId).toBe(lessonB.id);
    expect(updatedA?.deckId).toBe(updatedB?.deckId);
  });
});
