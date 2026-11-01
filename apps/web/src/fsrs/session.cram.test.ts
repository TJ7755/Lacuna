import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from './params';
import { makeSessionContext, selectNext, sessionComplete, sessionServePool } from './session';
import { NOW, deck, card } from './session.testFixtures';

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
