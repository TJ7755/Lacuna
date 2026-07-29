import { describe, it, expect } from 'vitest';
import {
  progressValue,
  scoreCard,
  makeObjectiveContext,
  isObjectiveComplete,
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

function reviewedCard(id: string, stability: number, overrides: Partial<Card> = {}): Card {
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
    ...overrides,
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
    // now = 0 keeps the epoch-based exam date in the future (the scheduling
    // horizon is time-aware: a past exam falls back to a rolling horizon).
    expect(progressValue(cards, deck, 0)).toBeCloseTo(expectedMean, 12);
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
    expect(progressValue(cards, deck, 0)).toBeCloseTo(fraction, 12);
  });

  it('the two objectives generally disagree, which is exactly why they must be pinned together', () => {
    const meanR = progressValue(cards, makeDeck('expectedMarks'), 0);
    const secured = progressValue(cards, makeDeck('securedTopics'), 0);
    expect(meanR).not.toBeCloseTo(secured, 2);
  });

  it('uses each card\'s resolved exam horizon when course context is provided', () => {
    const deck = makeDeck('expectedMarks');
    const nearDate = 2 * MS_PER_DAY;
    const farDate = 30 * MS_PER_DAY;
    const near = reviewedCard('near', 10, { primaryLessonId: 'nearLesson' });
    const far = reviewedCard('far', 10, { primaryLessonId: 'farLesson' });
    const examDateContext = {
      courseExamDate: deck.examDate,
      lessonsById: new Map([
        [
          'nearLesson',
          {
            id: 'nearLesson',
            courseId: 'course1',
            name: 'Near',
            orderIndex: 0,
            createdAt: 0,
            isExtension: false,
            examDate: nearDate,
          },
        ],
        [
          'farLesson',
          {
            id: 'farLesson',
            courseId: 'course1',
            name: 'Far',
            orderIndex: 1,
            createdAt: 0,
            isExtension: false,
            examDate: farDate,
          },
        ],
      ]),
      courseExamDates: [],
    };
    const expected =
      (forgettingCurve(nearDate / MS_PER_DAY, 10, DECAY) +
        forgettingCurve(farDate / MS_PER_DAY, 10, DECAY)) /
      2;

    expect(progressValue([near, far], deck, 0, examDateContext)).toBeCloseTo(expected, 12);
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

  it('uses resolved card horizons to determine securedTopics completion', () => {
    const deck = makeDeck('securedTopics');
    const card = reviewedCard('card', 10, { primaryLessonId: 'lesson1' });
    const examDateContext = {
      courseExamDate: deck.examDate,
      lessonsById: new Map([
        [
          'lesson1',
          {
            id: 'lesson1',
            courseId: 'course1',
            name: 'Lesson',
            orderIndex: 0,
            createdAt: 0,
            isExtension: false,
            examDate: 30 * MS_PER_DAY,
          },
        ],
      ]),
      courseExamDates: [],
    };

    expect(isObjectiveComplete([card], makeObjectiveContext(deck), 0)).toBe(true);
    expect(
      isObjectiveComplete([card], makeObjectiveContext(deck, examDateContext), 0),
    ).toBe(false);
  });
});
