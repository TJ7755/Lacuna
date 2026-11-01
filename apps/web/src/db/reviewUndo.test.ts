import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';
import { performanceForCourseBackingDecks, performanceForReviewUnit } from './backingDecks';
import {
  createCard,
  createCourse,
  createLesson,
  createLessonCard,
  recordReview,
  undoReview,
  updateCard,
} from './repository';
import { waitForTrajectorySample } from './reviewRepository.testFixtures';

describe('undoReview', () => {
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

  it('fully reverses a review: card, calibration profile and session history', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    const cardBefore = (await db.cards.get(card.id))!;
    const perfBefore = (await performanceForReviewUnit(deck.id)) ?? null;
    const unitLastInteractedAtBefore = (await db.schedulingUnits.get(deck.id))!.lastInteractedAt;

    const {
      card: updated,
      lastInteractedAtBefore,
      updatedAtBefore,
      undoStateAfter,
    } = await recordReview({
      card,
      eventId: 'event-undo',
      sessionId: 'session-undo',
      sessionKind: 'deck',
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    // The review actually changed state.
    expect(updated.reps).toBe(1);
    expect(await db.sessionHistory.count()).toBe(0);
    expect((await db.schedulingPerformance.get(deck.id))!.totalCorrectReviews).toBe(1);
    expect(lastInteractedAtBefore).toBe(unitLastInteractedAtBefore);
    expect((await db.schedulingUnits.get(deck.id))!.lastInteractedAt).not.toBe(
      unitLastInteractedAtBefore,
    );

    const session = await waitForTrajectorySample('event-undo');
    expect(await db.sessionHistory.count()).toBe(1);
    expect(session.id).toBeDefined();

    await undoReview({
      eventId: 'event-undo',
      cardBefore,
      perfBefore,
      sessionHistoryId: session.id,
      deckId: deck.id,
      kind: 'scheduling-unit',
      lastInteractedAtBefore,
      updatedAtBefore,
      undoStateAfter,
    });

    expect((await db.schedulingUnits.get(deck.id))!.updatedAt).toBe(updatedAtBefore);

    const restored = (await db.cards.get(card.id))!;
    expect(restored.reps).toBe(0);
    expect(restored.state).toBe(0);
    expect(restored.lastReviewed).toBeNull();
    expect(await db.sessionHistory.count()).toBe(0);
    expect((await db.schedulingPerformance.get(deck.id))!.totalCorrectReviews).toBe(0);
    expect((await db.schedulingUnits.get(deck.id))!.lastInteractedAt).toBe(
      unitLastInteractedAtBefore,
    );
  });

  it.each(['later', 'same millisecond'] as const)(
    'refuses to undo after a %s card edit',
    async (timing) => {
      const deck = await createCourse('Stale undo guard');
      const card = await createCard(deck.id, 'front_back', 'q', 'a');
      const perfBefore = (await performanceForReviewUnit(deck.id)) ?? null;
      const result = await recordReview({
        card,
        eventId: 'event-stale-undo',
        sessionId: 'session-stale-undo',
        sessionKind: 'deck',
        deck,
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
      });
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(result.card.updatedAt + (timing === 'later' ? 1 : 0));
      try {
        await updateCard(card.id, { front: 'edited after review' });
      } finally {
        clock.mockRestore();
      }

      await expect(
        undoReview({
          eventId: 'event-stale-undo',
          cardBefore: result.cardBefore,
          perfBefore,
          sessionHistoryId: result.sessionHistoryId,
          deckId: deck.id,
          kind: 'scheduling-unit',
          lastInteractedAtBefore: result.lastInteractedAtBefore,
          updatedAtBefore: result.updatedAtBefore,
          undoStateAfter: result.undoStateAfter,
        }),
      ).rejects.toThrow('changed after this review');
      // The newer content and its review event survive the refused undo.
      expect((await db.cards.get(card.id))!.front).toBe('edited after review');
      expect(
        await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-stale-undo')),
      ).toBeDefined();
    },
  );

  it.each(['scheduling-unit', 'course'] as const)(
    'refuses stale undo after another card changes shared %s performance',
    async (kind) => {
      const deck = await createCourse('Shared undo state');
      const card = await createCard(deck.id, 'front_back', 'first', 'answer');
      const other = await createCard(deck.id, 'front_back', 'second', 'answer');
      const perfBefore = (await performanceForReviewUnit(deck.id, kind)) ?? null;
      const args = {
        sessionId: 'shared-undo',
        sessionKind: 'deck' as const,
        deck,
        kind,
        grade: 3 as const,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
        now: Date.now(),
      };
      const result = await recordReview({ ...args, card, eventId: 'shared-first' });
      await recordReview({ ...args, card: other, eventId: 'shared-second' });
      const performance = await performanceForReviewUnit(deck.id, kind);
      await expect(
        undoReview({
          ...result,
          eventId: 'shared-first',
          deckId: deck.id,
          perfBefore,
        }),
      ).rejects.toThrow('changed after this review');
      expect(await performanceForReviewUnit(deck.id, kind)).toEqual(performance);
      expect((await db.cards.get(card.id))?.reps).toBe(1);
      expect(
        await db.reviewHistory.get(reviewHistoryEntryIdForEvent('shared-first')),
      ).toBeDefined();
    },
  );

  it('keeps persisted cards compact while record and undo hydrate canonical history', async () => {
    const deck = await createCourse('Review history consistency');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    const perfBefore = (await db.userPerformance.get(deck.id)) ?? null;
    const result = await recordReview({
      card,
      eventId: 'event-consistency',
      sessionId: 'session-consistency',
      sessionKind: 'deck',
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    const recordedCard = (await db.cards.get(card.id))!;
    const canonical = await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-consistency'));
    expect(recordedCard.history).toEqual([]);
    expect(result.card.history).toHaveLength(1);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
    expect(canonical).toMatchObject({
      ...result.card.history[0],
      cardId: card.id,
      deckId: deck.id,
      schedulingUnitId: deck.id,
    });

    await undoReview({
      eventId: 'event-consistency',
      cardBefore: result.cardBefore,
      perfBefore,
      sessionHistoryId: result.sessionHistoryId,
      deckId: deck.id,
      kind: 'scheduling-unit',
      lastInteractedAtBefore: result.lastInteractedAtBefore,
      updatedAtBefore: result.updatedAtBefore,
      undoStateAfter: result.undoStateAfter,
    });

    const undoneCard = (await db.cards.get(card.id))!;
    expect(undoneCard.history).toEqual([]);
    expect(
      await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-consistency')),
    ).toBeUndefined();
    expect((await hydrateCardsWithHistory([undoneCard]))[0].history).toEqual([]);
  });

  it('undoes course calibration without changing the backing-deck pacing profile', async () => {
    const course = await createCourse('Course key-space undo');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const backingBefore = {
      deckId: card.deckId!,
      runningMeanResponseTime: 31,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 6,
    };
    const calibrationBefore = {
      deckId: course.id,
      runningMeanResponseTime: 17,
      runningStdDevResponseTime: 3,
      m2: 12,
      totalCorrectReviews: 4,
    };
    await db.userPerformance.bulkPut([backingBefore, calibrationBefore]);

    const cardBefore = (await db.cards.get(card.id))!;
    const result = await recordReview({
      card,
      eventId: 'event-course-key-space-undo',
      sessionId: 'session-course-key-space-undo',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    await undoReview({
      eventId: 'event-course-key-space-undo',
      cardBefore,
      perfBefore: calibrationBefore,
      sessionHistoryId: result.sessionHistoryId,
      deckId: course.id,
      kind: 'course',
      lastInteractedAtBefore: result.lastInteractedAtBefore,
      updatedAtBefore: result.updatedAtBefore,
      undoStateAfter: result.undoStateAfter,
    });

    expect(await db.userPerformance.get(course.id)).toEqual(calibrationBefore);
    expect(await db.userPerformance.get(card.deckId!)).toEqual(backingBefore);
    expect(
      (await performanceForCourseBackingDecks(course.id, [card])).map((row) => row.deckId),
    ).toEqual([card.schedulingUnitId]);
    expect(await performanceForReviewUnit(course.id, 'course')).toMatchObject({
      deckId: course.id,
    });
    expect(await performanceForReviewUnit(card.schedulingUnitId!)).toMatchObject({
      deckId: card.schedulingUnitId,
    });
  });

  it('makes repeated undo harmless and permits a genuine retry afterwards', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    const perfBefore = (await db.userPerformance.get(deck.id)) ?? null;
    const result = await recordReview({
      card,
      deck,
      eventId: 'event-retry',
      sessionId: 'session-retry',
      sessionKind: 'deck',
      grade: 3,
      correct: true,
      responseTimeSec: 2,
      distracted: false,
    });
    const undo = {
      eventId: 'event-retry',
      cardBefore: result.cardBefore,
      perfBefore,
      sessionHistoryId: result.sessionHistoryId,
      deckId: deck.id,
      schedulingUnitId: deck.id,
      kind: result.kind,
      lastInteractedAtBefore: result.lastInteractedAtBefore,
      updatedAtBefore: result.updatedAtBefore,
      undoStateAfter: result.undoStateAfter,
    };

    await undoReview(undo);
    await undoReview(undo);
    const retried = await recordReview({
      card: result.cardBefore,
      deck,
      eventId: 'event-retry',
      sessionId: 'session-retry',
      sessionKind: 'deck',
      grade: 3,
      correct: true,
      responseTimeSec: 2,
      distracted: false,
    });

    expect(retried.recorded).toBe(true);
    expect((await db.cards.get(card.id))?.reps).toBe(1);
    await waitForTrajectorySample('event-retry');
    expect(await db.sessionHistory.count()).toBe(1);
  });
});
