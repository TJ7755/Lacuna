import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCard,
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  upsertLessonCardExposure,
} from '../../db/repository';
import { db } from '../../db/schema';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { CardFilter } from '../../db/search';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';
import { makeSessionContext, selectNext, sessionServePool } from '../../fsrs/session';

const distraction: DistractionTracker = {
  beginCard: vi.fn(),
  setAnswerVisible: vi.fn(),
  wasDistracted: () => false,
  blurredMs: () => 0,
  sessionMs: () => 1,
};

// Stable empty filters. An inline `[]` on every render is the same object-identity
// landmine as a rebuilt `scopeLessonIds` array and would reload the session forever.
const emptyFilterParams: CardFilter[] = [];

function sessionParams(overrides: Partial<UseLearnSessionParams> = {}): UseLearnSessionParams {
  return {
    courseId: undefined,
    lessonId: undefined,
    sessionId: undefined,
    tagFilter: null,
    filterParams: emptyFilterParams,
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
    distraction,
    typingSetting: 'reveal',
    startInFocusMode: false,
    m: 1,
    ...overrides,
  };
}

async function seedCurricularPractice() {
  const course = await createCourse('Chemistry');
  const lesson = await createLesson(course.id, 'Atomic structure');
  const first = await createLessonCard(course.id, lesson.id, 'front_back', 'Proton', 'Positive');
  const second = await createLessonCard(course.id, lesson.id, 'front_back', 'Electron', 'Negative');
  await upsertLessonCardExposure(lesson.id, first.id);
  await upsertLessonCardExposure(lesson.id, second.id);
  const node = await createPracticeNode(course.id, {
    type: 'manual',
    name: 'Checkpoint',
    position: 0,
  });
  const otherNode = await createPracticeNode(course.id, {
    type: 'manual',
    name: 'Later checkpoint',
    position: 0,
  });
  return { course, lesson, node, otherNode };
}

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.schedulingUnits.clear(),
    db.schedulingPerformance.clear(),
    db.reviewHistory.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.lessonCards.clear(),
    db.courseAssessments.clear(),
  ]);
});

describe('useLearnSession answer boundary', () => {
  it('orders global Course cards by scheduling urgency and enforces each inherited new-card limit', async () => {
    const nearCourse = await createCourse('Near course');
    const farCourse = await createCourse('Far course');
    const nearLesson = await createLesson(nearCourse.id, 'Near lesson');
    const farLesson = await createLesson(farCourse.id, 'Far lesson');
    const nearFirst = await createLessonCard(
      nearCourse.id,
      nearLesson.id,
      'front_back',
      'Near first',
      'Answer',
    );
    const nearSecond = await createLessonCard(
      nearCourse.id,
      nearLesson.id,
      'front_back',
      'Near second',
      'Answer',
    );
    const farFirst = await createLessonCard(
      farCourse.id,
      farLesson.id,
      'front_back',
      'Far first',
      'Answer',
    );
    const farSecond = await createLessonCard(
      farCourse.id,
      farLesson.id,
      'front_back',
      'Far second',
      'Answer',
    );
    await Promise.all([
      db.cards.update(nearFirst.id, { createdAt: 1 }),
      db.cards.update(nearSecond.id, { createdAt: 2 }),
      db.cards.update(farFirst.id, { createdAt: 1 }),
      db.cards.update(farSecond.id, { createdAt: 2 }),
    ]);
    const now = Date.now();
    await db.schedulingUnits.update(nearLesson.id, {
      examDate: now + 24 * 60 * 60 * 1000,
      newCardsPerDay: 1,
    });
    await db.schedulingUnits.update(farLesson.id, {
      examDate: now + 30 * 24 * 60 * 60 * 1000,
      newCardsPerDay: 1,
    });
    const units = (await db.schedulingUnits.bulkGet([nearLesson.id, farLesson.id])).filter(
      (unit): unit is NonNullable<typeof unit> => unit !== undefined,
    );
    const cards = [
      { ...nearFirst, createdAt: 1 },
      { ...nearSecond, createdAt: 2 },
      { ...farFirst, createdAt: 1 },
      { ...farSecond, createdAt: 2 },
    ];
    const serveable = sessionServePool(cards, makeSessionContext(units), now);
    expect(new Set(serveable.map((card) => card.id))).toEqual(new Set([nearFirst.id, farFirst.id]));
    expect(serveable.map((card) => card.id)).not.toContain(nearSecond.id);
    expect(serveable.map((card) => card.id)).not.toContain(farSecond.id);
    expect(selectNext(cards, makeSessionContext(units), new Map(), now)?.id).toBe(nearFirst.id);
    const params = {
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
      reviewSessionKind: 'practice' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current?.id).toBe(nearFirst.id));
    expect(result.current.sessionCardIds).toEqual(
      expect.arrayContaining([nearFirst.id, farFirst.id]),
    );
  });

  it.each([
    ['an unsupported kind', { v: 1, kind: 'scaffold' }],
    ['an unsupported version', { v: 2, kind: 'numeric', answer: { kind: 'exact', value: '4' } }],
  ])('does not grade a card with %s', async (_label, payload) => {
    const deck = await createCourse('Unsupported payload');
    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer', [], {
      payload: payload as never,
    });
    const params = {
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
      reviewSessionKind: 'deck' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current?.id).toBe(card.id));

    let undoAvailable: boolean | undefined;
    await act(async () => {
      undoAvailable = (
        await result.current.answer({
          correct: true,
          marksEarned: 1,
          marksAvailable: 1,
        })
      ).undoAvailable;
    });

    expect(undoAvailable).toBe(false);
    expect(result.current.phase).toBe('question');
    expect(result.current.events.current).toHaveLength(0);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
    expect(await db.sessionHistory.count()).toBe(0);
  });

  it('uses the course-keyed calibration row for a course session', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    await upsertLessonCardExposure(lesson.id, card.id);
    await db.coursePerformance.put({
      courseId: course.id,
      runningMeanResponseTime: 20,
      runningStdDevResponseTime: 1,
      m2: 0,
      totalCorrectReviews: 20,
      updatedAt: 0,
    });
    const params = {
      courseId: course.id,
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
      reviewSessionKind: 'practice' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
    };
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    let unmount: (() => void) | undefined;
    try {
      const rendered = renderHook(() => useLearnSession(params));
      const { result } = rendered;
      unmount = rendered.unmount;
      await waitFor(() => expect(result.current.current?.id).toBe(card.id));
      nowSpy.mockReturnValue(10_000);
      act(() => result.current.reveal());
      await waitFor(() => expect(result.current.phase).toBe('answer'));
      await act(async () => {
        await result.current.answer(true);
      });
      expect(result.current.events.current[0]?.grade).toBe(4);
    } finally {
      unmount?.();
      nowSpy.mockRestore();
    }
  });

  it('grades a card with a null payload like an ordinary card', async () => {
    const deck = await createCourse('Null payload', { newCardsPerDay: 2 });
    await createCard(deck.id, 'front_back', 'Question', 'Answer', [], {
      payload: null as never,
    });
    await createCard(deck.id, 'front_back', 'Next question', 'Next answer', [], {
      payload: null as never,
    });
    const params = {
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
      reviewSessionKind: 'deck' as const,
      isSimpleMode: false,
      mode: 'fsrs' as const,
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
      typingSetting: 'reveal' as const,
      startInFocusMode: false,
      m: 1,
    };
    const { result } = renderHook(() => useLearnSession(params));

    await waitFor(() => expect(result.current.current).not.toBeNull());
    const currentCardId = result.current.current!.id;

    act(() => {
      result.current.reveal();
    });
    await waitFor(() => expect(result.current.phase).toBe('answer'));

    let undoAvailable: boolean | undefined;
    await act(async () => {
      undoAvailable = (await result.current.answer(true)).undoAvailable;
    });

    expect(undoAvailable).toBe(true);
    expect(result.current.phase).not.toBe('answer');
    expect(result.current.events.current).toHaveLength(1);
    expect(await db.reviewHistory.where('cardId').equals(currentCardId).count()).toBe(1);
  });
});

