import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createLesson, createLessonCard } from '../../db/repository';
import { db } from '../../db/schema';
import { loadSimpleSession } from './simpleSessionPersistence';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all([
    db.cards.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.schedulingUnits.clear(),
    db.reviewHistory.clear(),
    db.sessionHistory.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
  ]);
});

afterEach(() => vi.restoreAllMocks());

it.each([true, false])(
  'shuffles once and preserves order through renders, reveal, answer (%s), undo and resume',
  async (correct) => {
    const course = await createCourse('Queue order');
    const lesson = await createLesson(course.id, 'Facts');
    for (const front of ['First', 'Second', 'Third']) {
      await createLessonCard(course.id, lesson.id, 'front_back', front, 'Answer');
    }
    const stored = await db.cards.where('courseId').equals(course.id).toArray();
    const authored = stored.map((card) => card.id);
    const expected = [authored[1], authored[2], authored[0]];
    const params: UseLearnSessionParams = {
      lessonId: lesson.id,
      courseId: undefined,
      sessionId: undefined,
      tagFilter: null,
      filterParams: [],
      practiceNodeKeyParam: null,
      requestScopeLessonIds: undefined,
      requestAssessmentId: undefined,
      requestPlanId: undefined,
      requestWindowId: undefined,
      plannedRevision: false,
      reviewSessionKind: 'practice',
      isSimpleMode: true,
      mode: 'simple',
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction: {
        beginCard: vi.fn(),
        setAnswerVisible: vi.fn(),
        wasDistracted: () => false,
        blurredMs: () => 0,
        sessionMs: () => 1,
      },
    };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const hook = renderHook(() => useLearnSession(params));
    const scope = { kind: 'lesson' as const, lessonId: lesson.id };
    const saved = () => loadSimpleSession(scope, authored);
    try {
      await waitFor(() => expect(hook.result.current.current).not.toBeNull());
      hook.result.current.persistSimpleResume();
      expect(saved()?.queueCardIds).toEqual(expected);
      expect(hook.result.current.current?.id).toBe(expected[0]);
      expect(hook.result.current.sessionCardIds).toEqual(expected);
      random.mockReturnValue(0.999);
      hook.rerender();
      act(() => hook.result.current.reveal());
      hook.result.current.persistSimpleResume();
      expect(saved()?.queueCardIds).toEqual(expected);
      expect(hook.result.current.current?.id).toBe(expected[0]);
      await act(async () => {
        await hook.result.current.answer(correct, { retainUndo: true });
      });
      expect(saved()).toMatchObject({
        queueCardIds: correct ? expected : [expected[1], expected[2], expected[0]],
        masteredCardIds: correct ? [expected[0]] : [],
        outcomes: new Map([[expected[0], correct ? 'correct' : 'wrong']]),
        events: [expect.objectContaining({ cardId: expected[0], correct })],
      });
      expect(hook.result.current.current?.id).toBe(expected[1]);
      await act(async () => {
        await hook.result.current.undoLast();
      });
      hook.result.current.persistSimpleResume();
      expect(saved()?.queueCardIds).toEqual(expected);
      expect(hook.result.current.current?.id).toBe(expected[0]);
      expect(saved()).toMatchObject({ masteredCardIds: [], events: [], outcomes: new Map() });
      hook.result.current.persistSimpleResume();
    } finally {
      hook.unmount();
    }
    const resumed = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(resumed.result.current.current).not.toBeNull());
      expect(saved()?.queueCardIds).toEqual(expected);
      expect(resumed.result.current.sessionCardIds).toEqual(expected);
      expect(resumed.result.current.current?.id).toBe(expected[0]);
      for (const id of expected) {
        expect(resumed.result.current.current?.id).toBe(id);
        act(() => resumed.result.current.reveal());
        await act(async () => {
          await resumed.result.current.answer(true, { retainUndo: true });
        });
      }
      expect(resumed.result.current.phase).toBe('finished');
      expect(resumed.result.current.summary?.events.map((event) => event.cardId)).toEqual(expected);
      expect(
        (await db.cards.where('courseId').equals(course.id).toArray()).map((card) => card.id),
      ).toEqual(authored);
    } finally {
      resumed.unmount();
    }
  },
);
