import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createNote,
  linkCardToLesson,
} from '../../db/repository';
import { db } from '../../db/schema';
import { useLearnSession } from './useLearnSession';
import { sessionParams } from './useLearnSession.testFixtures';
import {
  createCourseBasicReversedPair,
  createLessonBasicReversedPair,
  saveCardEdit,
} from '../../db/cardRepository';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.restoreAllMocks());

it('does not restore a deleted partner after correcting a checked introduction', async () => {
  const course = await createCourse('Introduction correction');
  const lesson = await createLesson(course.id, 'First');
  await createLessonBasicReversedPair(course.id, lesson.id, 'Question', 'Answer');
  const params = sessionParams({
    lessonId: lesson.id,
    reviewSessionKind: 'lesson',
    isSimpleMode: true,
    introduceNewCards: true,
    mode: 'simple',
  });
  const hook = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() =>
      expect(hook.result.current.introductionPresentation.stage).toBe('familiarise'),
    );
    const current = hook.result.current.current!;
    act(() => {
      hook.result.current.checkIntroduction(
        hook.result.current.introductionPresentation.serial,
        true,
      );
    });
    await act(async () => {
      const updated = await saveCardEdit(current.id, {
        type: current.type === 'basic_reversed' ? 'front_back' : 'cloze',
        front: '{{c1::Updated question}}',
        back: current.type === 'basic_reversed' ? 'Updated answer' : '',
      });
      await hook.result.current.handleEdited(updated);
    });
    expect(await db.cards.get(current.reverseCardId!)).toBeUndefined();
    act(() => {
      const { serial } = hook.result.current.introductionPresentation;
      hook.result.current.checkIntroduction(serial, true);
      hook.result.current.continueIntroduction(serial);
    });
    expect(hook.result.current.current?.id).not.toBe(current.reverseCardId);
  } finally {
    hook.unmount();
  }
});

it.each([false, true])(
  'refreshes the queued reverse after a study correction (converted: %s)',
  async (converted) => {
    const course = await createCourse('Paired correction');
    await createCourseBasicReversedPair(course.id, 'Question', 'Answer');
    const params = sessionParams({
      courseId: course.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.phase).toBe('question'));
      const current = hook.result.current.current!;
      await act(async () => {
        const updated = await saveCardEdit(current.id, {
          type: converted ? 'cloze' : current.type,
          front: converted ? '{{c1::Updated question}}' : 'Updated question',
          back: converted ? '' : 'Updated answer',
        });
        await hook.result.current.handleEdited(updated);
      });
      act(() => hook.result.current.reveal());
      await act(async () => {
        await hook.result.current.answer(true);
      });
      if (converted) {
        expect(hook.result.current.current?.id).not.toBe(current.reverseCardId);
      } else {
        expect(hook.result.current.current).toMatchObject({
          id: current.reverseCardId,
          front: 'Updated answer',
          back: 'Updated question',
        });
      }
    } finally {
      hook.unmount();
    }
  },
);

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

it.each(['current lesson', 'locked successor'] as const)(
  'continues from notes when the only card is suspended and owned by the %s',
  async (owner) => {
    const course = await createCourse('Science', {
      learnFirst: false,
      unlockMode: 'semi-linear',
      autoPractice: false,
    });
    const lesson = await createLesson(course.id, 'First');
    const next = await createLesson(course.id, 'Next');
    const belongsToLockedSuccessor = owner === 'locked successor';
    const card = await createLessonCard(
      course.id,
      belongsToLockedSuccessor ? next.id : lesson.id,
      'front_back',
      'Question',
      'Answer',
    );
    if (belongsToLockedSuccessor) await linkCardToLesson(lesson.id, card.id);
    await db.cards.update(card.id, { suspended: true });
    const onStepFinished = vi.fn();
    const params = sessionParams({
      lessonId: lesson.id,
      reviewSessionKind: 'lesson',
      onStepFinished,
    });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.phase).toBe('notes'));
      expect(await db.lessonCompletions.get(lesson.id)).toBeUndefined();
      expect((await db.lessons.get(next.id))?.unlockedAt).toBeUndefined();
      await act(async () => {
        await hook.result.current.continueFromNotes();
      });
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      const receipt = await db.lessonCompletions.get(lesson.id);
      const unlockedAt = (await db.lessons.get(next.id))?.unlockedAt;
      if (belongsToLockedSuccessor) {
        expect(receipt).toMatchObject({ lessonId: lesson.id });
        expect(unlockedAt).toEqual(expect.any(Number));
      } else {
        expect(receipt).toBeUndefined();
        expect(unlockedAt).toBeUndefined();
      }
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
      await waitFor(() => expect(hook.result.current.canEditCurrent).toBe(true));
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

it('blocks editing a locked course in an all-course session and reacts when it is detached', async () => {
  const course = await createCourse('Published');
  const lesson = await createLesson(course.id, 'First');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  await db.courses.update(course.id, {
    distributedCopy: {
      lineageId: 'published',
      revision: 1,
      locked: true,
      autoAcceptUpdates: false,
    },
  });
  const params = sessionParams();
  const hook = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(hook.result.current.phase).toBe('question'));
    act(() => hook.result.current.openEdit());
    expect(hook.result.current.editing).toBe(false);
    await act(async () => {
      await db.courses.update(course.id, { distributedCopy: undefined });
    });
    await waitFor(() => expect(hook.result.current.canEditCurrent).toBe(true));
    const currentId = hook.result.current.current!.id;
    act(() => hook.result.current.openEdit());
    expect(hook.result.current.editing).toBe(true);
    act(() => hook.result.current.cancelEdit());
    expect(hook.result.current.current!.id).toBe(currentId);
    expect(hook.result.current.phase).toBe('question');
  } finally {
    hook.unmount();
  }
});
