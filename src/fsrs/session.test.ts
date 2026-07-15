import { describe, expect, it } from 'vitest';
import type { Card, Deck, SchedulerConfig } from '../db/types';
import { defaultFsrsParameters, MS_PER_DAY } from './params';
import {
  makeSessionContext,
  selectNext,
  sessionComplete,
  sessionProgress,
  sessionServePool,
  type SessionUnit,
} from './session';

const NOW = new Date(2026, 5, 4, 12).getTime();

function deck(id: string, days: number): Deck {
  return {
    id,
    name: id,
    examDate: NOW + days * 24 * 60 * 60 * 1000,
    createdAt: NOW,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  };
}

/** A minimal SchedulerConfig standing in for a Course, keyed by courseId. */
function course(id: string, days: number): SchedulerConfig {
  return {
    id,
    examDate: NOW + days * 24 * 60 * 60 * 1000,
    examObjective: 'expectedMarks',
    fsrsParameters: defaultFsrsParameters(),
  };
}

function card(id: string, deckId: string, extra?: Partial<Card>): Card {
  return {
    id,
    deckId,
    type: 'front_back',
    front: id,
    back: 'answer',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: NOW,
    suspended: false,
    buriedUntil: null,
    ...extra,
  };
}

describe('multi-deck session normalisation', () => {
  it('serves a single-card deck without producing a degenerate zero priority', () => {
    const near = deck('near', 1);
    const far = deck('far', 30);
    const cards = [card('near-card', near.id), card('far-card', far.id)];

    const next = selectNext(cards, makeSessionContext([far, near]), new Map(), NOW);

    expect(next?.id).toBe('near-card');
  });

  it('keeps all-equal-score decks in a stable, NaN-free ordering', () => {
    const a = deck('a', 10);
    const b = deck('b', 2);
    const cards = [card('a1', a.id), card('a2', a.id), card('b1', b.id), card('b2', b.id)];

    const next = selectNext(cards, makeSessionContext([a, b]), new Map(), NOW);

    expect(next).not.toBeNull();
    expect(next?.deckId).toBe('b');
  });
});

describe('cram sessions', () => {
  it('bypasses the new-card cap while excluding suspended and buried cards', () => {
    const capped = { ...deck('capped', 1), newCardsPerDay: 1 };
    const cards = [
      card('first', capped.id, { createdAt: 1 }),
      card('second', capped.id, { createdAt: 2 }),
      card('suspended', capped.id, { suspended: true }),
      card('buried', capped.id, { buriedUntil: NOW + MS_PER_DAY }),
    ];

    const objectivePool = sessionServePool(cards, makeSessionContext([capped]), NOW);
    const cramPool = sessionServePool(cards, makeSessionContext([capped], 'cram'), NOW);

    expect(objectivePool.map((entry) => entry.id)).toEqual(['first']);
    expect(cramPool.map((entry) => entry.id)).toEqual(['first', 'second']);
  });

  it('does not complete after reviewing the first of two new cards when the cap is one', () => {
    const capped = {
      ...deck('capped', 1),
      examObjective: 'securedTopics' as const,
      newCardsPerDay: 1,
    };
    const initialCards = [
      card('first', capped.id, { createdAt: 1 }),
      card('second', capped.id, { createdAt: 2 }),
    ];
    const afterFirstReview = [
      {
        ...initialCards[0],
        state: 2 as const,
        stability: 100,
        difficulty: 5,
        lastReviewed: NOW,
        reps: 1,
        history: [
          {
            timestamp: NOW,
            grade: 3 as const,
            responseTimeSec: 2,
            distracted: false,
            stabilityBefore: null,
            stabilityAfter: 100,
            difficultyBefore: null,
            difficultyAfter: 5,
            retrievabilityAtReview: null,
          },
        ],
      },
      initialCards[1],
    ];
    const objectiveCtx = makeSessionContext([capped]);
    const cramCtx = makeSessionContext([capped], 'cram');

    expect(sessionServePool(initialCards, cramCtx, NOW)).toHaveLength(2);
    expect(sessionServePool(afterFirstReview, objectiveCtx, NOW).map((entry) => entry.id)).toEqual([
      'first',
    ]);
    expect(sessionComplete(afterFirstReview, cramCtx, NOW)).toBe(false);
  });

  it('excludes every card belonging to an archived unit', () => {
    const active = deck('active', 1);
    const archived = { ...deck('archived', 1), archived: true };
    const cards = [card('active-card', active.id), card('archived-card', archived.id)];

    const pool = sessionServePool(cards, makeSessionContext([archived, active], 'cram'), NOW);

    expect(pool.map((entry) => entry.id)).toEqual(['active-card']);
  });

  it('orders the weakest card first across units', () => {
    const first = deck('first', 1);
    const second = deck('second', 1);
    const strong = card('strong', first.id, {
      stability: 100,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });
    const weak = card('weak', second.id, {
      stability: 0.5,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });

    expect(
      selectNext([strong, weak], makeSessionContext([first, second], 'cram'), new Map(), NOW)?.id,
    ).toBe(weak.id);
  });

  it('skips the weakest card while it is cooling', () => {
    const d = deck('deck', 1);
    const weak = card('weak', d.id, {
      stability: 0.5,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });
    const strong = card('strong', d.id, {
      stability: 100,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });

    const next = selectNext(
      [weak, strong],
      makeSessionContext([d], 'cram'),
      new Map([[weak.id, 2]]),
      NOW,
    );

    expect(next?.id).toBe(strong.id);
  });

  it('uses the shortest cooldown when every card is cooling', () => {
    const d = deck('deck', 1);
    const cards = [card('one', d.id), card('two', d.id), card('three', d.id)];

    const next = selectNext(
      cards,
      makeSessionContext([d], 'cram'),
      new Map([
        ['one', 3],
        ['two', 1],
        ['three', 2],
      ]),
      NOW,
    );

    expect(next?.id).toBe('two');
  });

  it('breaks equal cooldowns by weakest-card priority', () => {
    const d = deck('deck', 1);
    const weak = card('weak', d.id, {
      stability: 0.5,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });
    const strong = card('strong', d.id, {
      stability: 100,
      difficulty: 5,
      lastReviewed: NOW,
      reps: 1,
      state: 2,
    });

    const next = selectNext(
      [strong, weak],
      makeSessionContext([d], 'cram'),
      new Map([
        [strong.id, 2],
        [weak.id, 2],
      ]),
      NOW,
    );

    expect(next?.id).toBe(weak.id);
  });

  it('returns an empty pool and no selection for empty or archived contexts', () => {
    const d = { ...deck('archived', 1), archived: true };
    const archivedContext = makeSessionContext([d], 'cram');
    const emptyContext = makeSessionContext([], 'cram');
    const cards = [card('card', d.id)];

    expect(sessionServePool(cards, archivedContext, NOW)).toEqual([]);
    expect(selectNext(cards, archivedContext, new Map(), NOW)).toBeNull();
    expect(sessionServePool(cards, emptyContext, NOW)).toEqual([]);
    expect(selectNext(cards, emptyContext, new Map(), NOW)).toBeNull();
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
            isExtension: false,
            examDate: NOW + 30 * MS_PER_DAY,
          },
        ],
      ]),
      courseExamDates: [],
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
