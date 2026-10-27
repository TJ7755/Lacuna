import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
} from '../../db/repository';
import { db } from '../../db/schema';
import { useLearnSession } from './useLearnSession';
import { sessionParams } from './useLearnSession.testFixtures';

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 86_400_000;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.useRealTimers());

it.each([10, 11])(
  'hands off after ten reviews without inventing completion (%s due cards)',
  async (count) => {
    const course = await createCourse('Review blocks', {
      learnFirst: false,
      examDate: NOW + 30 * DAY,
    });
    const lesson = await createLesson(course.id, 'Facts');
    const practice = await createPracticeNode(course.id, {
      type: 'manual',
      name: 'Checkpoint',
      position: 0,
      lessonIds: [lesson.id],
    });
    for (let index = 0; index < count; index += 1) {
      const card = await createLessonCard(
        course.id,
        lesson.id,
        'front_back',
        `Question ${index}`,
        'Answer',
      );
      await db.cards.update(card.id, {
        state: 2,
        stability: 0.1 + index * 0.1,
        difficulty: 5,
        lastReviewed: NOW - DAY,
        due: NOW - 1,
        reps: 5,
      });
    }
    const onStepFinished = vi.fn();
    const params = sessionParams({
      courseId: course.id,
      requestScopeLessonIds: [lesson.id],
      requestMilestoneLessonIds: [lesson.id],
      practiceNodeKeyParam: practice.id,
      requestReviewLimit: 10,
      onStepFinished,
    });
    const session = renderHook(() => useLearnSession(params));
    const answerCurrent = async (hook: typeof session) => {
      expect(hook.result.current.phase).toBe('question');
      act(() => hook.result.current.reveal());
      await act(async () => {
        await hook.result.current.answer(3);
      });
    };
    try {
      await waitFor(() => expect(session.result.current.phase).toBe('question'));
      for (let index = 0; index < 10; index += 1) await answerCurrent(session);
      await waitFor(() => expect(session.result.current.phase).toBe('finished'));

      expect(await db.reviewHistory.count()).toBe(10);
      expect(session.result.current.summary?.events).toHaveLength(10);
      expect(onStepFinished).toHaveBeenCalledTimes(1);
      const milestone = await db.practiceMilestones.get(practice.id);
      expect(milestone?.totalCardCount).toBe(count);
      if (count === 10) {
        expect(session.result.current.summary?.reachedGoal).toBe(true);
        expect(milestone?.completedAt).toBe(NOW);
      } else {
        expect(session.result.current.summary).toMatchObject({
          reachedGoal: false,
          blockComplete: true,
          limitReached: false,
          timeLimitReached: false,
        });
        expect(session.result.current.schedulerProgress).toBeLessThan(1);
        expect(milestone?.completedAt).toBeUndefined();
      }
    } finally {
      session.unmount();
    }

    if (count === 11) {
      const continued = renderHook(() => useLearnSession(params));
      try {
        await waitFor(() => expect(continued.result.current.phase).toBe('question'));
        await answerCurrent(continued);
        await waitFor(() => expect(continued.result.current.phase).toBe('finished'));
        expect(continued.result.current.summary?.events).toHaveLength(1);
        expect(continued.result.current.summary?.reachedGoal).toBe(true);
        expect(await db.reviewHistory.count()).toBe(11);
        expect((await db.practiceMilestones.get(practice.id))?.completedAt).toBe(NOW);
      } finally {
        continued.unmount();
      }
    }
  },
);
