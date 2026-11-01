import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import {
  makeSessionContext,
  selectNext,
  sessionComplete,
  sessionProgress,
  sessionServePool,
  type SessionUnit,
} from './session';
import { NOW, course, card } from './session.testFixtures';

describe('course new-card budget', () => {
  it("shares one course cap across that course's lesson units in a multi-unit session", () => {
    const lessonA = { ...course('lesson-a', 10), newCardsPerDay: 1 };
    const lessonB = { ...course('lesson-b', 10), newCardsPerDay: 1 };
    const cards = [
      card('a-new', lessonA.id, { courseId: 'course-1', createdAt: 1 }),
      card('b-new', lessonB.id, { courseId: 'course-1', createdAt: 2 }),
      card('other-new', 'lesson-c', { courseId: 'course-2', createdAt: 3 }),
    ];
    const lessonC = { ...course('lesson-c', 10), newCardsPerDay: 1 };

    const pool = sessionServePool(cards, makeSessionContext([lessonA, lessonB, lessonC]), NOW);

    expect(pool.map((entry) => entry.id).sort()).toEqual(['a-new', 'other-new']);
  });

  it('completes once the shared course budget is spent, not once per lesson', () => {
    const lessonA = {
      ...course('lesson-a', 10),
      examObjective: 'securedTopics' as const,
      newCardsPerDay: 1,
    };
    const lessonB = {
      ...course('lesson-b', 10),
      examObjective: 'securedTopics' as const,
      newCardsPerDay: 1,
    };
    const introduced = card('a-new', lessonA.id, {
      courseId: 'course-1',
      createdAt: 1,
      state: 2,
      stability: 100,
      difficulty: 5,
      lastReviewed: NOW,
      due: NOW + 100 * MS_PER_DAY,
      reps: 1,
      history: [
        {
          eventId: 'intro',
          sessionId: 'session',
          timestamp: NOW,
          grade: 3,
          responseTimeSec: 2,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 100,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        },
      ],
    });
    const cards = [introduced, card('b-new', lessonB.id, { courseId: 'course-1', createdAt: 2 })];
    const ctx = makeSessionContext([lessonA, lessonB]);

    expect(sessionServePool(cards, ctx, NOW + 60_000)).toEqual([introduced]);
    expect(sessionComplete(cards, ctx, NOW + 60_000)).toBe(true);
  });
});

