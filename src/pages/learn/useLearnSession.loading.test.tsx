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
import { ASSET_GC_GRACE_MS, scheduleAssetGc, storeImageBlob } from '../../db/assets';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';
import { simpleSessionStorageKey } from './simpleSessionPersistence';
import { makeSessionContext, selectNext, sessionServePool } from '../../fsrs/session';

import {
  distraction,
  resetSessionTestDatabase,
  sessionParams,
} from './useLearnSession.testFixtures';

beforeEach(resetSessionTestDatabase);

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

describe('useLearnSession pool preparation', () => {
  it('defers a pending media sweep until the study session is disabled', async () => {
    const course = await createCourse('Media maintenance', { learnFirst: false });
    const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
    const orphan = await storeImageBlob(new Blob(['orphan']), 'image/png', 1, 1);
    await db.assets.update(orphan.hash, { createdAt: Date.now() - ASSET_GC_GRACE_MS });
    const params = sessionParams({
      courseId: course.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    });
    const session = renderHook(({ enabled }) => useLearnSession({ ...params, enabled }), {
      initialProps: { enabled: true },
    });
    try {
      await waitFor(() => expect(session.result.current.current?.id).toBe(card.id));
      scheduleAssetGc(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await db.assets.get(orphan.hash)).toBeDefined();
      session.rerender({ enabled: false });
      await waitFor(async () => expect(await db.assets.get(orphan.hash)).toBeUndefined());
    } finally {
      session.unmount();
      await db.assets.delete(orphan.hash);
    }
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
    await act(async () => {
      await first.result.current.answer(3);
    });
    await waitFor(() => expect(first.result.current.phase).toBe('finished'));
    expect(first.result.current.summary?.[resultFlag]).toBe(true);
    expect(await db.reviewHistory.count()).toBe(1);
    first.unmount();

    const second = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(second.result.current.phase).toBe('finished'));
    expect(second.result.current.summary?.[resultFlag]).toBe(true);
    expect(second.result.current.events.current).toHaveLength(0);
    if (setting === 'maxReviewsPerDay') {
      await act(async () => {
        expect(await second.result.current.confirmCompletion()).toBe(true);
      });
      act(() => {
        second.result.current.continueStudying();
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
        courseId: course.id,
        isSimpleMode: true,
        standaloneSimple: true,
        mode: 'simple',
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

  it.each(['course', 'lesson'] as const)(
    'runs an anytime Simple pass over %s cards regardless of exposure or due date',
    async (scope) => {
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
      await act(async () => {
        await result.current.answer(true);
      });
      await waitFor(() => expect(result.current.phase).toBe('finished'));
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
      expect(await db.lessonCompletions.get(lesson.id)).toBeUndefined();
      expect(await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()).toBe(
        scope === 'lesson' ? 1 : 0,
      );
    },
  );

  it('finishes a filtered due session after a slow Yes schedules the card for tomorrow', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Pathogen?',
      'Causes disease',
    );
    await upsertLessonCardExposure(lesson.id, card.id);
    const now = Date.now();
    await db.cards.update(card.id, {
      state: 2,
      stability: 0.1,
      difficulty: 5,
      reps: 5,
      lastReviewed: now - 10_000,
      due: now - 1,
    });
    const params = sessionParams({
      courseId: course.id,
      filterParams: ['due'],
      mode: 'filtered-due',
    });
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { result, unmount } = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(result.current.current?.id).toBe(card.id));
      clock.mockReturnValue(10_000);
      act(() => result.current.reveal());
      await act(async () => {
        await result.current.answer(true);
      });
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

it.each([true, false])(
  'schedules prior knowledge without earlier completion (introductions %s)',
  async (learnFirst) => {
    const course = await createCourse('Three-year science', { learnFirst });
    const earlier = await createLesson(course.id, 'Year one');
    const current = await createLesson(course.id, 'Year two');
    const old = await createLessonCard(course.id, earlier.id, 'front_back', 'Known fact?', 'Yes');
    const second = await createLessonCard(
      course.id,
      earlier.id,
      'front_back',
      'Another fact?',
      'Yes',
    );
    await db.cards.update(old.id, { createdAt: 1 });
    await db.cards.update(second.id, { createdAt: 2 });
    await createLessonCard(course.id, current.id, 'front_back', 'New fact?', 'No');
    await updateCourse(course.id, { studyStartLessonId: current.id, newCardsPerDay: 1 });
    const params = sessionParams({ courseId: course.id, catchUpPractice: true });
    const { result, unmount } = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(result.current.current?.id).toBe(old.id));
      expect(result.current.sessionCardIds).toEqual([old.id]);
      act(() => result.current.reveal());
      await act(async () => {
        await result.current.answer(true);
      });
      const scheduled = await db.cards.get(old.id);
      expect(scheduled?.reps).toBeGreaterThan(0);
      expect(scheduled?.due).not.toBeNull();
      expect(await db.lessonCardExposures.where('lessonId').equals(earlier.id).count()).toBe(0);
      expect(await db.lessonCompletions.where('lessonId').equals(earlier.id).count()).toBe(0);
    } finally {
      unmount();
    }
    const resumedParams = sessionParams({ courseId: course.id, catchUpPractice: true });
    const resumed = renderHook(() => useLearnSession(resumedParams));
    try {
      await waitFor(() => expect(resumed.result.current.phase).not.toBe('loading'));
      expect(resumed.result.current.sessionCardIds).not.toContain(second.id);
    } finally {
      resumed.unmount();
    }
  },
);

it.each([true, false])(
  'unlocks the next year without earlier completion (catch-up-only gate %s)',
  async (hasEarlierGate) => {
    const course = await createCourse('Three-year science', {
      unlockMode: 'semi-linear',
      autoPractice: false,
    });
    const earlier = await createLesson(course.id, 'Year one');
    const current = await createLesson(course.id, 'Year two');
    const next = await createLesson(course.id, 'Year three');
    await createLessonCard(course.id, earlier.id, 'front_back', 'Earlier?', 'Yes');
    const card = await createLessonCard(course.id, current.id, 'front_back', 'Current?', 'Yes');
    await updateCourse(course.id, { studyStartLessonId: current.id });
    if (hasEarlierGate) {
      await createPracticeNode(course.id, {
        type: 'manual',
        name: 'Review year one',
        position: current.orderIndex,
        lessonIds: [earlier.id],
      });
    }
    const params = sessionParams({ lessonId: current.id, isSimpleMode: true, mode: 'simple' });
    const { result, unmount } = renderHook(() => useLearnSession(params));
    try {
      await waitFor(() => expect(result.current.current?.id).toBe(card.id));
      act(() => result.current.reveal());
      await act(async () => {
        await result.current.answer(true);
      });
      await waitFor(() => expect(result.current.phase).toBe('finished'));
      expect((await db.lessons.get(next.id))?.unlockedAt).toBeDefined();
      expect(await db.lessonCardExposures.where('lessonId').equals(earlier.id).count()).toBe(0);
      expect(await db.lessonCompletions.where('lessonId').equals(earlier.id).count()).toBe(0);
    } finally {
      unmount();
    }
  },
);

it('breaks equal scheduler scores randomly when reviewing earlier material', async () => {
  const course = await createCourse('Biology', { learnFirst: false });
  const earlier = await createLesson(course.id, 'Earlier');
  const current = await createLesson(course.id, 'Current');
  await updateCourse(course.id, { studyStartLessonId: current.id });
  await createLessonCard(course.id, earlier.id, 'front_back', 'One', 'Answer');
  await createLessonCard(course.id, earlier.id, 'front_back', 'Two', 'Answer');
  const stored = await db.cards.where('courseId').equals(course.id).toArray();
  const params = sessionParams({ courseId: course.id, catchUpPractice: true });
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const { result, unmount } = renderHook(() => useLearnSession(params));
  try {
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current?.id).toBe(stored[1].id);
    const ctx = result.current.ctxRef.current!;
    expect(selectNext(result.current.cardsRef.current, ctx, new Map())?.id).toBe(stored[1].id);
    expect(await db.reviewHistory.count()).toBe(0);
  } finally {
    unmount();
    random.mockRestore();
  }
});
