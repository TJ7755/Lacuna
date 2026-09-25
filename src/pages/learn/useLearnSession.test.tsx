import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCard,
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  updateCourse,
  upsertLessonCardExposure,
} from '../../db/repository';
import { db } from '../../db/schema';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { CardFilter } from '../../db/search';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';
import { simpleSessionStorageKey } from './simpleSessionPersistence';
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
    startInFocusMode: false,
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
    db.lessonCardExposures.clear(),
    db.courseAssessments.clear(),
  ]);
});

describe('useLearnSession answer boundary', () => {
  it.each(['lesson', 'course'] as const)('uses authored typing in a %s session', async (scope) => {
    const course = await createCourse('Typing', { learnFirst: false });
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'type' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    const params = sessionParams({
      ...(scope === 'lesson' ? { lessonId: lesson.id } : { courseId: course.id }),
      isSimpleMode: true, standaloneSimple: true, mode: 'simple',
    });
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    expect(session.result.current.isTypingCard).toBe(true);
    session.unmount();
  });

  it('uses a card typing override even when its lesson defaults to reveal', async () => {
    const course = await createCourse('Typing', { learnFirst: false });
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'reveal' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat', [], undefined, 'type');
    const params = sessionParams({ courseId: course.id, isSimpleMode: true, standaloneSimple: true, mode: 'simple' });
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    expect(session.result.current.isTypingCard).toBe(true);
    session.unmount();
  });

  it('lets an explicit reveal override a typing lesson', async () => {
    const course = await createCourse('Typing', { learnFirst: false });
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'type' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    await db.cards.update(card.id, { answerMode: 'reveal' });
    const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, standaloneSimple: true, mode: 'simple' });
    const session = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
    expect(session.result.current.isTypingCard).toBe(false);
    session.unmount();
  });

  it.each([
    ['maxReviewsPerDay', 'limitReached'],
    ['dailyReviewGoal', 'reachedGoal'],
  ] as const)('keeps %s reached when another session starts today', async (setting, resultFlag) => {
    const course = await createCourse('Daily count');
    const lesson = await createLesson(course.id, 'Lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'First', 'Answer');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Second', 'Answer');
    await updateCourse(course.id, { learnFirst: false, [setting]: 1 });
    const params = sessionParams({ courseId: course.id });

    const first = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(first.result.current.current).not.toBeNull());
    act(() => first.result.current.reveal());
    await act(async () => { await first.result.current.answer(3); });
    await waitFor(() => expect(first.result.current.phase).toBe('finished'));
    expect(first.result.current.summary?.[resultFlag]).toBe(true);
    expect(await db.reviewHistory.count()).toBe(1);
    first.unmount();

    const second = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(second.result.current.phase).toBe('finished'));
    expect(second.result.current.summary?.[resultFlag]).toBe(true);
    expect(second.result.current.events.current).toHaveLength(0);
    if (setting === 'maxReviewsPerDay') {
      act(() => {
        second.result.current.setSummary(null);
        second.result.current.setLimitOverride(true);
        second.result.current.serveNext();
      });
      await waitFor(() => expect(second.result.current.phase).toBe('question'));
    }
    second.unmount();
  });

  it('does not load curricular practice records for a standalone course pass', async () => {
    const course = await createCourse('Optional pass');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    const practiceQuery = vi.spyOn(db.practiceNodes, 'where');
    const exposureQuery = vi.spyOn(db.lessonCardExposures, 'where');
    const linkQuery = vi.spyOn(db.lessonCards, 'where');
    try {
      const params = sessionParams({
        courseId: course.id, isSimpleMode: true, standaloneSimple: true, mode: 'simple',
      });
      const { result } = renderHook(() => useLearnSession(params));
      await waitFor(() => expect(result.current.current?.id).toBe(card.id));
      expect(practiceQuery).not.toHaveBeenCalled();
      expect(exposureQuery).not.toHaveBeenCalled();
      expect(linkQuery).not.toHaveBeenCalled();
    } finally {
      practiceQuery.mockRestore();
      exposureQuery.mockRestore();
      linkQuery.mockRestore();
    }
  });

  it.each(['course', 'lesson'] as const)('runs an anytime Simple pass over %s cards regardless of exposure or due date', async (scope) => {
    const course = await createCourse('Anytime');
    const lesson = await createLesson(course.id, 'Completed lesson');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    if (scope === 'lesson') await upsertLessonCardExposure(lesson.id, card.id);
    await db.cards.update(card.id, { state: 2, stability: 10000, due: Date.now() + 864000000 });
    const params = sessionParams({
      courseId: scope === 'course' ? course.id : undefined,
      lessonId: scope === 'lesson' ? lesson.id : undefined,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const { result } = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(result.current.current?.id).toBe(card.id));
    expect(result.current.phase).toBe('question');
    act(() => result.current.reveal());
    await act(async () => { await result.current.answer(true); });
    await waitFor(() => expect(result.current.phase).toBe('finished'));
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
    expect(await db.lessonCompletions.get(lesson.id)).toBeUndefined();
    expect(await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()).toBe(scope === 'lesson' ? 1 : 0);
  });

  it('finishes a filtered due session after a slow Yes schedules the card for tomorrow', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Pathogen?', 'Causes disease');
    await upsertLessonCardExposure(lesson.id, card.id);
    const now = Date.now();
    await db.cards.update(card.id, {
      state: 2, stability: 0.1, difficulty: 5, reps: 5,
      lastReviewed: now - 10_000, due: now - 1,
    });
    const params = sessionParams({ courseId: course.id, filterParams: ['due'], mode: 'filtered-due' });
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { result, unmount } = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(result.current.current?.id).toBe(card.id));
      clock.mockReturnValue(10_000);
      act(() => result.current.reveal());
      await act(async () => { await result.current.answer(true); });
      expect(result.current.events.current[0]).toMatchObject({ grade: 2, correct: true });
      expect((await db.cards.get(card.id))!.due).toBeGreaterThan(Date.now());
      await waitFor(() => expect(result.current.phase).toBe('finished'));
      expect(result.current.events.current).toHaveLength(1);
    } finally {
      unmount();
      clock.mockRestore();
    }
  });

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
      startInFocusMode: false,
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
      startInFocusMode: false,
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
      startInFocusMode: false,
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

  it('records a Simple Learn answer as a timing-graded canonical FSRS review', async () => {
    const course = await createCourse('Simple scheduling');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Nucleus', 'DNA');
    const slowCard = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Mitochondrion',
      'Respiration',
    );
    await Promise.all([
      upsertLessonCardExposure(lesson.id, card.id),
      upsertLessonCardExposure(lesson.id, slowCard.id),
    ]);
    await db.coursePerformance.put({
      courseId: course.id,
      runningMeanResponseTime: 20,
      runningStdDevResponseTime: 1,
      m2: 0,
      totalCorrectReviews: 20,
      updatedAt: 0,
    });
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const params = sessionParams({
      courseId: course.id,
      sessionId: 'simple-session',
      reviewSessionKind: 'practice',
      isSimpleMode: true,
      mode: 'simple',
    });
    const rendered = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(rendered.result.current.current).not.toBeNull());
      const fastCardId = rendered.result.current.current!.id;
      const slowCardId = fastCardId === card.id ? slowCard.id : card.id;
      nowSpy.mockReturnValue(10_000);
      act(() => rendered.result.current.reveal());
      await waitFor(() => expect(rendered.result.current.phase).toBe('answer'));
      await act(async () => {
        await rendered.result.current.answer(true);
      });

      const reviews = await db.reviewHistory.where('cardId').equals(fastCardId).toArray();
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        sessionId: 'simple-session',
        sessionKind: 'practice',
        grade: 4,
        correct: true,
        responseTimeSec: 10,
      });
      expect(rendered.result.current.events.current[0]?.grade).toBe(4);
      expect((await db.cards.get(fastCardId))?.reps).toBe(1);

      await waitFor(() => expect(rendered.result.current.current?.id).toBe(slowCardId));
      nowSpy.mockReturnValue(60_000);
      act(() => rendered.result.current.reveal());
      await waitFor(() => expect(rendered.result.current.phase).toBe('answer'));
      await act(async () => {
        await rendered.result.current.answer(true);
      });
      expect((await db.reviewHistory.where('cardId').equals(slowCardId).first())?.grade).toBe(2);
      expect((await db.cards.get(slowCardId))?.reps).toBe(1);
    } finally {
      rendered.unmount();
      nowSpy.mockRestore();
    }
  });

  it('records No in Simple Learn as Again and keeps the card in its learning queue', async () => {
    const course = await createCourse('Simple retry');
    const lesson = await createLesson(course.id, 'Cells');
    const first = await createLessonCard(course.id, lesson.id, 'front_back', 'First', 'Answer');
    const second = await createLessonCard(course.id, lesson.id, 'front_back', 'Second', 'Answer');
    await Promise.all([
      upsertLessonCardExposure(lesson.id, first.id),
      upsertLessonCardExposure(lesson.id, second.id),
    ]);
    const params = sessionParams({ courseId: course.id, isSimpleMode: true, mode: 'simple' });
    const { result } = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const answeredId = result.current.current!.id;
    act(() => result.current.reveal());
    await waitFor(() => expect(result.current.phase).toBe('answer'));
    await act(async () => {
      await result.current.answer(false);
    });

    const reviews = await db.reviewHistory.where('cardId').equals(answeredId).toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ grade: 1, correct: false });
    expect(result.current.simpleWrong.current.has(answeredId)).toBe(true);
    expect(result.current.simpleMastered.current.has(answeredId)).toBe(false);
    expect(result.current.simpleQueue.current.find((card) => card.id === answeredId)?.reps).toBe(1);
  });

  it('removes an automatically suspended card from the Simple Learn queue and progress', async () => {
    const course = await createCourse('Simple leech', { leechThreshold: 1, leechAction: 'suspend' });
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    await db.cards.update(card.id, {
      state: 2, stability: 1, difficulty: 5, reps: 1, lapses: 0,
      lastReviewed: Date.now() - 86_400_000, due: Date.now() - 1,
    });
    await upsertLessonCardExposure(lesson.id, card.id);
    const params = sessionParams({ courseId: course.id, isSimpleMode: true, mode: 'simple' });
    const { result } = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(result.current.current?.id).toBe(card.id));
    act(() => result.current.reveal());
    await act(async () => { await result.current.answer(false); });
    expect((await db.cards.get(card.id))?.suspended).toBe(true);
    expect(result.current.simpleQueue.current).toEqual([]);
    expect(result.current.sessionCardIds).not.toContain(card.id);
    expect(result.current.sessionCardOutcomes.has(card.id)).toBe(false);
    expect(result.current.phase).toBe('finished');
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
      startInFocusMode: false,
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

    await act(async () => {
      await result.current.undoLast();
    });

    expect(result.current.current?.id).toBe(currentCardId);
    expect(result.current.phase).toBe('question');
    expect(result.current.events.current).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(await db.reviewHistory.where('cardId').equals(currentCardId).count()).toBe(0);
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

  it('persists an empty requested lesson scope without a phantom empty-string id', () => {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('lacuna.simpleSession.v1:')) localStorage.removeItem(key);
    }
    const { result } = renderHook((props: UseLearnSessionParams) => useLearnSession(props), {
      initialProps: sessionParams({
        courseId: 'course-1',
        sessionId: 'session-empty-scope',
        requestScopeLessonIds: [],
        isSimpleMode: true,
      }),
    });

    act(() => {
      result.current.persistSimpleResume();
    });

    const scope = {
      kind: 'practice' as const,
      courseId: 'course-1',
      sessionId: 'session-empty-scope',
      nodeKey: undefined,
      assessmentId: undefined,
      planId: undefined,
      windowId: undefined,
    };
    expect(
      localStorage.getItem(simpleSessionStorageKey({ ...scope, lessonIds: [] })),
    ).not.toBeNull();
    expect(localStorage.getItem(simpleSessionStorageKey({ ...scope, lessonIds: [''] }))).toBeNull();
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
