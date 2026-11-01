import { describe, expect, it } from 'vitest';
import { weekSummary } from './weekSummary';

// Thursday 21 May 2026, mid-afternoon local time.
const NOW = new Date(2026, 4, 21, 15, 0).getTime();
const at = (day: number, hour = 10) => new Date(2026, 4, day, hour).getTime();

describe('weekSummary', () => {
  it('marks the days studied this week, Monday first, and finds today', () => {
    const summary = weekSummary([at(18), at(20), at(21)], NOW);
    expect(summary.todayIndex).toBe(3);
    expect(summary.studied).toEqual([true, false, true, true, false, false, false]);
  });

  it('counts reviews from the last seven days only', () => {
    expect(weekSummary([at(14), at(15), at(19), at(20), at(21)], NOW).reviewed).toBe(4);
  });

  it('ignores reviews after now', () => {
    expect(weekSummary([at(21, 18)], NOW).reviewed).toBe(0);
  });

  it('starts a fresh week on Monday', () => {
    const monday = new Date(2026, 4, 25, 9).getTime();
    const summary = weekSummary([at(24), monday], monday);
    expect(summary.todayIndex).toBe(0);
    expect(summary.studied).toEqual([true, false, false, false, false, false, false]);
  });
});