describe('useLearnSession load identity', () => {
  beforeEach(async () => {
    await Promise.all([
      db.cards.clear(),
      db.schedulingUnits.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.coursePerformance.clear(),
      db.schedulingPerformance.clear(),
      db.reviewHistory.clear(),
      db.courses.clear(),
      db.lessons.clear(),
      db.lessonCards.clear(),
      db.lessonCardExposures.clear(),
      db.practiceNodes.clear(),
      db.practiceMilestones.clear(),
    ]);
  });

  it('does not reset progress or return to loading after answering when the scope array is rebuilt', async () => {
    const { course, lesson, node } = await seedCurricularPractice();
    const params = sessionParams({
      courseId: course.id,
      requestScopeLessonIds: [lesson.id],
      practiceNodeKeyParam: node.id,
    });
    const { result, rerender } = renderHook(
      (props: UseLearnSessionParams) => useLearnSession(props),
      { initialProps: params },
    );

    await waitFor(() => expect(result.current.phase).toBe('question'));
    act(() => {
      result.current.reveal();
    });
    await waitFor(() => expect(result.current.phase).toBe('answer'));
    await act(async () => {
      await result.current.answer(true);
    });

    expect(result.current.phase).not.toBe('loading');
    expect(result.current.events.current).toHaveLength(1);
    const progressAfterAnswer = result.current.schedulerProgress;

    rerender({
      ...params,
      requestScopeLessonIds: [lesson.id],
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.phase).not.toBe('loading');
    expect(result.current.events.current).toHaveLength(1);
    expect(result.current.schedulerProgress).toBe(progressAfterAnswer);
  });

  it('reloads when the practice node changes even if the lesson ids are unchanged', async () => {
    const { course, lesson, node, otherNode } = await seedCurricularPractice();
    const scopeLessonIds = [lesson.id];
    const params = sessionParams({
      courseId: course.id,
      requestScopeLessonIds: scopeLessonIds,
      practiceNodeKeyParam: node.id,
    });
    const { result, rerender } = renderHook(
      (props: UseLearnSessionParams) => useLearnSession(props),
      { initialProps: params },
    );

    await waitFor(() => expect(result.current.phase).toBe('question'));
    act(() => {
      result.current.reveal();
    });
    await waitFor(() => expect(result.current.phase).toBe('answer'));
    await act(async () => {
      await result.current.answer(true);
    });
    expect(result.current.events.current).toHaveLength(1);

    rerender({
      ...params,
      requestScopeLessonIds: scopeLessonIds,
      practiceNodeKeyParam: otherNode.id,
    });

    await waitFor(() => expect(result.current.events.current).toHaveLength(0));
    await waitFor(() => expect(result.current.phase).toBe('question'));
  });
});
