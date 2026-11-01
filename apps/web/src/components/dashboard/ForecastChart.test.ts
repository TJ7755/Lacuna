import { describe, expect, it } from 'vitest';
import { easeSeries, recallTicks, spreadLabels } from './ForecastChart';

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

describe('spreadLabels', () => {
  it('keeps labels apart, in order and inside the plot', () => {
    // Three courses at 0% crowd the floor; one sits alone near the top.
    const placed = spreadLabels([200, 20, 200, 200], 10, 200, 22);
    expect(placed[1]).toBe(20);
    const floor = [placed[0], placed[2], placed[3]].sort((a, b) => a - b);
    expect(floor).toEqual([156, 178, 200]);
  });

  it('keeps the lowest label on the floor when the plot is too short for them all', () => {
    const placed = spreadLabels([100, 100, 100], 90, 110, 22);
    expect(Math.min(...placed)).toBeGreaterThanOrEqual(90 - 44);
    expect(Math.max(...placed)).toBe(110);
  });
});
