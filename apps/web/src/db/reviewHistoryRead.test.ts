import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCard, createCourseCard, createCourse } from './repository';
import { addDays } from '@lacuna/core/fsrs/heatmap';
import { startOfDay } from '@lacuna/core/utils/datetime';
import {
  dailyReviewCounts,
  hydrateCardsWithHistory,
  listAllReviewHistory,
  listReviewHistoryForCards,
  listReviewHistoryForCourse,
} from './reviewHistoryRead';
import {
  reviewHistoryEntryIdForEvent,
  resolveReviewHistoryCollisions,
} from '@lacuna/core/db/reviewHistory';
import type { ReviewLog } from '@lacuna/core/db/types';

function review(timestamp: number, eventId?: string): ReviewLog {
  return {
    ...(eventId ? { eventId } : {}),
    timestamp,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

describe('review-history read adapter', () => {
  beforeEach(async () => {
    await Promise.all([
      db.cards.clear(),
      db.schedulingUnits.clear(),
      db.courses.clear(),
      db.reviewHistory.clear(),
    ]);
  });

  it('hydrates every card in caller order despite historical ownership changes', async () => {
    const course = await createCourse('Biology', { learnFirst: false });
    const cards = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createCourseCard(course.id, 'front_back', `Cell ${i}`, 'Mitochondrion'),
      ),
    );
    const now = Date.now();
    for (const [i, card] of cards.entries()) {
      Object.assign(card, {
        stability: 2 + i,
        stabilityFast: 1 + i,
        difficulty: 5,
        reps: 3,
        state: 2,
        lastReviewed: now - 2 * 86_400_000,
        due: now - 86_400_000,
      });
    }
    await db.reviewHistory.bulkAdd(
      cards.flatMap((card, i) =>
        Array.from({ length: 3 }, (_, r) => ({
          ...review(now - (4 - r) * 86_400_000, `${card.id}-${r}`),
          stabilityAfter: card.stability as number,
          stabilityFastAfter: card.stabilityFast as number,
          id: `${card.id}-${r}`,
          cardId: card.id,
          // Historical ownership can differ after a card moves; cardId is authoritative.
          courseId: i % 2 ? 'previous-course' : course.id,
          schedulingUnitId: card.schedulingUnitId,
        })),
      ),
    );
    const actual = await hydrateCardsWithHistory(cards);
    expect(actual.map((card) => card.id)).toEqual(cards.map((card) => card.id));
    for (const [index, card] of actual.entries()) {
      expect({ ...card, history: [] }).toEqual(cards[index]);
      expect(card.history.map((row) => [row.eventId, row.timestamp])).toEqual([
        [`${cards[index].id}-0`, now - 4 * 86_400_000],
        [`${cards[index].id}-1`, now - 3 * 86_400_000],
        [`${cards[index].id}-2`, now - 2 * 86_400_000],
      ]);
    }
  });

  it('counts repeat attempts within the local day by course and scheduling unit', async () => {
    const course = await createCourse('Daily reviews');
    const otherCourse = await createCourse('Other course');
    const card = await createCourseCard(course.id, 'front_back', 'Q', 'A');
    const otherCard = await createCourseCard(otherCourse.id, 'front_back', 'Q', 'A');
    const today = Date.now();
    const dayStart = startOfDay(today);
    const tomorrow = addDays(dayStart, 1);
    await db.reviewHistory.bulkAdd([
      {
        ...review(dayStart - 1, 'yesterday'),
        id: 'yesterday',
        cardId: card.id,
        courseId: course.id,
        schedulingUnitId: card.schedulingUnitId,
      },
      {
        ...review(dayStart, 'first'),
        id: 'first',
        cardId: card.id,
        courseId: course.id,
        schedulingUnitId: card.schedulingUnitId,
      },
      {
        ...review(today, 'repeat'),
        id: 'repeat',
        cardId: card.id,
        courseId: course.id,
        schedulingUnitId: card.schedulingUnitId,
      },
      {
        ...review(tomorrow, 'tomorrow'),
        id: 'tomorrow',
        cardId: card.id,
        courseId: course.id,
        schedulingUnitId: card.schedulingUnitId,
      },
      {
        ...review(today, 'other'),
        id: 'other',
        cardId: otherCard.id,
        courseId: otherCourse.id,
        schedulingUnitId: otherCard.schedulingUnitId,
      },
    ]);

    expect(await dailyReviewCounts('course', today)).toEqual(
      new Map([
        [course.id, 2],
        [otherCourse.id, 1],
      ]),
    );
    expect(await dailyReviewCounts('scheduling-unit', today)).toEqual(
      new Map([
        [card.schedulingUnitId, 2],
        [otherCard.schedulingUnitId, 1],
      ]),
    );
  });

  it('returns canonical rows first and retains legacy-only projection rows', async () => {
    const deck = await createCourse('Deck');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    const legacy = review(999);
    await db.reviewHistory.add({
      ...review(100, 'canonical-event'),
      id: 'review:event:canonical-event',
      cardId: card.id,
      deckId: card.deckId,
      schedulingUnitId: card.deckId,
    });

    const events = await listReviewHistoryForCards([{ ...card, history: [legacy] }]);

    expect(events.map((event) => event.timestamp)).toEqual([100, 999]);
    expect(events[0].eventId).toBe('canonical-event');
    expect(events[1].eventId).toBeUndefined();
  });

  it('prefers the canonical row over a stale projection for the same event', async () => {
    const deck = await createCourse('Deck');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    await db.reviewHistory.add({
      ...review(100, 'same-event'),
      id: reviewHistoryEntryIdForEvent('same-event'),
      cardId: card.id,
      deckId: card.deckId,
      schedulingUnitId: card.deckId,
    });

    const events = await listReviewHistoryForCards([
      { ...card, history: [review(999, 'same-event')] },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: reviewHistoryEntryIdForEvent('same-event'),
      timestamp: 100,
    });
  });

  it('uses canonical-only rows and falls back to projection-only rows when absent', async () => {
    const deck = await createCourse('Read precedence');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    await db.reviewHistory.add({
      ...review(100, 'canonical-only'),
      id: reviewHistoryEntryIdForEvent('canonical-only'),
      cardId: card.id,
      deckId: card.deckId,
      schedulingUnitId: card.deckId,
    });

    const canonicalHydrated = (await hydrateCardsWithHistory([(await db.cards.get(card.id))!]))[0];
    expect(canonicalHydrated.history).toHaveLength(1);
    expect(canonicalHydrated.history[0].eventId).toBe('canonical-only');

    await db.reviewHistory.clear();
    const projectionCard = { ...card, history: [review(999, 'projection-only')] };
    const projectionHydrated = (await hydrateCardsWithHistory([projectionCard]))[0];

    expect(projectionHydrated.history).toHaveLength(1);
    expect(projectionHydrated.history[0].eventId).toBe('projection-only');

    const explicitEmptyHydrated = (await hydrateCardsWithHistory([projectionCard], []))[0];
    expect(explicitEmptyHydrated.history).toEqual([]);
  });

  it('lists course events without leaking events from another course', async () => {
    const biology = await createCourse('Biology');
    const chemistry = await createCourse('Chemistry');
    const biologyCard = await createCourseCard(biology.id, 'front_back', 'Q1', 'A1');
    const chemistryCard = await createCourseCard(chemistry.id, 'front_back', 'Q2', 'A2');
    await db.reviewHistory.bulkAdd([
      {
        ...review(200, 'biology-event'),
        id: reviewHistoryEntryIdForEvent('biology-event'),
        cardId: biologyCard.id,
        deckId: biologyCard.deckId,
        schedulingUnitId: biologyCard.deckId,
        courseId: biology.id,
      },
      {
        ...review(300, 'chemistry-event'),
        id: reviewHistoryEntryIdForEvent('chemistry-event'),
        cardId: chemistryCard.id,
        deckId: chemistryCard.deckId,
        schedulingUnitId: chemistryCard.deckId,
        courseId: chemistry.id,
      },
    ]);

    const events = await listReviewHistoryForCourse(biology.id);

    expect(events).toHaveLength(1);
    expect(events[0].cardId).toBe(biologyCard.id);
    const supplied = { ...biologyCard, history: [review(100)] };
    const reused = await listReviewHistoryForCourse(biology.id, [supplied]);
    expect(reused.map((entry) => entry.timestamp)).toEqual([100, 200]);
    expect(await listAllReviewHistory()).toHaveLength(2);
  });

  it('repairs canonical cross-card event collisions even when all projections are suppressed', async () => {
    const course = await createCourse('Collision reads');
    const first = await createCourseCard(course.id, 'front_back', 'First', 'A');
    const second = await createCourseCard(course.id, 'front_back', 'Second', 'A');
    const canonical = [
      { ...review(100, 'shared-event'), id: 'first-row', cardId: first.id, courseId: course.id },
      { ...review(200, 'shared-event'), id: 'second-row', cardId: second.id, courseId: course.id },
    ];
    await db.reviewHistory.bulkAdd(canonical);
    // Both stale projections must be suppressed before resolving canonical collisions.
    await db.cards.bulkPut([
      { ...first, history: [review(999, 'shared-event')] },
      { ...second, history: [review(999, 'shared-event')] },
    ]);

    expect(await listAllReviewHistory()).toEqual(resolveReviewHistoryCollisions(canonical));
    expect(await listReviewHistoryForCourse(course.id)).toEqual(
      resolveReviewHistoryCollisions(canonical),
    );
  });

  it('retains legacy duplicate occurrences alongside canonical events after filtering projections', async () => {
    const course = await createCourse('Legacy reads');
    const card = await createCourseCard(course.id, 'front_back', 'Q', 'A');
    const legacy = review(200);
    await db.reviewHistory.add({
      ...review(100, 'canonical'),
      id: 'canonical-row',
      cardId: card.id,
    });
    const entries = await listReviewHistoryForCards([
      { ...card, history: [review(999, 'canonical'), legacy, legacy] },
    ]);
    expect(entries.map((entry) => entry.timestamp)).toEqual([100, 200, 200]);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
  });
});
