import { describe, expect, it } from 'vitest';
import type { Card, Deck } from '../db/types';
import { defaultFsrsParameters } from './params';
import { makeSessionContext, selectNext } from './session';

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

function card(id: string, deckId: string): Card {
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
