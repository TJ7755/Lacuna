import { describe, expect, it } from 'vitest';
import { MS_PER_DAY, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import {
  assessmentTiming,
  ASSESSMENT_TARGET_RECALL,
  assessmentReviewGain,
  worthwhileAssessmentPractice,
} from '@lacuna/core/fsrs/assessmentTiming';
import { makeEngine } from '@lacuna/core/fsrs/fsrs';
import { simContext } from '@lacuna/core/fsrs/forwardSim';
import { card, course, NOW } from './session.testFixtures';

function context() {
  const config = { ...course('course', 1), fsrsParameters: defaultFsrsParameters() };
  return simContext(config, makeEngine(config.fsrsParameters));
}

describe('assessment timing prediction', () => {
  it('preserves generated ordinary due dates and predicts one upstream FSRS-7 transition', () => {
    const ctx = context();
    const initial = ctx.model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
    for (const days of [1 / MS_PER_DAY, 0.01, 1, 10, 1000]) {
      for (const gap of [0, 1, 10, 100]) {
        for (const offset of [-1, 0, 0.5, 1, 2]) {
          const exam = NOW + days * MS_PER_DAY;
          const c = card('card', 'course', {
            due: NOW + offset * days * MS_PER_DAY,
            ...(gap === 0
              ? initial
              : ctx.model.step({
                  memoryState: initial,
                  rating: 3,
                  elapsedDays: gap,
                })),
            lastReviewed: NOW,
            state: 2,
          });
          const before = structuredClone(c);
          const result = assessmentTiming(c, NOW, exam, ctx);
          expect(result.due).toBe(c.due);
          expect(c).toEqual(before);
          const reviewAt = Math.max(NOW, c.due!);
          const projected =
            reviewAt < exam
              ? ctx.model.step({
                  memoryState: {
                    stability: c.stability!,
                    stabilityFast: c.stabilityFast!,
                    difficulty: c.difficulty!,
                  },
                  rating: ctx.expectedGrade,
                  elapsedDays: (reviewAt - NOW) / MS_PER_DAY,
                })
              : {
                  stability: c.stability!,
                  stabilityFast: c.stabilityFast!,
                  difficulty: c.difficulty!,
                };
          const elapsed = exam - (reviewAt < exam ? reviewAt : NOW);
          const recall = ctx.model.forgettingCurve(projected, elapsed / MS_PER_DAY);
          expect(result.predictedRecall).toBeCloseTo(recall, 9);
          expect(result.feasible).toBe(recall >= ASSESSMENT_TARGET_RECALL);
        }
      }
    }
  });

  it('does not simulate a review on or after the assessment or for an unscheduled card', () => {
    const ctx = context();
    const memory = ctx.model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
    const exam = NOW + MS_PER_DAY;
    for (const due of [null, exam, exam + MS_PER_DAY]) {
      const c = card('card', 'course', { ...memory, due, lastReviewed: NOW, state: 2 });
      const result = assessmentTiming(c, NOW, exam, ctx);
      expect(result.due).toBe(due);
      expect(result.predictedRecall).toBeCloseTo(ctx.model.forgettingCurve(memory, 1), 12);
      expect(result.feasible).toBe(true);
    }
  });

  it('preserves ordinary schedules without a strictly future finite assessment', () => {
    const ctx = context();
    for (const due of [null, NOW - 100, NOW, NOW + 1000000]) {
      for (const exam of [undefined, NOW - 1, NOW, NaN, Infinity]) {
        expect(assessmentTiming(card('card', 'course', { due }), NOW, exam, ctx)).toEqual({
          due,
          predictedRecall: null,
          feasible: null,
        });
      }
    }
  });
});

describe('worthwhile early assessment practice', () => {
  it('admits useful early work outside the urgent window while preserving spacing', () => {
    const ctx = context();
    const c = card('weak', 'course', {
      state: 2,
      ...ctx.model.step({ memoryState: null, rating: 1, elapsedDays: 0 }),
      lastReviewed: NOW - 2 * MS_PER_DAY,
      due: NOW + 20 * MS_PER_DAY,
    });
    const gains = [0.1, 1, 3, 7, 14].map((days) =>
      assessmentReviewGain(c, NOW + days * MS_PER_DAY, NOW, ctx),
    );

    expect(gains.every((gain) => gain >= 0.01)).toBe(true);
    expect(worthwhileAssessmentPractice(c, NOW + MS_PER_DAY / 10, NOW, ctx)).toBe(true);
    expect(worthwhileAssessmentPractice(c, NOW + 14 * MS_PER_DAY, NOW, ctx)).toBe(true);
    expect(worthwhileAssessmentPractice(c, NOW + 30 * MS_PER_DAY, NOW, ctx)).toBe(true);
    expect(
      worthwhileAssessmentPractice(
        { ...c, lastReviewed: NOW - MS_PER_DAY / 2 },
        NOW + MS_PER_DAY / 10,
        NOW,
        ctx,
      ),
    ).toBe(true);
    expect(
      worthwhileAssessmentPractice({ ...c, lastReviewed: NOW }, NOW + MS_PER_DAY, NOW, ctx),
    ).toBe(false);
    expect(worthwhileAssessmentPractice({ ...c, due: NOW }, NOW + 30 * MS_PER_DAY, NOW, ctx)).toBe(
      true,
    );
  });
});
