import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { createCard, createCourse, createLesson, deleteCards } from '../../db/repository';
import { useCardListActions } from './useCardListActions';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify }) }));

beforeEach(async () => {
  notify.mockClear();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe.each([
  'addTag',
  'removeTag',
  'suspend',
  'bury',
  'reset',
  'due',
  'assign',
  'resume',
  'flag',
] as const)('%s Undo', (action) => {
  it.each(['content', 'history', 'deletion', 'unchanged'] as const)(
    'preserves subsequent %s state',
    async (change) => {
      const course = await createCourse('Undo');
      const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
      const lesson = await createLesson(course.id, 'Target');
      await db.cards.update(card.id, {
        tags: action === 'removeTag' ? ['tag'] : [],
        suspended: action === 'resume',
      });
      const before = await db.cards.get(card.id);
      const { result } = renderHook(() =>
        useCardListActions({ cards: [card], courseId: course.id }),
      );
      act(() => {
        result.current.toggle(card.id);
        result.current.setTagValue('tag');
        result.current.setAssignTarget(lesson.id);
        if (action === 'due') result.current.setRescheduleMode('dueNow');
      });
      await act(async () => {
        switch (action) {
          case 'addTag':
            await result.current.handleAddTag();
            break;
          case 'removeTag':
            await result.current.handleRemoveTag();
            break;
          case 'suspend':
            await result.current.handleSuspend(true);
            break;
          case 'bury':
            await result.current.handleBury();
            break;
          case 'reset':
          case 'due':
            await result.current.handleReschedule();
            break;
          case 'assign':
            await result.current.handleAssignLesson();
            break;
          case 'resume':
            await result.current.handleResume(card);
            break;
          case 'flag':
            await result.current.handleToggleFlag(card);
            break;
        }
      });
      const undo = notify.mock.calls.at(-1)![2].onAction;
      expect(await db.cards.get(card.id)).not.toEqual(before);
      if (change === 'content') await db.cards.update(card.id, { front: 'Later edit' });
      if (change === 'history') {
        await db.reviewHistory.add({
          id: 'later-review',
          eventId: 'later-review',
          cardId: card.id,
          deckId: card.deckId,
          schedulingUnitId: card.schedulingUnitId,
          timestamp: 100,
          grade: 3,
          responseTimeSec: 2,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 2,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        });
      }
      if (change === 'deletion') await deleteCards([card.id]);
      await act(async () => {
        await undo();
      });
      if (change === 'unchanged') {
        await waitFor(async () =>
          expect(await db.cards.get(card.id)).toEqual({ ...before, updatedAt: expect.any(Number) }),
        );
      } else {
        if (change === 'content') expect((await db.cards.get(card.id))!.front).toBe('Later edit');
        if (change === 'history') expect(await db.reviewHistory.get('later-review')).toBeDefined();
        if (change === 'deletion') expect(await db.cards.get(card.id)).toBeUndefined();
        expect(notify).toHaveBeenLastCalledWith('Could not undo that change.', 'negative');
      }
    },
  );
});
