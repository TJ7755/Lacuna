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

vi.mock('./fsrs', () => ({
  getRetrievability: (state: FsrsState, atDate: Date) =>
    mocks.getRetrievability(state, atDate),
}));

import { buildExamModeSession } from './exam-mode';

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
  });

  it('sorts cards by ascending retrievability with never-reviewed cards first', async () => {
    const deckId = 'deck-rank';
    const examDate = new Date('2026-03-20T00:00:00.000Z');

    const cardA = makeCard({ id: 'a', deck_id: deckId });
    const cardB = makeCard({ id: 'b', deck_id: deckId });
    const cardC = makeCard({ id: 'c', deck_id: deckId });

    mocks.cardsByDeck.set(deckId, [cardA, cardB, cardC]);

    const stateA = makeState({
      id: 'sa',
      card_id: 'a',
      last_review: new Date('2026-03-12T00:00:00.000Z'),
    });
    const stateB = makeState({ id: 'sb', card_id: 'b', last_review: null });
    const stateC = makeState({
      id: 'sc',
      card_id: 'c',
      last_review: new Date('2026-03-11T00:00:00.000Z'),
    });

    mocks.statesByCardId.set('a', stateA);
    mocks.statesByCardId.set('b', stateB);
    mocks.statesByCardId.set('c', stateC);

    mocks.getRetrievability.mockImplementation((state) => {
      if (state.card_id === 'b') return 0;
      if (state.card_id === 'c') return 0.2;
      if (state.card_id === 'a') return 0.6;
      return 1;
    });

    const session = await buildExamModeSession(deckId, examDate, 50);

    expect(session.cards).toHaveLength(3);
    expect(session.cards.map((entry) => entry.cardWithState.card.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(session.cards.map((entry) => entry.priority)).toEqual([1, 2, 3]);
    expect(session.cards.map((entry) => entry.retrievabilityAtExam)).toEqual([
      0, 0.2, 0.6,
    ]);
  });

  it('uses dailyReviewCapacity when exam is today', async () => {
    const deckId = 'deck-today';
    const examDate = new Date('2026-03-15T23:59:00.000Z');

    const cards = Array.from({ length: 12 }, (_v, i) =>
      makeCard({ id: `t-${i + 1}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);

    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    mocks.getRetrievability.mockReturnValue(0.5);

    const session = await buildExamModeSession(deckId, examDate, 7);

    expect(session.estimatedReviewable).toBe(7);
  });

  it('uses dailyReviewCapacity when exam date is in the past', async () => {
    const deckId = 'deck-past';
    const examDate = new Date('2026-03-14T00:00:00.000Z');

    const cards = Array.from({ length: 5 }, (_v, i) =>
      makeCard({ id: `p-${i + 1}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);

    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    mocks.getRetrievability.mockReturnValue(0.4);

    const session = await buildExamModeSession(deckId, examDate, 9);

    expect(session.estimatedReviewable).toBe(9);
  });

  it('caps estimatedReviewable at total cards for future exam dates', async () => {
    const deckId = 'deck-future';
    const examDate = new Date('2026-03-18T00:00:00.000Z'); // 3 days away

    const cards = Array.from({ length: 10 }, (_v, i) =>
      makeCard({ id: `f-${i + 1}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);

    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    mocks.getRetrievability.mockReturnValue(0.7);

    const session = await buildExamModeSession(deckId, examDate, 50);

    expect(session.estimatedReviewable).toBe(10);
  });

  it('computes future capacity as days * dailyReviewCapacity when below total', async () => {
    const deckId = 'deck-future-cap';
    const examDate = new Date('2026-03-17T12:00:00.000Z'); // ceil to 3 days

    const cards = Array.from({ length: 25 }, (_v, i) =>
      makeCard({ id: `fc-${i + 1}`, deck_id: deckId }),
    );
    mocks.cardsByDeck.set(deckId, cards);

    for (const card of cards) {
      mocks.statesByCardId.set(
        card.id,
        makeState({ id: `s-${card.id}`, card_id: card.id }),
      );
    }

    mocks.getRetrievability.mockReturnValue(0.3);

    const session = await buildExamModeSession(deckId, examDate, 4);

    expect(session.estimatedReviewable).toBe(12);
  });
});
