import { describe, expect, it, vi } from 'vitest';
import { MS_PER_DAY, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import {
  assessmentTiming,
  ASSESSMENT_TARGET_RECALL,
  assessmentReviewGain,
  worthwhileAssessmentPractice,
} from './assessmentTiming';
import { makeEngine, toTsCard } from './fsrs';
import { forgettingCurve, simContext } from './forwardSim';
import { card, course, NOW } from './session.testFixtures';

function context() {
  const config = { ...course('course', 1), fsrsParameters: defaultFsrsParameters() };
  return simContext(config, makeEngine(config.fsrsParameters));
}

describe('assessment timing prediction', () => {
  it('preserves generated ordinary due dates and predicts using the existing curve', () => {
    const ctx = context();
    for (const days of [1 / MS_PER_DAY, 0.01, 1, 10, 1000]) {
      for (const stability of [0.001, 0.1, 1, 10, 1000]) {
        for (const offset of [-1, 0, 0.5, 1, 2]) {
          const exam = NOW + days * MS_PER_DAY;
          const c = card('card', 'course', {
            due: NOW + offset * days * MS_PER_DAY,
            stability,
            difficulty: 5,
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
              ? ctx.fsrs.next(toTsCard(c, reviewAt), new Date(reviewAt), ctx.expectedGrade).card
                  .stability
              : stability;
          const elapsed = exam - (reviewAt < exam ? reviewAt : NOW);
          const recall = forgettingCurve(elapsed / MS_PER_DAY, projected, ctx.decay);
          expect(result.predictedRecall).toBeCloseTo(recall, 12);
          expect(result.feasible).toBe(recall >= ASSESSMENT_TARGET_RECALL);
        }
      }
    }
  });

  it('does not simulate a review on or after the assessment or for an unscheduled card', () => {
    const ctx = context();
    const next = vi.spyOn(ctx.fsrs, 'next');
    const exam = NOW + MS_PER_DAY;
    for (const due of [null, exam, exam + MS_PER_DAY]) {
      const c = card('card', 'course', { due, stability: 0.1, lastReviewed: NOW, state: 2 });
      const result = assessmentTiming(c, NOW, exam, ctx);
      expect(result.due).toBe(due);
      expect(result.predictedRecall).toBe(forgettingCurve(1, 0.1, ctx.decay));
      expect(result.feasible).toBe(false);
    }
    expect(next).not.toHaveBeenCalled();
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

  it('reports infeasibility for tiny post-review stability without changing due', () => {
    const ctx = context();
    const c = card('card', 'course', { due: NOW });
    const item = ctx.fsrs.next(toTsCard(c, NOW), new Date(NOW), 3);
    vi.spyOn(ctx.fsrs, 'next').mockReturnValue({
      ...item,
      card: { ...item.card, stability: 1e-15 },
    });
    const result = assessmentTiming(c, NOW, NOW + 1000, ctx);
    expect(result.due).toBe(NOW);
    expect(result.predictedRecall).toBeLessThan(ASSESSMENT_TARGET_RECALL);
    expect(result.feasible).toBe(false);
  });
});

describe('worthwhile early assessment practice', () => {
  it('measures gains across the final fortnight and preserves final-day work', () => {
    const ctx = context();
    const c = card('weak', 'course', {
      state: 2,
      stability: 0.5,
      difficulty: 5,
      lastReviewed: NOW - 2 * MS_PER_DAY,
      due: NOW + 20 * MS_PER_DAY,
    });
    const gains = [0.1, 1, 3, 7, 14].map((days) =>
      assessmentReviewGain(c, NOW + days * MS_PER_DAY, NOW, ctx),
    );

    expect(gains.every((gain) => gain >= 0.01)).toBe(true);
    expect(worthwhileAssessmentPractice(c, NOW + MS_PER_DAY / 10, NOW, 14, ctx)).toBe(true);
    expect(worthwhileAssessmentPractice(c, NOW + 14 * MS_PER_DAY, NOW, 14, ctx)).toBe(true);
    expect(worthwhileAssessmentPractice(c, NOW + 14 * MS_PER_DAY + 1, NOW, 14, ctx)).toBe(false);
    expect(
      worthwhileAssessmentPractice(
        { ...c, lastReviewed: NOW - MS_PER_DAY / 2 },
        NOW + MS_PER_DAY / 10,
        NOW,
        14,
        ctx,
      ),
    ).toBe(true);
    expect(
      worthwhileAssessmentPractice({ ...c, lastReviewed: NOW }, NOW + MS_PER_DAY, NOW, 14, ctx),
    ).toBe(false);
    expect(
      worthwhileAssessmentPractice(
        { ...c, due: NOW, stability: 10000 },
        NOW + 30 * MS_PER_DAY,
        NOW,
        14,
        ctx,
      ),
    ).toBe(true);
  });
});
