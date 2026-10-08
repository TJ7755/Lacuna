import { describe, expect, it } from 'vitest';
import { easeSeries, recallTicks } from './ForecastChart';

describe('easeSeries', () => {
  it('keeps the endpoints, smooths the steps and never makes a rising series fall', () => {
    const steps = [0.6, 0.8, 0.8, 0.8, 0.8, 0.9, 0.9, 0.9, 0.9, 0.95];
    const eased = easeSeries(steps);
    expect(eased[0]).toBe(0.6);
    expect(eased[eased.length - 1]).toBe(0.95);
    for (let i = 1; i < eased.length; i++) expect(eased[i]).toBeGreaterThanOrEqual(eased[i - 1]);
    expect(eased[4]).toBeGreaterThan(0.8);
  });
});

describe('recallTicks', () => {
  it('steps by ten points when the values allow it', () => {
    expect(recallTicks([0.62, 0.9, 0.95])).toEqual([1, 0.9, 0.8, 0.7, 0.6]);
  });
});
