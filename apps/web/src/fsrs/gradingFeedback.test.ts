import { describe, expect, it } from 'vitest';
import { reviewFeedbackMessage, reviewRetentionMessage } from './gradingFeedback';
import { predictedRetrievabilityAtHorizon } from './progress';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { ExamDateContext } from './examDate';
import type { Card, LegacyDeckRecord } from '../db/types';

const NOW = Date.parse('2026-08-31T10:00:00Z');

function makeDeck(overrides: Partial<LegacyDeckRecord> = {}): LegacyDeckRecord {
  return {
    id: 'd1',
    name: 'LegacyDeckRecord',
    examDate: NOW + 30 * MS_PER_DAY,
    createdAt: NOW,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    conceptId: 'concept-c1',
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: 'q',
    back: 'a',
    stability: 10,
    difficulty: 5,
    lastReviewed: NOW,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW + MS_PER_DAY,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: NOW,
    updatedAt: 1,
    ...overrides,
  };
}

function makeContext(overrides: Partial<ExamDateContext> = {}): ExamDateContext {
  return { lessonsById: new Map(), courseAssessments: [], ...overrides };
}

describe('reviewFeedbackMessage', () => {
  it.each([
    [1, NOW + 60_000, 'Again · retry in 1 minute'],
    [2, NOW + 4 * 60 * 60_000, 'Hard · again in 4 hours'],
    [3, NOW + 4 * 24 * 60 * 60_000, 'Good · again in 4 days'],
    [4, NOW + 60 * 24 * 60 * 60_000, 'Easy · again in 2 months'],
  ] as const)('describes grade %s and its next interval', (grade, due, expected) => {
    expect(reviewFeedbackMessage(grade, due, NOW)).toBe(expected);
  });
});

describe('reviewRetentionMessage', () => {
  it('projects post-review retention at a future deck exam', () => {
    const card = makeCard();
    const deck = makeDeck();
    const expected = Math.round(predictedRetrievabilityAtHorizon(card, deck, NOW) * 100);
    expect(reviewRetentionMessage(3, card, deck, undefined, NOW)).toBe(
      `Good · ${expected}% recall at exam`,
    );
  });

  it('resolves a genuine future course exam date from context', () => {
    const card = makeCard();
    const deck = makeDeck({ examDate: undefined });
    const context = makeContext({ courseExamDate: NOW + 30 * MS_PER_DAY });
    const message = reviewRetentionMessage(3, card, deck, context, NOW);
    expect(message).toMatch(/^Good · \d+% recall at exam$/);
  });

  it('returns null without any exam date', () => {
    expect(
      reviewRetentionMessage(3, makeCard(), makeDeck({ examDate: undefined }), undefined, NOW),
    ).toBeNull();
  });

  it('returns null once the exam has passed', () => {
    const deck = makeDeck({ examDate: NOW - MS_PER_DAY });
    expect(reviewRetentionMessage(3, makeCard(), deck, undefined, NOW)).toBeNull();
  });

  it('returns null when the context resolves only a past date', () => {
    const deck = makeDeck({ examDate: undefined });
    const context = makeContext({ courseExamDate: NOW - MS_PER_DAY });
    expect(reviewRetentionMessage(3, makeCard(), deck, context, NOW)).toBeNull();
  });
});
