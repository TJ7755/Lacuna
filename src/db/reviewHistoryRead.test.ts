import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCard, createCourse, createCourseCard, createDeck } from './repository';
import {
  hydrateCardsWithHistory,
  listAllReviewHistory,
  listReviewHistoryForCards,
  listReviewHistoryForCourse,
} from './reviewHistoryRead';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';
import type { ReviewLog } from './types';

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
      db.decks.clear(),
      db.courses.clear(),
      db.reviewHistory.clear(),
    ]);
  });

  it('returns canonical rows first and retains legacy-only projection rows', async () => {
    const deck = await createDeck('Deck');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    const legacy = review(999);
    await db.cards.update(card.id, { history: [legacy] });
    await db.reviewHistory.add({
      ...review(100, 'canonical-event'),
      id: 'review:event:canonical-event',
      cardId: card.id,
      deckId: card.deckId,
    });

    const events = await listReviewHistoryForCards([(await db.cards.get(card.id))!]);

    expect(events.map((event) => event.timestamp)).toEqual([100, 999]);
    expect(events[0].eventId).toBe('canonical-event');
    expect(events[1].eventId).toBeUndefined();
  });

  it('prefers the canonical row over a stale projection for the same event', async () => {
    const deck = await createDeck('Deck');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    await db.cards.update(card.id, { history: [review(999, 'same-event')] });
    await db.reviewHistory.add({
      ...review(100, 'same-event'),
      id: reviewHistoryEntryIdForEvent('same-event'),
      cardId: card.id,
      deckId: card.deckId,
    });

    const events = await listReviewHistoryForCards([(await db.cards.get(card.id))!]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: reviewHistoryEntryIdForEvent('same-event'),
      timestamp: 100,
    });
  });

  it('uses canonical-only rows when present and currently falls back to projection-only rows when absent', async () => {
    const deck = await createDeck('Read precedence');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    await db.reviewHistory.add({
      ...review(100, 'canonical-only'),
      id: reviewHistoryEntryIdForEvent('canonical-only'),
      cardId: card.id,
      deckId: card.deckId,
    });

    const canonicalHydrated = (await hydrateCardsWithHistory([(await db.cards.get(card.id))!]))[0];
    expect(canonicalHydrated.history).toHaveLength(1);
    expect(canonicalHydrated.history[0].eventId).toBe('canonical-only');

    await db.reviewHistory.clear();
    await db.cards.update(card.id, { history: [review(999, 'projection-only')] });
    const projectionHydrated = (await hydrateCardsWithHistory([(await db.cards.get(card.id))!]))[0];

    // This is the current compatibility fallback, and is the divergence recorded
    // in the findings report: an explicit canonical result with no matching row
    // does not suppress the stale projection.
    expect(projectionHydrated.history).toHaveLength(1);
    expect(projectionHydrated.history[0].eventId).toBe('projection-only');
  });

  it('lists course events without leaking events from another course', async () => {
    const biology = await createCourse('Biology');
    const chemistry = await createCourse('Chemistry');
    const biologyCard = await createCourseCard(biology.id, 'front_back', 'Q1', 'A1');
    const chemistryCard = await createCourseCard(chemistry.id, 'front_back', 'Q2', 'A2');
    await db.cards.update(biologyCard.id, { history: [review(200)] });
    await db.cards.update(chemistryCard.id, { history: [review(300)] });

    const events = await listReviewHistoryForCourse(biology.id);

    expect(events).toHaveLength(1);
    expect(events[0].cardId).toBe(biologyCard.id);
    expect(await listAllReviewHistory()).toHaveLength(2);
  });
});
