import { describe, expect, it } from 'vitest';
import { applyReview, makeEngine, toTsCard, type SchedulingMemory } from '@lacuna/core/fsrs/fsrs';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '@lacuna/core/fsrs/params';

const now = Date.UTC(2026, 0, 1);
const fresh: SchedulingMemory = {
  id: 'card',
  stability: null,
  stabilityFast: null,
  difficulty: null,
  lastReviewed: null,
  due: null,
  reps: 0,
  lapses: 0,
  learningSteps: 0,
  scheduledDays: 0,
  state: 0,
};

function engine() {
  return makeEngine({ ...defaultFsrsParameters(), enable_fuzz: false });
}

describe('FSRS-7 engine boundary', () => {
  it('initialises and lapses both traces using upstream fractional-day reference values', () => {
    const scheduler = engine();
    expect(FSRS_VERSION).toBe(7);
    expect(scheduler.config.weights).toHaveLength(34);
    const first = applyReview(scheduler, fresh, 3, now);
    expect(first.memory).toMatchObject({
      stability: 3.9221,
      stabilityFast: 3.13768,
      difficulty: 3.53072398,
      reps: 1,
    });
    expect(first.retrievabilityAtReview).toBeNull();
    const lapse = applyReview(scheduler, { ...fresh, ...first.memory }, 1, now + 0.05 * MS_PER_DAY);
    expect(lapse.memory).toMatchObject({
      stability: 1.1610651,
      stabilityFast: 0.16996148,
      difficulty: 9.05649394,
      reps: 2,
    });
    expect(lapse.retrievabilityAtReview).toBeCloseTo(0.9611346211630858, 12);
  });

  it.each([1, 2, 3] as const)(
    'initialises opaque state %s from the real answer without resetting progress',
    (state) => {
      const scheduler = engine();
      const opaque = {
        ...fresh,
        stability: 100,
        difficulty: 9,
        stabilityFast: null,
        state,
        lastReviewed: now - MS_PER_DAY,
        due: now + MS_PER_DAY,
        reps: 12,
        lapses: 4,
        learningSteps: 1,
      };
      const before = structuredClone(opaque);
      const converted = toTsCard(opaque, now);
      expect(converted).toMatchObject({
        stability: 0,
        stabilityFast: 0,
        difficulty: 0,
        state,
        reps: 12,
        lapses: 4,
        learningStep: 1,
      });
      expect(converted.dueAt.getTime()).toBe(opaque.due);
      const result = applyReview(scheduler, opaque, 3, now);
      expect(result.retrievabilityAtReview).toBeNull();
      expect(result.memory).toMatchObject({
        stability: 3.9221,
        stabilityFast: 3.13768,
        difficulty: 3.53072398,
        reps: 13,
        lapses: 4,
      });
      expect(opaque).toEqual(before);
    },
  );

  it('rejects FSRS-6 weights rather than silently scheduling with another model', () => {
    expect(() => makeEngine({ ...defaultFsrsParameters(), w: new Array(21).fill(1) })).toThrow();
  });
});
