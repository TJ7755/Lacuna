import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import { applyReview, makeEngine } from '@lacuna/core/fsrs/fsrs';
import { rescheduleCards } from './cardBulkActions';
import { applyScheduleEdit } from './scheduleEdits';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { backup } from '../sync/mergeSnapshots.testFixtures';
import { reviewHistoryEntryIdForEvent } from '@lacuna/core/db/reviewHistory';
import { fsrsWeightsFingerprint } from '@lacuna/core/fsrs/weightProvenance';
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

  it.each(
    (['answers', 'reset-before', 'reset-between', 'shared-reset'] as const).flatMap((mode) =>
      [1, 5].map((priorReviews) => ({ mode, priorReviews })),
    ),
  )(
    'reconciles timestamp-free imports after $priorReviews reviews and peer changes: $mode',
    async ({ mode, priorReviews }) => {
      const deck = await createCourse('Imported learning');
      const created = await createCard(deck.id, 'front_back', 'q', 'a');
      const imported = {
        ...created,
        state: 2 as const,
        stability: 10,
        stabilityFast: null,
        difficulty: 4,
        lastReviewed: null,
        reps: priorReviews,
        lapses: 1,
        due: 900000,
        scheduledDays: 10,
        updatedAt: 1,
      };
      const reset = { at: mode === 'reset-between' ? 2500 : 1500, kind: 'reset' as const };
      const resetCard = {
        ...applyScheduleEdit(imported, reset),
        scheduleEdits: [reset],
        updatedAt: reset.at,
      };
      const start = mode === 'shared-reset' ? resetCard : imported;
      await db.cards.put(start);
      const args = {
        card: start,
        deck,
        sessionId: 'peer',
        sessionKind: 'deck' as const,
        grade: 3 as const,
        responseTimeSec: 1,
        distracted: false,
        correct: true,
      };
      const first = await recordReview({ ...args, eventId: 'import-first', now: 2000 });
      const firstEvent = (await db.reviewHistory.get(
        reviewHistoryEntryIdForEvent('import-first'),
      ))!;
      if (mode !== 'reset-between') {
        await db.cards.put(start);
        await db.reviewHistory.clear();
      }
      const second = await recordReview({ ...args, eventId: 'import-second', now: 3000 });
      const secondEvent = (await db.reviewHistory.get(
        reviewHistoryEntryIdForEvent('import-second'),
      ))!;
      const resetPeer = mode === 'reset-before' || mode === 'reset-between';
      const left = backup({
        courses: [deck],
        cards: [resetPeer ? resetCard : first.card],
        reviewHistory: resetPeer ? [] : [firstEvent],
      });
      const right = backup({
        courses: [deck],
        cards: [second.card],
        reviewHistory: mode === 'reset-between' ? [firstEvent, secondEvent] : [secondEvent],
      });
      const merged = mergeSnapshots(left, right);
      const beforeLast =
        mode === 'reset-between'
          ? applyScheduleEdit(first.card, reset)
          : mode === 'reset-before'
            ? resetCard
            : first.card;
      const expected = applyReview(makeEngine(deck.fsrsParameters), beforeLast, 3, 3000).memory;
      expect(merged.cards[0]).toMatchObject(expected);
      expect(merged.cards[0].reps).toBe(
        mode === 'reset-before' ? priorReviews + 1 : priorReviews + 2,
      );
      expect(merged.reviewHistory).toHaveLength(mode === 'reset-before' ? 1 : 2);
      expect(mergeSnapshots(right, left)).toEqual(merged);
      expect(mergeSnapshots(merged, right)).toEqual(merged);
    },
  );

  it.each([
    { twoResets: false, answerAt: 2000 },
    { twoResets: true, answerAt: 2000 },
    { twoResets: true, answerAt: 1500 },
  ])(
    'keeps lifetime counters with two resets=$twoResets and first answer at $answerAt',
    async ({ twoResets, answerAt }) => {
      const deck = await createCourse('Complete reset history');
      const fresh = await createCard(deck.id, 'front_back', 'q', 'a');
      const args = {
        card: fresh,
        deck,
        sessionId: 'complete-reset',
        sessionKind: 'deck' as const,
        responseTimeSec: 1,
        distracted: false,
        correct: true,
      };
      const shared = await recordReview({ ...args, eventId: 'shared', grade: 4, now: 1000 });
      const sharedEvent = (await db.reviewHistory.get(reviewHistoryEntryIdForEvent('shared')))!;
      const offline = await recordReview({
        ...args,
        card: shared.card,
        eventId: 'offline-answer',
        grade: twoResets ? 4 : 1,
        now: twoResets ? 2200 : 2000,
      });
      const b = backup({
        courses: [deck],
        cards: [offline.card],
        reviewHistory: await db.reviewHistory.toArray(),
      });
      await db.cards.put(shared.card);
      await db.reviewHistory.clear();
      await db.reviewHistory.put(sharedEvent);
      if (twoResets) {
        const earlierClock = vi.spyOn(Date, 'now').mockReturnValue(1500);
        try {
          await rescheduleCards([fresh.id], { reset: true });
        } finally {
          earlierClock.mockRestore();
        }
        const afterFirstReset = await recordReview({
          ...args,
          card: (await db.cards.get(fresh.id))!,
          eventId: 'after-first-reset',
          grade: 1,
          now: answerAt,
        });
        const intermediate = backup({
          courses: [deck],
          cards: [afterFirstReset.card],
          reviewHistory: await db.reviewHistory.toArray(),
        });
        expect(mergeSnapshots(intermediate, intermediate).cards[0]).toMatchObject({
          state: afterFirstReset.card.state,
          due: afterFirstReset.card.due,
          reps: afterFirstReset.card.reps,
          lapses: afterFirstReset.card.lapses,
        });
      }
      const clock = vi.spyOn(Date, 'now').mockReturnValue(2500);
      try {
        await rescheduleCards([fresh.id], { reset: true });
      } finally {
        clock.mockRestore();
      }
      const resetCard = (await db.cards.get(fresh.id))!;
      const afterReset = await recordReview({
        ...args,
        card: resetCard,
        eventId: 'after-reset',
        grade: 4,
        now: 3000,
      });
      const a = backup({
        courses: [deck],
        cards: [afterReset.card],
        reviewHistory: await db.reviewHistory.toArray(),
      });
      const merged = mergeSnapshots(a, b);
      expect(merged.reviewHistory).toHaveLength(twoResets ? 4 : 3);
      expect(merged.cards[0]).toMatchObject(
        twoResets ? { reps: 4, lapses: 0 } : { reps: 3, lapses: 1 },
      );
      if (!twoResets) {
        const reset = resetCard.scheduleEdits!.at(-1)!;
        const expected = applyReview(
          makeEngine(deck.fsrsParameters),
          applyScheduleEdit(offline.card, reset),
          4,
          3000,
        ).memory;
        expect(merged.cards[0]).toMatchObject(expected);
      }
      expect(mergeSnapshots(b, a)).toEqual(merged);
      expect(mergeSnapshots(merged, a)).toEqual(merged);
    },
  );

  it('applies a witnessed reset before an equal-time answer despite an unwitnessed due edit', async () => {
    const deck = await createCourse('Concurrent equal-time edits');
    const fresh = await createCard(deck.id, 'front_back', 'q', 'a');
    const answer = async (eventId: string, grade: 1 | 4, now: number) =>
      recordReview({
        card: (await db.cards.get(fresh.id))!,
        deck,
        eventId,
        grade,
        now,
        sessionId: 'equal-time-edits',
        sessionKind: 'deck',
        responseTimeSec: 1,
        distracted: false,
        correct: grade === 4,
      });
    const edit = async (at: number, options: Parameters<typeof rescheduleCards>[1]) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(at);
      try {
        await rescheduleCards([fresh.id], options);
      } finally {
        clock.mockRestore();
      }
    };
    const shared = await answer('shared', 4, 1000);
    const sharedEvent = (await db.reviewHistory.get(reviewHistoryEntryIdForEvent('shared')))!;
    await edit(1500, { reset: true });
    const first = await answer('after-reset', 1, 1500);
    const a = backup({
      courses: [deck],
      cards: [first.card],
      reviewHistory: await db.reviewHistory.toArray(),
    });
    await db.cards.put(shared.card);
    await db.reviewHistory.clear();
    await db.reviewHistory.put(sharedEvent);
    await edit(1250, { reset: true });
    await edit(1500, { due: 900000 });
    const second = await answer('offline-easy', 4, 2200);
    const b = backup({
      courses: [deck],
      cards: [second.card],
      reviewHistory: await db.reviewHistory.toArray(),
    });
    const merged = mergeSnapshots(a, b);
    const expected = applyReview(
      makeEngine(deck.fsrsParameters),
      { ...first.card, due: 900000 },
      4,
      2200,
    ).memory;
    expect(merged.cards[0]).toMatchObject(expected);
    expect(merged.cards[0]).toMatchObject({ reps: 3, lapses: 0 });
    expect(mergeSnapshots(b, a)).toEqual(merged);
    expect(mergeSnapshots(merged, b)).toEqual(merged);
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
