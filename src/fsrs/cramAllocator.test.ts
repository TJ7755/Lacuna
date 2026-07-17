import { describe, expect, it } from 'vitest';
import type { Card, Deck, Grade, ReviewLog, UserPerformance } from '../db/types';
import {
  allocateCramReview,
  simulateReviewOutcomes,
  type CramMemoryModel,
  type MemoryModelFallbackReason,
  type RecallPrediction,
  type SuccessGradeCoefficient,
} from './cramAllocator';
import { defaultFsrsParameters, MS_PER_DAY } from './params';
import { makeObjectiveContext, sortByObjective } from './objective';
import { estimateResponseTime, type ResponseTimeCoefficients } from './responseTimeCost';

const NOW = 30 * MS_PER_DAY;
const ASSESSMENT = NOW + 2 * MS_PER_DAY;
const GRADES: SuccessGradeCoefficient[] = [
  { grade: 2, probability: 0.2 },
  { grade: 3, probability: 0.6 },
  { grade: 4, probability: 0.2 },
];
const RESPONSE: ResponseTimeCoefficients = {
  fallbackSeconds: 10,
  fallbackStandardDeviationSeconds: 3,
  priorCorrectReviews: 20,
  minimumSeconds: 0.5,
  maximumSeconds: 120,
  failureFeedbackSeconds: 4,
};

function deck(objective: Deck['examObjective'] = 'expectedMarks'): Deck {
  return {
    id: 'deck',
    name: 'Deck',
    examDate: ASSESSMENT,
    examObjective: objective,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    createdAt: 0,
  };
}

function card(id: string, partial: Partial<Card> = {}): Card {
  return {
    id,
    deckId: 'deck',
    type: 'front_back',
    front: id,
    back: id,
    stability: 3,
    difficulty: 5,
    lastReviewed: NOW - MS_PER_DAY,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    ...partial,
  };
}

interface TestCoefficients {
  successNow: Record<string, number>;
  examNow: Record<string, number>;
  after: Record<string, Partial<Record<Grade, number>>>;
  standardDeviation?: number;
  productiveDelay?: Record<string, number>;
  validationReason?: Exclude<MemoryModelFallbackReason, 'missing'>;
}

function testModel(coefficients: TestCoefficients) {
  const calls: Array<{ id: string; grade: Grade; repsAfter: number }> = [];
  const prediction = (probability: number): RecallPrediction => ({
    probability,
    ...(coefficients.standardDeviation === undefined
      ? {}
      : { standardDeviation: coefficients.standardDeviation }),
  });
  const model: CramMemoryModel = {
    version: 'explicit-test-coefficients',
    validate: () =>
      coefficients.validationReason
        ? { valid: false, reason: coefficients.validationReason }
        : { valid: true },
    predictRecall: ({ card: value, at }) =>
      prediction(
        at === ASSESSMENT
          ? (coefficients.examNow[value.id] ?? 0.4)
          : (coefficients.successNow[value.id] ?? 0.5),
      ),
    simulateOutcome: ({ card: value, cardAfterFsrs, grade }) => {
      calls.push({ id: value.id, grade, repsAfter: cardAfterFsrs.reps });
      return prediction(coefficients.after[value.id]?.[grade] ?? 0.5);
    },
    nextProductiveAt: ({ card: value, now }) =>
      now + (coefficients.productiveDelay?.[value.id] ?? 0),
  };
  return { model, calls };
}

function allocationInput(
  cards: Card[],
  model: CramMemoryModel | undefined,
  objective: Deck['examObjective'] = 'expectedMarks',
) {
  return {
    cards,
    eligibleCardIds: new Set(cards.map((value) => value.id)),
    context: makeObjectiveContext(deck(objective)),
    assessmentAt: ASSESSMENT,
    now: NOW,
    remainingWindowSeconds: 300,
    currentWindowId: 'window-today',
    futureWindowStarts: [] as number[],
    projection: {
      projectionMode: 'memory-model' as const,
      memoryModelVersion: 'explicit-test-coefficients',
    },
    model,
    successGrades: GRADES,
    responseTimeCoefficients: RESPONSE,
  };
}

describe('outcome simulation', () => {
  it('simulates failure and every configured success grade through one FSRS transition', () => {
    const value = card('a');
    const { model, calls } = testModel({
      successNow: { a: 0.6 },
      examNow: { a: 0.4 },
      after: { a: { 1: 0.5, 2: 0.7, 3: 0.8, 4: 0.9 } },
    });
    const result = simulateReviewOutcomes(
      value,
      model,
      GRADES,
      makeObjectiveContext(deck()),
      NOW,
      ASSESSMENT,
    );

    expect(result?.outcomes.map((outcome) => outcome.grade)).toEqual([1, 2, 3, 4]);
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.repsAfter === value.reps + 1)).toBe(true);
    expect(value.reps).toBe(1);
    expect(value.history).toEqual([]);
    expect(result?.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0)).toBeCloseTo(1);
  });

  it('computes binary expected gain without double-counting success grades', () => {
    const { model } = testModel({
      successNow: { a: 0.5 },
      examNow: { a: 0.4 },
      after: { a: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 } },
    });
    const result = simulateReviewOutcomes(
      card('a'),
      model,
      GRADES,
      makeObjectiveContext(deck()),
      NOW,
      ASSESSMENT,
    );
    expect(result?.expectedAssessmentRecallGain).toBeCloseTo(0.25);
  });
});

