import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { recordReview } from '../db/reviewRepository';
import { db } from '../db/schema';
import { useCourseStudyFlow } from './useCourseStudyFlow';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('labels a stale read with its own generation until the refreshed read arrives', async () => {
  const course = await createCourse('Biology');
  const { result, rerender } = renderHook(
    ({ refreshKey }) => useCourseStudyFlow(course.id, refreshKey),
    { initialProps: { refreshKey: 0 } },
  );
  await waitFor(() => expect(result.current?.generation).toBe(0));

  rerender({ refreshKey: 1 });
  // The conductor treats generation === refreshKey as the post-step plan; the
  // previous read must not claim that before the live query re-runs (#402).
  expect(result.current?.generation).toBe(0);
  await waitFor(() => expect(result.current?.generation).toBe(1));
});

it('does not rebuild a committed step after reviews, and refreshes before continuation', async () => {
  const course = await createCourse('Biology');
  const { result, rerender } = renderHook(
    ({ refreshKey, enabled }) => useCourseStudyFlow(course.id, refreshKey, enabled),
    { initialProps: { refreshKey: 0, enabled: true } },
  );
  await waitFor(() => expect(result.current?.course.name).toBe('Biology'));
  const committed = result.current;
  rerender({ refreshKey: 0, enabled: false });
  await act(async () => {
    await db.courses.update(course.id, { name: 'Cells' });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(result.current).toBe(committed);

  rerender({ refreshKey: 1, enabled: true });
  expect(result.current?.generation).toBe(0);
  await waitFor(() => expect(result.current?.generation).toBe(1));
  expect(result.current?.course.name).toBe('Cells');
});

it('loads a URL-seeded step once even when planning starts paused', async () => {
  const course = await createCourse('Biology');
  const { result } = renderHook(() => useCourseStudyFlow(course.id, 0, false));
  await waitFor(() => expect(result.current?.course.name).toBe('Biology'));
  const committed = result.current;
  await act(async () => {
    await db.courses.update(course.id, { name: 'Cells' });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(result.current).toBe(committed);
});

it('does not reuse a paused snapshot from another course', async () => {
  const first = await createCourse('Biology');
  const second = await createCourse('Chemistry');
  const { result, rerender } = renderHook(({ id }) => useCourseStudyFlow(id, 0, false), {
    initialProps: { id: first.id },
  });
  await waitFor(() => expect(result.current?.course.id).toBe(first.id));
  rerender({ id: second.id });
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current?.course.id).toBe(second.id));
});

it('retains completed lessons as inactive topic inventory without reopening their work', async () => {
  const course = await createCourse('Biology', { schedulingMode: 'steady', learnFirst: false });
  const lesson = await createLesson(course.id, 'Cells');
  const card = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'Membrane?',
    'Controls transport.',
  );
  await recordReview({
    card,
    deck: course,
    kind: 'course',
    eventId: 'inventory-review',
    sessionId: 'inventory-session',
    sessionKind: 'practice',
    grade: 4,
    correct: true,
    responseTimeSec: 3,
    distracted: false,
  });
  const { result } = renderHook(() => useCourseStudyFlow(course.id));
  await waitFor(() =>
    expect(result.current?.snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: lesson.id, nodeType: 'lesson', status: 'completed' }),
      ]),
    ),
  );
  expect(result.current?.progress?.priorities).toEqual([]);
  expect(result.current?.progress?.otherTopics).toEqual([
    expect.objectContaining({ conceptId: card.conceptId, dueCards: 0, newCards: 0 }),
  ]);
});
