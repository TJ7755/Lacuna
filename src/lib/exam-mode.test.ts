import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../db/repositories/cards';
import type { FsrsState } from '../db/repositories/fsrs';

const mocks = vi.hoisted(() => {
  const now = new Date('2026-03-15T10:00:00.000Z');

  const cardsByDeck = new Map<string, Card[]>();
  const statesByCardId = new Map<string, FsrsState | null>();

  return {
    now,
    cardsByDeck,
    statesByCardId,
    getRetrievability: vi.fn<(state: FsrsState, atDate: Date) => number>(),
    applyRating: vi.fn<(state: FsrsState, rating: string) => FsrsState>(),
  };
});

vi.mock('../db/repositories/cards', () => ({
  getCardsByDeckRecursive: vi.fn(async (deckId: string) => {
    return mocks.cardsByDeck.get(deckId) ?? [];
  }),
}));

vi.mock('../db/repositories/fsrs', () => ({
  getCardState: vi.fn(async (cardId: string) => {
    return mocks.statesByCardId.get(cardId) ?? null;
  }),
}));

vi.mock('../db/repositories/sequenceCards', () => ({
  getSequenceCardsWithState: vi.fn(async () => []),
}));

vi.mock('./fsrs', () => ({
  getRetrievability: (state: FsrsState, atDate: Date) =>
    mocks.getRetrievability(state, atDate),
  applyRating: (state: FsrsState, rating: string) =>
    mocks.applyRating(state, rating),
}));

import { buildExamModeSession } from './exam-mode';

