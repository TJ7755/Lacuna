import { describe, expect, it, vi } from 'vitest';
import { MS_PER_DAY, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import {
  assessmentTiming,
  ASSESSMENT_TARGET_RECALL,
  ASSESSMENT_PREPARATION_LEAD_MS,
} from './assessmentTiming';
import { makeEngine, toTsCard } from './fsrs';
import { forgettingCurve, simContext } from './forwardSim';
import { card, course, NOW } from './session.testFixtures';

function context() {
  const config = { ...course('course', 1), fsrsParameters: defaultFsrsParameters() };
  return simContext(config, makeEngine(config.fsrsParameters));
}

describe('assessment timing', () => {
  it('caps generated ordinary schedules and predicts recall using the existing curve', () => {
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
          const result = assessmentTiming(c, NOW, exam, ctx);
          expect(result.due).toBe(
            Math.min(c.due!, Math.max(NOW, exam - ASSESSMENT_PREPARATION_LEAD_MS)),
          );
          expect(result.due).toBeLessThan(exam);
          const projected = ctx.fsrs.next(
            toTsCard(c, Math.max(NOW, result.due!)),
            new Date(Math.max(NOW, result.due!)),
            ctx.expectedGrade,
          ).card;
          const recall = forgettingCurve(
            (exam - Math.max(NOW, result.due!)) / MS_PER_DAY,
            projected.stability,
            ctx.decay,
          );
          expect(result.predictedRecall).toBeCloseTo(recall, 12);
          expect(result.feasible).toBe(recall >= ASSESSMENT_TARGET_RECALL);
        }
      }
    }
  });

  it('makes an ordinary due date after the exam due one day before it', () => {
    const exam = NOW + 3 * MS_PER_DAY;
    const result = assessmentTiming(
      card('card', 'course', { due: exam + MS_PER_DAY }),
      NOW,
      exam,
      context(),
    );
    expect(result.due).toBe(exam - ASSESSMENT_PREPARATION_LEAD_MS);
  });

  it('makes imminent assessments immediately due while retaining ordinary overdue dates', () => {
    const exam = NOW + MS_PER_DAY / 2;
    for (const due of [null, NOW + 100, NOW - 100]) {
      const result = assessmentTiming(card('card', 'course', { due }), NOW, exam, context());
      expect(result.due).toBe(Math.min(due ?? Infinity, NOW));
    }
  });

  it('preserves an ordinary review before the preparation deadline', () => {
    const due = NOW + MS_PER_DAY;
    const result = assessmentTiming(
      card('card', 'course', { due }),
      NOW,
      NOW + 3 * MS_PER_DAY,
      context(),
    );
    expect(result.due).toBe(due);
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

  it('reports infeasibility when tiny post-review stability cannot span the remaining time', () => {
    const ctx = context();
    const c = card('card', 'course', { due: NOW + MS_PER_DAY });
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
