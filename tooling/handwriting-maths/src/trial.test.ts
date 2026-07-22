import { describe, expect, it } from 'vitest';
import { ARMS, buildTrialOrder, median, summarise, toCsv, type Trial } from './trial';

const targets = ['42', '3+7=10', 'x^2+3', '12/4=3'];

/** Deterministic stand-in for Math.random, cycling through fixed values. */
const sequence = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const trial = (overrides: Partial<Trial> & Pick<Trial, 'arm'>): Trial => ({
  target: '42',
  durationMs: 1000,
  correct: true,
  corrections: 0,
  entered: '42',
  ...overrides,
});

describe('buildTrialOrder', () => {
  it('attempts every target once per arm', () => {
    const order = buildTrialOrder(targets, sequence([0.1, 0.5, 0.9]));
    expect(order.length).toBe(targets.length * ARMS.length);
    for (const target of targets) {
      const arms = order.filter((planned) => planned.target === target).map((p) => p.arm);
      expect(arms.slice().sort()).toEqual(ARMS.slice().sort());
    }
  });

  it('rotates which arm goes first, so no arm is systematically advantaged', () => {
    const order = buildTrialOrder(targets, sequence([0.1, 0.5, 0.9]));
    const firstPerTarget = targets.map(
      (target) => order.find((planned) => planned.target === target)?.arm,
    );
    // Four targets over three arms: every arm leads at least once.
    expect(new Set(firstPerTarget).size).toBe(ARMS.length);
  });

  it('is deterministic given a deterministic random source', () => {
    const a = buildTrialOrder(targets, sequence([0.3, 0.7, 0.2]));
    const b = buildTrialOrder(targets, sequence([0.3, 0.7, 0.2]));
    expect(a).toEqual(b);
  });

  it('handles an empty target list', () => {
    expect(buildTrialOrder([], sequence([0.5]))).toEqual([]);
  });
});

describe('median', () => {
  it('takes the middle value of an odd-length list', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('averages the middle pair of an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is unmoved by a single extreme value, unlike a mean', () => {
    expect(median([1, 2, 3, 4, 100])).toBe(3);
  });

  it('returns NaN for an empty list', () => {
    expect(median([])).toBeNaN();
  });
});

describe('summarise', () => {
  it('times correct trials only', () => {
    const trials: Trial[] = [
      trial({ arm: 'canvas', durationMs: 1000 }),
      trial({ arm: 'canvas', durationMs: 3000 }),
      // A fast failure must not flatter the arm.
      trial({ arm: 'canvas', durationMs: 50, correct: false }),
    ];
    const canvas = summarise(trials).find((s) => s.arm === 'canvas');
    expect(canvas?.medianMs).toBe(2000);
    expect(canvas?.trials).toBe(3);
  });

  it('reports accuracy over all attempted trials', () => {
    const trials: Trial[] = [
      trial({ arm: 'keyboard' }),
      trial({ arm: 'keyboard', correct: false }),
      trial({ arm: 'keyboard', correct: false }),
      trial({ arm: 'keyboard' }),
    ];
    expect(summarise(trials).find((s) => s.arm === 'keyboard')?.accuracy).toBe(0.5);
  });

  it('summarises corrections across correct and incorrect trials alike', () => {
    const trials: Trial[] = [
      trial({ arm: 'palette', corrections: 1 }),
      trial({ arm: 'palette', corrections: 5, correct: false }),
      trial({ arm: 'palette', corrections: 3 }),
    ];
    expect(summarise(trials).find((s) => s.arm === 'palette')?.medianCorrections).toBe(3);
  });

  it('returns a row per arm even when an arm was never attempted', () => {
    const summaries = summarise([trial({ arm: 'canvas' })]);
    expect(summaries.map((s) => s.arm)).toEqual(ARMS.slice());
    const keyboard = summaries.find((s) => s.arm === 'keyboard');
    expect(keyboard?.trials).toBe(0);
    expect(keyboard?.accuracy).toBeNaN();
  });
});

describe('toCsv', () => {
  it('emits a header and one row per trial', () => {
    const csv = toCsv([trial({ arm: 'canvas' }), trial({ arm: 'keyboard' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('arm,target,entered,correct,duration_ms,corrections');
    expect(lines.length).toBe(3);
    expect(lines[1]).toBe('canvas,42,42,1,1000,0');
  });

  it('quotes fields containing commas or quotes', () => {
    const csv = toCsv([trial({ arm: 'keyboard', target: '1,2', entered: 'a"b' })]);
    expect(csv.split('\n')[1]).toContain('"1,2"');
    expect(csv.split('\n')[1]).toContain('"a""b"');
  });

  it('rounds fractional durations', () => {
    const csv = toCsv([trial({ arm: 'canvas', durationMs: 1234.7 })]);
    expect(csv.split('\n')[1]).toContain(',1235,');
  });
});
