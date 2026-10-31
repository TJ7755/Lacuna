import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createLesson, createLessonCard, createNote } from '../../db/repository';
import { db } from '../../db/schema';
import { useLearnSession } from './useLearnSession';
import { sessionParams } from './useLearnSession.testFixtures';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  'continues from notes with an empty pool without mistaking existing cards for a cardless lesson (%s)',
  async (hasCard) => {
    const course = await createCourse('Notes');
    const lesson = await createLesson(course.id, 'Introduction');
    await createNote(lesson.id, 'Read this first', 'Lesson content');
    if (hasCard) {
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
      await db.cards.update(card.id, { suspended: true });
    }
    const onStepFinished = vi.fn();
    const params = sessionParams({
      lessonId: lesson.id,
      isSimpleMode: true,
      mode: 'simple',
      onStepFinished,
    });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.phase).toBe('notes'));
      expect(await db.lessonCompletions.get(lesson.id)).toBeUndefined();
      await act(async () => {
        await hook.result.current.continueFromNotes();
      });
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      expect(hook.result.current.phase).toBe('finished');
      expect(hook.result.current.lessonNotesScreen).toBeNull();
      expect(hook.result.current.summary?.reachedGoal).toBe(true);
      if (hasCard) expect(await db.lessonCompletions.get(lesson.id)).toBeUndefined();
      else expect(await db.lessonCompletions.get(lesson.id)).toMatchObject({ lessonId: lesson.id });
      expect(await db.reviewHistory.count()).toBe(0);
    } finally {
      hook.unmount();
    }
  },
);

it('offers sorted, distinct tags from the edited card’s scheduling unit', async () => {
  const course = await createCourse('Tags');
  const first = await createLesson(course.id, 'First');
  const second = await createLesson(course.id, 'Second');
  await createLessonCard(course.id, first.id, 'front_back', 'One', 'Answer', ['Zulu', 'alpha']);
  await createLessonCard(course.id, first.id, 'front_back', 'Two', 'Answer', ['beta', 'Zulu']);
  await createLessonCard(course.id, second.id, 'front_back', 'Other', 'Answer', ['unrelated']);
  const params = sessionParams({
    courseId: course.id,
    isSimpleMode: true,
    standaloneSimple: true,
    mode: 'simple',
  });
  const hook = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(hook.result.current.phase).toBe('question'));
    const expected = new Map([
      [first.id, ['Zulu', 'alpha', 'beta']],
      [second.id, ['unrelated']],
    ]);
    const inspected = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const lessonId = hook.result.current.current!.primaryLessonId!;
      inspected.add(lessonId);
      expect(hook.result.current.editTagSuggestions).toEqual([]);
      act(() => hook.result.current.openEdit());
      expect(hook.result.current.editTagSuggestions).toEqual(expected.get(lessonId));
      act(() => hook.result.current.cancelEdit());
      expect(hook.result.current.editTagSuggestions).toEqual([]);
      act(() => hook.result.current.reveal());
      await act(async () => {
        await hook.result.current.answer(true);
      });
    }
    expect(inspected).toEqual(new Set([first.id, second.id]));
  } finally {
    hook.unmount();
  }
});
