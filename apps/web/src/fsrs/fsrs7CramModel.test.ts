import { describe, expect, it } from 'vitest';
import { FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';
import { revisionReplanReasons } from '../course/revisionPlan';
import type { Card, RevisionPlanInputSnapshot } from '@lacuna/core/db/types';
import {
  createFsrs7CramModel,
  projectionForFsrs7,
  readinessFromPredictions,
} from '@lacuna/core/fsrs/fsrs7CramModel';
import { defaultFsrsParameters, MS_PER_DAY } from '@lacuna/core/fsrs/params';

const params = { ...defaultFsrsParameters(), w: [...FSRS7_DEFAULT_WEIGHTS] };

const REVIEWED_AT = Date.UTC(2026, 6, 1, 12);

function card(partial: Partial<Card> = {}): Card {
  return {
    id: 'card',
    conceptId: 'concept-card',
    deckId: 'deck',
    schedulingUnitId: 'deck',
    type: 'front_back',
    front: 'Front',
    back: 'Back',
    stability: 3,
    stabilityFast: 0.02,
    difficulty: 5,
    lastReviewed: REVIEWED_AT,
    reps: 1,
    lapses: 0,
    state: 2,
    due: REVIEWED_AT,
    scheduledDays: 1,
    learningSteps: 0,
    history: [
      {
        timestamp: REVIEWED_AT,
        grade: 3,
        correct: true,
        responseTimeSec: 4,
        distracted: false,
        stabilityBefore: null,
        stabilityAfter: 3,
        difficultyBefore: null,
        difficultyAfter: 5,
        retrievabilityAtReview: null,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('FSRS-7 cram memory model', () => {
  it.each([
    [1 / 1440, 0.9422380705757256],
    [1 / 24, 0.9228598698390408],
    [0.25, 0.9130754908617562],
    [1, 0.8953472389355146],
    [7, 0.829885474944635],
  ])('projects fractional and long-term recall at %s days', (days, expected) => {
    // Reference values from ts-fsrs 6.0.0's standalone FSRS-7 curve, using
    // default weights and S=3, SFast=0.02, D=5. No Lacuna projection involved.
    const prediction = createFsrs7CramModel(params).predictRecall({
      card: card(),
      at: REVIEWED_AT + days * MS_PER_DAY,
    });
    expect(prediction.probability).toBeCloseTo(expected, 12);
    expect(prediction.standardDeviation).toBeCloseTo(Math.sqrt(expected * (1 - expected)), 12);
  });

  it.each(['success', 'failure'] as const)(
    'projects the supplied FSRS state after a %s without applying a second review',
    (outcome) => {
      const now = REVIEWED_AT + MS_PER_DAY;
      const model = createFsrs7CramModel(params);
      expect(
        model.simulateOutcome({
          card: card({ stability: 20, stabilityFast: 1, difficulty: 8 }),
          cardAfterFsrs: card({ lastReviewed: now }),
          outcome,
          grade: outcome === 'success' ? 3 : 1,
          now,
          assessmentAt: now + MS_PER_DAY,
          predictAt: now + MS_PER_DAY,
        }).probability,
      ).toBeCloseTo(0.8953472389355146, 12);
    },
  );

  it.each([
    [{ history: [] }, 'unsupported'],
    [{ stability: null }, 'unsupported'],
    [{ stabilityFast: null }, 'unsupported'],
    [{ stability: Number.NaN }, 'corrupt'],
    [{ stabilityFast: -1 }, 'corrupt'],
    [{ difficulty: Number.NaN }, 'corrupt'],
    [{ lastReviewed: REVIEWED_AT + 1 }, 'unsupported'],
  ] as const)('rejects unscorable evidence %s', (partial, reason) => {
    expect(
      createFsrs7CramModel(params).validate({
        card: card(partial as Partial<Card>),
        now: REVIEWED_AT,
        assessmentAt: REVIEWED_AT,
      }),
    ).toEqual({ valid: false, reason });
  });

  it('withholds recall for legacy memory without changing its scheduling evidence', () => {
    const legacy = card({
      stabilityFast: null,
      due: REVIEWED_AT + 60_000,
      reps: 20,
      lapses: 4,
      learningSteps: 2,
    });
    const before = structuredClone(legacy);
    const model = createFsrs7CramModel(params);
    expect(
      model.predictRecall({ card: legacy, at: REVIEWED_AT + MS_PER_DAY }).probability,
    ).toBeNaN();
    expect(legacy).toEqual(before);
  });

  it('keeps productive attempts at or after the due time', () => {
    const model = createFsrs7CramModel(params);
    for (const due of [null, REVIEWED_AT - 1, REVIEWED_AT + 60_000]) {
      expect(
        model.nextProductiveAt({
          card: card({ due }),
          now: REVIEWED_AT,
          assessmentAt: REVIEWED_AT + MS_PER_DAY,
        }),
      ).toBe(due === null ? REVIEWED_AT : Math.max(REVIEWED_AT, due));
    }
  });

  it('claims no short-term recall until a card clears an unprimed retest (#313)', () => {
    const model = createFsrs7CramModel(params);
    const [first] = card().history;
    const primed = { ...first, timestamp: REVIEWED_AT + 30_000, grade: 4 as const, primed: true };
    const window = { now: REVIEWED_AT + 60_000, assessmentAt: REVIEWED_AT + 86_400_000 };
    const lastReviewed = REVIEWED_AT + 30_000;

    expect(
      model?.validate({ card: card({ history: [first, primed], lastReviewed }), ...window }),
    ).toEqual({ valid: false, reason: 'unsupported' });
    // A genuinely spaced retest, or history from before the flag existed, still counts.
    const retest = { ...first, timestamp: REVIEWED_AT + 50_000 };
    expect(
      model?.validate({
        card: card({ history: [first, primed, retest], lastReviewed: REVIEWED_AT + 50_000 }),
        ...window,
      }),
    ).toEqual({ valid: true });
    expect(
      model?.validate({
        card: card({ history: [first, { ...primed, primed: undefined }], lastReviewed }),
        ...window,
      }),
    ).toEqual({ valid: true });
  });

  it('aggregates readiness only when every prediction carries valid uncertainty', () => {
    const readiness = readinessFromPredictions([
      { probability: 0.8, standardDeviation: 0.2 },
      { probability: 0.6, standardDeviation: 0.1 },
    ]);
    expect(readiness?.probability).toBeCloseTo(0.7, 12);
    expect(readiness?.standardDeviation).toBeCloseTo(Math.sqrt(0.05) / 2, 12);
    expect(readinessFromPredictions([{ probability: 0.8 }])).toBeNull();
  });

  it('replans when FSRS parameters change and matches the runtime provenance', () => {
    const firstProjection = projectionForFsrs7(params);
    const changed = { ...params, w: [...params.w] };
    changed.w[0] += 0.001;
    expect(createFsrs7CramModel(params).version).toBe(firstProjection.memoryModelVersion);
    const input: RevisionPlanInputSnapshot = {
      coverageVersion: 'coverage',
      deadlineAt: REVIEWED_AT + MS_PER_DAY,
      reachedLessonIds: ['lesson'],
      exposureVersion: 'exposure',
      availabilityVersion: 'available',
      reviewEvidenceVersion: 'reviews',
      projection: firstProjection,
    };
    expect(
      revisionReplanReasons(input, {
        ...input,
        projection: projectionForFsrs7(changed),
      }),
    ).toEqual(['memory-model-changed']);
  });
});