function queueItemId(cardWithState: { queueType: string }): string {
  const queue = cardWithState as
    | { queueType: 'card'; card: { id: string } }
    | { queueType: 'sequence_chain'; itemId: string };
  return queue.queueType === 'card' ? queue.card.id : queue.itemId;
}

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-1',
    deck_id: 'deck-1',
    card_type: 'basic',
    front: 'Front',
    back: 'Back',
    cloze_text: null,
    image_url: null,
    occlusion_data: null,
    created_at: new Date('2026-03-01T00:00:00.000Z'),
    updated_at: new Date('2026-03-01T00:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<FsrsState>): FsrsState {
  return {
    id: 'state-1',
    card_id: 'card-1',
    stability: 3,
    difficulty: 5,
    due: new Date('2026-03-01T00:00:00.000Z'),
    last_review: new Date('2026-03-10T00:00:00.000Z'),
    rating_history: [],
    created_at: new Date('2026-03-01T00:00:00.000Z'),
    updated_at: new Date('2026-03-01T00:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

describe('buildExamModeSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mocks.now);
    mocks.cardsByDeck.clear();
    mocks.statesByCardId.clear();
    mocks.getRetrievability.mockReset();
    mocks.applyRating.mockImplementation((state) => state);
  });

  it('examReadiness is 0 when all cards have never been reviewed', async () => {
    const deckId = 'deck-never-reviewed';
    const examDate = new Date('2026-03-25T00:00:00.000Z');

    const cards = [
      makeCard({ id: 'a', deck_id: deckId }),
      makeCard({ id: 'b', deck_id: deckId }),
    ];
    mocks.cardsByDeck.set(deckId, cards);
    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    // never reviewed → retrievability = 0
    mocks.getRetrievability.mockReturnValue(0);

    const session = await buildExamModeSession(deckId, examDate);

    expect(session.examReadiness).toBe(0);
  });

  it('examReadiness is 1 when all cards have retrievability >= target at exam date', async () => {
    const deckId = 'deck-all-ready';
    const examDate = new Date('2026-03-25T00:00:00.000Z');

    const cards = [
      makeCard({ id: 'a', deck_id: deckId }),
      makeCard({ id: 'b', deck_id: deckId }),
    ];
    mocks.cardsByDeck.set(deckId, cards);
    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    // all above default target 0.90
    mocks.getRetrievability.mockReturnValue(0.95);

    const session = await buildExamModeSession(deckId, examDate);

    expect(session.examReadiness).toBe(1);
  });

  it('marginalImprovement is positive for never-reviewed cards', async () => {
    const deckId = 'deck-new-cards';
    const examDate = new Date('2026-03-25T00:00:00.000Z');

    const card = makeCard({ id: 'new', deck_id: deckId });
    mocks.cardsByDeck.set(deckId, [card]);
    mocks.statesByCardId.set('new', makeState({ id: 'sn', card_id: 'new' }));

    // Before review: 0 (never reviewed). After review (via applyRating stub): 0.6.
    mocks.getRetrievability
      .mockReturnValueOnce(0) // retrievabilityAtExam
      .mockReturnValueOnce(0.6); // retrievabilityAfterReview

    const session = await buildExamModeSession(deckId, examDate);

    expect(session.cards[0].marginalImprovement).toBeGreaterThan(0);
  });

  it('marginalImprovement is near 0 for a card reviewed today with stability > 1 year', async () => {
    const deckId = 'deck-stable';
    const examDate = new Date('2026-03-25T00:00:00.000Z');

    const card = makeCard({ id: 'stable', deck_id: deckId });
    mocks.cardsByDeck.set(deckId, [card]);
    mocks.statesByCardId.set(
      'stable',
      makeState({ id: 'ss', card_id: 'stable', stability: 400 }),
    );

    // Both before and after review are nearly identical (high stability card).
    mocks.getRetrievability
      .mockReturnValueOnce(0.98) // retrievabilityAtExam
      .mockReturnValueOnce(0.99); // retrievabilityAfterReview

    const session = await buildExamModeSession(deckId, examDate);

    expect(session.cards[0].marginalImprovement).toBeCloseTo(0.01, 2);
  });

  it('todayQueue does not exceed dailyBudgetMinutes (1.5 min per card)', async () => {
    const deckId = 'deck-budget';
    const examDate = new Date('2026-03-25T00:00:00.000Z');

    // 20 cards all below target with good marginal improvement
    const cards = Array.from({ length: 20 }, (_v, i) =>
      makeCard({ id: `b-${i}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);
    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    // Below target before, above target after: alternate 0.5 / 0.95 per call pair
    let callCount = 0;
    mocks.getRetrievability.mockImplementation(() => {
      callCount++;
      return callCount % 2 === 1 ? 0.5 : 0.95;
    });

    const budget = 10; // 10 minutes → max 6 cards at 1.5 min each
    const session = await buildExamModeSession(deckId, examDate, {
      dailyBudgetMinutes: budget,
    });

    const totalMinutes = session.todayQueue.length * 1.5;
    expect(totalMinutes).toBeLessThanOrEqual(budget);
  });

  it('todayQueue excludes cards already above target retention', async () => {
    const deckId = 'deck-exclude-ready';
    const examDate = new Date('2026-03-25T00:00:00.000Z');

    const cardAbove = makeCard({ id: 'above', deck_id: deckId });
    const cardBelow = makeCard({ id: 'below', deck_id: deckId });
    mocks.cardsByDeck.set(deckId, [cardAbove, cardBelow]);
    mocks.statesByCardId.set(
      'above',
      makeState({ id: 'sa', card_id: 'above' }),
    );
    mocks.statesByCardId.set(
      'below',
      makeState({ id: 'sb', card_id: 'below' }),
    );

    mocks.getRetrievability.mockImplementation((state) => {
      if (state.card_id === 'above') return 0.95; // above target
      if (state.card_id === 'below') return 0.3; // below target (both calls)
      return 0.3;
    });
    // afterReview for below: 0.85 (still meaningful improvement)
    const callMap: Record<string, number> = {};
    mocks.getRetrievability.mockImplementation((state) => {
      const key = state.card_id;
      callMap[key] = (callMap[key] ?? 0) + 1;
      if (key === 'above') return 0.95;
      // below: first call = atExam=0.3, second call = afterReview=0.85
      return callMap[key] === 1 ? 0.3 : 0.85;
    });

    const session = await buildExamModeSession(deckId, examDate);

    const queueIds = session.todayQueue.map((c) =>
      queueItemId(c.cardWithState),
    );
    expect(queueIds).not.toContain('above');
    expect(queueIds).toContain('below');
  });

  it('dailyBudgetMinutes is higher when fewer days remain', async () => {
    const deckId = 'deck-urgency';

    // 20 cards below target
    const cards = Array.from({ length: 20 }, (_v, i) =>
      makeCard({ id: `u-${i}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);
    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }
    mocks.getRetrievability.mockReturnValue(0.3);

    // Far exam: 20 days away
    const farExam = new Date('2026-04-04T00:00:00.000Z');
    const sessionFar = await buildExamModeSession(deckId, farExam);

    // Near exam: 2 days away
    const nearExam = new Date('2026-03-17T00:00:00.000Z');
    const sessionNear = await buildExamModeSession(deckId, nearExam);

    expect(sessionNear.dailyBudgetMinutes).toBeGreaterThan(
      sessionFar.dailyBudgetMinutes,
    );
  });

  it('computed budget includes 15% conservative multiplier over raw minimum', async () => {
    const deckId = 'deck-multiplier';
    const examDate = new Date('2026-03-17T00:00:00.000Z'); // 2 days away (ceil from now)

    // 10 cards all below target
    const cards = Array.from({ length: 10 }, (_v, i) =>
      makeCard({ id: `m-${i}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);
    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }
    mocks.getRetrievability.mockReturnValue(0.3);

    const session = await buildExamModeSession(deckId, examDate);

    // daysRemaining = ceil((2026-03-17 - 2026-03-15T10:00) / 86400000) = 2
    // rawBudget = ceil((10 * 1.5) / 2) = ceil(7.5) = 8
    // withMultiplier = ceil(8 * 1.15) = ceil(9.2) = 10
    const daysRemaining = session.daysRemaining;
    const rawMinimum = Math.ceil((10 * 1.5) / Math.max(1, daysRemaining));
    const expectedBudget = Math.min(
      120,
      Math.max(5, Math.ceil(rawMinimum * 1.15)),
    );
    expect(session.dailyBudgetMinutes).toBe(expectedBudget);
  });

  it('sorts all cards descending by marginalImprovement', async () => {
    const deckId = 'deck-sort';
    const examDate = new Date('2026-03-20T00:00:00.000Z');

    const cardA = makeCard({ id: 'a', deck_id: deckId });
    const cardB = makeCard({ id: 'b', deck_id: deckId });
    const cardC = makeCard({ id: 'c', deck_id: deckId });

    mocks.cardsByDeck.set(deckId, [cardA, cardB, cardC]);
    mocks.statesByCardId.set('a', makeState({ id: 'sa', card_id: 'a' }));
    mocks.statesByCardId.set('b', makeState({ id: 'sb', card_id: 'b' }));
    mocks.statesByCardId.set('c', makeState({ id: 'sc', card_id: 'c' }));

    // Call sequence per card: atExam, afterReview, atExam, afterReview, atExam, afterReview
    // Card A: atExam=0.6, afterReview=0.8 → improvement=0.2
    // Card B: atExam=0.0, afterReview=0.7 → improvement=0.7
    // Card C: atExam=0.3, afterReview=0.6 → improvement=0.3
    const callCounts: Record<string, number> = {};
    mocks.getRetrievability.mockImplementation((state) => {
      const id = state.card_id;
      callCounts[id] = (callCounts[id] ?? 0) + 1;
      const isAfterReview = callCounts[id] % 2 === 0;
      if (id === 'a') return isAfterReview ? 0.8 : 0.6;
      if (id === 'b') return isAfterReview ? 0.7 : 0.0;
      if (id === 'c') return isAfterReview ? 0.6 : 0.3;
      return 0;
    });

    const session = await buildExamModeSession(deckId, examDate);

    // Sorted descending by marginalImprovement: B(0.7) > C(0.3) > A(0.2)
    expect(session.cards.map((c) => queueItemId(c.cardWithState))).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(session.cards.map((c) => c.priority)).toEqual([1, 2, 3]);
  });
});
