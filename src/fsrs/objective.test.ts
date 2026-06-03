import { describe, it, expect } from 'vitest';
import {
  progressValue,
  scoreCard,
  makeObjectiveContext,
} from './objective';
import { forgettingCurve } from './forwardSim';
import { defaultFsrsParameters, MASTERY_R, MS_PER_DAY } from './params';
import type { Card, Deck, ExamObjective } from '../db/types';

const DECAY = -defaultFsrsParameters().w[20];

function makeDeck(objective: ExamObjective): Deck {
  return {
    id: 'd1',
    name: 'Deck',
    examDate: 7 * MS_PER_DAY,
    createdAt: 0,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: objective,
  };
}

function reviewedCard(id: string, stability: number): Card {
  return {
    id,
    deckId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
    stability,
    difficulty: 5,
    lastReviewed: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    due: 0,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
  };
}

function newCard(id: string): Card {
  return {
    id,
    deckId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
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
    createdAt: 0,
  };
}

// A deck with a deliberate mix: two cards predicted >= 0.90 on exam day, two below.
const cards: Card[] = [
  reviewedCard('a', 3), // ~0.83  -> below
  reviewedCard('b', 10), // ~0.92 -> at/above
  reviewedCard('c', 100), // ~0.99 -> above
  newCard('d'), // 0 -> below
];

describe('objective consistency: the bar matches the objective', () => {
  it('expectedMarks: progress equals the mean predicted exam-day R across the deck', () => {
    const deck = makeDeck('expectedMarks');
    const examDays = deck.examDate / MS_PER_DAY;
    // Independent computation of the mean predicted retrievability.
    const expectedMean =
      (forgettingCurve(examDays, 3, DECAY) +
        forgettingCurve(examDays, 10, DECAY) +
        forgettingCurve(examDays, 100, DECAY) +
        0) /
      4;
    expect(progressValue(cards, deck)).toBeCloseTo(expectedMean, 12);
  });

  it('securedTopics: progress equals the fraction of cards at or above 0.90', () => {
    const deck = makeDeck('securedTopics');
    const examDays = deck.examDate / MS_PER_DAY;
    const rValues = [
      forgettingCurve(examDays, 3, DECAY),
      forgettingCurve(examDays, 10, DECAY),
      forgettingCurve(examDays, 100, DECAY),
      0,
    ];
    const fraction =
      rValues.filter((r) => r >= MASTERY_R).length / rValues.length;
    expect(progressValue(cards, deck)).toBeCloseTo(fraction, 12);
  });

  it('the two objectives generally disagree, which is exactly why they must be pinned together', () => {
    const meanR = progressValue(cards, makeDeck('expectedMarks'));
    const secured = progressValue(cards, makeDeck('securedTopics'));
    expect(meanR).not.toBeCloseTo(secured, 2);
  });
});

describe('scheduler scoring follows the objective', () => {
  it('securedTopics ranks an already-secured card lowest and a securable card highest', () => {
    // Cards last reviewed 20 days ago (so they have decayed), exam 3 days out.
    const now = 20 * MS_PER_DAY;
    const deck: Deck = { ...makeDeck('securedTopics'), examDate: now + 3 * MS_PER_DAY };
    const oc = makeObjectiveContext(deck);

    const alreadySecured = reviewedCard('hi', 100); // still ~0.97 on exam day
    const securable = reviewedCard('lo', 10); // ~0.83 now, but a review pushes it over 0.90

    const secScore = scoreCard(alreadySecured, oc, now);
    const lowScore = scoreCard(securable, oc, now);

    // Already-secured cards score -1 (nothing to gain); securable cards score > 1.
    expect(secScore).toBe(-1);
    expect(lowScore).toBeGreaterThan(1);
  });
});
