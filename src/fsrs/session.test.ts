import { describe, expect, it } from 'vitest';
import type { Card, Deck, SchedulerConfig } from '../db/types';
import { defaultFsrsParameters } from './params';
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

describe('course/lesson-scoped sessions', () => {
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
      scope: { kind: 'lesson', courseId: 'course-1', lessonId: 'lesson-a', linkedCardIds: new Set() },
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
      scope: { kind: 'lesson', courseId: 'course-1', lessonId: 'lesson-a', linkedCardIds: new Set() },
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
