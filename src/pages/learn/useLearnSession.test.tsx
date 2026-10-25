import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCard,
  cardsForSequence,
  createSequence,
  createCourse,
  createLesson,
  createLessonCard,
  upsertLessonCardExposure,
} from '../../db/repository';
import { db } from '../../db/schema';
import { useLearnSession } from './useLearnSession';
import { isLabelCardId } from '../../db/sequenceGeneration';
import { writeAnswerInput } from '../../state/answerInput';

import {
  distraction,
  resetSessionTestDatabase,
  sessionParams,
} from './useLearnSession.testFixtures';

beforeEach(resetSessionTestDatabase);

describe('useLearnSession answer boundary', () => {
  it.each([
    ['an unsupported kind', { v: 1, kind: 'scaffold' }],
    ['an unsupported version', { v: 2, kind: 'numeric', answer: { kind: 'exact', value: '4' } }],
  ])('does not grade a card with %s', async (_label, payload) => {
    const deck = await createCourse('Unsupported payload');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer', [], {
      payload: payload as never,
    });
    const params = {
      courseId: undefined,
      lessonId: undefined,
      sessionId: undefined,
      tagFilter: null,
      filterParams: [],
      requestScopeLessonIds: undefined,
      practiceNodeKeyParam: null,
      requestAssessmentId: undefined,
      requestPlanId: undefined,
      requestWindowId: undefined,
      plannedRevision: false,
      reviewSessionKind: 'deck' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      startInFocusMode: false,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current?.id).toBe(card.id));

    let undoAvailable: boolean | undefined;
    await act(async () => {
      undoAvailable = (
        await result.current.answer({
          correct: true,
          marksEarned: 1,
          marksAvailable: 1,
        })
      ).undoAvailable;
    });

    expect(undoAvailable).toBe(false);
    expect(result.current.phase).toBe('question');
    expect(result.current.events.current).toHaveLength(0);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
    expect(await db.sessionHistory.count()).toBe(0);
  });

  it.each(['lesson', 'course'] as const)('uses authored typing in a %s session', async (scope) => {
    const course = await createCourse('Typing', { learnFirst: false });
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'type' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    const params = sessionParams({
      ...(scope === 'lesson' ? { lessonId: lesson.id } : { courseId: course.id }),
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    expect(session.result.current.isTypingCard).toBe(true);
    session.unmount();
  });

  it('uses a card typing override even when its lesson defaults to reveal', async () => {
    const course = await createCourse('Typing', { learnFirst: false });
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'reveal' });
    const card = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Cat',
      'chat',
      [],
      undefined,
      'type',
    );
    const params = sessionParams({
      courseId: course.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    expect(session.result.current.isTypingCard).toBe(true);
    session.unmount();
  });

  it('lets an explicit reveal override a typing lesson and learner preference', async () => {
    writeAnswerInput('type');
    const course = await createCourse('Typing', { learnFirst: false });
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'type' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    await db.cards.update(card.id, { answerMode: 'reveal' });
    const params = sessionParams({
      lessonId: lesson.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    expect(session.result.current.isTypingCard).toBe(false);
    session.unmount();
  });

  it.each([true, false])(
    'records the actual ordinary input and removes it on undo (typing: %s)',
    async (typing) => {
      writeAnswerInput(typing ? 'type' : 'reveal');
      const course = await createCourse('Typing', { learnFirst: false });
      const lesson = await createLesson(course.id, 'Vocabulary', {
        answerMode: typing ? 'reveal' : 'type',
      });
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
      const params = sessionParams({
        courseId: course.id,
        isSimpleMode: true,
        standaloneSimple: true,
        mode: 'simple',
      });
      const session = renderHook(() => useLearnSession(params));
      await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
      expect(session.result.current.isTypingCard).toBe(typing);
      act(() => session.result.current.reveal());
      act(() => writeAnswerInput(typing ? 'reveal' : 'type'));
      await act(async () => {
        await session.result.current.answer(true, { retainUndo: true });
      });
      expect(await db.reviewHistory.where('cardId').equals(card.id).first()).toMatchObject({
        input: typing ? 'typed' : 'reveal',
      });
      await act(async () => {
        await session.result.current.undoLast({ reveal: true });
      });
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
      await act(async () => {
        await session.result.current.answer(true, { retainUndo: true });
      });
      expect(await db.reviewHistory.where('cardId').equals(card.id).first()).toMatchObject({
        input: typing ? 'typed' : 'reveal',
      });
      session.unmount();
    },
  );

  it('does not reparse the typing answer during unrelated renders or phase changes', async () => {
    writeAnswerInput('type');
    const course = await createCourse('Typing cache', { learnFirst: false });
    const card = await createCard(course.id, 'front_back', 'Question', '**Answer**');
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const params = sessionParams({
      courseId: course.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const session = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
      expect(session.result.current.isTypingCard).toBe(true);
      const parsed = parse.mock.calls.length;
      expect(parsed).toBeGreaterThan(0);
      session.rerender();
      act(() => session.result.current.reveal());
      expect(parse).toHaveBeenCalledTimes(parsed);
      act(() => session.result.current.hide());
      expect(parse).toHaveBeenCalledTimes(parsed);
      act(() => writeAnswerInput('reveal'));
      expect(session.result.current.isTypingCard).toBe(false);
      act(() => writeAnswerInput('type'));
      expect(parse.mock.calls.length).toBeGreaterThan(parsed);
    } finally {
      session.unmount();
      parse.mockRestore();
    }
  });

  it('clears the previous card input before an alternate reveal path', async () => {
    writeAnswerInput('type');
    const course = await createCourse('Input capture', { learnFirst: false });
    await createCard(course.id, 'front_back', 'First question', 'Answer');
    await createCard(course.id, 'front_back', 'Second question', 'Answer');
    const params = sessionParams({
      courseId: course.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const session = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(session.result.current.current).not.toBeNull());
      const firstId = session.result.current.current!.id;
      act(() => session.result.current.reveal());
      await act(async () => {
        await session.result.current.answer(true);
      });
      expect(await db.reviewHistory.where('cardId').equals(firstId).first()).toMatchObject({
        input: 'typed',
      });
      const secondId = session.result.current.current!.id;
      expect(secondId).not.toBe(firstId);
      act(() => session.result.current.revealRecitation(1));
      await act(async () => {
        await session.result.current.answer(true);
      });
      expect(await db.reviewHistory.where('cardId').equals(secondId).first()).toMatchObject({
        input: 'reveal',
      });
    } finally {
      session.unmount();
    }
  });

  it.each(['type', 'reveal'] as const)(
    'records %s input for an ordinary lines-sequence label',
    async (preference) => {
      writeAnswerInput(preference);
      const course = await createCourse('Sequence labels', { learnFirst: false });
      const lesson = await createLesson(course.id, 'Vocabulary');
      const sequence = await createSequence(
        course.id,
        lesson.id,
        'Vocabulary',
        [{ id: 'line-1', value: 'Answer', label: 'Question' }],
        { mode: 'lines', generateLabelCards: true },
      );
      const cards = await cardsForSequence(sequence);
      const label = cards.find((card) => isLabelCardId(card.sequenceItemId!))!;
      for (const card of cards) if (card.id !== label.id) await db.cards.delete(card.id);
      const params = sessionParams({
        courseId: course.id,
        isSimpleMode: true,
        standaloneSimple: true,
        mode: 'simple',
      });
      const session = renderHook(() => useLearnSession(params));
      try {
        await waitFor(() => expect(session.result.current.current?.id).toBe(label.id));
        expect(session.result.current.isLinesModeCard).toBe(true);
        expect(session.result.current.recitationSequence).toBeNull();
        expect(session.result.current.isTypingCard).toBe(preference === 'type');
        act(() => session.result.current.reveal());
        await act(async () => {
          await session.result.current.answer(true);
        });
        expect(await db.reviewHistory.where('cardId').equals(label.id).first()).toMatchObject({
          input: preference === 'type' ? 'typed' : 'reveal',
        });
      } finally {
        session.unmount();
        await db.sequences.delete(sequence.id);
      }
    },
  );

  it('uses the course-keyed calibration row for a course session', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    await upsertLessonCardExposure(lesson.id, card.id);
    await db.coursePerformance.put({
      courseId: course.id,
      runningMeanResponseTime: 20,
      runningStdDevResponseTime: 1,
      m2: 0,
      totalCorrectReviews: 20,
      updatedAt: 0,
    });
    const params = {
      courseId: course.id,
      lessonId: undefined,
      sessionId: undefined,
      tagFilter: null,
      filterParams: [],
      requestScopeLessonIds: undefined,
      practiceNodeKeyParam: null,
      requestAssessmentId: undefined,
      requestPlanId: undefined,
      requestWindowId: undefined,
      plannedRevision: false,
      reviewSessionKind: 'practice' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      startInFocusMode: false,
    };
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    let unmount: (() => void) | undefined;
    try {
      const rendered = renderHook(() => useLearnSession(params));
      const { result } = rendered;
      unmount = rendered.unmount;
      await waitFor(() => expect(result.current.current?.id).toBe(card.id));
      nowSpy.mockReturnValue(10_000);
      act(() => result.current.reveal());
      await waitFor(() => expect(result.current.phase).toBe('answer'));
      await act(async () => {
        await result.current.answer(true);
      });
      expect(result.current.events.current[0]?.grade).toBe(4);
    } finally {
      unmount?.();
      nowSpy.mockRestore();
    }
  });

  it('records a Simple Learn answer as a timing-graded canonical FSRS review', async () => {
    const course = await createCourse('Simple scheduling');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Nucleus', 'DNA');
    const slowCard = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Mitochondrion',
      'Respiration',
    );
    await Promise.all([
      upsertLessonCardExposure(lesson.id, card.id),
      upsertLessonCardExposure(lesson.id, slowCard.id),
    ]);
    await db.coursePerformance.put({
      courseId: course.id,
      runningMeanResponseTime: 20,
      runningStdDevResponseTime: 1,
      m2: 0,
      totalCorrectReviews: 20,
      updatedAt: 0,
    });
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const params = sessionParams({
      courseId: course.id,
      sessionId: 'simple-session',
      reviewSessionKind: 'practice',
      isSimpleMode: true,
      mode: 'simple',
    });
    const rendered = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(rendered.result.current.current).not.toBeNull());
      const fastCardId = rendered.result.current.current!.id;
      const slowCardId = fastCardId === card.id ? slowCard.id : card.id;
      nowSpy.mockReturnValue(10_000);
      act(() => rendered.result.current.reveal());
      await waitFor(() => expect(rendered.result.current.phase).toBe('answer'));
      // Inspecting the answer and dragging to grade must not change inference at reveal.
      nowSpy.mockReturnValue(30_000);
      await act(async () => {
        await rendered.result.current.answer(true);
      });

      const reviews = await db.reviewHistory.where('cardId').equals(fastCardId).toArray();
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        sessionId: 'simple-session',
        sessionKind: 'practice',
        grade: 4,
        correct: true,
        responseTimeSec: 10,
      });
      expect(rendered.result.current.events.current[0]?.grade).toBe(4);
      expect((await db.cards.get(fastCardId))?.reps).toBe(1);

      await waitFor(() => expect(rendered.result.current.current?.id).toBe(slowCardId));
      nowSpy.mockReturnValue(60_000);
      act(() => rendered.result.current.reveal());
      await waitFor(() => expect(rendered.result.current.phase).toBe('answer'));
      await act(async () => {
        await rendered.result.current.answer(true);
      });
      expect((await db.reviewHistory.where('cardId').equals(slowCardId).first())?.grade).toBe(2);
      expect((await db.cards.get(slowCardId))?.reps).toBe(1);
    } finally {
      rendered.unmount();
      nowSpy.mockRestore();
    }
  });

  it('records No in Simple Learn as Again and keeps the card in its learning queue', async () => {
    const course = await createCourse('Simple retry');
    const lesson = await createLesson(course.id, 'Cells');
    const first = await createLessonCard(course.id, lesson.id, 'front_back', 'First', 'Answer');
    const second = await createLessonCard(course.id, lesson.id, 'front_back', 'Second', 'Answer');
    await Promise.all([
      upsertLessonCardExposure(lesson.id, first.id),
      upsertLessonCardExposure(lesson.id, second.id),
    ]);
    const params = sessionParams({ courseId: course.id, isSimpleMode: true, mode: 'simple' });
    const { result } = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const answeredId = result.current.current!.id;
    act(() => result.current.reveal());
    await waitFor(() => expect(result.current.phase).toBe('answer'));
    await act(async () => {
      await result.current.answer(false);
    });

    const reviews = await db.reviewHistory.where('cardId').equals(answeredId).toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ grade: 1, correct: false });
    expect(result.current.simpleWrong.current.has(answeredId)).toBe(true);
    expect(result.current.simpleMastered.current.has(answeredId)).toBe(false);
    expect(result.current.simpleQueue.current.find((card) => card.id === answeredId)?.reps).toBe(1);
  });

  it('removes an automatically suspended card from the Simple Learn queue and progress', async () => {
    const course = await createCourse('Simple leech', {
      leechThreshold: 1,
      leechAction: 'suspend',
    });
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    await db.cards.update(card.id, {
      state: 2,
      stability: 1,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      lastReviewed: Date.now() - 86_400_000,
      due: Date.now() - 1,
    });
    await upsertLessonCardExposure(lesson.id, card.id);
    const params = sessionParams({ courseId: course.id, isSimpleMode: true, mode: 'simple' });
    const { result } = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(result.current.current?.id).toBe(card.id));
    act(() => result.current.reveal());
    await act(async () => {
      await result.current.answer(false);
    });
    expect((await db.cards.get(card.id))?.suspended).toBe(true);
    expect(result.current.simpleQueue.current).toEqual([]);
    expect(result.current.sessionCardIds).not.toContain(card.id);
    expect(result.current.sessionCardOutcomes.has(card.id)).toBe(false);
    expect(result.current.phase).toBe('finished');
  });

  it('grades a card with a null payload like an ordinary card', async () => {
    const deck = await createCourse('Null payload', { newCardsPerDay: 2 });
    await createCard(deck.id, 'front_back', 'Question', 'Answer', [], {
      payload: null as never,
    });
    await createCard(deck.id, 'front_back', 'Next question', 'Next answer', [], {
      payload: null as never,
    });
    const params = {
      courseId: undefined,
      lessonId: undefined,
      sessionId: undefined,
      tagFilter: null,
      filterParams: [],
      requestScopeLessonIds: undefined,
      practiceNodeKeyParam: null,
      requestAssessmentId: undefined,
      requestPlanId: undefined,
      requestWindowId: undefined,
      plannedRevision: false,
      reviewSessionKind: 'deck' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      startInFocusMode: false,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current).not.toBeNull());
    const currentCardId = result.current.current!.id;

    act(() => {
      result.current.reveal();
    });
    await waitFor(() => expect(result.current.phase).toBe('answer'));

    let undoAvailable: boolean | undefined;
    await act(async () => {
      undoAvailable = (await result.current.answer(true)).undoAvailable;
    });

    expect(undoAvailable).toBe(true);
    expect(result.current.phase).not.toBe('answer');
    expect(result.current.events.current).toHaveLength(1);
    expect(await db.reviewHistory.where('cardId').equals(currentCardId).count()).toBe(1);
    expect(await db.reviewHistory.where('cardId').equals(currentCardId).first()).toMatchObject({
      input: 'reveal',
    });

    await act(async () => {
      await result.current.undoLast();
    });

    expect(result.current.current?.id).toBe(currentCardId);
    expect(result.current.phase).toBe('question');
    expect(result.current.events.current).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(await db.reviewHistory.where('cardId').equals(currentCardId).count()).toBe(0);
  });
});
