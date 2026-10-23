import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createLesson, createLessonCard } from '../../db/repository';
import { db } from '../../db/schema';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all([
    db.cards.clear(), db.courses.clear(), db.lessons.clear(), db.lessonCards.clear(),
    db.lessonCardExposures.clear(), db.schedulingUnits.clear(), db.reviewHistory.clear(),
    db.sessionHistory.clear(), db.coursePerformance.clear(), db.schedulingPerformance.clear(),
  ]);
});

afterEach(() => vi.restoreAllMocks());

it.each([true, false])('shuffles once and preserves order through renders, reveal, answer (%s), undo and resume', async (correct) => {
  const course = await createCourse('Queue order');
  const lesson = await createLesson(course.id, 'Facts');
  for (const front of ['First', 'Second', 'Third']) {
    await createLessonCard(course.id, lesson.id, 'front_back', front, 'Answer');
  }
  const stored = await db.cards.where('courseId').equals(course.id).toArray();
  const authored = stored.map((card) => card.id);
  const expected = [authored[1], authored[2], authored[0]];
  const params: UseLearnSessionParams = {
    lessonId: lesson.id, courseId: undefined, sessionId: undefined,
    tagFilter: null, filterParams: [], practiceNodeKeyParam: null,
    requestScopeLessonIds: undefined, requestAssessmentId: undefined,
    requestPlanId: undefined, requestWindowId: undefined, plannedRevision: false,
    reviewSessionKind: 'practice', isSimpleMode: true, mode: 'simple',
    navigate: vi.fn(), notify: vi.fn(),
    distraction: {
      beginCard: vi.fn(), setAnswerVisible: vi.fn(), wasDistracted: () => false,
      blurredMs: () => 0, sessionMs: () => 1,
    },
  };
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const hook = renderHook(() => useLearnSession(params));
  const queueIds = () => hook.result.current.simpleQueue.current.map((card) => card.id);
  try {
    await waitFor(() => expect(hook.result.current.current).not.toBeNull());
    expect(queueIds()).toEqual(expected);
    expect(hook.result.current.sessionCardIds).toEqual(expected);
    random.mockReturnValue(0.999);
    hook.rerender();
    act(() => hook.result.current.reveal());
    expect(queueIds()).toEqual(expected);
    await act(async () => { await hook.result.current.answer(correct, { retainUndo: true }); });
    expect(queueIds()).toEqual(correct ? expected : [expected[1], expected[2], expected[0]]);
    expect(hook.result.current.simpleMastered.current.has(expected[0])).toBe(correct);
    expect(hook.result.current.simpleWrong.current.has(expected[0])).toBe(!correct);
    expect(hook.result.current.current?.id).toBe(expected[1]);
    await act(async () => { await hook.result.current.undoLast(); });
    expect(queueIds()).toEqual(expected);
    expect(hook.result.current.current?.id).toBe(expected[0]);
    expect(hook.result.current.simpleMastered.current.size).toBe(0);
    hook.result.current.persistSimpleResume();
  } finally {
    hook.unmount();
  }
  const resumed = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(resumed.result.current.current).not.toBeNull());
    expect(resumed.result.current.simpleQueue.current.map((card) => card.id)).toEqual(expected);
    expect(resumed.result.current.sessionCardIds).toEqual(expected);
    expect(resumed.result.current.current?.id).toBe(expected[0]);
    expect((await db.cards.where('courseId').equals(course.id).toArray()).map((card) => card.id)).toEqual(authored);
  } finally {
    resumed.unmount();
  }
});
