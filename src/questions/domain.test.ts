import { describe, expect, it } from 'vitest';
import type { Card, ReviewLog } from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import {
  migrateQuestionModeContent,
  validateQuestionConceptSet,
  validateQuestionAttempt,
} from './domain';

type LegacyCard = Omit<Card, 'conceptId' | 'payload'> & {
  conceptId?: string;
  payload?: unknown;
};

function card(
  overrides: Partial<LegacyCard> & Pick<LegacyCard, 'id' | 'front' | 'back'>,
): LegacyCard {
  const { id, front, back, ...rest } = overrides;
  return {
    id,
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    schedulingUnitId: 'unit-1',
    type: 'front_back',
    front,
    back,
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
    createdAt: 100,
    updatedAt: 100,
    ...rest,
  };
}

function review(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    eventId: 'review-1',
    sessionId: 'session-1',
    sessionKind: 'lesson',
    timestamp: 200,
    grade: 3,
    correct: true,
    responseTimeSec: 7,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
    ...overrides,
  };
}

describe('migrateQuestionModeContent', () => {
  it('assigns deterministic concepts without guessing that unlinked mirror cards are a pair', () => {
    const explicitPair = [
      card({
        id: 'pair-a',
        front: 'Capital of France',
        back: 'Paris',
        type: 'basic_reversed',
        reverseCardId: 'pair-b',
      }),
      card({
        id: 'pair-b',
        front: 'Paris',
        back: 'Capital of France',
        type: 'front_back',
        reverseCardId: 'pair-a',
      }),
    ];
    const unlinkedMirrors = [
      card({ id: 'loose-a', front: 'Sodium symbol', back: 'Na' }),
      card({ id: 'loose-b', front: 'Na', back: 'Sodium symbol' }),
    ];
    const sequenceCards = [
      card({ id: 'sequence-a', front: 'Step?', back: 'One', sequenceItemId: 'item-1' }),
      card({
        id: 'sequence-b',
        front: 'Step one label?',
        back: 'One',
        sequenceItemId: 'item-1::label',
      }),
    ];

    const first = migrateQuestionModeContent({
      cards: [...explicitPair, ...unlinkedMirrors, ...sequenceCards],
      reviewHistory: [],
    });
    const second = migrateQuestionModeContent({
      cards: [...explicitPair, ...unlinkedMirrors, ...sequenceCards],
      reviewHistory: [],
    });

    expect(second).toEqual(first);
    const conceptByCard = new Map(first.cards.map((entry) => [entry.id, entry.conceptId]));
    expect(conceptByCard.get('pair-a')).toBe(conceptByCard.get('pair-b'));
    expect(conceptByCard.get('loose-a')).not.toBe(conceptByCard.get('loose-b'));
    expect(conceptByCard.get('sequence-a')).toBe(conceptByCard.get('sequence-b'));
    expect(first.concepts.every((concept) => concept.provisional)).toBe(true);
  });

  it('converts supported structured cards into fixed Questions and labels legacy receipts honestly', () => {
    const structured = card({
      id: 'numeric-card',
      front: 'What is 6 × 7?',
      back: '42, because 6 groups of 7 make 42.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '42' } },
      stability: 4,
      difficulty: 5,
      lastReviewed: 200,
      reps: 1,
      state: 2,
      due: 300,
      scheduledDays: 4,
      history: [review({ marksEarned: 1, marksAvailable: 1 })],
    });

    const result = migrateQuestionModeContent({ cards: [structured] });

    expect(result.cards).toEqual([]);
    expect(result.removedCardIds).toEqual(['numeric-card']);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      kind: 'fixed',
      prompt: 'What is 6 × 7?',
      explanation: '42, because 6 groups of 7 make 42.',
      stability: 4,
      due: 300,
      scheduleEpoch: {
        reason: 'legacy-card-migration',
        baseline: { kind: 'legacy-replayable', sourceCardId: 'numeric-card' },
      },
    });
    expect(result.questionConcepts[0]).toMatchObject({
      questionId: result.questions[0].id,
      targetConceptIds: [result.concepts[0].id],
      prerequisiteConceptIds: [],
    });
    expect(result.attempts[0]).toMatchObject({
      receiptOrigin: 'legacy-reconstructed',
      status: 'answered',
      scheduleEffect: { kind: 'replay', grade: 3 },
      submittedAnswer: undefined,
      renderedPrompt: 'What is 6 × 7?',
      marksEarned: 1,
      marksAvailable: 1,
    });
  });

  it('preserves unsupported structured payloads as legacy Cards', () => {
    const unsupported = card({
      id: 'future-card',
      front: 'Future question',
      back: 'Future answer',
      payload: { v: 99, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
    });

    const result = migrateQuestionModeContent({ cards: [unsupported], reviewHistory: [] });

    expect(result.questions).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].payload).toEqual(unsupported.payload);
    expect(result.cards[0].conceptId).toBeTruthy();
  });

  it('keeps incomplete legacy rows readable instead of aborting the database upgrade', () => {
    const incomplete = {
      ...card({
        id: 'incomplete-legacy-card',
        front: 'discarded',
        back: 'discarded',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
      }),
      front: undefined,
      back: undefined,
      history: undefined,
    } as unknown as LegacyCard;

    const result = migrateQuestionModeContent({ cards: [incomplete] });

    expect(result.questions).toEqual([]);
    expect(result.cards).toEqual([
      expect.objectContaining({ id: incomplete.id, conceptId: expect.any(String) }),
    ]);
    expect(result.concepts).toEqual([
      expect.objectContaining({ name: 'Untitled concept', provisional: true }),
    ]);
  });

  it('keeps Course-less structured Cards readable instead of aborting the upgrade', () => {
    const legacy = card({
      id: 'legacy-numeric',
      courseId: null,
      front: 'Legacy numeric prompt',
      back: '',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
    });

    const result = migrateQuestionModeContent({ cards: [legacy] });

    expect(result.questions).toEqual([]);
    expect(result.cards[0]).toMatchObject({ id: 'legacy-numeric', conceptId: expect.any(String) });
    expect(result.concepts[0]).toMatchObject({ courseId: null, provisional: true });
  });

  it('uses an opaque baseline when canonical history cannot replay the stored schedule', () => {
    const structured = card({
      id: 'incomplete-history',
      front: 'What is 5 + 5?',
      back: '10',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '10' } },
      stability: 8,
      difficulty: 4,
      lastReviewed: 300,
      reps: 2,
      state: 2,
      due: 900,
      scheduledDays: 7,
    });
    const canonical: ReviewHistoryEntry = {
      ...review({ timestamp: 200 }),
      id: 'canonical-review-1',
      cardId: structured.id,
      courseId: structured.courseId,
      primaryLessonId: structured.primaryLessonId,
      schedulingUnitId: structured.schedulingUnitId,
    };

    const result = migrateQuestionModeContent({
      cards: [structured],
      reviewHistory: [canonical],
      lessonCardLinks: [
        { id: 'primary-link', lessonId: 'lesson-1', cardId: structured.id },
        { id: 'additional-link', lessonId: 'lesson-2', cardId: structured.id },
      ],
    });

    expect(result.questions[0]).toMatchObject({
      primaryLessonId: 'lesson-1',
      additionalLessonIds: ['lesson-2'],
      scheduleEpoch: {
        baseline: {
          kind: 'legacy-opaque',
          reason: 'inconsistent-history',
          state: { stability: 8, reps: 2, due: 900 },
        },
      },
    });
    expect(result.attempts[0]).toMatchObject({
      sourceReviewId: 'canonical-review-1',
      scheduleEffect: { kind: 'included-in-opaque-baseline' },
    });
  });

  it('leaves a structured Card intact while unresolved lineage state owns it', () => {
    const structured = card({
      id: 'lineage-card',
      front: 'What is 3 + 4?',
      back: '7',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '7' } },
    });

    const result = migrateQuestionModeContent({
      cards: [structured],
      reviewHistory: [],
      protectedCardIds: new Set([structured.id]),
    });

    expect(result.questions).toEqual([]);
    expect(result.cards).toEqual([
      expect.objectContaining({ id: structured.id, conceptId: expect.any(String) }),
    ]);
  });
});

