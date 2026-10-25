import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import { performanceForReviewUnit } from './backingDecks';
import {
  createCard,
  createCourse,
  recordReview,
  sampleReviewTrajectory,
  undoReview,
} from './repository';
import { waitForTrajectorySample } from './reviewRepository.testFixtures';

describe('review trajectory sampling', () => {
  beforeEach(async () => {
    await Promise.all([
      db.schedulingUnits.clear(),
      db.cards.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.assets.clear(),
      db.reviewHistory.clear(),
      db.schedulingUnits.clear(),
      db.schedulingPerformance.clear(),
    ]);
  });

  it('skips the card scan when the unit already has a trajectory sample today', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    const now = 1_725_123_456_789;

    await db.sessionHistory.add({
      eventId: 'existing-daily-sample',
      sessionId: 'session-existing-daily-sample',
      timestamp: now,
      deckId: deck.id,
      schedulingUnitId: deck.id,
      averagePredictedRetrievability: 0.5,
    });
    await recordReview({
      card,
      deck,
      eventId: 'event-daily-sample-skip',
      sessionId: 'session-daily-sample-skip',
      sessionKind: 'deck',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
      now,
    });

    const cardsWhere = vi.spyOn(db.cards, 'where');
    try {
      await sampleReviewTrajectory({
        eventId: 'event-daily-sample-skip',
        sessionId: 'session-daily-sample-skip',
        timestamp: now,
        deck,
        kind: 'scheduling-unit',
        cardId: card.id,
      });
    } finally {
      cardsWhere.mockRestore();
    }

    expect(cardsWhere).not.toHaveBeenCalled();
    expect(await db.sessionHistory.count()).toBe(1);
  });

  it('defers and coalesces the daily trajectory scan until after the next frame', async () => {
    const deck = await createCourse('Deferred trajectory');
    const first = await createCard(deck.id, 'front_back', 'first', 'answer');
    const second = await createCard(deck.id, 'front_back', 'second', 'answer');
    const realSetTimeout = globalThis.setTimeout;
    const fallbackTimer = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((...args: Parameters<typeof setTimeout>) =>
        args[1] === 250
          ? realSetTimeout(() => {}, 0)
          : realSetTimeout(...args)) as typeof setTimeout);
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    const cardsWhere = vi.spyOn(db.cards, 'where');

    try {
      await recordReview({
        card: first,
        deck,
        eventId: 'event-deferred-first',
        sessionId: 'session-deferred',
        sessionKind: 'deck',
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
      });
      await recordReview({
        card: second,
        deck,
        eventId: 'event-deferred-second',
        sessionId: 'session-deferred',
        sessionKind: 'deck',
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(frames).toHaveLength(1);
      expect(cardsWhere).not.toHaveBeenCalled();
      expect(await db.sessionHistory.count()).toBe(0);

      frames[0](performance.now());
      await waitForTrajectorySample('event-deferred-second');
      expect(cardsWhere).toHaveBeenCalledTimes(1);
      expect(await db.sessionHistory.count()).toBe(1);
    } finally {
      cardsWhere.mockRestore();
      requestFrame.mockRestore();
      fallbackTimer.mockRestore();
    }
  });

  it('falls back to an earlier coalesced event when the latest review is undone before sampling', async () => {
    const deck = await createCourse('Coalesced undo');
    const first = await createCard(deck.id, 'front_back', 'first', 'answer');
    const second = await createCard(deck.id, 'front_back', 'second', 'answer');
    const realSetTimeout = globalThis.setTimeout;
    const fallbackTimer = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((...args: Parameters<typeof setTimeout>) =>
        args[1] === 250
          ? realSetTimeout(() => {}, 0)
          : realSetTimeout(...args)) as typeof setTimeout);
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });

    try {
      await recordReview({
        card: first,
        deck,
        eventId: 'event-coalesced-a',
        sessionId: 'session-coalesced',
        sessionKind: 'deck',
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
      });
      const perfBeforeSecond = (await performanceForReviewUnit(deck.id)) ?? null;
      const secondResult = await recordReview({
        card: second,
        deck,
        eventId: 'event-coalesced-b',
        sessionId: 'session-coalesced',
        sessionKind: 'deck',
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
      });
      await undoReview({
        eventId: 'event-coalesced-b',
        cardBefore: secondResult.cardBefore,
        perfBefore: perfBeforeSecond,
        deckId: deck.id,
        kind: secondResult.kind,
        lastInteractedAtBefore: secondResult.lastInteractedAtBefore,
        updatedAtBefore: secondResult.updatedAtBefore,
        undoStateAfter: secondResult.undoStateAfter,
      });

      frames[0](performance.now());
      const sample = await waitForTrajectorySample('event-coalesced-a');
      expect(sample.eventId).toBe('event-coalesced-a');
      expect(await db.sessionHistory.count()).toBe(1);
    } finally {
      requestFrame.mockRestore();
      fallbackTimer.mockRestore();
    }
  });

  it('runs a frame-suspended trajectory job once through its timer fallback', async () => {
    const deck = await createCourse('Suspended frame');
    const card = await createCard(deck.id, 'front_back', 'question', 'answer');
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });

    try {
      await recordReview({
        card,
        deck,
        eventId: 'event-frame-fallback',
        sessionId: 'session-frame-fallback',
        sessionKind: 'deck',
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
      });
      await waitForTrajectorySample('event-frame-fallback');
      frames[0](performance.now());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(await db.sessionHistory.count()).toBe(1);
    } finally {
      requestFrame.mockRestore();
    }
  });
});
