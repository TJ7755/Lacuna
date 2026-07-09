import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  addTagToCards,
  buryCards,
  createCard,
  createCardWithReverse,
  createCourse,
  createDeck,
  createLesson,
  createLessonCard,
  ratchetLessonUnlock,
  recordReview,
  removeTagFromCards,
  rescheduleCards,
  setCardsSuspended,
  undoReview,
} from './repository';

describe('undoReview', () => {
  beforeEach(async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.assets.clear(),
    ]);
  });

  it('fully reverses a review: card, calibration profile and session history', async () => {
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    const cardBefore = (await db.cards.get(card.id))!;
    const perfBefore = (await db.userPerformance.get(deck.id)) ?? null;

    const { card: updated, sessionHistoryId } = await recordReview({
      card,
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    // The review actually changed state.
    expect(updated.reps).toBe(1);
    expect(await db.sessionHistory.count()).toBe(1);
    expect((await db.userPerformance.get(deck.id))!.totalCorrectReviews).toBe(1);

    await undoReview({ cardBefore, perfBefore, sessionHistoryId, deckId: deck.id });

    const restored = (await db.cards.get(card.id))!;
    expect(restored.reps).toBe(0);
    expect(restored.state).toBe(0);
    expect(restored.lastReviewed).toBeNull();
    expect(await db.sessionHistory.count()).toBe(0);
    expect((await db.userPerformance.get(deck.id))!.totalCorrectReviews).toBe(0);
  });

  it('course-keyed review updates Course.lastInteractedAt, courseId-keyed userPerformance, and sessionHistory.courseId', async () => {
    await Promise.all([db.courses.clear(), db.lessons.clear()]);

    const c = await createCourse('Test course');
    const lesson = await createLesson(c.id, 'Lesson 1');
    const card = await createLessonCard(c.id, lesson.id, 'front_back', 'q', 'a');

    const cardBefore = (await db.cards.get(card.id))!;
    const perfBefore = (await db.userPerformance.get(c.id)) ?? null;

    const { card: updated, sessionHistoryId } = await recordReview({
      card,
      deck: c,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    expect(updated.reps).toBe(1);

    const historyRow = await db.sessionHistory.get(sessionHistoryId);
    expect(historyRow?.courseId).toBe(c.id);
    expect(historyRow?.deckId).toBe(card.deckId);

    const perf = await db.userPerformance.get(c.id);
    expect(perf?.totalCorrectReviews).toBe(1);

    const updatedCourse = await db.courses.get(c.id);
    expect(updatedCourse?.lastInteractedAt).toBeDefined();

    // The card's own shadow deck (created empty by ensureLessonDeck) is untouched
    // by the course-keyed review: its calibration row stays at zero reviews.
    expect((await db.userPerformance.get(card.deckId))?.totalCorrectReviews).toBe(0);

    await undoReview({ cardBefore, perfBefore, sessionHistoryId, deckId: c.id });

    const restored = (await db.cards.get(card.id))!;
    expect(restored.reps).toBe(0);
    expect(await db.sessionHistory.get(sessionHistoryId)).toBeUndefined();
    expect(await db.userPerformance.get(c.id)).toBeUndefined();
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
    const { card, reverse } = await createCardWithReverse(deck.id, 'bonjour', 'hello', [
      'french',
    ]);

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
});
