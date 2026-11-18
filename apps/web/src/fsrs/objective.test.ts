import { describe, it, expect } from 'vitest';
import {
  progressValue,
  scoreCard,
  makeObjectiveContext,
  isObjectiveComplete,
} from '@lacuna/core/fsrs/objective';
import { modelOf } from '@lacuna/core/fsrs/fsrs';
import { defaultFsrsParameters, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { Card, LegacyDeckRecord, ExamObjective } from '@lacuna/core/db/types';

const NOW = Date.UTC(2026, 6, 1, 12);
const model = modelOf(defaultFsrsParameters());
const initialMemory = model.step({ memoryState: null, rating: 3, elapsedDays: 0 });

function makeDeck(objective: ExamObjective): LegacyDeckRecord {
  return {
    id: 'd1',
    name: 'LegacyDeckRecord',
    examDate: NOW + 7 * MS_PER_DAY,
    createdAt: 0,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: objective,
  };
}

function reviewedCard(id: string, reviewGapDays: number, overrides: Partial<Card> = {}): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
    ...(reviewGapDays === 0
      ? initialMemory
      : model.step({
          memoryState: initialMemory,
          rating: 3,
          elapsedDays: reviewGapDays,
        })),
    lastReviewed: NOW,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function newCard(id: string): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
    stability: null,
    stabilityFast: null,
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
    updatedAt: 0,
  };
}

// States after an initial Good answer, then (where non-zero) another Good
// answer after the named gap. Two are above 90% at seven days; two are below.
const cards: Card[] = [
  reviewedCard('a', 0),
  reviewedCard('b', 1),
  reviewedCard('c', 10),
  newCard('d'),
];

describe('objective consistency: the bar matches the objective', () => {
  it('expectedMarks: progress equals the mean predicted exam-day R across the deck', () => {
    const deck = makeDeck('expectedMarks');
    // Upstream FSRS-7 reference recalls at seven days for the above histories.
    const expectedMean = (0.8854090932694928 + 0.9358705501763661 + 0.9544275889980759) / 4;
    expect(progressValue(cards, deck, NOW)).toBeCloseTo(expectedMean, 12);
  });

  it('securedTopics: progress equals the fraction of cards at or above 0.90', () => {
    const deck = makeDeck('securedTopics');
    expect(progressValue(cards, deck, NOW)).toBe(2 / 4);
  });

  it('the two objectives generally disagree, which is exactly why they must be pinned together', () => {
    const meanR = progressValue(cards, makeDeck('expectedMarks'), NOW);
    const secured = progressValue(cards, makeDeck('securedTopics'), NOW);
    expect(meanR).not.toBeCloseTo(secured!, 2);
  });

  it("uses each card's resolved exam horizon when course context is provided", () => {
    const deck = makeDeck('expectedMarks');
    const nearDate = NOW + 2 * MS_PER_DAY;
    const farDate = NOW + 30 * MS_PER_DAY;
    const near = reviewedCard('near', 1, { primaryLessonId: 'nearLesson' });
    const far = reviewedCard('far', 1, { primaryLessonId: 'farLesson' });
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
            updatedAt: 0,
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
            updatedAt: 0,
            isExtension: false,
            examDate: farDate,
          },
        ],
      ]),
      courseAssessments: [],
    };
    // Upstream reference recalls for a second Good answer after a one-day gap.
    const expected = (0.9630101239001205 + 0.875106246808392) / 2;

    expect(progressValue([near, far], deck, NOW, examDateContext)).toBeCloseTo(expected, 12);
  });
});

describe('scheduler scoring follows the objective', () => {
  it('securedTopics ranks an already-secured card lowest and a securable card highest', () => {
    // Cards last reviewed 20 days ago (so they have decayed), exam 3 days out.
    const now = NOW + 20 * MS_PER_DAY;
    const deck: LegacyDeckRecord = { ...makeDeck('securedTopics'), examDate: now + 3 * MS_PER_DAY };
    const oc = makeObjectiveContext(deck);

    const alreadySecured = reviewedCard('hi', 100); // spaced success: still above 0.90 on exam day
    const securable = reviewedCard('lo', 0); // one answer: a spaced review can secure it

    const secScore = scoreCard(alreadySecured, oc, now);
    const lowScore = scoreCard(securable, oc, now);

    // Already-secured cards score -1 (nothing to gain); securable cards score > 1.
    expect(secScore).toBe(-1);
    expect(lowScore).toBeGreaterThan(1);
  });

  it('uses resolved card horizons to determine securedTopics completion', () => {
    const deck = makeDeck('securedTopics');
    const card = reviewedCard('card', 1, { primaryLessonId: 'lesson1' });
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
            updatedAt: 0,
            isExtension: false,
            examDate: NOW + 30 * MS_PER_DAY,
          },
        ],
      ]),
      courseAssessments: [],
    };

    expect(isObjectiveComplete([card], makeObjectiveContext(deck), NOW)).toBe(true);
    expect(isObjectiveComplete([card], makeObjectiveContext(deck, examDateContext), NOW)).toBe(
      false,
    );
  });
});