describe('course/lesson-scoped sessions', () => {
  it('uses a course exam-date context for scoring, completion and progress', () => {
    const c = { ...course('course-1', 7), examObjective: 'securedTopics' as const };
    const near = card('near', 'shadow-deck', {
      courseId: c.id,
      primaryLessonId: 'near-lesson',
      stability: 10,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });
    const far = card('far', 'shadow-deck', {
      courseId: c.id,
      primaryLessonId: 'far-lesson',
      stability: 10,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });
    const examDateContext = {
      courseExamDate: c.examDate,
      lessonsById: new Map([
        [
          'near-lesson',
          {
            id: 'near-lesson',
            courseId: c.id,
            name: 'Near',
            orderIndex: 0,
            createdAt: NOW,
            updatedAt: NOW,
            isExtension: false,
            examDate: NOW + 2 * MS_PER_DAY,
          },
        ],
        [
          'far-lesson',
          {
            id: 'far-lesson',
            courseId: c.id,
            name: 'Far',
            orderIndex: 1,
            createdAt: NOW,
            updatedAt: NOW,
            isExtension: false,
            examDate: NOW + 30 * MS_PER_DAY,
          },
        ],
      ]),
      courseAssessments: [],
    };
    const unit: SessionUnit = {
      config: c,
      scope: { kind: 'course', courseId: c.id },
      examDateContext,
    };
    const ctx = makeSessionContext([unit]);

    expect(selectNext([near, far], ctx, new Map(), NOW)?.id).toBe('far');
    expect(sessionComplete([near], ctx, NOW)).toBe(true);
    expect(sessionComplete([far], ctx, NOW)).toBe(false);
    expect(sessionProgress([near, far], ctx, NOW)).toBe(0.5);
  });

  it('course scope serves cards by courseId regardless of their backing shadow deck', () => {
    const c = course('course-1', 10);
    const unit: SessionUnit = { config: c, scope: { kind: 'course', courseId: c.id } };
    const cards = [
      card('c1', 'shadow-deck-a', { courseId: 'course-1' }),
      card('c2', 'shadow-deck-b', { courseId: 'course-1' }),
      card('other', 'shadow-deck-c', { courseId: 'other-course' }),
    ];

    const ctx = makeSessionContext([unit]);
    const next = selectNext(cards, ctx, new Map(), NOW);

    expect(next).not.toBeNull();
    expect(['c1', 'c2']).toContain(next!.id);
    expect(sessionProgress(cards, ctx, NOW)).toBeGreaterThanOrEqual(0);
  });

  it('lesson scope serves cards by primaryLessonId plus cards linked via LessonCardLink', () => {
    const c = course('course-1', 10);
    const unit: SessionUnit = {
      config: c,
      scope: {
        kind: 'lesson',
        courseId: c.id,
        lessonId: 'lesson-1',
        linkedCardIds: new Set(['linked-card']),
      },
    };
    const cards = [
      card('own-card', 'shadow-deck-a', { courseId: 'course-1', primaryLessonId: 'lesson-1' }),
      card('linked-card', 'shadow-deck-b', { courseId: 'course-1', primaryLessonId: 'lesson-2' }),
      card('unrelated', 'shadow-deck-c', { courseId: 'course-1', primaryLessonId: 'lesson-2' }),
    ];

    const ctx = makeSessionContext([unit]);
    expect(sessionComplete(cards, ctx, NOW)).toBe(false);

    const served = new Set<string>();
    let cd = new Map<string, number>();
    for (let i = 0; i < 3; i++) {
      const next = selectNext(cards, ctx, cd, NOW);
      if (!next) break;
      served.add(next.id);
      cd = new Map(cd).set(next.id, 999);
    }
    expect(served.has('own-card')).toBe(true);
    expect(served.has('linked-card')).toBe(true);
    expect(served.has('unrelated')).toBe(false);
  });

  it('dedupes a card shared between two lesson units into a single pool entry', () => {
    const cA = course('course-1', 10);
    const cB = course('course-1', 30);
    const lessonA: SessionUnit = {
      config: cA,
      scope: {
        kind: 'lesson',
        courseId: 'course-1',
        lessonId: 'lesson-a',
        linkedCardIds: new Set(),
      },
    };
    const lessonB: SessionUnit = {
      config: cB,
      scope: {
        kind: 'lesson',
        courseId: 'course-1',
        lessonId: 'lesson-b',
        linkedCardIds: new Set(['shared']),
      },
    };
    const cards = [
      card('shared', 'shadow-deck-a', { courseId: 'course-1', primaryLessonId: 'lesson-a' }),
      card('a2', 'shadow-deck-a', { courseId: 'course-1', primaryLessonId: 'lesson-a' }),
      card('b1', 'shadow-deck-b', { courseId: 'course-1', primaryLessonId: 'lesson-b' }),
    ];

    const pool = sessionServePool(cards, makeSessionContext([lessonA, lessonB]), NOW);

    expect(pool.filter((c) => c.id === 'shared')).toHaveLength(1);
    expect(pool).toHaveLength(3);
  });

  it('scores a card shared between two lesson units deterministically regardless of unit registration order', () => {
    const cA = course('course-1', 10);
    const cB = course('course-1', 30);
    const lessonA: SessionUnit = {
      config: cA,
      scope: {
        kind: 'lesson',
        courseId: 'course-1',
        lessonId: 'lesson-a',
        linkedCardIds: new Set(),
      },
    };
    const lessonB: SessionUnit = {
      config: cB,
      scope: {
        kind: 'lesson',
        courseId: 'course-1',
        lessonId: 'lesson-b',
        linkedCardIds: new Set(['shared']),
      },
    };
    const cards = [
      card('shared', 'shadow-deck-a', { courseId: 'course-1', primaryLessonId: 'lesson-a' }),
      card('a2', 'shadow-deck-a', { courseId: 'course-1', primaryLessonId: 'lesson-a' }),
      card('b1', 'shadow-deck-b', { courseId: 'course-1', primaryLessonId: 'lesson-b' }),
    ];

    const serveOrder = (units: SessionUnit[]) => {
      const ctx = makeSessionContext(units);
      const served: string[] = [];
      let cd = new Map<string, number>();
      for (let i = 0; i < 3; i++) {
        const next = selectNext(cards, ctx, cd, NOW);
        if (!next) break;
        served.push(next.id);
        cd = new Map(cd).set(next.id, 999);
      }
      return served;
    };

    expect(serveOrder([lessonA, lessonB])).toEqual(serveOrder([lessonB, lessonA]));
  });
});

describe('shared cards without a lesson owner', () => {
  const sharedUnits: SessionUnit[] = [
    {
      config: course('course-1', 3),
      scope: {
        kind: 'lesson',
        courseId: 'course-1',
        lessonId: 'lesson-a',
        linkedCardIds: new Set(['shared']),
      },
    },
    {
      config: course('course-1', 30),
      scope: {
        kind: 'lesson',
        courseId: 'course-1',
        lessonId: 'lesson-b',
        linkedCardIds: new Set(['shared']),
      },
    },
  ];

  it('scores a shared linked card by its most urgent unit in cram mode', () => {
    const shared = card('shared', 'shadow-deck', {
      courseId: 'course-1',
      primaryLessonId: 'another-lesson',
      stability: 1,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });

    expect(selectNext([shared], makeSessionContext(sharedUnits, 'cram'), new Map(), NOW)?.id).toBe(
      shared.id,
    );
  });

  it('chooses the shortest cooldown for a shared card with no owning lesson unit', () => {
    const shared = card('shared', 'shadow-deck', {
      courseId: 'course-1',
      primaryLessonId: 'another-lesson',
      stability: 1,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });

    expect(
      selectNext([shared], makeSessionContext(sharedUnits), new Map([[shared.id, 2]]), NOW)?.id,
    ).toBe(shared.id);
  });
});
