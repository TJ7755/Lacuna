import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCard,
  createCourse,
  createDeck,
  createLesson,
  createLessonCard,
  upsertLessonCardExposure,
} from '../../db/repository';
import { db } from '../../db/schema';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import { useLearnSession } from './useLearnSession';

const distraction: DistractionTracker = {
  beginCard: vi.fn(),
  setAnswerVisible: vi.fn(),
  wasDistracted: () => false,
  blurredMs: () => 0,
  sessionMs: () => 1,
};

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.decks.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.lessonCards.clear(),
    db.courseAssessments.clear(),
  ]);
});

describe('useLearnSession answer boundary', () => {
  it.each([
    ['an unsupported kind', { v: 1, kind: 'scaffold' }],
    [
      'an unsupported version',
      { v: 2, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    ],
  ])('does not grade a card with %s', async (_label, payload) => {
    const deck = await createDeck('Unsupported payload');
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
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current?.id).toBe(card.id));

    await act(async () => {
      await result.current.answer({ correct: true, marksEarned: 1, marksAvailable: 1 });
    });

    expect(result.current.phase).toBe('question');
    expect(result.current.events.current).toHaveLength(0);
    expect((await db.cards.get(card.id))?.history).toHaveLength(0);
    expect(await db.sessionHistory.count()).toBe(0);
  });

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
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
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

  it('grades a card with a null payload like an ordinary card', async () => {
    const deck = await createDeck('Null payload');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer', [], {
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
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current?.id).toBe(card.id));

    act(() => {
      result.current.reveal();
    });
    await waitFor(() => expect(result.current.phase).toBe('answer'));

    await act(async () => {
      await result.current.answer(true);
    });

    expect(result.current.phase).not.toBe('answer');
    expect(result.current.events.current).toHaveLength(1);
    expect((await db.cards.get(card.id))?.history).toHaveLength(1);
  });
});
