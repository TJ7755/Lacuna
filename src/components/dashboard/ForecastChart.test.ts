import { describe, expect, it } from 'vitest';
import { easeSeries, recallTicks, spreadLabels, stopNowProjection } from './ForecastChart';

describe('stopNowProjection', () => {
  it('explains why a course without a future exam has no exam-day projection', () => {
    const projection = stopNowProjection(
      { end: 100, hasExam: false, target: 0.9, ifStopped: 0.62 },
      [{ at: 1, recall: 0.62 }],
      1,
    );
    expect(projection.points).toEqual([]);
    expect(projection.explanation).toMatch(/no future exam date/i);
  });

  it('explains why there is no projection without study data', () => {
    const projection = stopNowProjection(
      { end: 100, hasExam: true, target: 0.9, ifStopped: 0 },
      [],
      1,
    );
    expect(projection.points).toEqual([]);
    expect(projection.explanation).toMatch(/no study data/i);
  });

  it('spans today to the exam at the current exam-day estimate, without simulating reviews', () => {
    const now = Date.UTC(2026, 9, 20);
    const end = Date.UTC(2026, 10, 3);
    const forecast = { end, hasExam: true, target: 0.9, ifStopped: 0.62 };
    const history = [
      { at: now - 86_400_000, recall: 0.4 },
      { at: now, recall: 0.62 },
    ];
    expect(stopNowProjection(forecast, history, now)).toEqual({
      points: [
        { at: now, recall: 0.62 },
        { at: end, recall: 0.62 },
      ],
      explanation: null,
    });
  });
});

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
