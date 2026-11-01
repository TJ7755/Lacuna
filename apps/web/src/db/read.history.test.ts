import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import type { ReviewLog } from './types';
import { createCourse, createLesson, createLessonCard } from './repository';
import { getCard, hydrateCardsWithHistory } from './read';
import { clearAll } from './read.testFixtures';

describe('canonical-history hydration', () => {
  beforeEach(clearAll);

  afterEach(() => vi.restoreAllMocks());

  it('hydrates canonical review history and retains an unmatched legacy projection', async () => {
    const course = await createCourse('Course A');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const stale: ReviewLog = {
      timestamp: 999,
      grade: 1,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    await db.reviewHistory.add({
      ...stale,
      id: 'review:event:canonical',
      eventId: 'canonical',
      timestamp: 100,
      cardId: card.id,
      deckId: card.deckId,
      schedulingUnitId: card.deckId,
      courseId: course.id,
      primaryLessonId: lesson.id,
    });

    const rawCard = await db.cards.get(card.id);
    expect(rawCard).toBeDefined();
    const hydrated = await hydrateCardsWithHistory([{ ...rawCard!, history: [stale] }]);
    expect(hydrated[0].history.map((entry) => entry.eventId)).toEqual(['canonical', undefined]);
    expect((await getCard(card.id))?.history[0].eventId).toBe('canonical');
    expect((await getCard(card.id))?.history).toHaveLength(1);
  });

  it('falls back to embedded history for legacy-only cards', async () => {
    const course = await createCourse('Course A');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const legacy: ReviewLog = {
      timestamp: 100,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    const rawCard = await db.cards.get(card.id);
    expect(rawCard).toBeDefined();
    expect(
      (await hydrateCardsWithHistory([{ ...rawCard!, history: [legacy] }]))[0].history[0].timestamp,
    ).toBe(100);
  });
});