describe('response-time cost', () => {
  it('uses the conservative fallback without sufficient valid calibration', () => {
    expect(estimateResponseTime(undefined, RESPONSE)).toEqual({
      expectedSeconds: 10,
      standardDeviationSeconds: 3,
      personalisedWeight: 0,
    });
  });

  it('shrinks personal timing towards the fallback and retains uncertainty', () => {
    const performance: UserPerformance = {
      deckId: 'deck',
      runningMeanResponseTime: 20,
      runningStdDevResponseTime: 5,
      m2: 500,
      totalCorrectReviews: 20,
    };
    const result = estimateResponseTime(performance, RESPONSE);
    expect(result.expectedSeconds).toBe(15);
    expect(result.personalisedWeight).toBe(0.5);
    expect(result.standardDeviationSeconds).toBeCloseTo(Math.sqrt(17));
  });
});

describe('expected-gain allocator', () => {
  it('uses assessment gain per expected minute under expectedMarks', () => {
    const { model } = testModel({
      successNow: { fast: 0.5, slow: 0.5 },
      examNow: { fast: 0.4, slow: 0.4 },
      after: {
        fast: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 },
        slow: { 1: 0.6, 2: 0.9, 3: 0.9, 4: 0.9 },
      },
    });
    const performance = new Map<string, UserPerformance>([
      [
        'slow-deck',
        {
          deckId: 'slow-deck',
          runningMeanResponseTime: 60,
          runningStdDevResponseTime: 5,
          m2: 500,
          totalCorrectReviews: 200,
        },
      ],
    ]);
    const slow = card('slow', { deckId: 'slow-deck' });
    const input = allocationInput([card('fast'), slow], model);
    const result = allocateCramReview({ ...input, performanceByDeck: performance });
    expect(result.mode).toBe('memory-model');
    if (result.mode !== 'memory-model') return;
    expect(result.selected?.card.id).toBe('fast');
    expect(result.selected?.expectedGainPerMinute).toBeCloseTo(1.25);
  });

  it('prioritises expected mastery crossings and never polishes secure cards', () => {
    const { model } = testModel({
      successNow: { crossing: 0.8, gain: 0.8, secure: 0.8 },
      examNow: { crossing: 0.85, gain: 0.3, secure: 0.92 },
      after: {
        crossing: { 1: 0.86, 2: 0.92, 3: 0.92, 4: 0.92 },
        gain: { 1: 0.5, 2: 0.89, 3: 0.89, 4: 0.89 },
        secure: { 1: 0.94, 2: 0.99, 3: 0.99, 4: 0.99 },
      },
    });
    const result = allocateCramReview(
      allocationInput([card('gain'), card('secure'), card('crossing')], model, 'securedTopics'),
    );
    expect(result.mode).toBe('memory-model');
    if (result.mode !== 'memory-model') return;
    expect(result.selected?.card.id).toBe('crossing');
    expect(result.ranked.map((entry) => entry.card.id)).not.toContain('secure');
  });

  it('stops at budget exhaustion or when every marginal gain is non-positive', () => {
    const { model } = testModel({
      successNow: { a: 0.5 },
      examNow: { a: 0.8 },
      after: { a: { 1: 0.8, 2: 1, 3: 1, 4: 1 } },
    });
    const tooShort = allocateCramReview({
      ...allocationInput([card('a')], model),
      remainingWindowSeconds: 1,
    });
    expect(tooShort.mode === 'memory-model' && tooShort.stopReason).toBe('budget-exhausted');

    const { model: noGain } = testModel({
      successNow: { a: 0.5 },
      examNow: { a: 0.8 },
      after: { a: { 1: 0.7, 2: 0.8, 3: 0.8, 4: 0.8 } },
    });
    const stopped = allocateCramReview(allocationInput([card('a')], noGain));
    expect(stopped.mode === 'memory-model' && stopped.stopReason).toBe('no-positive-value');
  });

  it('spaces successful retrievals into a future window but permits productive close-deadline work', () => {
    const history: ReviewLog[] = [
      {
        eventId: 'event',
        revisionWindowId: 'window-today',
        sessionKind: 'revision-plan',
        timestamp: NOW - 1_000,
        grade: 3,
        correct: true,
        responseTimeSec: 5,
        distracted: false,
        stabilityBefore: 2,
        stabilityAfter: 3,
        difficultyBefore: 5,
        difficultyAfter: 5,
        retrievabilityAtReview: 0.7,
      },
    ];
    const { model } = testModel({
      successNow: { a: 0.5 },
      examNow: { a: 0.4 },
      after: { a: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 } },
    });
    const value = card('a', { history });
    const spaced = allocateCramReview({
      ...allocationInput([value], model),
      futureWindowStarts: [NOW + MS_PER_DAY],
    });
    expect(spaced.mode === 'memory-model' && spaced.stopReason).toBe('future-window-spacing');

    const close = allocateCramReview(allocationInput([value], model));
    expect(close.mode === 'memory-model' && close.selected?.card.id).toBe('a');
  });

  it('waits for the model-provided productive interval after a failure', () => {
    const { model } = testModel({
      successNow: { a: 0.5 },
      examNow: { a: 0.4 },
      after: { a: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 } },
      productiveDelay: { a: 60_000 },
    });
    const result = allocateCramReview(allocationInput([card('a')], model));
    expect(result.mode === 'memory-model' && result.stopReason).toBe('future-window-spacing');
  });

  it('propagates supplied prediction and response-time uncertainty', () => {
    const { model } = testModel({
      successNow: { a: 0.5 },
      examNow: { a: 0.4 },
      after: { a: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 } },
      standardDeviation: 0.1,
    });
    const result = allocateCramReview(allocationInput([card('a')], model));
    expect(result.mode).toBe('memory-model');
    if (result.mode !== 'memory-model') return;
    expect(result.selected?.simulation.gainStandardDeviation).toBeGreaterThan(0);
    expect(result.selected?.gainPerMinuteStandardDeviation).toBeGreaterThan(0);
  });

  it('falls back explicitly for missing, corrupt and unsupported coefficients', () => {
    const cards = [card('weak', { stability: 1 }), card('strong', { stability: 100 })];
    const context = makeObjectiveContext(deck());
    const ordinary = sortByObjective(cards, context, NOW).map(({ card: value }) => value.id);
    const missing = allocateCramReview(allocationInput(cards, undefined));
    expect(missing).toMatchObject({ mode: 'practice-fallback', fallbackReason: 'missing' });
    expect(missing.mode === 'practice-fallback' && missing.cards.map((value) => value.id)).toEqual(
      ordinary,
    );

    const { model: corrupt } = testModel({
      successNow: {},
      examNow: {},
      after: {},
      validationReason: 'corrupt',
    });
    expect(allocateCramReview(allocationInput(cards, corrupt))).toMatchObject({
      mode: 'practice-fallback',
      fallbackReason: 'corrupt',
    });
    const { model: unsupported } = testModel({
      successNow: {},
      examNow: {},
      after: {},
      validationReason: 'unsupported',
    });
    expect(allocateCramReview(allocationInput(cards, unsupported))).toMatchObject({
      mode: 'practice-fallback',
      fallbackReason: 'unsupported',
    });

    expect(
      allocateCramReview({
        ...allocationInput(cards, corrupt),
        responseTimeCoefficients: { ...RESPONSE, fallbackSeconds: Number.NaN },
      }),
    ).toMatchObject({ mode: 'practice-fallback', fallbackReason: 'corrupt' });

    expect(
      allocateCramReview({
        ...allocationInput(cards, corrupt),
        projection: {
          projectionMode: 'fsrs-6-practice-fallback',
          memoryModelVersion: 'fsrs-6',
          fallbackReason: 'unsupported',
        },
      }),
    ).toMatchObject({ mode: 'practice-fallback', fallbackReason: 'unsupported' });
  });

  it('falls back instead of using out-of-range predicted confidence', () => {
    const { model } = testModel({
      successNow: { a: 1.1 },
      examNow: { a: 0.4 },
      after: { a: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 } },
    });
    expect(allocateCramReview(allocationInput([card('a')], model))).toMatchObject({
      mode: 'practice-fallback',
      fallbackReason: 'corrupt',
    });
  });

  it('never leaks cards outside the eligible, reached and available pool', () => {
    const values = [card('eligible'), card('excluded'), card('unavailable', { suspended: true })];
    const { model } = testModel({
      successNow: { eligible: 0.5, excluded: 0.5, unavailable: 0.5 },
      examNow: { eligible: 0.4, excluded: 0.4, unavailable: 0.4 },
      after: {
        eligible: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 },
        excluded: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 },
        unavailable: { 1: 0.5, 2: 0.8, 3: 0.8, 4: 0.8 },
      },
    });
    const result = allocateCramReview({
      ...allocationInput(values, model),
      eligibleCardIds: new Set(['eligible', 'unavailable']),
    });
    expect(result.mode === 'memory-model' && result.ranked.map((entry) => entry.card.id)).toEqual([
      'eligible',
    ]);
  });

  it('rebuilds priorities for a realistic pool within a lightweight performance bound', () => {
    const values = Array.from({ length: 500 }, (_, index) => card(`card-${index}`));
    const { model } = testModel({
      successNow: {},
      examNow: {},
      after: {},
    });
    const started = performance.now();
    const result = allocateCramReview(allocationInput(values, model));
    const elapsed = performance.now() - started;
    expect(result.mode === 'memory-model' && result.ranked).toHaveLength(500);
    expect(elapsed).toBeLessThan(1_000);
  });
});
