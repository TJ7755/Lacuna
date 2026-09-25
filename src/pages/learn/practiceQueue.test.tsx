import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, createLesson, createLessonCard } from '../../db/repository';
import { db } from '../../db/schema';
import type { ExamObjective, Grade } from '../../db/types';
import { sessionServePool } from '../../fsrs/session';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';

const NOW = Date.UTC(2026, 8, 25, 12);
const DAY = 86_400_000;

afterEach(() => vi.useRealTimers());
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function startSession(count: number, objective: ExamObjective = 'securedTopics', dueOnly = false) {
  const course = await createCourse('Queue simulation', {
    examDate: NOW + 30 * DAY, learnFirst: false, examObjective: objective,
  });
  const lesson = await createLesson(course.id, 'Lesson');
  for (let index = 0; index < count; index += 1) {
    const card = await createLessonCard(course.id, lesson.id, 'front_back', `Card ${index}`, 'Answer');
    await db.cards.update(card.id, {
      state: 2, stability: 0.1 + index * 0.1, difficulty: 5,
      lastReviewed: NOW - DAY, due: NOW - 1, reps: 5,
    });
  }
  const params: UseLearnSessionParams = {
    courseId: course.id, lessonId: undefined, sessionId: undefined,
    tagFilter: null, filterParams: dueOnly ? ['due'] : [], requestScopeLessonIds: undefined,
    practiceNodeKeyParam: null, requestAssessmentId: undefined,
    requestPlanId: undefined, requestWindowId: undefined, plannedRevision: false,
    reviewSessionKind: 'practice', isSimpleMode: false, mode: 'fsrs',
    navigate: vi.fn(), notify: vi.fn(), startInFocusMode: false,
    distraction: {
      beginCard: vi.fn(), setAnswerVisible: vi.fn(), wasDistracted: () => false,
      blurredMs: () => 0, sessionMs: () => 1,
    },
  };
  const hook = renderHook(() => useLearnSession(params));
  await waitFor(() => expect(hook.result.current.phase).toBe('question'));
  return hook;
}

async function answer(hook: Awaited<ReturnType<typeof startSession>>, grade: Grade) {
  act(() => hook.result.current.reveal());
  await act(async () => { await hook.result.current.answer(grade); });
  await waitFor(() => expect(hook.result.current.phase).not.toBe('answer'));
}

describe.each(['expectedMarks', 'securedTopics'] as const)('%s queue', (objective) => {
  it.each([1, 2, 8].flatMap((count) => [1, 2, 3, 4].map((grade) => ({ count, grade: grade as Grade }))))(
    'reviews $count remaining cards without early repeats after grade $grade',
    async ({ count, grade }) => {
      const hook = await startSession(count, objective);
      const sequence: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const current = hook.result.current.current!;
        sequence.push(current.front);
        expect(current.due! <= Date.now(), sequence.join(' → ')).toBe(true);
        expect(new Set(sequence).size, sequence.join(' → ')).toBe(sequence.length);
        await answer(hook, grade);
      }
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      expect(await db.reviewHistory.count()).toBe(count);
      expect(hook.result.current.summary?.masteryAfter).toBeLessThan(1);
    },
  );
});

it.each([false, true])('shows work completion separately from recall (due only: %s)', async (dueOnly) => {
  const hook = await startSession(2, 'expectedMarks', dueOnly);
  expect(hook.result.current.schedulerProgress).toBe(0);
  expect(hook.result.current.predictedRecall).toBeGreaterThan(0);
  await answer(hook, 3);
  expect(hook.result.current.schedulerProgress).toBe(0.5);
  await answer(hook, 3);
  await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
  expect(hook.result.current.schedulerProgress).toBe(1);
  expect(hook.result.current.predictedRecall).toBeLessThan(1);
});

it('restores the answered card and completion on Undo', async () => {
  const hook = await startSession(2);
  const first = hook.result.current.current!;
  await answer(hook, 3);
  expect(hook.result.current.schedulerProgress).toBe(0.5);
  await act(async () => { await hook.result.current.undoLast(); });
  expect(hook.result.current.current?.id).toBe(first.id);
  expect(hook.result.current.schedulerProgress).toBe(0);
  expect(await db.reviewHistory.count()).toBe(0);
});

it('allows a failed card back when its actual retry time arrives', async () => {
  const hook = await startSession(2);
  const failedId = hook.result.current.current!.id;
  await answer(hook, 1);
  const pool = () => sessionServePool(hook.result.current.cardsRef.current, hook.result.current.ctxRef.current!);
  expect(pool().map((card) => card.id)).not.toContain(failedId);
  const failed = hook.result.current.cardsRef.current.find((card) => card.id === failedId)!;
  vi.setSystemTime(failed.due!);
  expect(pool().map((card) => card.id)).toContain(failedId);
});
