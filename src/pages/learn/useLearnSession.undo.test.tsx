import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCard, createCourse, createCourseAssessment, createLesson, createLessonCard,
  createPracticeNode, upsertLessonCardExposure,
} from '../../db/repository';
import { createOrResumeRevisionPlan } from '../../db/revisionPlanRepository';
import { db } from '../../db/schema';
import { performanceForReviewUnit } from '../../db/backingDecks';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';
import { useLearnView } from './useLearnView';
import { loadSimpleSession } from './simpleSessionPersistence';

function sessionParams(overrides: Partial<UseLearnSessionParams> = {}): UseLearnSessionParams {
  return {
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
    ...overrides,
  };
}

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
    db.practiceNodes.clear(),
    db.practiceMilestones.clear(),
    db.revisionPlans.clear(),
  ]);
});

describe('useLearnSession Undo presentation', () => {
  it.each([true, false])('keeps a revision window active until confirmation and undoes its final %s verdict', async (correct) => {
    const course = await createCourse('Vocabulary');
    const lesson = await createLesson(course.id, 'Animals');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    await upsertLessonCardExposure(lesson.id, card.id);
    const assessment = await createCourseAssessment(course.id, 'Vocabulary test', Date.now() + 86_400_000, {
      afterLessonId: lesson.id, coverageMode: 'prefix',
    });
    const plan = await createOrResumeRevisionPlan(assessment.id, 0.1, {
      projectionMode: 'fsrs-6-practice-fallback', memoryModelVersion: 'fsrs-6', fallbackReason: 'missing',
    });
    const onStepFinished = vi.fn();
    const params = sessionParams({
      courseId: course.id, plannedRevision: true, requestAssessmentId: assessment.id,
      requestPlanId: plan.id, requestWindowId: plan.windows[0].id, onStepFinished,
    });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current?.id).toBe(card.id));
      const activePlan = await db.revisionPlans.get(plan.id);
      act(() => hook.result.current.reveal());
      await act(async () => { expect((await hook.result.current.answer(correct, { retainUndo: true })).undoAvailable).toBe(true); });
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      expect(await db.revisionPlans.get(plan.id)).toEqual(activePlan);
      expect(onStepFinished).not.toHaveBeenCalled();

      await act(async () => { await hook.result.current.undoLast(); });
      expect(hook.result.current.phase).toBe('question');
      expect(hook.result.current.summary).toBeNull();
      expect(await db.reviewHistory.count()).toBe(0);
      expect(await db.revisionPlans.get(plan.id)).toEqual(activePlan);
      act(() => hook.result.current.reveal());
      await act(async () => { await hook.result.current.answer(correct, { retainUndo: true }); });
      await act(async () => { expect(await hook.result.current.confirmCompletion()).toBe(true); });
      expect((await db.revisionPlans.get(plan.id))?.completedSessions).toHaveLength(1);
      expect(onStepFinished).toHaveBeenCalledOnce();
      expect(onStepFinished.mock.calls[0][0].revision).toMatchObject({ cardsCovered: 1, cardsImproved: correct ? 1 : 0 });
    } finally {
      hook.unmount();
    }
  });

  it('defers the final Practice milestone until confirmation', async () => {
    const course = await createCourse('Vocabulary', { dailyReviewGoal: 1 });
    const lesson = await createLesson(course.id, 'Animals');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    await upsertLessonCardExposure(lesson.id, card.id);
    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Checkpoint', position: 0 });
    const params = sessionParams({
      courseId: course.id, practiceNodeKeyParam: node.id, requestMilestoneLessonIds: [lesson.id],
    });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current?.id).toBe(card.id));
      const milestoneBefore = await db.practiceMilestones.get(node.id);
      act(() => hook.result.current.reveal());
      await act(async () => { await hook.result.current.answer(true, { retainUndo: true }); });
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      expect(await db.practiceMilestones.get(node.id)).toEqual(milestoneBefore);
      await act(async () => { await hook.result.current.undoLast(); });
      expect(await db.practiceMilestones.get(node.id)).toEqual(milestoneBefore);
      act(() => hook.result.current.reveal());
      await act(async () => { await hook.result.current.answer(true, { retainUndo: true }); });
      await act(async () => { expect(await hook.result.current.confirmCompletion()).toBe(true); });
      expect(await db.practiceMilestones.get(node.id)).toMatchObject({ completedAt: expect.any(Number) });
    } finally {
      hook.unmount();
    }
  });

  it.each([true, false])('keeps ordinary manual completion immediate in Simple mode %s', async (isSimpleMode) => {
    const course = await createCourse('Vocabulary', { learnFirst: !isSimpleMode ? false : true });
    const lesson = await createLesson(course.id, 'Animals');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    const onStepFinished = vi.fn();
    const params = sessionParams({
      lessonId: lesson.id, isSimpleMode, mode: isSimpleMode ? 'simple' : 'fsrs', onStepFinished,
    });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current).not.toBeNull());
      act(() => hook.result.current.reveal());
      let undoAvailable = true;
      await act(async () => { undoAvailable = (await hook.result.current.answer(true)).undoAvailable; });
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      expect(undoAvailable).toBe(false);
      expect(hook.result.current.canUndo).toBe(false);
    } finally {
      hook.unmount();
    }
  });

  it.each(['pool', 'limit', 'goal'] as const)('undoes the final scheduled answer after reaching the %s', async (stop) => {
    const course = await createCourse('Vocabulary', {
      learnFirst: false,
      ...(stop === 'limit' ? { maxReviewsPerDay: 1 } : {}),
      ...(stop === 'goal' ? { dailyReviewGoal: 1 } : {}),
    });
    const lesson = await createLesson(course.id, 'Animals', { answerMode: 'type' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    const cardBefore = await db.cards.get(card.id);
    const courseBefore = await db.courses.get(course.id);
    const onStepFinished = vi.fn();
    const params = sessionParams({ courseId: course.id, onStepFinished });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current?.id).toBe(card.id));
      act(() => hook.result.current.reveal());
      let undoAvailable = false;
      await act(async () => { undoAvailable = (await hook.result.current.answer(true, { retainUndo: true })).undoAvailable; });
      expect(undoAvailable).toBe(true);
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      expect(hook.result.current.canUndo).toBe(true);
      expect(onStepFinished).not.toHaveBeenCalled();

      await act(async () => { await hook.result.current.undoLast(); });
      expect(hook.result.current.phase).toBe('question');
      expect(hook.result.current.summary).toBeNull();
      expect(hook.result.current.events.current).toHaveLength(0);
      expect(hook.result.current.schedulerProgress).toBe(0);
      expect(await db.cards.get(card.id)).toEqual(cardBefore);
      expect(await db.courses.get(course.id)).toEqual(courseBefore);
      expect(await db.reviewHistory.count()).toBe(0);

      act(() => hook.result.current.reveal());
      await act(async () => { await hook.result.current.answer(true, { retainUndo: true }); });
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      await act(async () => { expect(await hook.result.current.confirmCompletion()).toBe(true); });
      expect(onStepFinished).toHaveBeenCalledOnce();
    } finally {
      hook.unmount();
    }
  });

  it('retains the provisional report and Undo after completion fails, then retries once', async () => {
    const course = await createCourse('Vocabulary', { unlockMode: 'semi-linear' });
    const lesson = await createLesson(course.id, 'Animals');
    const nextLesson = await createLesson(course.id, 'Plants');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    const onStepFinished = vi.fn();
    const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple', onStepFinished });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current).not.toBeNull());
      act(() => hook.result.current.reveal());
      await act(async () => { await hook.result.current.answer(true, { retainUndo: true }); });
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      const summary = hook.result.current.summary;
      const update = db.lessons.update.bind(db.lessons);
      const unlock = vi.spyOn(db.lessons, 'update').mockImplementationOnce((key, changes) =>
        update(key, changes).then(() => { throw new Error('Completion failed'); }),
      );
      try {
        await act(async () => { expect(await hook.result.current.confirmCompletion()).toBe(false); });
        expect(hook.result.current.phase).toBe('finished');
        expect(hook.result.current.summary).toEqual(summary);
        expect(hook.result.current.canUndo).toBe(true);
        expect(onStepFinished).not.toHaveBeenCalled();
        expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeUndefined();
        expect(params.notify).toHaveBeenCalledWith('Completion failed', 'negative');

        await act(async () => { await hook.result.current.undoLast(); });
        expect(hook.result.current.phase).toBe('question');
        expect(await db.reviewHistory.count()).toBe(0);
        act(() => hook.result.current.reveal());
        await act(async () => { await hook.result.current.answer(true, { retainUndo: true }); });
        await act(async () => {
          expect(await hook.result.current.confirmCompletion()).toBe(true);
          expect(await hook.result.current.confirmCompletion()).toBe(true);
        });
        expect(onStepFinished).toHaveBeenCalledOnce();
        expect(hook.result.current.canUndo).toBe(false);
      } finally {
        unlock.mockRestore();
      }
    } finally {
      hook.unmount();
    }
  });

  it('keeps the final Simple answer reversible until completion is confirmed once', async () => {
    const course = await createCourse('Vocabulary', { unlockMode: 'semi-linear' });
    const lesson = await createLesson(course.id, 'Animals', { answerMode: 'type' });
    const nextLesson = await createLesson(course.id, 'Plants');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    const onStepFinished = vi.fn();
    const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple', onStepFinished });
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current?.id).toBe(card.id));
      act(() => hook.result.current.reveal());
      await act(async () => { expect((await hook.result.current.answer(true, { retainUndo: true })).undoAvailable).toBe(true); });
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      expect(hook.result.current.canUndo).toBe(true);
      expect(hook.result.current.summary?.events).toHaveLength(1);
      expect(onStepFinished).not.toHaveBeenCalled();
      expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeUndefined();

      await act(async () => {
        const undo = hook.result.current.undoLast();
        expect(await hook.result.current.confirmCompletion()).toBe(false);
        await undo;
      });
      expect(hook.result.current.phase).toBe('question');
      expect(hook.result.current.summary).toBeNull();
      expect(await db.reviewHistory.count()).toBe(0);
      expect(await db.lessonCardExposures.count()).toBe(0);
      expect(await hook.result.current.confirmCompletion()).toBe(false);

      act(() => hook.result.current.reveal());
      await act(async () => { await hook.result.current.answer(true, { retainUndo: true }); });
      await waitFor(() => expect(hook.result.current.phase).toBe('finished'));
      const unlock = vi.spyOn(db.lessons, 'update');
      try {
        await act(async () => {
          expect(await Promise.all([
            hook.result.current.confirmCompletion(), hook.result.current.confirmCompletion(),
          ])).toEqual([true, true]);
          expect(await hook.result.current.confirmCompletion()).toBe(true);
        });
        expect(onStepFinished).toHaveBeenCalledOnce();
        expect(unlock).toHaveBeenCalledOnce();
        expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toEqual(expect.any(Number));
        expect(hook.result.current.canUndo).toBe(false);
        expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, [card.id])).toBeNull();
      } finally {
        unlock.mockRestore();
      }
    } finally {
      hook.unmount();
    }
  });

  it.each([true, false])('undoes a Simple introduction marked %s with its evidence and resume state', async (correct) => {
    const course = await createCourse('Vocabulary');
    const lesson = await createLesson(course.id, 'Animals', { answerMode: 'type' });
    await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Dog', 'chien');
    const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const hook = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(hook.result.current.current).not.toBeNull());
      const answeredId = hook.result.current.current!.id;
      const cardBefore = await db.cards.get(answeredId);
      const courseBefore = await db.courses.get(course.id);
      const performanceBefore = await performanceForReviewUnit(course.id, 'course');
      const orderBefore = [...hook.result.current.sessionCardIds];
      clock.mockReturnValue(3000);
      act(() => hook.result.current.reveal());
      clock.mockReturnValue(8000);
      const markedBy = { by: 'jev' as const, model: 'jev-1.14.0', confidence: 0.98, markedAt: Date.now() };
      let undoAvailable = false;
      await act(async () => {
        undoAvailable = (await hook.result.current.answer(correct, { markedBy, retainUndo: true })).undoAvailable;
      });
      expect(await db.reviewHistory.where('cardId').equals(answeredId).first()).toMatchObject({
        correct, markedBy, responseTimeSec: 2,
      });
      expect(await db.lessonCardExposures.get([lesson.id, answeredId])).toEqual(
        correct ? expect.objectContaining({ cardId: answeredId }) : undefined,
      );
      expect(undoAvailable).toBe(true);
      expect(hook.result.current.canUndo).toBe(true);
      await waitFor(async () => expect(await db.sessionHistory.count()).toBe(1));

      await act(async () => { await hook.result.current.undoLast(); });

      expect(hook.result.current.current?.id).toBe(answeredId);
      expect(hook.result.current.phase).toBe('question');
      expect(hook.result.current.simpleProgress).toBe(0);
      expect(hook.result.current.simpleWrong.current.size).toBe(0);
      expect(hook.result.current.sessionCardOutcomes.size).toBe(0);
      expect(hook.result.current.canUndo).toBe(false);
      expect(await db.cards.get(answeredId)).toEqual(cardBefore);
      expect(await db.courses.get(course.id)).toEqual(courseBefore);
      expect(await performanceForReviewUnit(course.id, 'course')).toEqual(performanceBefore);
      expect(await db.reviewHistory.where('cardId').equals(answeredId).count()).toBe(0);
      expect(await db.sessionHistory.count()).toBe(0);
      expect(await db.lessonCardExposures.get([lesson.id, answeredId])).toBeUndefined();
      expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, orderBefore)).toMatchObject({
        queueCardIds: orderBefore, masteredCardIds: [], events: [], outcomes: new Map(),
      });
    } finally {
      clock.mockRestore();
      hook.unmount();
    }
  });

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
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const hook = renderHook(() => {
      const view = useLearnView(false, params.notify);
      const session = useLearnSession({ ...params, onCardServed: view.resetForCard });
      return { session, view };
    });
    try {
      await waitFor(() => expect(hook.result.current.session.current).not.toBeNull());
      const answeredId = hook.result.current.session.current!.id;
      clock.mockReturnValue(3000);
      act(() => hook.result.current.session.reveal());
      clock.mockReturnValue(8000);
      const markedBy = {
        by: 'jev' as const,
        model: 'jev-1.14.0',
        confidence: 0.98,
        markedAt: Date.now(),
      };
      await act(async () => {
        await hook.result.current.session.answer(true, { markedBy });
      });
      await waitFor(() => expect(hook.result.current.session.current?.id).not.toBe(answeredId));
      const review = await db.reviewHistory.where('cardId').equals(answeredId).first();
      expect(review?.markedBy).toEqual(markedBy);
      expect(review!.responseTimeSec).toBe(2);
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
      clock.mockRestore();
      hook.unmount();
    }
  });
});
