import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cardsForSequence,
  createCourse,
  createLesson,
  createLessonCard,
  createSequence,
} from '../../db/repository';
import { db } from '../../db/schema';
import { useLearnSession } from './useLearnSession';
import { loadSimpleSession } from './simpleSessionPersistence';
import { resetSessionTestDatabase, sessionParams } from './useLearnSession.testFixtures';

beforeEach(resetSessionTestDatabase);
afterEach(() => vi.restoreAllMocks());

it('rolls back the review when its introduction exposure fails, then retries and undoes once', async () => {
  const course = await createCourse('Atomic introduction');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const before = await db.cards.get(card.id);
  const performanceBefore = await db.coursePerformance.toArray();
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    act(() => session.result.current.reveal());
    const addExposure = vi
      .spyOn(db.lessonCardExposures, 'add')
      .mockRejectedValueOnce(new Error('Exposure failed'));
    await act(async () => {
      await expect(session.result.current.answer(true, { retainUndo: true })).rejects.toThrow(
        'Exposure failed',
      );
    });
    expect(await db.cards.get(card.id)).toEqual(before);
    expect(await db.reviewHistory.count()).toBe(0);
    expect(await db.coursePerformance.toArray()).toEqual(performanceBefore);
    session.result.current.persistSimpleResume();
    expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, [card.id])?.events).toEqual(
      [],
    );
    expect(session.result.current.phase).toBe('answer');
    addExposure.mockRestore();

    await act(async () => {
      await session.result.current.answer(true, { retainUndo: true });
    });
    expect(await db.reviewHistory.count()).toBe(1);
    expect(await db.lessonCardExposures.count()).toBe(1);
    expect(session.result.current.summary?.events).toEqual([
      expect.objectContaining({ cardId: card.id, correct: true }),
    ]);
    await act(async () => {
      await session.result.current.undoLast();
    });
    expect(await db.reviewHistory.count()).toBe(0);
    expect(await db.lessonCardExposures.count()).toBe(0);
    expect(await db.cards.get(card.id)).toEqual(before);
    session.result.current.persistSimpleResume();
    expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, [card.id])?.events).toEqual(
      [],
    );
  } finally {
    session.unmount();
  }
});

it('refuses undo without removing evidence when another writer changes its exposure', async () => {
  const course = await createCourse('Concurrent exposure');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    act(() => session.result.current.reveal());
    await act(async () => {
      await session.result.current.answer(true, { retainUndo: true });
    });
    const key: [string, string] = [lesson.id, card.id];
    const exposure = (await db.lessonCardExposures.get(key))!;
    const changed = { ...exposure, updatedAt: exposure.updatedAt + 1 };
    await db.lessonCardExposures.put(changed);
    const reviewed = await db.cards.get(card.id);

    await act(async () => {
      await session.result.current.undoLast();
    });
    expect(params.notify).toHaveBeenCalledWith(
      'The lesson exposure changed after this answer, so undo is no longer available.',
      'negative',
    );
    expect(await db.lessonCardExposures.get(key)).toEqual(changed);
    expect(await db.cards.get(card.id)).toEqual(reviewed);
    expect(await db.reviewHistory.count()).toBe(1);
    expect(session.result.current.canUndo).toBe(true);
    expect(session.result.current.summary?.events).toEqual([
      expect.objectContaining({ cardId: card.id, correct: true }),
    ]);
  } finally {
    session.unmount();
  }
});

it('records each recited line once and exposes only mastered lines', async () => {
  const course = await createCourse('Recitation evidence');
  const lesson = await createLesson(course.id, 'Poem');
  const sequence = await createSequence(
    course.id,
    lesson.id,
    'Two lines',
    [
      { id: 'first', value: 'First line' },
      { id: 'second', value: 'Second line' },
    ],
    { mode: 'lines' },
  );
  const cards = await cardsForSequence(sequence);
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(session.result.current.recitationSequence?.id).toBe(sequence.id));
    await act(async () => {
      await session.result.current.answerRecitation([{ itemId: 'first', correct: false }], 12, []);
    });
    expect(await db.reviewHistory.count()).toBe(1);
    expect(await db.lessonCardExposures.count()).toBe(0);
    await act(async () => {
      await session.result.current.answerRecitation(
        [
          { itemId: 'first', correct: true },
          { itemId: 'second', correct: true },
        ],
        4,
        ['first'],
      );
    });
    expect(await db.reviewHistory.count()).toBe(2);
    expect(await db.coursePerformance.get(course.id)).toMatchObject({
      totalCorrectReviews: 1,
      runningMeanResponseTime: 4,
    });
    expect(await db.lessonCardExposures.count()).toBe(1);
    const first = cards.find((card) => card.sequenceItemId === 'first')!;
    const second = cards.find((card) => card.sequenceItemId === 'second')!;
    expect(
      loadSimpleSession(
        { kind: 'lesson', lessonId: lesson.id },
        cards.map((card) => card.id),
      ),
    ).toMatchObject({
      masteredCardIds: [first.id],
      outcomes: new Map([
        [first.id, 'correct'],
        [second.id, 'correct'],
      ]),
      events: [
        expect.objectContaining({ cardId: first.id, grade: 1, responseTimeSec: 12 }),
        expect.objectContaining({ cardId: second.id, grade: 3, responseTimeSec: 4 }),
      ],
    });
    expect(await db.reviewHistory.where('cardId').equals(first.id).first()).toMatchObject({
      grade: 1,
      responseTimeSec: 12,
    });
    expect(await db.reviewHistory.where('cardId').equals(second.id).first()).toMatchObject({
      grade: 3,
      responseTimeSec: 4,
    });
    for (const card of cards) {
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
    }
  } finally {
    session.unmount();
    await db.sequences.delete(sequence.id);
  }
});
