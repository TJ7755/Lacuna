import { expect, it } from 'vitest';
import { exampleHistories, forecastExample, EXAMPLE_NOW } from './examReadinessModel';

it('shows decay between reviews and a jump only when a review occurs', () => {
  const { history, reviewed, unreviewed } = forecastExample(exampleHistories[0], 21);
  const jumps = history.slice(1).filter((point, i) => point.at === history[i].at);
  expect(jumps).toHaveLength(2);
  for (const jump of jumps) expect(jump.recall).toBeCloseTo(1);
  for (let i = 1; i < history.length; i++) {
    if (history[i].at > history[i - 1].at) {
      expect(history[i].recall).toBeLessThanOrEqual(history[i - 1].recall);
    }
  }
  expect(reviewed[0]).toEqual(history.at(-1));
  expect(reviewed[1]).toEqual({ at: EXAMPLE_NOW, recall: 1 });
  expect(unreviewed[0]).toEqual(history.at(-1));
  expect(reviewed.at(-1)!.recall).toBeGreaterThan(unreviewed.at(-1)!.recall);
});

it('changing the exam date leaves past reviews intact and extends the forecast', () => {
  const near = forecastExample(exampleHistories[0], 7);
  const far = forecastExample(exampleHistories[0], 42);
  expect(far.history).toEqual(near.history);
  expect(far.reviewed.at(-1)!.at).toBeGreaterThan(near.reviewed.at(-1)!.at);
  expect(far.reviewed.at(-1)!.recall).toBeLessThan(near.reviewed.at(-1)!.recall);
  for (const point of [...far.history, ...far.reviewed, ...far.unreviewed]) {
    expect(point.recall).toBeGreaterThanOrEqual(0);
    expect(point.recall).toBeLessThanOrEqual(1);
  }
});
