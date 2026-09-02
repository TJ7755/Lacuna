import { describe, expect, it } from 'vitest';
import { summariseMemorySeries } from './memory-statistics';

describe('memory sample statistics', () => {
  it('reports median, MAD, minimum and maximum without duplicating raw samples', () => {
    const samples = [9, 1, 5, 7, 3, 11, 13, 15, 17];
    expect(summariseMemorySeries(samples)).toEqual({
      count: 9,
      median: 9,
      medianAbsoluteDeviation: 4,
      minimum: 1,
      maximum: 17,
    });
  });

  it('requires exactly nine samples per checkpoint', () => {
    expect(() => summariseMemorySeries([1, 2])).toThrow('exactly 9');
  });
});
