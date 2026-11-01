import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import { db } from '../../db/schema';
import { computeCourseSummaries } from '../../state/courseSummaries';
import { useCourseStudyFlow } from '../../state/useCourseStudyFlow';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';

const NOW = Date.UTC(2026, 9, 19, 12);
const DAY = 86_400_000;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.useRealTimers());

function sessionParams(courseId: string, examPractice = false): UseLearnSessionParams {
  return {
    courseId,
    examPractice,
    lessonId: undefined,
    sessionId: undefined,
    tagFilter: null,
    filterParams: examPractice ? [] : ['due'],
    requestScopeLessonIds: undefined,
    practiceNodeKeyParam: null,
    requestAssessmentId: undefined,
    requestPlanId: undefined,
    requestWindowId: undefined,
    plannedRevision: false,
    reviewSessionKind: 'practice',
    isSimpleMode: false,
    mode: 'fsrs',
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
}

it.each(['steady', 'exam'] as const)(
  'counts and serves an unplaced, secure-but-due card in a %s course',
  async (schedulingMode) => {
    const course = await createCourse('Biology', {
      schedulingMode,
      examDate: schedulingMode === 'exam' ? NOW + DAY : undefined,
    });
    const due = await createCourseCard(course.id, 'front_back', 'Due', 'Answer');
    const future = await createCourseCard(course.id, 'front_back', 'Future', 'Answer');
    await createCourseCard(course.id, 'front_back', 'New', 'Answer');
    await db.cards.update(due.id, {
      state: 2,
      due: NOW - 1,
      stability: 1e8,
      lastReviewed: NOW - DAY,
      reps: 3,
    });
    await db.cards.update(future.id, {
      state: 2,
      due: NOW + DAY,
      stability: 0.5,
      lastReviewed: NOW - DAY,
      reps: 3,
    });

    const summary = computeCourseSummaries([course], [], await db.cards.toArray(), [], NOW)[
      course.id
    ];
    expect(summary.eligible).toBe(1);
    const flow = renderHook(() => useCourseStudyFlow(course.id));
    await waitFor(() =>
      expect(flow.result.current?.snapshot.recurringPracticeEligibleCount).toBe(1),
    );
    expect(flow.result.current?.decision).toMatchObject({
      kind: 'step',
      step: { mode: 'recurring' },
    });

    const params = sessionParams(course.id);
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.phase).toBe('question'));
    expect(session.result.current.current?.id).toBe(due.id);
    act(() => session.result.current.reveal());
    await act(async () => {
      await session.result.current.answer(3);
    });
    await waitFor(() => expect(session.result.current.phase).toBe('finished'));
    expect(await db.reviewHistory.count()).toBe(1);
    expect(
      computeCourseSummaries([course], [], await db.cards.toArray(), [], NOW)[course.id].eligible,
    ).toBe(0);
  },
);

it.each(['steady', 'exam'] as const)(
  'offers early practice only below a future exam target (%s)',
  async (schedulingMode) => {
    const course = await createCourse('Biology', {
      schedulingMode,
      examDate: schedulingMode === 'exam' ? NOW + 7 * DAY : undefined,
    });
    const weak = await createCourseCard(course.id, 'front_back', 'Weak', 'Answer');
    const secure = await createCourseCard(course.id, 'front_back', 'Secure', 'Answer');
    for (const [card, stability] of [
      [weak, 0.5],
      [secure, 1e8],
    ] as const) {
      await db.cards.update(card.id, {
        state: 2,
        due: NOW + DAY,
        stability,
        lastReviewed: NOW - DAY,
        reps: 3,
      });
    }
    const flow = renderHook(() => useCourseStudyFlow(course.id));
    await waitFor(() => expect(flow.result.current).toBeTruthy());
    expect(flow.result.current?.snapshot.recurringPracticeEligibleCount).toBe(0);
    expect(flow.result.current?.snapshot.examPracticeEligibleCount).toBe(
      schedulingMode === 'exam' ? 1 : 0,
    );
    const params = sessionParams(course.id, true);
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.phase).not.toBe('loading'));
    expect(session.result.current.current?.id).toBe(
      schedulingMode === 'exam' ? weak.id : undefined,
    );
  },
);
