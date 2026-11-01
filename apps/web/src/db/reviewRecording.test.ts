import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';
import { fsrsWeightsFingerprint } from '../fsrs/weightProvenance';
import { performanceForReviewUnit } from './backingDecks';
import {
  createCard,
  createCourse,
  createLesson,
  createLessonCard,
  recordReview,
  undoReview,
} from './repository';
import { waitForTrajectorySample } from './reviewRepository.testFixtures';

describe('recordReview response time', () => {
  beforeEach(async () => {
    await Promise.all([
      db.cards.clear(),
      db.reviewHistory.clear(),
      db.sessionHistory.clear(),
      db.schedulingUnits.clear(),
      db.schedulingPerformance.clear(),
    ]);
  });

  it.each([NaN, Infinity, -Infinity, -1])(
    'rejects invalid response time %s before changing persisted state',
    async (responseTimeSec) => {
      const deck = await createCourse('Invalid review time');
      const card = await createCard(deck.id, 'front_back', 'q', 'a');
      const cardBefore = await db.cards.get(card.id);
      const unitBefore = await db.schedulingUnits.get(deck.id);
      const performanceBefore = await db.schedulingPerformance.get(deck.id);

      await expect(
        recordReview({
          card,
          deck,
          eventId: 'invalid-time',
          sessionId: 'invalid-time-session',
          sessionKind: 'deck',
          grade: 3,
          responseTimeSec,
          distracted: false,
          correct: true,
        }),
      ).rejects.toThrow('Review response time must be a non-negative finite number.');

      expect(await db.cards.get(card.id)).toEqual(cardBefore);
      expect(await db.schedulingUnits.get(deck.id)).toEqual(unitBefore);
      expect(await db.schedulingPerformance.get(deck.id)).toEqual(performanceBefore);
      expect(await db.reviewHistory.count()).toBe(0);
      expect(await db.sessionHistory.count()).toBe(0);
    },
  );
});