describe('validateQuestionConceptSet', () => {
  const concepts = [
    { id: 'target', courseId: 'course-1' },
    { id: 'prerequisite', courseId: 'course-1' },
    { id: 'foreign', courseId: 'course-2' },
  ];

  it('accepts one primary target and distinct same-course prerequisites', () => {
    expect(() =>
      validateQuestionConceptSet(
        {
          questionId: 'question-1',
          courseId: 'course-1',
          targetConceptIds: ['target'],
          prerequisiteConceptIds: ['prerequisite'],
          authoringRevisionId: 'revision-1',
          authoringUpdatedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        concepts,
      ),
    ).not.toThrow();
  });

  it.each([
    { targetConceptIds: [], prerequisiteConceptIds: [] },
    { targetConceptIds: ['target', 'prerequisite'], prerequisiteConceptIds: [] },
    { targetConceptIds: ['target'], prerequisiteConceptIds: ['target'] },
    { targetConceptIds: ['target'], prerequisiteConceptIds: ['prerequisite', 'prerequisite'] },
    { targetConceptIds: ['foreign'], prerequisiteConceptIds: [] },
  ])('rejects an invalid concept set %#', (invalid) => {
    expect(() =>
      validateQuestionConceptSet(
        {
          questionId: 'question-1',
          courseId: 'course-1',
          authoringRevisionId: 'revision-1',
          authoringUpdatedAt: 1,
          createdAt: 1,
          updatedAt: 1,
          ...invalid,
        },
        concepts,
      ),
    ).toThrow();
  });
});

describe('validateQuestionAttempt', () => {
  it('rejects a native generated receipt without deterministic generator evidence', () => {
    expect(() =>
      validateQuestionAttempt({
        id: 'attempt-1',
        questionId: 'question-1',
        courseId: 'course-1',
        contentVersion: 1,
        contentRevisionId: 'content-1',
        scheduleEpochId: 'epoch-1',
        purpose: 'post-instruction',
        shownAt: 1,
        updatedAt: 1,
        status: 'shown',
        receiptOrigin: 'native',
        renderedPrompt: 'Solve x² - 1 = 0',
        resolvedPayload: {
          v: 1,
          kind: 'numeric',
          answer: { kind: 'matches-one-of', values: ['-1', '1'] },
        },
        renderedExplanation: '(x - 1)(x + 1) = 0',
        sessionId: 'session-1',
        generatorKey: 'integer-root-quadratic',
        generatorVersion: 1,
        scheduleEffect: { kind: 'none' },
      }),
    ).toThrow(/generator/i);
  });
});
