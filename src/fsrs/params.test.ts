import { describe, expect, it } from 'vitest';
import {
  clampRequestRetention,
  defaultFsrsParameters,
  DEFAULT_REQUEST_RETENTION,
  MAX_REQUEST_RETENTION,
  MIN_REQUEST_RETENTION,
} from './params';

describe('clampRequestRetention', () => {
  it.each([
    [MIN_REQUEST_RETENTION - 0.1, MIN_REQUEST_RETENTION],
    [MIN_REQUEST_RETENTION, MIN_REQUEST_RETENTION],
    [0.9, 0.9],
    [MAX_REQUEST_RETENTION, MAX_REQUEST_RETENTION],
    [MAX_REQUEST_RETENTION + 0.1, MAX_REQUEST_RETENTION],
  ])('clamps %s to %s', (value, expected) => {
    expect(clampRequestRetention(value)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'uses the default for non-finite value %s',
    (value) => {
      expect(clampRequestRetention(value)).toBe(DEFAULT_REQUEST_RETENTION);
    },
  );
});

describe('defaultFsrsParameters', () => {
  it('returns independent parameter arrays on every call', () => {
    const first = defaultFsrsParameters();
    const second = defaultFsrsParameters();

    first.w[0] = 999;
    first.learning_steps.push('1d');
    first.relearning_steps.push('2d');

    expect(second.w[0]).not.toBe(999);
    expect(second.learning_steps).not.toContain('1d');
    expect(second.relearning_steps).not.toContain('2d');
    expect(first.w).not.toBe(second.w);
    expect(first.learning_steps).not.toBe(second.learning_steps);
    expect(first.relearning_steps).not.toBe(second.relearning_steps);
  });
});
