import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import type { SessionHistoryEntry } from './types';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';
import { fsrsWeightsFingerprint } from '../fsrs/weightProvenance';
import {
  performanceForCourseBackingDecks,
  performanceForReviewUnits,
} from './backingDecks';
import {
  addTagToCards,
  buryCards,
  createCard,
  createCards,
  createCardWithReverse,
  createCourse,
  createDeck,
  createLesson,
  createLessonCard,
  deleteCards,
  moveCards,
  ratchetLessonUnlock,
  recordReview,
  removeTagFromCards,
  rescheduleCards,
  sampleReviewTrajectory,
  setCardsSuspended,
  undoReview,
  updateCard,
} from './repository';

async function waitForTrajectorySample(
  eventId: string,
): Promise<SessionHistoryEntry & { id: number }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const entry = await db.sessionHistory.where('eventId').equals(eventId).first();
    if (entry?.id !== undefined) return entry as SessionHistoryEntry & { id: number };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for trajectory sample ${eventId}.`);
}

describe('undoReview', () => {
  beforeEach(async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.assets.clear(),
      db.reviewHistory.clear(),
    ]);
  });

  it('fully reverses a review: card, calibration profile and session history', async () => {
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    const cardBefore = (await db.cards.get(card.id))!;
    const perfBefore = (await db.userPerformance.get(deck.id)) ?? null;
    const deckLastInteractedAtBefore = (await db.decks.get(deck.id))!.lastInteractedAt;

    const {
      card: updated,
      lastInteractedAtBefore,
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
    expect((await db.userPerformance.get(deck.id))!.totalCorrectReviews).toBe(1);
    expect(lastInteractedAtBefore).toBe(deckLastInteractedAtBefore);
    expect((await db.decks.get(deck.id))!.lastInteractedAt).not.toBe(deckLastInteractedAtBefore);

    const session = await waitForTrajectorySample('event-undo');
    expect(await db.sessionHistory.count()).toBe(1);
    expect(session.id).toBeDefined();

    await undoReview({
      eventId: 'event-undo',
      cardBefore,
      perfBefore,
      sessionHistoryId: session.id,
      deckId: deck.id,
      kind: 'deck',
      lastInteractedAtBefore,
    });

    const restored = (await db.cards.get(card.id))!;
    expect(restored.reps).toBe(0);
    expect(restored.state).toBe(0);
    expect(restored.lastReviewed).toBeNull();
    expect(await db.sessionHistory.count()).toBe(0);
    expect((await db.userPerformance.get(deck.id))!.totalCorrectReviews).toBe(0);
    expect((await db.decks.get(deck.id))!.lastInteractedAt).toBe(deckLastInteractedAtBefore);
  });

  it('keeps the card projection and canonical event in sync through record and undo', async () => {
    const deck = await createDeck('Review history consistency');
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
    expect(recordedCard.history).toHaveLength(1);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
    expect(canonical).toMatchObject({
      ...recordedCard.history[0],
      cardId: card.id,
      deckId: deck.id,
    });

    await undoReview({
      eventId: 'event-consistency',
      cardBefore: result.cardBefore,
      perfBefore,
      sessionHistoryId: result.sessionHistoryId,
      deckId: deck.id,
      kind: 'deck',
      lastInteractedAtBefore: result.lastInteractedAtBefore,
    });

    const undoneCard = (await db.cards.get(card.id))!;
    expect(undoneCard.history).toEqual([]);
    expect(await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-consistency'))).toBeUndefined();
    expect((await hydrateCardsWithHistory([undoneCard]))[0].history).toEqual([]);
  });

  it('records hintUsed on the review log, defaulting to false when omitted', async () => {
    const deck = await createDeck('Test deck');
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

    expect((await db.cards.get(cardWithHint.id))!.history[0].hintUsed).toBe(true);
    expect((await db.cards.get(cardWithoutHint.id))!.history[0].hintUsed).toBe(false);
  });

  it('records machine-awarded marks on the review log', async () => {
    const deck = await createDeck('Test deck');
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
      checkerDisputes: [{
        reportedAt: 1_725_123_456_789,
        question: '2 + 2',
        studentLine: '4',
        verdict: { correct: true, marksEarned: 1, matchedLineIndex: 0 },
        checkerSeeds: ['card:0:0'],
      }],
    });

    expect((await db.cards.get(card.id))!.history[0]).toMatchObject({
      grade: 4,
      correct: true,
      marksEarned: 1,
      marksAvailable: 1,
      lineVerdicts: [{ studentLine: '4', matchedLineIndex: 0, marksEarned: 1 }],
      checkerDisputes: [{
        reportedAt: 1_725_123_456_789,
        question: '2 + 2',
        studentLine: '4',
        verdict: { correct: true, marksEarned: 1, matchedLineIndex: 0 },
        checkerSeeds: ['card:0:0'],
      }],
    });
  });

  it('course-keyed review updates Course.lastInteractedAt, courseId-keyed userPerformance, and sessionHistory.courseId', async () => {
    await Promise.all([db.courses.clear(), db.lessons.clear()]);

    const c = await createCourse('Test course');
    const lesson = await createLesson(c.id, 'Lesson 1');
    const card = await createLessonCard(c.id, lesson.id, 'front_back', 'q', 'a');

    const cardBefore = (await db.cards.get(card.id))!;
    const perfBefore = (await db.userPerformance.get(c.id)) ?? null;
    const courseLastInteractedAtBefore = (await db.courses.get(c.id))!.lastInteractedAt;

    const {
      card: updated,
      lastInteractedAtBefore,
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

    const perf = await db.userPerformance.get(c.id);
    expect(perf?.totalCorrectReviews).toBe(1);

    const updatedCourse = await db.courses.get(c.id);
    expect(updatedCourse?.lastInteractedAt).toBeDefined();
    expect(lastInteractedAtBefore).toBe(courseLastInteractedAtBefore);
    expect(updatedCourse?.lastInteractedAt).not.toBe(courseLastInteractedAtBefore);

    // The card's own shadow deck (created empty by ensureLessonDeck) is untouched
    // by the course-keyed review: its calibration row stays at zero reviews.
    expect((await db.userPerformance.get(card.deckId))?.totalCorrectReviews).toBe(0);

    await undoReview({
      eventId: 'event-course',
      cardBefore,
      perfBefore,
      sessionHistoryId: historyRow.id,
      deckId: c.id,
      kind: 'course',
      lastInteractedAtBefore,
    });

    const restored = (await db.cards.get(card.id))!;
    expect(restored.reps).toBe(0);
    expect(await db.sessionHistory.get(historyRow.id)).toBeUndefined();
    expect(await db.userPerformance.get(c.id)).toBeUndefined();
    expect((await db.courses.get(c.id))!.lastInteractedAt).toBe(courseLastInteractedAtBefore);
  });

  it('undoes course calibration without changing the backing-deck pacing profile', async () => {
    const course = await createCourse('Course key-space undo');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const backingBefore = {
      deckId: card.deckId,
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
    });

    expect(await db.userPerformance.get(course.id)).toEqual(calibrationBefore);
    expect(await db.userPerformance.get(card.deckId)).toEqual(backingBefore);
    expect((await performanceForCourseBackingDecks(course.id, [card])).map((row) => row.deckId)).toEqual([
      card.deckId,
    ]);
    expect((await performanceForReviewUnits([course.id, card.deckId])).map((row) => row?.deckId)).toEqual([
      course.id,
      card.deckId,
    ]);
  });

  it('persists every provenance field and the exact attempt timestamp', async () => {
    const deck = await createDeck('Test deck');
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
    const deck = await createDeck('Test deck');
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
    expect((await db.cards.get(card.id))?.history).toHaveLength(1);
    await waitForTrajectorySample('event-replayed');
    expect(await db.sessionHistory.count()).toBe(1);
    expect((await db.userPerformance.get(deck.id))?.totalCorrectReviews).toBe(1);
  });

  it('skips the card scan when the unit already has a trajectory sample today', async () => {
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    const now = 1_725_123_456_789;

    await db.sessionHistory.add({
      eventId: 'existing-daily-sample',
      sessionId: 'session-existing-daily-sample',
      timestamp: now,
      deckId: deck.id,
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
        kind: 'deck',
        cardId: card.id,
      });
    } finally {
      cardsWhere.mockRestore();
    }

    expect(cardsWhere).not.toHaveBeenCalled();
    expect(await db.sessionHistory.count()).toBe(1);
  });

  it('makes repeated undo harmless and permits a genuine retry afterwards', async () => {
    const deck = await createDeck('Test deck');
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
      kind: result.kind,
      lastInteractedAtBefore: result.lastInteractedAtBefore,
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

describe('ratchetLessonUnlock', () => {
  beforeEach(async () => {
    await Promise.all([db.courses.clear(), db.lessons.clear()]);
  });

  it('sets unlockedAt the first time it is called', async () => {
    const course = await createCourse('Test course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    expect((await db.lessons.get(lesson.id))?.unlockedAt).toBeUndefined();

    const now = Date.now();
    await ratchetLessonUnlock(lesson.id, now);

    expect((await db.lessons.get(lesson.id))?.unlockedAt).toBe(now);
  });

  it('never re-sets or clears an already-ratcheted lesson (one-way)', async () => {
    const course = await createCourse('Test course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const first = Date.now();
    await ratchetLessonUnlock(lesson.id, first);
    await ratchetLessonUnlock(lesson.id, first + 10_000);

    expect((await db.lessons.get(lesson.id))?.unlockedAt).toBe(first);
  });

  it('no-ops for a non-existent lesson', async () => {
    await expect(ratchetLessonUnlock('missing-lesson-id')).resolves.toBeUndefined();
  });
});

describe('createCardWithReverse', () => {
  beforeEach(async () => {
    await Promise.all([db.decks.clear(), db.cards.clear()]);
  });

  it('creates two independent cards with swapped sides and shared tags', async () => {
    const deck = await createDeck('Vocab');
    const { card, reverse } = await createCardWithReverse(deck.id, 'bonjour', 'hello', ['french']);

    expect(card.front).toBe('bonjour');
    expect(card.back).toBe('hello');
    expect(reverse.front).toBe('hello');
    expect(reverse.back).toBe('bonjour');
    // Distinct rows, distinct FSRS state.
    expect(card.id).not.toBe(reverse.id);
    expect(reverse.reps).toBe(0);
    expect(reverse.lastReviewed).toBeNull();
    expect(card.tags).toEqual(['french']);
    expect(reverse.tags).toEqual(['french']);
    expect(await db.cards.where('deckId').equals(deck.id).count()).toBe(2);
  });
});

describe('structured item payload validation', () => {
  beforeEach(async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.userPerformance.clear(),
      db.assets.clear(),
      db.reviewHistory.clear(),
    ]);
  });

  it('rejects malformed payloads before create and update writes', async () => {
    const deck = await createDeck('Payload validation');
    const invalidPayload = { v: 1, kind: 'working', scheme: [] } as never;

    await expect(
      createCard(deck.id, 'front_back', 'Question', '', [], { payload: invalidPayload }),
    ).rejects.toThrow('Invalid structured item payload.');
    expect(await db.cards.count()).toBe(0);

    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    await expect(updateCard(card.id, { payload: invalidPayload })).rejects.toThrow(
      'Invalid structured item payload.',
    );
    expect((await db.cards.get(card.id))?.payload).toBeUndefined();
  });

  it('validates every draft before a bulk create and keeps payloads off cloze cards', async () => {
    const deck = await createDeck('Payload validation');
    const invalidPayload = { v: 1, kind: 'working', scheme: [] } as never;

    await expect(
      createCards(deck.id, [
        { type: 'front_back', front: 'Q1', back: '', payload: invalidPayload },
        { type: 'front_back', front: 'Q2', back: '' },
      ]),
    ).rejects.toThrow('Invalid structured item payload.');
    expect(await db.cards.count()).toBe(0);

    await expect(
      createCard(deck.id, 'cloze', '{{c1::answer}}', '', [], {
        payload: { v: 1, kind: 'scaffold' },
      }),
    ).rejects.toThrow('Structured item payloads require a front_back card.');
  });
});

describe('bulk card actions', () => {
  beforeEach(async () => {
    await Promise.all([db.decks.clear(), db.cards.clear()]);
  });

  it('suspends and resumes many cards at once', async () => {
    const deck = await createDeck('Bulk');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    const b = await createCard(deck.id, 'front_back', 'b', '2');

    await setCardsSuspended([a.id, b.id], true);
    expect((await db.cards.get(a.id))!.suspended).toBe(true);
    expect((await db.cards.get(b.id))!.suspended).toBe(true);

    await setCardsSuspended([a.id], false);
    expect((await db.cards.get(a.id))!.suspended).toBe(false);
    expect((await db.cards.get(b.id))!.suspended).toBe(true);
  });

  it('adds a tag without duplicating it and removes it again', async () => {
    const deck = await createDeck('Bulk');
    const a = await createCard(deck.id, 'front_back', 'a', '1', ['keep']);
    const b = await createCard(deck.id, 'front_back', 'b', '2');

    await addTagToCards([a.id, b.id], 'exam');
    await addTagToCards([a.id, b.id], 'exam'); // idempotent
    expect((await db.cards.get(a.id))!.tags).toEqual(['keep', 'exam']);
    expect((await db.cards.get(b.id))!.tags).toEqual(['exam']);

    await removeTagFromCards([a.id, b.id], 'exam');
    expect((await db.cards.get(a.id))!.tags).toEqual(['keep']);
    expect((await db.cards.get(b.id))!.tags).toEqual([]);
  });

  it('buries many cards until tomorrow', async () => {
    const deck = await createDeck('Bulk');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    const b = await createCard(deck.id, 'front_back', 'b', '2');
    const until = Date.now() + 86400000;

    await buryCards([a.id, b.id], until);
    expect((await db.cards.get(a.id))!.buriedUntil).toBe(until);
    expect((await db.cards.get(b.id))!.buriedUntil).toBe(until);
  });

  it('resets many cards to new', async () => {
    const deck = await createDeck('Bulk');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    // Simulate a reviewed card
    await db.cards.update(a.id, {
      state: 2,
      stability: 5,
      difficulty: 4,
      due: Date.now() + 86400000,
      scheduledDays: 5,
      learningSteps: 1,
      reps: 3,
    });

    await rescheduleCards([a.id], { reset: true });
    const restored = await db.cards.get(a.id);
    expect(restored!.state).toBe(0);
    expect(restored!.stability).toBeNull();
    expect(restored!.difficulty).toBeNull();
    expect(restored!.due).toBeNull();
    expect(restored!.scheduledDays).toBe(0);
    expect(restored!.learningSteps).toBe(0);
    expect(restored!.lastReviewed).toBeNull();
    expect(restored!.buriedUntil).toBeNull();
    expect(restored!.reps).toBe(3); // history preserved
  });

  it('sets a custom due date on many cards and clears bury', async () => {
    const deck = await createDeck('Bulk');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    const b = await createCard(deck.id, 'front_back', 'b', '2');
    await db.cards.update(a.id, { buriedUntil: Date.now() + 86400000 });
    const target = Date.now() + 172800000;

    await rescheduleCards([a.id, b.id], { due: target });
    expect((await db.cards.get(a.id))!.due).toBe(target);
    expect((await db.cards.get(b.id))!.due).toBe(target);
    expect((await db.cards.get(a.id))!.buriedUntil).toBeNull();
  });

  it('rejects reschedule with no options', async () => {
    const deck = await createDeck('Bulk');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    await expect(rescheduleCards([a.id], {})).rejects.toThrow(
      'Reschedule requires either reset: true or a due date.',
    );
  });

  it('deletes and moves ordinary cards', async () => {
    const deck = await createDeck('Bulk');
    const other = await createDeck('Other');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    const b = await createCard(deck.id, 'front_back', 'b', '2');

    await moveCards([a.id], other.id);
    expect((await db.cards.get(a.id))!.deckId).toBe(other.id);

    await deleteCards([b.id]);
    expect(await db.cards.get(b.id)).toBeUndefined();
  });

  it('keeps canonical review-history ownership in sync when moving a card', async () => {
    const deck = await createDeck('Bulk');
    const other = await createDeck('Other');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await db.reviewHistory.add({
      id: 'review:event:move-card',
      eventId: 'move-card',
      cardId: card.id,
      deckId: deck.id,
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

    await moveCards([card.id], other.id);

    expect(await db.reviewHistory.get('review:event:move-card')).toEqual(
      expect.objectContaining({ deckId: other.id }),
    );
    const hydrated = await hydrateCardsWithHistory([(await db.cards.get(card.id))!]);
    expect(hydrated[0].history).toHaveLength(1);
  });

  it('refuses to delete or move sequence-generated cards', async () => {
    const deck = await createDeck('Bulk');
    const other = await createDeck('Other');
    const a = await createCard(deck.id, 'front_back', 'a', '1');
    await db.cards.update(a.id, { sequenceItemId: 'seq-item-1' });

    await expect(deleteCards([a.id])).rejects.toThrow(
      'One or more cards were generated by a sequence or occlusion and can only be deleted or moved via that sequence or occlusion.',
    );
    await expect(moveCards([a.id], other.id)).rejects.toThrow(
      'One or more cards were generated by a sequence or occlusion and can only be deleted or moved via that sequence or occlusion.',
    );
    expect(await db.cards.get(a.id)).toBeDefined();
    expect((await db.cards.get(a.id))!.deckId).toBe(deck.id);
  });
});
