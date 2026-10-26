import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { createCourse } from '../db/courseRepository';
import { createLesson, setLocalLessonOrder } from '../db/lessonRepository';
import { db } from '../db/schema';
import { ShellCourseDataProvider, useSidebarData } from './ShellCourseData';
import { useLessonOrderData } from './useLessonOrderData';
import { useLessons } from './useCourseData';
import { useCourseStudyFlow } from './useCourseStudyFlow';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('keeps Settings, Sidebar and guided Study in agreement while source hooks remain canonical', async () => {
  const course = await createCourse('Science', {
    autoPractice: false,
    unlockMode: 'open',
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  const { result } = renderHook(
    () => ({
      display: useLessonOrderData(course.id),
      sidebar: useSidebarData(),
      study: useCourseStudyFlow(course.id),
      source: useLessons(course.id),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ShellCourseDataProvider>{children}</ShellCourseDataProvider>
      ),
    },
  );
  await waitFor(() =>
    expect(result.current.sidebar?.lessons.map((lesson) => lesson.id)).toEqual([a.id, b.id]),
  );
  await act(async () => {
    await setLocalLessonOrder(course.id, [b.id, a.id]);
  });
  await waitFor(() =>
    expect(result.current.display?.lessons.map((lesson) => lesson.id)).toEqual([b.id, a.id]),
  );
  await waitFor(() =>
    expect(result.current.sidebar?.lessons.map((lesson) => lesson.id)).toEqual([b.id, a.id]),
  );
  await waitFor(() =>
    expect(result.current.study?.decision).toMatchObject({
      step: { kind: 'lesson', lessonId: b.id },
    }),
  );
  expect(result.current.source?.map((lesson) => lesson.id)).toEqual([a.id, b.id]);
  await act(async () => {
    await db.courses.update(course.id, { autoPractice: true });
  });
  await waitFor(() => expect(result.current.display?.unavailableReason).toBeUndefined());
  await waitFor(() =>
    expect(result.current.sidebar?.lessons.map((lesson) => lesson.id)).toEqual([b.id, a.id]),
  );
  await waitFor(() =>
    expect(result.current.study?.decision).toMatchObject({
      step: { kind: 'lesson', lessonId: b.id },
    }),
  );
  expect((await db.courses.get(course.id))?.localLessonOrder).toEqual([b.id, a.id]);
  // A new checkpoint also suspends both readers, even with Course unchanged.
  const final = (await db.courseAssessments.toArray())[0];
  await act(async () => {
    await db.courseAssessments.add({
      ...final,
      id: 'checkpoint',
      kind: 'checkpoint',
      afterLessonId: a.id,
    });
  });
  await waitFor(() => expect(result.current.display?.unavailableReason).toMatch(/checkpoints/));
  await waitFor(() =>
    expect(result.current.sidebar?.lessons.map((lesson) => lesson.id)).toEqual([a.id, b.id]),
  );
  await act(async () => {
    await setLocalLessonOrder(course.id);
  });
  expect((await db.courses.get(course.id))?.localLessonOrder).toBeUndefined();
  await waitFor(() =>
    expect(result.current.sidebar?.lessons.map((lesson) => lesson.id)).toEqual([a.id, b.id]),
  );
});
