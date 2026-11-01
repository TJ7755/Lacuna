import { describe, expect, it, vi } from 'vitest';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { makeObjectiveContext, scoreCard } from './objective';
import { makeSessionContext, selectNext } from './session';
import { NOW, deck, card } from './session.testFixtures';

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

  it('keeps the within-deck winner when normalising against another deck', () => {
    const near = deck('near', 2);
    const far = deck('far', 30);
    const reviewed = card('near-reviewed', near.id, {
      stability: 1,
      difficulty: 5,
      lastReviewed: NOW - 10 * MS_PER_DAY,
      reps: 3,
      state: 2,
      due: NOW - 9 * MS_PER_DAY,
    });
    const nearCards = [card('near-new', near.id), reviewed];

    const alone = selectNext(nearCards, makeSessionContext([near]), new Map(), NOW);
    const mixed = selectNext(
      [...nearCards, card('far-card', far.id)],
      makeSessionContext([near, far]),
      new Map(),
      NOW,
    );

    expect(alone).not.toBeNull();
    expect(mixed?.id).toBe(alone?.id);
  });
});

describe('random session tie-breaking', () => {
  it('shuffles only equal scores once, independently of input order and lookahead', () => {
    const unit = deck('biology', 10);
    const cards = ['one', 'two', 'three'].map((id) => card(id, unit.id));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    let ctx: ReturnType<typeof makeSessionContext>;
    try {
      ctx = makeSessionContext([unit], 'objective', cards);
    } finally {
      random.mockRestore();
    }
    expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe('two');
    expect(selectNext([...cards].reverse(), ctx, new Map(), NOW)?.id).toBe('two');
    expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe('two');
    expect(cards.map((c) => c.id)).toEqual(['one', 'two', 'three']);
    const remaining = cards.filter((c) => c.id !== 'two');
    expect(selectNext(remaining, ctx, new Map(), NOW)?.id).toBe('three');
    const nextRandom = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      const nextSession = makeSessionContext([unit], 'objective', cards);
      expect(selectNext(cards, nextSession, new Map(), NOW)?.id).toBe('one');
    } finally {
      nextRandom.mockRestore();
    }
  });

  it('keeps unequal objective scores ahead of the random tie-break', () => {
    const unit = deck('biology', 10);
    const cards = [
      card('new', unit.id),
      card('review', unit.id, {
        stability: 1,
        difficulty: 5,
        lastReviewed: NOW - 10 * MS_PER_DAY,
        reps: 3,
        state: 2,
        due: NOW - 9 * MS_PER_DAY,
      }),
    ];
    const oc = makeObjectiveContext(unit);
    expect(scoreCard(cards[0], oc, NOW)).not.toBe(scoreCard(cards[1], oc, NOW));
    const expected = selectNext(cards, makeSessionContext([unit]), new Map(), NOW);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const ctx = makeSessionContext([unit], 'objective', cards);
      expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe(expected?.id);
    } finally {
      random.mockRestore();
    }
  });

  it('respects new-card admission limits before tie-breaking', () => {
    const unit = { ...deck('biology', 10), newCardsPerDay: 1 };
    const cards = [card('oldest', unit.id), card('newer', unit.id, { createdAt: NOW + 1 })];
    const ctx = makeSessionContext([unit], 'objective', cards);
    expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe('oldest');
  });
});

it.each(['objective', 'due', 'cram'] as const)(
  'keeps cooldowns ahead of equal-score tie-breaks in %s mode',
  (mode) => {
    const unit = deck('biology', 10);
    const cards = ['one', 'two', 'three'].map((id) =>
      card(id, unit.id, {
        state: 2,
        reps: 1,
        due: NOW - 1,
        stability: 1,
        lastReviewed: NOW - MS_PER_DAY,
      }),
    );
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const ctx = makeSessionContext([unit], mode, cards);
      expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe('two');
      expect(selectNext(cards, ctx, new Map([['two', 1]]), NOW)?.id).toBe('three');
      expect(
        selectNext(
          cards,
          ctx,
          new Map([
            ['one', 1],
            ['two', 2],
            ['three', 3],
          ]),
          NOW,
        )?.id,
      ).toBe('one');
    } finally {
      random.mockRestore();
    }
  },
);

it('breaks normalised multi-unit ties randomly without changing exam urgency', () => {
  const near = deck('near', 2);
  const far = deck('far', 30);
  const cards = [card('near-one', near.id), card('near-two', near.id), card('far', far.id)];
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  try {
    const ctx = makeSessionContext([near, far], 'objective', cards);
    expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe('near-two');
    expect(
      selectNext(
        cards.filter((c) => c.id !== 'near-two'),
        ctx,
        new Map(),
        NOW,
      )?.id,
    ).toBe('near-one');
  } finally {
    random.mockRestore();
  }
});

describe('assessment urgency', () => {
  it('prioritises the applicable card assessment over the unit default', () => {
    const near = deck('near', 1);
    const far = deck('far', 30);
    const cards = [card('near-card', near.id), card('paper-card', far.id)];
    const ctx = makeSessionContext([
      near,
      {
        config: far,
        scope: { kind: 'scheduling-unit', schedulingUnitId: far.id },
        examDateContext: {
          lessonsById: new Map(),
          courseAssessments: [],
          courseExamDate: NOW + MS_PER_DAY / 2,
        },
      },
    ]);
    expect(selectNext(cards, ctx, new Map(), NOW)?.id).toBe('paper-card');
  });
});