describe('recordReview', () => {
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

  it('records hintUsed on the review log, defaulting to false when omitted', async () => {
    const deck = await createCourse('Test deck');
    const cardWithHint = await createCard(deck.id, 'front_back', 'q1', 'a1');
    const cardWithoutHint = await createCard(deck.id, 'front_back', 'q2', 'a2');

    await recordReview({
      card: cardWithHint,
      eventId: 'event-hint',
      sessionId: 'session-hints',
      sessionKind: 'deck',
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      hintUsed: true,
      correct: true,
    });
    await recordReview({
      card: cardWithoutHint,
      eventId: 'event-no-hint',
      sessionId: 'session-hints',
      sessionKind: 'deck',
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    expect((await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-hint')))!.hintUsed).toBe(
      true,
    );
    expect(
      (await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-no-hint')))!.hintUsed,
    ).toBe(false);
  });

  it('records machine-awarded marks on the review log', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', '2 + 2', '', [], {
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    });

    await recordReview({
      card,
      eventId: 'event-numeric',
      sessionId: 'session-numeric',
      sessionKind: 'deck',
      deck,
      grade: 4,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
      marksEarned: 1,
      marksAvailable: 1,
      lineVerdicts: [{ studentLine: '4', matchedLineIndex: 0, marksEarned: 1 }],
      checkerDisputes: [
        {
          reportedAt: 1_725_123_456_789,
          question: '2 + 2',
          studentLine: '4',
          verdict: { correct: true, marksEarned: 1, matchedLineIndex: 0 },
          checkerSeeds: ['card:0:0'],
        },
      ],
    });

    expect(await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-numeric'))).toMatchObject(
      {
        grade: 4,
        correct: true,
        marksEarned: 1,
        marksAvailable: 1,
        lineVerdicts: [{ studentLine: '4', matchedLineIndex: 0, marksEarned: 1 }],
        checkerDisputes: [
          {
            reportedAt: 1_725_123_456_789,
            question: '2 + 2',
            studentLine: '4',
            verdict: { correct: true, marksEarned: 1, matchedLineIndex: 0 },
            checkerSeeds: ['card:0:0'],
          },
        ],
      },
    );
  });

  it('course-keyed review updates Course.lastInteractedAt, course performance and sessionHistory.courseId', async () => {
    await Promise.all([db.courses.clear(), db.lessons.clear()]);

    const c = await createCourse('Test course');
    const lesson = await createLesson(c.id, 'Lesson 1');
    const card = await createLessonCard(c.id, lesson.id, 'front_back', 'q', 'a');

    const cardBefore = (await db.cards.get(card.id))!;
    const coursePerformanceBefore = await performanceForReviewUnit(c.id, 'course');
    const perfBefore = coursePerformanceBefore ?? null;
    const courseLastInteractedAtBefore = (await db.courses.get(c.id))!.lastInteractedAt;

    const {
      card: updated,
      lastInteractedAtBefore,
      updatedAtBefore,
      undoStateAfter,
    } = await recordReview({
      card,
      eventId: 'event-course',
      sessionId: 'session-course',
      sessionKind: 'lesson',
      deck: c,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    expect(updated.reps).toBe(1);

    const historyRow = await waitForTrajectorySample('event-course');
    expect(historyRow?.courseId).toBe(c.id);
    expect(historyRow?.deckId).toBe(card.deckId);

    const perf = await performanceForReviewUnit(c.id, 'course');
    expect(perf?.totalCorrectReviews).toBe(1);

    const updatedCourse = await db.courses.get(c.id);
    expect(updatedCourse?.lastInteractedAt).toBeDefined();
    expect(lastInteractedAtBefore).toBe(courseLastInteractedAtBefore);
    expect(updatedCourse?.lastInteractedAt).not.toBe(courseLastInteractedAtBefore);

    // The lesson scheduling unit is untouched by a course-keyed review.
    expect((await performanceForReviewUnit(card.schedulingUnitId))?.totalCorrectReviews).toBe(0);

    await undoReview({
      eventId: 'event-course',
      cardBefore,
      perfBefore,
      sessionHistoryId: historyRow.id,
      deckId: c.id,
      kind: 'course',
      lastInteractedAtBefore,
      updatedAtBefore,
      undoStateAfter,
    });

    const restored = (await db.cards.get(card.id))!;
    expect(restored.reps).toBe(0);
    expect(await db.sessionHistory.get(historyRow.id)).toBeUndefined();
    expect(await performanceForReviewUnit(c.id, 'course')).toEqual(coursePerformanceBefore);
    expect((await db.courses.get(c.id))!.lastInteractedAt).toBe(courseLastInteractedAtBefore);
    expect((await db.courses.get(c.id))!.updatedAt).toBe(updatedAtBefore);
  });

  it('persists every provenance field and the exact attempt timestamp', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    const now = 1_725_123_456_789;

    const result = await recordReview({
      card,
      deck,
      eventId: 'event-provenance',
      sessionId: 'session-provenance',
      sessionKind: 'revision-plan',
      revisionPlanId: 'plan-1',
      revisionWindowId: 'window-1',
      grade: 2,
      correct: false,
      responseTimeSec: 3.125,
      distracted: true,
      hintUsed: true,
      now,
    });

    expect(result.recorded).toBe(true);
    expect(result.card.history[0]).toEqual(
      expect.objectContaining({
        eventId: 'event-provenance',
        sessionId: 'session-provenance',
        sessionKind: 'revision-plan',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
        timestamp: now,
        grade: 2,
        correct: false,
        responseTimeSec: 3.125,
        distracted: true,
        hintUsed: true,
        fsrsWeightsFingerprint: fsrsWeightsFingerprint(deck.fsrsParameters),
      }),
    );
    const historyRow = await waitForTrajectorySample('event-provenance');
    expect(historyRow).toEqual(
      expect.objectContaining({
        eventId: 'event-provenance',
        sessionId: 'session-provenance',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
        timestamp: now,
      }),
    );
  });

  it('commits concurrent replays once and performs one FSRS transition', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    const args = {
      card,
      deck,
      eventId: 'event-replayed',
      sessionId: 'session-replayed',
      sessionKind: 'deck' as const,
      grade: 3 as const,
      correct: true,
      responseTimeSec: 2,
      distracted: false,
      now: 1_725_123_456_789,
    };

    const results = await Promise.all([recordReview(args), recordReview(args)]);

    expect(results.map((result) => result.recorded).sort()).toEqual([false, true]);
    expect((await db.cards.get(card.id))?.reps).toBe(1);
    expect((await db.cards.get(card.id))?.history).toEqual([]);
    expect(results.every((result) => result.card.history.length === 1)).toBe(true);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
    await waitForTrajectorySample('event-replayed');
    expect(await db.sessionHistory.count()).toBe(1);
    expect((await db.schedulingPerformance.get(deck.id))?.totalCorrectReviews).toBe(1);
  });
});
