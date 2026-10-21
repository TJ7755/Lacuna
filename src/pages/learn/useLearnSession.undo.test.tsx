import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCard, createCourse } from '../../db/repository';
import { db } from '../../db/schema';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';
import { useLearnView } from './useLearnView';

const distraction: DistractionTracker = {
  beginCard: vi.fn(),
  setAnswerVisible: vi.fn(),
  wasDistracted: () => false,
  blurredMs: () => 0,
  sessionMs: () => 1,
};

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.sessionHistory.clear(),
    db.reviewHistory.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.courseAssessments.clear(),
  ]);
});

describe('useLearnSession Undo presentation', () => {
  it("clears the next card's typed answer and hints when restoring the previous card", async () => {
    const course = await createCourse('Vocabulary', { newCardsPerDay: 2 });
    await createCard(course.id, 'front_back', 'Cat', 'chat', [], { answerMode: 'type' });
    await createCard(course.id, 'front_back', 'Dog', 'chien', [], { answerMode: 'type' });
    const params: UseLearnSessionParams = {
      courseId: undefined,
      lessonId: undefined,
      sessionId: undefined,
      tagFilter: null,
      filterParams: [],
      requestScopeLessonIds: undefined,
      practiceNodeKeyParam: null,
      requestAssessmentId: undefined,
      requestPlanId: undefined,
      requestWindowId: undefined,
      plannedRevision: false,
      reviewSessionKind: 'deck',
      isSimpleMode: false,
      mode: 'fsrs',
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
    };
    const hook = renderHook(() => {
      const view = useLearnView(false, params.notify);
      const session = useLearnSession({ ...params, onCardServed: view.resetForCard });
      return { session, view };
    });
    try {
      await waitFor(() => expect(hook.result.current.session.current).not.toBeNull());
      const answeredId = hook.result.current.session.current!.id;
      const clock = vi.spyOn(performance, 'now');
      clock.mockReturnValue(1000);
      act(() => hook.result.current.session.reveal());
      clock.mockReturnValue(6000);
      const markedBy = { by: 'jev' as const, model: 'jev-1.14.0', confidence: 0.98, markedAt: Date.now() };
      const revealedAt = performance.now();
      await act(async () => {
        await hook.result.current.session.answer(true, { markedBy });
      });
      await waitFor(() => expect(hook.result.current.session.current?.id).not.toBe(answeredId));
      const review = await db.reviewHistory.where('cardId').equals(answeredId).first();
      expect(review?.markedBy).toEqual(markedBy);
      expect(review!.responseTimeSec).toBeLessThan((revealedAt - 1000) / 1000);
      clock.mockRestore();
      expect(hook.result.current.session.isTypingCard).toBe(true);
      act(() => {
        hook.result.current.view.setTypedAnswer('Answer for the next card');
        hook.result.current.session.setHintStep(1);
      });

      await act(async () => {
        await hook.result.current.session.undoLast();
      });

      expect(hook.result.current.session.current?.id).toBe(answeredId);
      expect(hook.result.current.session.phase).toBe('question');
      expect(hook.result.current.view.typedAnswer).toBe('');
      expect(hook.result.current.session.hintStep).toBe(0);
      expect(await db.reviewHistory.where('cardId').equals(answeredId).count()).toBe(0);
    } finally {
      hook.unmount();
    }
  });
});
